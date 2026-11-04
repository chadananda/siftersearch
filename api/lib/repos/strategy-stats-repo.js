// strategy-stats-repo — measures every step, branch and strategy (strategy graph Phase 2). Tables live in strategies.db beside
// the graphs: step_runs (one row per executed node), turn_runs (one row per graph run: its branch), tool_runs (tools.js run()).
// Writes are BUFFERED in memory and flushed in one transaction every FLUSH_MS (timer unref'd) — the reply path only pushes to
// an array. 90-day retention. Quality joins improve.db (judge verdicts + defect classes by turn_id) and calls.db (Jev gold) in JS.
import { createHash } from 'crypto';
import { openStrategiesDb, catalog } from './strategies-repo.js';
import { forensicsSince } from './improve-repo.js';
import { listCalls } from './jev-calls-repo.js';

const FLUSH_MS = 2000, MAX_BUFFER = 500, RETAIN_DAYS = 90, PRUNE_EVERY_MS = 6 * 3600_000;
const DAY = 86400_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS step_runs (
  turn_id TEXT, at INTEGER NOT NULL, strategy_id TEXT NOT NULL, strategy_version INTEGER, node TEXT NOT NULL, step_id TEXT,
  step_version INTEGER, activity TEXT, ms REAL, usd REAL, edge TEXT, ok INTEGER NOT NULL DEFAULT 1, jev_ids TEXT);
CREATE INDEX IF NOT EXISTS idx_step_runs_strategy ON step_runs(strategy_id, at);
CREATE INDEX IF NOT EXISTS idx_step_runs_step ON step_runs(step_id, at);
CREATE TABLE IF NOT EXISTS turn_runs (
  turn_id TEXT, at INTEGER NOT NULL, strategy_id TEXT NOT NULL, strategy_version INTEGER, branch_hash TEXT, branch TEXT, ms REAL, usd REAL);
