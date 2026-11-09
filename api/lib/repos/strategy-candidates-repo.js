// strategy-candidates-repo — Phase 3 of the strategy graph (planning/anis-strategy-graph-plan.md, Improvement): the GAPS (turns no
// strategy served, internal only — questions never leave this DB), the DESIGN runs (Opus candidates, valid or dropped) and the
// PROMOTIONS ledger, all in strategies.db (strategies-repo's open function). A candidate is a strategies row with status
// 'candidate'; promote = old active → 'retired', candidate → 'active' (rev bump: every process's catalog + Jev options reload);
// rollback = active → 'rolled_back', the newest retired → 'active'. Rows are append-only except status. Deps: strategies-repo.
import { openStrategiesDb, bumpRev, readAll } from './strategies-repo.js';
import { repairParams, repairTemplate, paramProblems, templateProblems } from '../assistant/activities/contract.js';

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const safeJson = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS strategy_gaps (
  turn_id TEXT PRIMARY KEY, thread_id TEXT, question TEXT NOT NULL, label TEXT NOT NULL, source TEXT NOT NULL,
  jev_choice TEXT, jev_confidence REAL, reason TEXT, judge_why TEXT, design_id INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS strategy_gaps_open ON strategy_gaps (design_id, label);
CREATE TABLE IF NOT EXISTS strategy_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cluster_key TEXT NOT NULL, label TEXT, status TEXT NOT NULL,
  strategy_id TEXT, version INTEGER, attempts INTEGER, usd REAL, errors_json TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS strategy_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id TEXT NOT NULL, version INTEGER, action TEXT NOT NULL,
  decision_json TEXT, usd REAL, created_at TEXT, created_by TEXT);`;

let conn = null;
/** The store's connection for this process (tests pass their own db to every function). */
export function candidatesDb() { if (!conn) { conn = openStrategiesDb(); ensureCandidatesSchema(conn); } return conn; }
export function ensureCandidatesSchema(db) { db.exec(SCHEMA); return db; }
export function resetCandidatesDb() { conn = null; }

// ── gaps ──
/** Upsert one gap (a later judge verdict adds its reason and label to the Jev gap of the same turn). */
export function recordGap(db, g) {
  ensureCandidatesSchema(db);
  return db.prepare(`INSERT INTO strategy_gaps (turn_id, thread_id, question, label, source, jev_choice, jev_confidence, reason, judge_why, created_at)
    VALUES (@turn_id, @thread_id, @question, @label, @source, @jev_choice, @jev_confidence, @reason, @judge_why, @created_at)
    ON CONFLICT(turn_id) DO UPDATE SET judge_why = COALESCE(excluded.judge_why, judge_why),
      label = CASE WHEN excluded.source = 'judge' THEN excluded.label ELSE label END,
      source = CASE WHEN excluded.source = 'judge' OR source = 'judge' THEN 'jev+judge' ELSE source END`)
    .run({ thread_id: null, jev_choice: null, jev_confidence: null, reason: null, judge_why: null, created_at: nowIso(), ...g }).changes;
}
/** Open gaps (not yet given to a design), oldest first. */
export const openGaps = (db, { limit = 2000 } = {}) => ensureCandidatesSchema(db)
  .prepare('SELECT * FROM strategy_gaps WHERE design_id IS NULL ORDER BY created_at, turn_id LIMIT ?').all(limit);
export const listGaps = (db, { limit = 200 } = {}) => ensureCandidatesSchema(db)
  .prepare('SELECT * FROM strategy_gaps ORDER BY created_at DESC LIMIT ?').all(limit);

/** The gap questions behind a candidate (its designs' clusters): held out of the question writer, the promotion's check set. */
export const heldQuestions = (db, id, version) => ensureCandidatesSchema(db).prepare(`SELECT DISTINCT g.question FROM strategy_gaps g
  JOIN strategy_designs d ON d.id = g.design_id WHERE d.strategy_id = ? AND d.version = ?`).all(id, version).map((r) => r.question);

// ── design runs ──
/** Log one design attempt and close its cluster's gaps (a dropped design closes them too: never retried on the same evidence). */
export function logDesign(db, { cluster_key, label = null, status, strategy_id = null, version = null, attempts = 1, usd = 0, errors = null, turn_ids = [] }) {
  ensureCandidatesSchema(db);
  return db.transaction(() => {
    const id = db.prepare(`INSERT INTO strategy_designs (cluster_key, label, status, strategy_id, version, attempts, usd, errors_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(cluster_key, label, status, strategy_id, version, attempts, usd, errors ? JSON.stringify(errors) : null, nowIso()).lastInsertRowid;
    const mark = db.prepare('UPDATE strategy_gaps SET design_id = ? WHERE turn_id = ?');
    for (const t of turn_ids) mark.run(id, t);
    return Number(id);
  })();
}
export const listDesigns = (db, { limit = 50 } = {}) => ensureCandidatesSchema(db).prepare('SELECT * FROM strategy_designs ORDER BY id DESC LIMIT ?').all(limit)
  .map(({ errors_json, ...r }) => ({ ...r, errors: safeJson(errors_json) }));

