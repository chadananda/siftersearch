// strategy-planner-repo: what the PLANNER (assistant/strategy-planner.js) keeps beside a strategy row - its plan + node tests + tool wishes,
// the planner/route log (a second plan for one type is a defect), PROBATION (first N runs, per-node stats, baseline) and the TOOLS-loop
// re-plan queue. All in strategies.db; rows keyed by strategy id@version. Deps: strategy-candidates-repo (schema + connection).
import { ensureCandidatesSchema } from './strategy-candidates-repo.js';

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const safeJson = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };
const SCHEMA = `
CREATE TABLE IF NOT EXISTS strategy_plans (
  strategy_id TEXT NOT NULL, version INTEGER NOT NULL, type_key TEXT, plan_json TEXT, tests_json TEXT, wishes_json TEXT, source TEXT, created_at TEXT,
  PRIMARY KEY (strategy_id, version));
CREATE TABLE IF NOT EXISTS planner_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, kind TEXT NOT NULL, loop TEXT, type_key TEXT, strategy_id TEXT, version INTEGER, usd REAL, note TEXT);
CREATE INDEX IF NOT EXISTS planner_log_kind ON planner_log (kind, type_key);
CREATE TABLE IF NOT EXISTS strategy_probation (
  strategy_id TEXT NOT NULL, version INTEGER NOT NULL, phase TEXT NOT NULL, provisional INTEGER DEFAULT 0, need INTEGER, runs INTEGER DEFAULT 0, scored INTEGER DEFAULT 0,
  score_sum REAL DEFAULT 0, baseline_score REAL, usd_sum REAL DEFAULT 0, ms_sum REAL DEFAULT 0, node_stats_json TEXT, started_at TEXT, ended_at TEXT, note TEXT,
  PRIMARY KEY (strategy_id, version));
CREATE TABLE IF NOT EXISTS planner_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS strategy_replans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, strategy_id TEXT NOT NULL, element TEXT, catalog_version TEXT, status TEXT DEFAULT 'queued', queued_at TEXT);`;
const ready = (db) => { ensureCandidatesSchema(db); db.exec(SCHEMA); return db; };

