// jev-theories-repo — the decision-theory loop's store, in strategies.db (strategies-repo's open function): FROZEN synthetic gold sets
// per Jev gate (jev_synthetic: append-only, a set grows only by appending; its version = the number of appends), the frozen per-class
// question sets of each strategy (strategy_synthetic: the promotion replay's class/guard questions, written once, then reused), and
// the THEORY ledger (jev_theories: diagnosis → experiment numbers → won | lost | code). Server processes only. Deps: strategies-repo.
import { openStrategiesDb } from './strategies-repo.js';

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const safeJson = (s, d = null) => { try { return JSON.parse(s); } catch { return d; } };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jev_synthetic (
  gate TEXT NOT NULL, idx INTEGER NOT NULL, set_version INTEGER NOT NULL, state TEXT NOT NULL, questions_json TEXT NOT NULL,
  gold_json TEXT NOT NULL, side TEXT, created_at TEXT, created_by TEXT, PRIMARY KEY (gate, idx));
CREATE TABLE IF NOT EXISTS strategy_synthetic (
  strategy_id TEXT NOT NULL, idx INTEGER NOT NULL, question TEXT NOT NULL, set_kind TEXT NOT NULL, of TEXT, created_at TEXT,
  PRIMARY KEY (strategy_id, idx));
CREATE TABLE IF NOT EXISTS jev_theories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, gate TEXT NOT NULL, kind TEXT NOT NULL, theory_json TEXT, result_json TEXT, verdict TEXT NOT NULL,
  strategy_id TEXT, version INTEGER, improvement_id INTEGER, evidence_key TEXT, usd REAL, created_at TEXT);
CREATE INDEX IF NOT EXISTS jev_theories_at ON jev_theories (created_at);`;

let conn = null;
export function theoriesDb() { if (!conn) { conn = openStrategiesDb(); ensureTheoriesSchema(conn); } return conn; }
export function ensureTheoriesSchema(db) { db.exec(SCHEMA); return db; }
export function resetTheoriesDb() { conn = null; }

// ── synthetic gold per gate (frozen, versioned, append-only) ──
/** The gate's frozen synthetic set. → { version, rows: [{ id, state, questions, gold, side, src: 'synthetic' }] } */
export function syntheticSet(db, gate) {
  ensureTheoriesSchema(db);
  const rows = db.prepare('SELECT * FROM jev_synthetic WHERE gate = ? ORDER BY idx').all(gate);
  return { version: rows.reduce((v, r) => Math.max(v, r.set_version), 0),
    rows: rows.map((r) => ({ id: `syn:${gate}:${r.idx}`, ref: null, state: r.state, questions: safeJson(r.questions_json, {}), gold: safeJson(r.gold_json), side: r.side, src: 'synthetic' })) };
}
/** Append cases ({ state, questions, gold, side? }) to the gate's set — never rewrites; a case whose state is already there is skipped.
 *  → { version, added } (version unchanged when nothing was added). */
export function appendSynthetic(db, gate, cases = [], { by = 'opus-synthetic' } = {}) {
  ensureTheoriesSchema(db);
  return db.transaction(() => {
    const have = new Set(db.prepare('SELECT state FROM jev_synthetic WHERE gate = ?').all(gate).map((r) => r.state));
    const top = db.prepare('SELECT COALESCE(MAX(idx), 0) AS i, COALESCE(MAX(set_version), 0) AS v FROM jev_synthetic WHERE gate = ?').get(gate);
    const fresh = cases.filter((c) => c?.state && !have.has(c.state) && (have.add(c.state), true));
    if (!fresh.length) return { version: top.v, added: 0 };
    const ins = db.prepare(`INSERT INTO jev_synthetic (gate, idx, set_version, state, questions_json, gold_json, side, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const at = nowIso();
    fresh.forEach((c, i) => ins.run(gate, top.i + i + 1, top.v + 1, c.state, JSON.stringify(c.questions), JSON.stringify(c.gold), c.side ?? null, at, by));
    return { version: top.v + 1, added: fresh.length };
  })();
}
export const syntheticCount = (db) => Number(ensureTheoriesSchema(db).prepare('SELECT COUNT(*) AS n FROM jev_synthetic').get().n || 0);