// ── candidates ──
const maxVersion = (db, table, id) => Number(db.prepare(`SELECT MAX(version) AS v FROM ${table} WHERE id = ?`).get(id)?.v || 0);

/** Save a validated candidate (strategy-design.js normalized shape): new templates and steps (new ids only), then the strategy
 *  row at the next version of its id with status 'candidate' and parent_version = the active version. → { id, version } */
export function saveCandidate(db, { strategy, steps = [], templates = [] }, { by = 'opus-design' } = {}) {
  ensureCandidatesSchema(db);
  const at = nowIso();
  return db.transaction(() => {
    for (const t of templates) db.prepare('INSERT INTO templates (id, version, text, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(t.id, maxVersion(db, 'templates', t.id) + 1, t.text, at, by);
    for (const s of steps) db.prepare(`INSERT INTO steps (id, version, activity, params_json, template_id, template_version, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, s.version, s.activity, JSON.stringify(s.params || {}), s.template_id ?? null, s.template_version ?? null, at, by);
    const version = maxVersion(db, 'strategies', strategy.id) + 1;
    const parent = db.prepare("SELECT MAX(version) AS v FROM strategies WHERE id = ? AND status = 'active'").get(strategy.id)?.v ?? null;
    db.prepare(`INSERT INTO strategies (id, version, name, description, exemplars_json, graph_json, status, parent_version, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?, ?, ?)`).run(strategy.id, version, strategy.name, strategy.description, JSON.stringify(strategy.exemplars || []),
      JSON.stringify(strategy.graph), parent, at, by);
    bumpRev(db);   // new steps/templates are visible to every catalog (a candidate row is not: only 'active' rows are served)
    return { id: strategy.id, version };
  })();
}

const parseRow = ({ exemplars_json, graph_json, ...s }) => ({ ...s, exemplars: safeJson(exemplars_json, []), graph: safeJson(graph_json) });
export function strategyRow(db, id, version) {
  const r = version != null ? db.prepare('SELECT * FROM strategies WHERE id = ? AND version = ?').get(id, version)
    : db.prepare('SELECT * FROM strategies WHERE id = ? ORDER BY version DESC LIMIT 1').get(id);
  return r ? parseRow(r) : null;
}
export const listCandidates = (db, { status = 'candidate' } = {}) => db.prepare(`SELECT * FROM strategies WHERE ${status === 'all' ? '1' : 'status = ?'} ORDER BY created_at DESC, id`)
  .all(...(status === 'all' ? [] : [status])).map(parseRow);

/** The dry run's PIN for strategy@version: its row plus fresh step/template maps (a candidate is not in any catalog). */
export function pinFor(db, id, version) {
  const row = strategyRow(db, id, version);
  if (!row) return null;
  const all = readAll(db);
  return { id: row.id, version: row.version, row, steps: new Map(all.steps.map((s) => [`${s.id}@${s.version}`, s])),
    templates: new Map(all.templates.map((t) => [`${t.id}@${t.version}`, t])),
    templatesLatest: all.templates.reduce((m, t) => (!m.has(t.id) || m.get(t.id).version < t.version ? m.set(t.id, t) : m), new Map()) };
}

// ── promotion ledger ──
export function logPromotion(db, { strategy_id, version = null, action, decision = null, usd = null, by = 'improve' }) {
  ensureCandidatesSchema(db);
  return Number(db.prepare(`INSERT INTO strategy_promotions (strategy_id, version, action, decision_json, usd, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(strategy_id, version, action, decision ? JSON.stringify(decision) : null, usd, nowIso(), by).lastInsertRowid);
}
export const listPromotions = (db, { limit = 50 } = {}) => ensureCandidatesSchema(db).prepare('SELECT * FROM strategy_promotions ORDER BY id DESC LIMIT ?').all(limit)
  .map(({ decision_json, ...r }) => ({ ...r, decision: safeJson(decision_json) }));

/** Make id@version the active row: the current active version(s) → 'retired' (restorable), rev bump, ledger row. */
export function promote(db, id, version, { decision = null, usd = null, by = 'improve' } = {}) {
  ensureCandidatesSchema(db);
  return db.transaction(() => {
    const row = db.prepare('SELECT status FROM strategies WHERE id = ? AND version = ?').get(id, version);
    if (!row) throw new Error(`no strategy ${id}@${version}`);
    db.prepare("UPDATE strategies SET status = 'retired' WHERE id = ? AND status = 'active' AND version != ?").run(id, version);
    db.prepare("UPDATE strategies SET status = 'active' WHERE id = ? AND version = ?").run(id, version);
    bumpRev(db);
    logPromotion(db, { strategy_id: id, version, action: 'promote', decision, usd, by });
    return { id, version, was: row.status };
  })();
}

/** Undo the last promotion of `id`: active → 'rolled_back', the newest retired version below it → 'active'. */
export function rollback(db, id, { by = 'ops' } = {}) {
  ensureCandidatesSchema(db);
  return db.transaction(() => {
    const cur = db.prepare("SELECT version FROM strategies WHERE id = ? AND status = 'active' ORDER BY version DESC LIMIT 1").get(id);
    if (!cur) throw new Error(`strategy ${id} has no active version`);
    const prev = db.prepare("SELECT version FROM strategies WHERE id = ? AND status = 'retired' AND version < ? ORDER BY version DESC LIMIT 1").get(id, cur.version);
    db.prepare("UPDATE strategies SET status = 'rolled_back' WHERE id = ? AND version = ?").run(id, cur.version);
    if (prev) db.prepare("UPDATE strategies SET status = 'active' WHERE id = ? AND version = ?").run(id, prev.version);
    bumpRev(db);
    logPromotion(db, { strategy_id: id, version: cur.version, action: 'rollback', decision: { restored: prev?.version ?? null }, by });
    return { id, rolled_back: cur.version, restored: prev?.version ?? null };
  })();
}

// ── Phase 4: EDITS of an existing strategy from the improve analyst's DATA suggestions (cluster_key 'edit:<strategy>') ──
/** Design runs whose cluster_key starts with `prefix`, created at/after `since` ('YYYY-MM-DD HH:MM:SS'). → count */
export const countDesigns = (db, { prefix, since }) => Number(ensureCandidatesSchema(db)
  .prepare('SELECT COUNT(*) AS n FROM strategy_designs WHERE cluster_key LIKE ? AND created_at >= ?').get(`${prefix}%`, since)?.n || 0);
/** The newest design row that produced id@version (its label is the one-line change), or null. */
export const designFor = (db, id, version) => ensureCandidatesSchema(db)
  .prepare('SELECT * FROM strategy_designs WHERE strategy_id = ? AND version = ? ORDER BY id DESC LIMIT 1').get(id, version) || null;
/** The deciding ledger row for id@version (promote | reject | already-active; a dry run decides nothing), or null. */
export function decisionFor(db, id, version) {
  const r = ensureCandidatesSchema(db).prepare(`SELECT * FROM strategy_promotions WHERE strategy_id = ? AND version = ?
    AND action IN ('promote', 'reject', 'already-active') ORDER BY id DESC LIMIT 1`).get(id, version);
  if (!r) return null;
  const { decision_json, ...rest } = r;
  return { ...rest, decision: safeJson(decision_json) };
}

/** The progress page's reads (audit/improve-overview.js shapes them): the ledger's newest rows with each version's parent and the
 *  one-line change its design logged; the candidates no ledger row has tried yet (= under test now); gap counts (open; designs
 *  since `since`, edits excluded). No question text. */
export function overviewReads(db, { since, limit = 200 } = {}) {
  ensureCandidatesSchema(db);
  const label = db.prepare('SELECT cluster_key, label FROM strategy_designs WHERE strategy_id = ? AND version = ? ORDER BY id DESC LIMIT 1');
  const parent = db.prepare('SELECT parent_version FROM strategies WHERE id = ? AND version = ?');
  const change = (id, v) => { const d = label.get(id, v); if (!d) return null;
    return /^(edit|theory|miss):/.test(String(d.cluster_key)) ? d.label : `new design for the "${d.label || '?'}" gap class`; };
  const promotions = listPromotions(db, { limit }).map((p) => ({ ...p, parent_version: p.version != null ? parent.get(p.strategy_id, p.version)?.parent_version ?? null : null,
    change: p.version != null ? change(p.strategy_id, p.version) : null }));
  const tried = new Set(db.prepare('SELECT DISTINCT strategy_id, version FROM strategy_promotions').all().map((r) => `${r.strategy_id}@${r.version}`));
  const candidates = db.prepare("SELECT id, version, parent_version, created_at FROM strategies WHERE status = 'candidate' ORDER BY created_at, version").all()
    .filter((c) => !tried.has(`${c.id}@${c.version}`)).map((c) => ({ ...c, change: change(c.id, c.version) }));
  const gaps = { open: Number(db.prepare('SELECT COUNT(*) AS n FROM strategy_gaps WHERE design_id IS NULL').get().n || 0),
    designed: Number(db.prepare("SELECT COUNT(*) AS n FROM strategy_designs WHERE cluster_key NOT LIKE 'edit:%' AND cluster_key NOT LIKE 'theory:%' AND cluster_key NOT LIKE 'miss:%' AND created_at >= ?").get(since || '').n || 0) };
  return { promotions, candidates, gaps };
}

/** Improve digest: what was kept OUT for confusing Jev since `since` (store timestamp): promotions rejected with real-call breaks / confidence
 *  drops / guard steals, and clusters judged a setting of an existing strategy. → { rejected: [...], setting_of: [...] } */
export function confusionDigest(db, { since }) {
  ensureCandidatesSchema(db);
  const num = (n) => ({ broken: n?.replay_broken ?? n?.broken ?? 0, confidence_drops: n?.replay_confidence_drops ?? n?.confidence_drops ?? 0, steals: n?.jev_guard_steals ?? 0 });
  const rejected = db.prepare("SELECT * FROM strategy_promotions WHERE action = 'reject' AND created_at >= ? ORDER BY id DESC").all(since || '')
    .map(({ decision_json, ...r }) => ({ ...r, decision: safeJson(decision_json) })).map((p) => ({ strategy: p.strategy_id, version: p.version, by: p.created_by, at: p.created_at, ...num(p.decision?.numbers), failed: p.decision?.failed ?? [] }))
    .filter((p) => p.broken > 0 || p.confidence_drops > 0 || p.steals > 0);
  const setting_of = db.prepare("SELECT label, status, created_at FROM strategy_designs WHERE status LIKE 'setting-of:%' AND created_at >= ? ORDER BY id DESC").all(since || '')
    .map((d) => ({ setting_of: d.status.slice(11), label: d.label, at: d.created_at }));
  return { rejected, setting_of };
}

// ── slot-syntax repair (a planner wrote `{topic}` / "from:x" / "x+y" for a unit slot; the only syntax is `{{unit}}`) ──
const QUERYISH = /^(query|words|name|term|title|work|value|text|translator)$/;
/** params → the same with unit slots in `{{unit}}` form. Pure. */
export const fixSlots = (v, key = '') => {
  if (typeof v === 'string') {
    let t = v.replace(/(?<!\{)\{(\w+)\}(?!\})/g, '{{$1}}');
    if (QUERYISH.test(key) && !t.includes('{{') && /^from:/.test(t.trim())) t = t.trim().slice(5).split(/[+\s,]+/).filter(Boolean).map((u) => `{{${u}}}`).join(' ');
    return t;
  }
  if (Array.isArray(v)) return v.map((x) => fixSlots(x, key));
  return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixSlots(x, k)])) : v;
};
/** A search.shelf step gated on BOTH a named work (in_named) and a named person (by_person) is skipped unless the question names both: drop in_named (the person filter stays). Pure. */
export const fixGates = (p, activity = '') => (activity === 'search.shelf' && p && p.in_named && p.by_person ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'in_named')) : p);