CREATE INDEX IF NOT EXISTS idx_turn_runs_strategy ON turn_runs(strategy_id, at);
CREATE INDEX IF NOT EXISTS idx_turn_runs_turn ON turn_runs(turn_id);
CREATE TABLE IF NOT EXISTS tool_runs (at INTEGER NOT NULL, turn_id TEXT, tool TEXT NOT NULL, ms REAL, ok INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS idx_tool_runs_tool ON tool_runs(tool, at);`;

let conn = null, failed = false;
const statsDb = () => {
  if (conn) return conn;
  conn = openStrategiesDb();
  conn.exec(SCHEMA);
  return conn;
};
/** Tests: use this connection (schema added); null drops it. */
export function setStatsDb(db) { buffer.steps.length = buffer.turns.length = buffer.tools.length = 0; failed = false; conn = db; if (db) db.exec(SCHEMA); }

// ── branch ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A run's branch: the ordered node:edge pairs it took. */
export const branchOf = (trace = []) => trace.map((e) => `${e.node}:${e.edge ?? ''}`);
/** Stable 12-hex hash of a branch (same path → same hash). */
export const branchHash = (branch) => createHash('sha1').update(branch.join('>')).digest('hex').slice(0, 12);
const splitKey = (key) => { const i = String(key ?? '').lastIndexOf('@'); return i < 0 ? [key ?? null, null] : [key.slice(0, i), Number(key.slice(i + 1)) || null]; };

// ── write path (buffered) ─────────────────────────────────────────────────────────────────────────────────────────────
const buffer = { steps: [], turns: [], tools: [] };
let timer = null, lastPrune = 0;
const schedule = () => {
  if (buffer.steps.length + buffer.tools.length >= MAX_BUFFER) { setImmediate(() => flushStepRuns()); return; }
  if (timer) return;
  timer = setTimeout(() => { timer = null; flushStepRuns(); }, FLUSH_MS);
  timer.unref?.();
};

/**
 * Log one turn's graph runs. runs = [{ graph: 'id@v', trace: [{node, step:'id@v', ms, edge}] (+ non-enumerable jevCalls [{id}]) }]. Pure array pushes;
 * the activity of each step is resolved from the catalog (cached). usd = the turn's whole spend (put on every run of the turn).
 */
export function logTurnRuns({ turnId = null, runs = [], usd = null, at = Date.now() } = {}) {
  if (failed || !runs?.length) return 0;
  const byKey = catalog().steps.byKey;
  for (const r of runs) {
    const [sid, sver] = splitKey(r.graph);
    if (!sid || !r.trace?.length) continue;
    const branch = branchOf(r.trace);
    let ms = 0;
    for (const e of r.trace) {
      const [stepId, stepVer] = splitKey(e.step);
      ms += Number(e.ms) || 0;
      const jev = (e.jevCalls || e.jev || []).map((c) => (typeof c === 'object' ? c?.id : c)).filter((x) => x != null);
      buffer.steps.push([turnId, at, sid, sver, e.node, stepId, stepVer, byKey.get(e.step)?.activity ?? null, e.ms ?? null, e.usd ?? null,
        e.edge ?? null, e.error ? 0 : 1, jev.length ? jev.join(',') : null]);
    }
    buffer.turns.push([turnId, at, sid, sver, branchHash(branch), branch.join('>'), Math.round(ms * 100) / 100, usd]);
  }
  schedule();
  return runs.length;
}

/** One tools.js call (name, wall ms, ok). */
export function logToolRun({ tool, ms, ok = true, turnId = null, at = Date.now() }) {
  if (failed || !tool) return;
  buffer.tools.push([at, turnId, tool, Math.round(ms * 100) / 100, ok ? 1 : 0]);
  schedule();
}

/** Write the buffer in one transaction (and prune past retention every few hours). → rows written. Never throws. */
export function flushStepRuns({ now = Date.now() } = {}) {
  if (timer) { clearTimeout(timer); timer = null; }
  const n = buffer.steps.length + buffer.turns.length + buffer.tools.length;
  if (!n) return 0;
  const steps = buffer.steps.splice(0), turns = buffer.turns.splice(0), tools = buffer.tools.splice(0);
  try {
    const db = statsDb();
    const s = db.prepare(`INSERT INTO step_runs (turn_id, at, strategy_id, strategy_version, node, step_id, step_version, activity, ms, usd, edge, ok, jev_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const t = db.prepare('INSERT INTO turn_runs (turn_id, at, strategy_id, strategy_version, branch_hash, branch, ms, usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const o = db.prepare('INSERT INTO tool_runs (at, turn_id, tool, ms, ok) VALUES (?, ?, ?, ?, ?)');
    db.transaction(() => {
      for (const r of steps) s.run(...r);
      for (const r of turns) t.run(...r);
      for (const r of tools) o.run(...r);
      if (now - lastPrune > PRUNE_EVERY_MS) {
        lastPrune = now;
        const cut = now - RETAIN_DAYS * DAY;
        for (const tb of ['step_runs', 'turn_runs', 'tool_runs']) db.prepare(`DELETE FROM ${tb} WHERE at < ?`).run(cut);
      }
    })();
  } catch (err) {
    failed = true;   // a store that cannot be written stops logging (stats are bookkeeping, never the reply)
    console.warn(`[strategy-stats] logging off: ${err.message}`);
    return 0;
  }
  return n;
}

// ── math ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Nearest-rank percentile of numbers (null when empty). */
export function pct(xs, p) {
  const v = xs.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}
const mean = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r2 = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** The improve judge's score: judge_json.score, an integer 0–10 on pass and weak verdicts alike (null before 11-04). */
export const judgeScore = (j) => (j?.score == null || !Number.isFinite(Number(j.score)) ? null : Number(j.score));

/** turn_id → { score, weak, classes[] } from improve.db reply forensics (judged or with defects). */
export function qualityByTurn(days = 7, { forensics = forensicsSince } = {}) {
  const out = new Map();
  let rows = [];
  try { rows = forensics(days, { kind: 'reply' }) || []; } catch { rows = []; }
  for (const r of rows) {
    if (!r.turn_id || out.has(r.turn_id)) continue;   // newest first: the latest judgement wins
    const classes = [...new Set([...(r.defects || []).map((d) => d.class), ...(r.judge?.classes || [])].filter(Boolean))];
    out.set(r.turn_id, { score: judgeScore(r.judge), verdict: r.judge?.verdict ?? null, weak: r.judge?.verdict ? r.judge.verdict === 'weak' : null, classes });
  }
  return out;
}

const since = (days) => Date.now() - Math.max(0.01, Number(days) || 7) * DAY;
const topClasses = (qs, n = 5) => {
  const c = new Map();
  for (const q of qs) for (const k of q.classes) c.set(k, (c.get(k) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([cls, k]) => ({ class: cls, n: k }));
};
/** Aggregate a set of turn_runs rows (+ their quality). */
function aggregate(rows, quality) {
  const qs = rows.map((r) => quality.get(r.turn_id)).filter(Boolean);
  const judged = qs.filter((q) => q.verdict), scored = qs.filter((q) => q.score != null);
  return {
    turns: rows.length,
    p50_ms: pct(rows.map((r) => r.ms), 50), p95_ms: pct(rows.map((r) => r.ms), 95),
    usd_per_turn: r2(mean(rows.map((r) => r.usd)), 5),
    judged: judged.length, n_scored: scored.length, score: r2(mean(scored.map((q) => q.score)), 2),
    weak_pct: judged.length ? r2((100 * judged.filter((q) => q.weak).length) / judged.length, 1) : null,
    top_defects: topClasses(qs),
  };
}

/** Per strategy@version over `days`: turns, share of all turns, p50/p95 ms, $/turn, judged n (a verdict), n_scored + mean judge score (0–10,
 * non-null scores only), weak % (of verdicts), top defect classes. */
export function strategyStats({ days = 7, quality = null } = {}) {
  const rows = statsDb().prepare('SELECT turn_id, strategy_id, strategy_version, ms, usd FROM turn_runs WHERE at >= ?').all(since(days));
  const q = quality || qualityByTurn(days);
  const total = new Set(rows.map((r) => r.turn_id ?? `anon:${Math.random()}`)).size;
  const groups = new Map();
  for (const r of rows) { const k = `${r.strategy_id}@${r.strategy_version}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups].map(([key, rs]) => ({ strategy: rs[0].strategy_id, version: rs[0].strategy_version, key, ...aggregate(rs, q),
    share: total ? r2(rs.length / total, 4) : null })).sort((a, b) => b.turns - a.turns);
}

/** Per branch of one strategy (all versions, or one): the branch, share of the strategy's turns, and the same metrics. */
export function branchStats(strategyId, { days = 7, version = null, quality = null } = {}) {
  const rows = statsDb().prepare(`SELECT turn_id, strategy_version, branch_hash, branch, ms, usd FROM turn_runs WHERE strategy_id = ? AND at >= ?
    ${version != null ? 'AND strategy_version = ?' : ''}`).all(strategyId, since(days), ...(version != null ? [Number(version)] : []));
  const q = quality || qualityByTurn(days);
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.branch_hash)) groups.set(r.branch_hash, []); groups.get(r.branch_hash).push(r); }
  return [...groups].map(([hash, rs]) => ({ hash, branch: String(rs[0].branch || '').split('>').filter(Boolean),
    versions: [...new Set(rs.map((r) => r.strategy_version))], ...aggregate(rs, q), share: rows.length ? r2(rs.length / rows.length, 4) : null }))
    .sort((a, b) => b.turns - a.turns);
}

/**
 * Per step@version: runs, p50/p95 ms, $ (when steps carry it), edge mix. Decision steps whose runs made Jev calls also get
 * accuracy against the gate bank's gold (calls.db `correct`), over at most `maxCalls` calls.
 */
export function stepStats({ days = 7, maxCalls = 2000, callById = (id) => listCalls({ id, limit: 1 })[0] } = {}) {
  const rows = statsDb().prepare('SELECT step_id, step_version, activity, ms, usd, edge, ok, jev_ids FROM step_runs WHERE at >= ? AND step_id IS NOT NULL').all(since(days));
  const groups = new Map();
  for (const r of rows) { const k = `${r.step_id}@${r.step_version}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  let budget = maxCalls;
  return [...groups].map(([key, rs]) => {
    const edges = {};
    for (const r of rs) edges[r.edge ?? ''] = (edges[r.edge ?? ''] || 0) + 1;
    const usd = rs.filter((r) => r.usd != null);
    const out = { step: rs[0].step_id, version: rs[0].step_version, key, activity: rs[0].activity, runs: rs.length,
      p50_ms: pct(rs.map((r) => r.ms), 50), p95_ms: pct(rs.map((r) => r.ms), 95), usd: usd.length ? r2(usd.reduce((a, r) => a + r.usd, 0), 4) : null,
      errors: rs.filter((r) => !r.ok).length, edges };
    const ids = rs.flatMap((r) => (r.jev_ids ? r.jev_ids.split(',').map(Number) : []));
    if (ids.length) {
      let labelled = 0, right = 0;
      for (const id of ids) {
        if (budget-- <= 0) break;
        let c = null;
        try { c = callById(id); } catch { c = null; }
        if (c?.correct == null) continue;
        labelled++; if (c.correct) right++;
      }
      out.jev = { calls: ids.length, labelled, accuracy: labelled ? r2(right / labelled, 3) : null };
    }
    return out;
  }).sort((a, b) => b.runs - a.runs);
}

/** Per tool over `days`: calls, errors, p50/p95 ms. */
export function toolStats({ days = 7 } = {}) {
  const rows = statsDb().prepare('SELECT tool, ms, ok FROM tool_runs WHERE at >= ?').all(since(days));
  const g = new Map();
  for (const r of rows) { if (!g.has(r.tool)) g.set(r.tool, []); g.get(r.tool).push(r); }
  return Object.fromEntries([...g].map(([tool, rs]) => [tool, { calls: rs.length, errors: rs.filter((r) => !r.ok).length,
    p50_ms: pct(rs.map((r) => r.ms), 50), p95_ms: pct(rs.map((r) => r.ms), 95) }]));
}

/** Per activity over `days` (from step_runs): runs, p50 ms, $. */
export function activityStats({ days = 7 } = {}) {
  const rows = statsDb().prepare('SELECT activity, ms, usd FROM step_runs WHERE at >= ? AND activity IS NOT NULL').all(since(days));
  const g = new Map();
  for (const r of rows) { if (!g.has(r.activity)) g.set(r.activity, []); g.get(r.activity).push(r); }
  return Object.fromEntries([...g].map(([a, rs]) => { const u = rs.filter((r) => r.usd != null);
    return [a, { runs: rs.length, p50_ms: pct(rs.map((r) => r.ms), 50), usd: u.length ? r2(u.reduce((s, r) => s + r.usd, 0), 4) : null }]; }));
}
