// strategy-candidates-repo — Phase 3 of the strategy graph (planning/anis-strategy-graph-plan.md, Improvement): the GAPS (turns no
// strategy served, internal only — questions never leave this DB), the DESIGN runs (Opus candidates, valid or dropped) and the
// PROMOTIONS ledger, all in strategies.db (strategies-repo's open function). A candidate is a strategies row with status
// 'candidate'; promote = old active → 'retired', candidate → 'active' (rev bump: every process's catalog + Jev options reload);
// rollback = active → 'rolled_back', the newest retired → 'active'. Rows are append-only except status. Deps: strategies-repo.
import { openStrategiesDb, bumpRev, readAll } from './strategies-repo.js';

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
    return String(d.cluster_key).startsWith('edit:') ? d.label : `new design for the "${d.label || '?'}" gap class`; };
  const promotions = listPromotions(db, { limit }).map((p) => ({ ...p, parent_version: p.version != null ? parent.get(p.strategy_id, p.version)?.parent_version ?? null : null,
    change: p.version != null ? change(p.strategy_id, p.version) : null }));
  const tried = new Set(db.prepare('SELECT DISTINCT strategy_id, version FROM strategy_promotions').all().map((r) => `${r.strategy_id}@${r.version}`));
  const candidates = db.prepare("SELECT id, version, parent_version, created_at FROM strategies WHERE status = 'candidate' ORDER BY created_at, version").all()
    .filter((c) => !tried.has(`${c.id}@${c.version}`)).map((c) => ({ ...c, change: change(c.id, c.version) }));
  const gaps = { open: Number(db.prepare('SELECT COUNT(*) AS n FROM strategy_gaps WHERE design_id IS NULL').get().n || 0),
    designed: Number(db.prepare("SELECT COUNT(*) AS n FROM strategy_designs WHERE cluster_key NOT LIKE 'edit:%' AND created_at >= ?").get(since || '').n || 0) };
  return { promotions, candidates, gaps };
}