export function savePlan(db, id, version, { typeKey = null, plan = null, tests = null, wishes = [], source = 'design' } = {}) {
  ready(db).prepare(`INSERT OR REPLACE INTO strategy_plans (strategy_id, version, type_key, plan_json, tests_json, wishes_json, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, version, typeKey, JSON.stringify(plan), tests ? JSON.stringify(tests) : null, JSON.stringify(wishes || []), source, nowIso());
}
export const setTests = (db, id, version, tests) => ready(db).prepare('UPDATE strategy_plans SET tests_json = ? WHERE strategy_id = ? AND version = ?').run(JSON.stringify(tests), id, version);
const planRow = (r) => r && { id: r.strategy_id, version: r.version, typeKey: r.type_key, plan: safeJson(r.plan_json), tests: safeJson(r.tests_json), wishes: safeJson(r.wishes_json, []), source: r.source, at: r.created_at };
export const planFor = (db, id, version) => planRow(ready(db).prepare('SELECT * FROM strategy_plans WHERE strategy_id = ? AND version = ?').get(id, version));
export const allPlans = (db) => ready(db).prepare('SELECT * FROM strategy_plans ORDER BY created_at').all().map(planRow);
/** A plan already made for this challenge type (a pending or live strategy), newest first. */
export const planForType = (db, typeKey) => planRow(ready(db).prepare('SELECT * FROM strategy_plans WHERE type_key = ? ORDER BY created_at DESC LIMIT 1').get(typeKey));

export const logPlanner = (db, { kind, loop = null, type_key = null, strategy_id = null, version = null, usd = null, note = null }) =>
  ready(db).prepare('INSERT INTO planner_log (at, kind, loop, type_key, strategy_id, version, usd, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(nowIso(), kind, loop, type_key, strategy_id, version, usd, note ? String(note).slice(0, 400) : null);
export const plannerLog = (db, { kind = null, limit = 200 } = {}) => ready(db).prepare(`SELECT * FROM planner_log ${kind ? 'WHERE kind = ?' : ''} ORDER BY id DESC LIMIT ${Number(limit) | 0}`).all(...(kind ? [kind] : []));
/** Types planned more than once: each extra plan is a defect (the first should have joined Jev's cards). → [{ type_key, plans }] */
export const repeatPlans = (db) => ready(db).prepare("SELECT type_key, COUNT(*) AS plans FROM planner_log WHERE kind = 'plan' AND type_key IS NOT NULL GROUP BY type_key HAVING plans > 1").all();

// ── probation ──
const probRow = (r) => r && { id: r.strategy_id, version: r.version, phase: r.phase, provisional: !!r.provisional, need: r.need, runs: r.runs, scored: r.scored, mean: r.scored ? r.score_sum / r.scored : null,
  baseline: r.baseline_score, usd: r.runs ? r.usd_sum / r.runs : null, ms: r.runs ? r.ms_sum / r.runs : null, nodes: safeJson(r.node_stats_json, {}), startedAt: r.started_at, endedAt: r.ended_at, note: r.note };
export function startProbation(db, id, version, { need, baseline = null, provisional = false }) {
  ready(db).prepare(`INSERT OR REPLACE INTO strategy_probation (strategy_id, version, phase, provisional, need, baseline_score, node_stats_json, started_at) VALUES (?, ?, 'probation', ?, ?, ?, '{}', ?)`)
    .run(id, version, provisional ? 1 : 0, need, baseline, nowIso());
}
export const probationFor = (db, id, version) => probRow(ready(db).prepare('SELECT * FROM strategy_probation WHERE strategy_id = ? AND version = ?').get(id, version));
/** The probation a strategy is in now (by id), if any. */
export const activeProbation = (db, id) => probRow(ready(db).prepare("SELECT * FROM strategy_probation WHERE strategy_id = ? AND phase = 'probation' ORDER BY version DESC LIMIT 1").get(id));
/** The probation of the ACTIVE version named `name`, if it is in one. */
export const activeProbationByName = (db, name) => probRow(ready(db).prepare(`SELECT p.* FROM strategy_probation p JOIN strategies s ON s.id = p.strategy_id AND s.version = p.version
  WHERE s.name = ? AND s.status = 'active' AND p.phase = 'probation' ORDER BY p.version DESC LIMIT 1`).get(name));
export const listProbations = (db, { phase = null } = {}) => ready(db).prepare(`SELECT * FROM strategy_probation ${phase ? 'WHERE phase = ?' : ''} ORDER BY started_at DESC`).all(...(phase ? [phase] : [])).map(probRow);
/** One probation run: judge score (0-10, null = unjudged), ms, usd, nodes [{ node, edge, ok }] (per-node run counts, edges taken, failures). */
export function recordProbationRun(db, id, version, { score = null, ms = 0, usd = 0, nodes = [] }) {
  ready(db);
  db.transaction(() => {
    const r = db.prepare('SELECT node_stats_json FROM strategy_probation WHERE strategy_id = ? AND version = ?').get(id, version);
    const st = safeJson(r?.node_stats_json, {}) || {};
    for (const n of nodes) { const x = (st[n.node] ||= { runs: 0, ok: 0, edges: {} }); x.runs++; if (n.ok !== false) x.ok++; x.edges[n.edge] = (x.edges[n.edge] || 0) + 1; }
    db.prepare(`UPDATE strategy_probation SET runs = runs + 1, scored = scored + ?, score_sum = score_sum + ?, usd_sum = usd_sum + ?, ms_sum = ms_sum + ?, node_stats_json = ?
      WHERE strategy_id = ? AND version = ?`).run(score == null ? 0 : 1, score ?? 0, usd || 0, ms || 0, JSON.stringify(st), id, version);
  })();
  return probationFor(db, id, version);
}
export const finishProbation = (db, id, version, { phase, note = null }) => ready(db).prepare('UPDATE strategy_probation SET phase = ?, note = ?, ended_at = ? WHERE strategy_id = ? AND version = ?').run(phase, note ? String(note).slice(0, 400) : null, nowIso(), id, version);

// ── TOOLS loop: re-plans queued when the element catalog changes ──
export const getMeta = (db, key) => ready(db).prepare('SELECT value FROM planner_meta WHERE key = ?').get(key)?.value ?? null;
export const setMeta = (db, key, value) => ready(db).prepare('INSERT INTO planner_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
export function queueReplan(db, { strategy_id, element = null, catalog_version }) {
  ready(db);
  if (db.prepare("SELECT 1 FROM strategy_replans WHERE strategy_id = ? AND catalog_version = ? AND status = 'queued'").get(strategy_id, catalog_version)) return false;
  db.prepare('INSERT INTO strategy_replans (strategy_id, element, catalog_version, queued_at) VALUES (?, ?, ?, ?)').run(strategy_id, element, catalog_version, nowIso());
  return true;
}
export const queuedReplans = (db) => ready(db).prepare("SELECT * FROM strategy_replans WHERE status = 'queued' ORDER BY id").all();
export const settleReplan = (db, id, status) => ready(db).prepare('UPDATE strategy_replans SET status = ? WHERE id = ?').run(status, id);