// ── frozen per-class question sets (the promotion replay's questions: written once per strategy, then reused) ──
/** → [{ question, set: 'fresh'|'guard', of }] in the order they were frozen ([] when none yet). */
export const classSet = (db, strategyId) => ensureTheoriesSchema(db).prepare('SELECT * FROM strategy_synthetic WHERE strategy_id = ? ORDER BY idx').all(strategyId)
  .map((r) => ({ question: r.question, set: r.set_kind, ...(r.of ? { of: r.of } : {}) }));
/** Append questions to the strategy's frozen set (a question already there is skipped). → added */
export function freezeClassSet(db, strategyId, questions = []) {
  ensureTheoriesSchema(db);
  return db.transaction(() => {
    const have = new Set(classSet(db, strategyId).map((q) => q.question));
    let i = Number(db.prepare('SELECT COALESCE(MAX(idx), 0) AS i FROM strategy_synthetic WHERE strategy_id = ?').get(strategyId).i);
    const ins = db.prepare('INSERT INTO strategy_synthetic (strategy_id, idx, question, set_kind, of, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    let added = 0;
    for (const q of questions) {
      if (!q?.question || have.has(q.question) || !['fresh', 'guard'].includes(q.set)) continue;
      have.add(q.question); ins.run(strategyId, ++i, q.question, q.set, q.of ?? null, nowIso()); added++;
    }
    return added;
  })();
}

// ── the theory ledger ──
export function logTheory(db, { gate, kind, theory = null, result = null, verdict, strategy_id = null, version = null, improvement_id = null, evidence_key = null, usd = 0 }) {
  ensureTheoriesSchema(db);
  return Number(db.prepare(`INSERT INTO jev_theories (gate, kind, theory_json, result_json, verdict, strategy_id, version, improvement_id, evidence_key, usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(gate, kind, JSON.stringify(theory), JSON.stringify(result), verdict, strategy_id, version, improvement_id,
    evidence_key, usd, nowIso()).lastInsertRowid);
}
/** Has this evidence item already been diagnosed? (one diagnosis per weak verdict) */
export const theorizedFor = (db, key) => !!ensureTheoriesSchema(db).prepare('SELECT 1 FROM jev_theories WHERE evidence_key = ? LIMIT 1').get(key);
export const listTheories = (db, { since = '', limit = 200 } = {}) => ensureTheoriesSchema(db)
  .prepare('SELECT * FROM jev_theories WHERE created_at >= ? ORDER BY id DESC LIMIT ?').all(since, limit)
  .map(({ theory_json, result_json, ...r }) => ({ ...r, theory: safeJson(theory_json), result: safeJson(result_json) }));
/** The overview's decisions block: theories tested (won|lost) / shipped (won AND its candidate promoted) since `since`, synthetic cases held. */
export function theoryCounts(db, { since = '' } = {}) {
  ensureTheoriesSchema(db);
  const r = db.prepare(`SELECT COUNT(*) AS tested,
    COALESCE(SUM(verdict = 'won' AND json_extract(result_json, '$.promoted') = 1), 0) AS shipped FROM jev_theories WHERE created_at >= ? AND verdict IN ('won', 'lost')`).get(since);
  return { theories_tested_7d: Number(r.tested || 0), shipped_7d: Number(r.shipped || 0), synthetic_cases: syntheticCount(db) };
}
/** The next free version of step `id` (a theory saves a new version of the decision step it enriches). */
export const nextStepVersion = (db, id) => Number(db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM steps WHERE id = ?').get(id).v) + 1;