/** The template ids a step names (template / shared / how / by_count), '@sub' excluded. */
const tplIds = (p = {}) => [p.template, p.shared, p.how, ...Object.values(p.by_count || {})].flat().filter((x) => typeof x === 'string' && x !== '@sub');
const latestTpl = (db, id) => db.prepare('SELECT text FROM templates WHERE id = ? ORDER BY version DESC LIMIT 1').get(id)?.text ?? null;
/** The CONTRACT problems of a strategy row (activities/contract.js): its steps' param values and the templates they name. → [string] */
export function contractProblems(db, row) {
  const out = [], seen = new Set();
  for (const [nid, n] of Object.entries(row.graph?.nodes || {})) {
    const st = db.prepare('SELECT * FROM steps WHERE id = ? AND version = ?').get(n.step, n.step_version);
    if (!st) continue;
    const params = safeJson(st.params_json, {});
    out.push(...paramProblems(st.activity, params).map((m) => `${nid}: ${m}`));
    for (const t of tplIds(params)) { if (seen.has(`${t}|${t === params.shared}`)) continue; seen.add(`${t}|${t === params.shared}`);
      const text = latestTpl(db, t);
      if (text == null) out.push(`${nid}: template ${t} does not exist`); else out.push(...templateProblems(text, { shared: t === params.shared }).map((m) => `template ${t}: ${m}`)); }
  }
  return [...new Set(out)];
}

/** Strategy `id` at `version` (default newest) → corrected as a NEW candidate version: slot syntax, contract values (activities/contract.js repairParams: ignored or
 *  always-wrong values dropped to the element's default, strays moved under params, shared list → one id) and the templates its steps name (single-brace slots,
 *  a shared template wraps {{base}}); nothing to fix and the row is a candidate = that row stands (re-run: no @n+1). A fixed template is a NEW template version (live at once for every
 *  strategy that names it). → { id, version (the target, null when nothing applies), fixed: [step ids], templates: [ids], problems: [what still breaks the contract], saved: bool, activatable: bool } */
export function fixStrategySlots(db, id, { version = null, by = 'ops-slot-fix' } = {}) {
  const row = strategyRow(db, id, version);
  if (!row) throw new Error(`no strategy ${id}${version != null ? '@' + version : ''}`);
  const graph = JSON.parse(JSON.stringify(row.graph)), steps = [], shared = new Set(), names = new Set();
  for (const [nid, n] of Object.entries(graph.nodes || {})) {
    const st = db.prepare('SELECT * FROM steps WHERE id = ? AND version = ?').get(n.step, n.step_version);
    if (!st) continue;
    const params = safeJson(st.params_json, {}), fixed = fixGates(fixSlots(repairParams(st.activity, params)), st.activity);
    for (const t of tplIds(fixed)) { names.add(t); if (t === fixed.shared) shared.add(t); }
    if (JSON.stringify(fixed) === JSON.stringify(params)) continue;
    const v = maxVersion(db, 'steps', st.id) + 1 + steps.filter((x) => x.id === st.id).length;
    steps.push({ id: st.id, version: v, activity: st.activity, params: fixed, template_id: st.template_id, template_version: st.template_version });
    graph.nodes[nid] = { ...n, step_version: v };
  }
  const templates = [...names].map((t) => ({ id: t, text: latestTpl(db, t) })).filter((t) => t.text != null)
    .map((t) => ({ ...t, fixed: repairTemplate(t.text, { shared: shared.has(t.id) }) })).filter((t) => t.fixed !== t.text).map((t) => ({ id: t.id, text: t.fixed }));
  let target = row, saved = false;
  if (steps.length || templates.length) { const sv = saveCandidate(db, { strategy: { id, name: row.name, description: row.description, exemplars: row.exemplars, graph }, steps, templates }, { by }); target = strategyRow(db, id, sv.version); saved = true; }
  else if (row.status !== 'candidate') return { id, version: null, fixed: [], templates: [], problems: contractProblems(db, row), saved: false, activatable: false };
  const active = db.prepare("SELECT MAX(version) AS v FROM strategies WHERE id = ? AND status = 'active'").get(id)?.v ?? null;
  return { id, version: target.version, fixed: steps.map((x) => x.id), templates: templates.map((t) => t.id), problems: contractProblems(db, target), saved, activatable: target.status === 'candidate' && active != null && target.parent_version === active };
}

/** near_misses ({example|text}) folded into a description as "Not for: ..." (Jev reads only description + exemplars). Pure. */
export const foldNearMisses = (description, misses = []) => `${String(description ?? '').trim()} Not for: ${misses.map((m) => String(m.example || m.text).trim().replace(/[.?!]+$/, '')).join('; ')}.`;

// ── card edit (description / exemplars / near_misses of a saved strategy, graph untouched) ──
/** Strategy `id`'s newest (or `version`) graph + a rewritten CARD as a NEW candidate version. near_misses are not stored anywhere (Jev reads only
 *  description + exemplars), so they are validated like the planner's (>=3, {text, goes_to: "unmatched" | an existing strategy id}) and folded
 *  into the description as "Not for: ..." so Jev sees them. → { id, version, description, activatable } (throws on an invalid card) */
export function editStrategyCard(db, id, { description, near_misses, exemplars, version = null, by = 'strategy-card' } = {}) {
  const row = strategyRow(db, id, version);
  if (!row) throw new Error(`no strategy ${id}${version != null ? '@' + version : ''}`);
  let desc = String(description ?? row.description ?? '').trim();
  if (near_misses != null) {
    const ids = new Set(db.prepare('SELECT DISTINCT id FROM strategies').all().map((r) => r.id));
    const misses = Array.isArray(near_misses) ? near_misses : [];
    if (misses.length < 3) throw new Error('card: at least 3 near_misses');
    for (const m of misses) if (!String(m?.example || m?.text || '').trim() || !(m?.goes_to === 'unmatched' || ids.has(m?.goes_to))) throw new Error(`card: near_miss ${JSON.stringify(String(m?.example || m?.text || '').slice(0, 40))} must go to an existing strategy or "unmatched"`);
    desc = foldNearMisses(desc, misses);
  }
  if (desc.length < 20 || desc.length > 600) throw new Error(`description must be 20-600 characters (is ${desc.length})`);
  const ex = Array.isArray(exemplars) ? exemplars.map((x) => String(x).trim()).filter(Boolean) : row.exemplars;
  if (ex.length < 2) throw new Error('exemplars: at least 2 class phrasings');
  const sv = saveCandidate(db, { strategy: { id, name: row.name, description: desc, exemplars: ex, graph: row.graph }, steps: [] }, { by });
  const target = strategyRow(db, id, sv.version);
  const active = db.prepare("SELECT MAX(version) AS v FROM strategies WHERE id = ? AND status = 'active'").get(id)?.v ?? null;
  return { id, version: sv.version, description: desc, problems: contractProblems(db, target), activatable: active != null && target.parent_version === active };
}
