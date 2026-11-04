// improve-repo — the improvement cycle's own SQLite (IMPROVE_DB, default /tank/sifter/audit/improve.db beside audits.db):
// per-item forensics + Opus judge verdicts, deep-analysis suggestions (deduped, evidence-counted), worker cursors.
// Written by api/workers/improve-worker.js; the admin routes read it and set a suggestion's status. Not the content DB.
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { targetOf, targetClass } from '../audit/improve-targets.js';

export const IMPROVE_DB = () => process.env.IMPROVE_DB || '/tank/sifter/audit/improve.db';
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS forensics (
  item_key TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL, session_id TEXT, asked_at TEXT, route TEXT,
  defects_json TEXT, payload_json TEXT, backfill INTEGER DEFAULT 0,
  judge_state TEXT DEFAULT 'pending', judge_json TEXT, judge_usd REAL DEFAULT 0, judge_tokens_json TEXT,
  deep_state TEXT DEFAULT 'none', deep_usd REAL DEFAULT 0, attempts INTEGER DEFAULT 0, error TEXT,
  priority INTEGER DEFAULT 3, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS idx_forensics_work ON forensics(judge_state, deep_state, priority, asked_at);
CREATE INDEX IF NOT EXISTS idx_forensics_asked ON forensics(asked_at);
CREATE TABLE IF NOT EXISTS improvements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, stage TEXT NOT NULL, file TEXT, fn TEXT, change TEXT NOT NULL, expected_effect TEXT,
  classes_json TEXT, severity INTEGER DEFAULT 2, evidence_n INTEGER DEFAULT 1, evidence_json TEXT,
  status TEXT DEFAULT 'open', status_note TEXT, status_at TEXT, first_seen TEXT, last_seen TEXT);
CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvements(status);
CREATE TABLE IF NOT EXISTS improve_cursor (name TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS behavior_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, scenario TEXT NOT NULL, proposal INTEGER, state TEXT NOT NULL, checks_json TEXT, commit_sha TEXT, at TEXT);
CREATE INDEX IF NOT EXISTS idx_behavior_runs ON behavior_runs(proposal, scenario, id);`;
// Columns added after the first deploy (idempotent ALTERs on every writable open): the deep analysis's own conclusion
// (diagnosis, root cause, the improvement ids it produced or confirmed) and when each step ran (throughput per hour);
// each improvement's target (who can apply it: data for the live loop, code for Claude Code) and who reviewed it, when.
const ADDED_COLUMNS = [['forensics', 'deep_json', 'TEXT'], ['forensics', 'judged_at', 'TEXT'], ['forensics', 'deep_at', 'TEXT'],
  ['improvements', 'target', 'TEXT'], ['improvements', 'reviewed_at', 'TEXT'], ['improvements', 'reviewed_by', 'TEXT'],
  // 11-04 v2: a CODE fix's acceptance scenarios (improve.js parseScenario); a DATA fix's strategy and the candidate (id@version) testing it
  ['improvements', 'scenarios_json', 'TEXT'], ['improvements', 'strategy', 'TEXT'], ['improvements', 'candidate', 'TEXT']];
const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
function evolve(db) {
  for (const [t, c, type] of ADDED_COLUMNS) if (!hasColumn(db, t, c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type}`);
  // rows from before the analyst named a target: inferred from stage + file (improve-targets.js), once
  const old = db.prepare('SELECT id, stage, file FROM improvements WHERE target IS NULL').all();
  if (old.length) { const set = db.prepare('UPDATE improvements SET target = ? WHERE id = ?'); db.transaction(() => { for (const r of old) set.run(targetOf(r), r.id); })(); }
}

/** Open (and create) the store. Callers close it; tests pass ':memory:'. */
export function openImproveDb(path = IMPROVE_DB(), { readonly = false } = {}) {
  if (readonly && path !== ':memory:' && !existsSync(path)) return null;
  if (!readonly && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, readonly ? { readonly: true, fileMustExist: true } : {});
  db.pragma('busy_timeout = 5000');
  if (!readonly) { db.pragma('journal_mode = WAL'); db.exec(SCHEMA); evolve(db); }
  return db;
}
const withDb = (opts, fn, { readonly = false } = {}) => {
  const db = opts?.db || openImproveDb(IMPROVE_DB(), { readonly });
  if (!db) return null;
  try { return fn(db); } finally { if (!opts?.db) db.close(); }
};

export const getCursor = (db, name) => db.prepare('SELECT value FROM improve_cursor WHERE name = ?').get(name)?.value ?? null;
export const setCursor = (db, name, value) => db.prepare(`INSERT INTO improve_cursor (name, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(name, String(value), nowIso());

/** One forensic item (reply or search). Re-recording keeps an existing judge verdict. judge_state: 'pending' (judge it),
 *  'covered' (a search inside a turn — the reply's judge and deep analysis see it), 'clean' (no turn, no forensic defect). */
export function recordForensic(db, it) {
  db.prepare(`INSERT INTO forensics (item_key, kind, ref_id, session_id, asked_at, route, defects_json, payload_json, backfill, priority, judge_state, created_at, updated_at)
    VALUES (@item_key, @kind, @ref_id, @session_id, @asked_at, @route, @defects_json, @payload_json, @backfill, @priority, @judge_state, @now, @now)
    ON CONFLICT(item_key) DO UPDATE SET defects_json = excluded.defects_json, payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .run({ item_key: it.key, kind: it.kind, ref_id: String(it.ref_id), session_id: it.session_id ?? null, asked_at: it.asked_at ?? null, route: it.route ?? null,
      defects_json: JSON.stringify(it.defects || []), payload_json: JSON.stringify(it), backfill: it.backfill ? 1 : 0, priority: it.priority ?? 3, judge_state: it.judge_state || 'pending', now: nowIso() });
}

/** Searches queued before 11-04's judge-the-reply rule: a turn's search waits on nothing — its reply is judged. → rows changed */
export const deferCoveredSearches = (db) => db.prepare(`UPDATE forensics SET judge_state = 'covered', updated_at = ? WHERE kind = 'search' AND judge_state = 'pending'
  AND json_extract(payload_json, '$.turn_id') IS NOT NULL`).run(nowIso()).changes;

/** The next unit of LLM work, in priority order (deep on weak replies, judge replies, deep on weak searches, judge searches, backfill). */
export function nextWork(db, { maxAttempts = 5 } = {}) {
  const r = db.prepare(`SELECT *, CASE WHEN deep_state = 'pending' AND backfill = 0 THEN (CASE kind WHEN 'reply' THEN 0 ELSE 2 END) ELSE priority END AS p
    FROM forensics WHERE attempts < ? AND (judge_state = 'pending' OR deep_state = 'pending')
    ORDER BY p, asked_at DESC LIMIT 1`).get(maxAttempts);
  return r ? { ...r, step: r.deep_state === 'pending' ? 'deep' : 'judge', item: safeJson(r.payload_json), judge: safeJson(r.judge_json) } : null;
}
export function saveJudge(db, key, { judge, usd, usage }) {
  const now = nowIso();
  db.prepare(`UPDATE forensics SET judge_state = 'done', judge_json = ?, judge_usd = ?, judge_tokens_json = ?, deep_state = ?, error = NULL, judged_at = ?, updated_at = ? WHERE item_key = ?`)
    .run(JSON.stringify(judge), usd, JSON.stringify(usage || null), judge.verdict === 'weak' ? 'pending' : 'none', now, now, key);
}
/** deep = { diagnosis, root_cause, improvement_ids } — the analysis's conclusion, kept beside the suggestions it produced. */
export function saveDeepDone(db, key, { usd, deep = null }) {
  const now = nowIso();
  db.prepare(`UPDATE forensics SET deep_state = 'done', deep_usd = ?, deep_json = ?, error = NULL, deep_at = ?, updated_at = ? WHERE item_key = ?`)
    .run(usd, deep ? JSON.stringify(deep) : null, now, now, key);
}
export function noteFailure(db, key, error) {
  db.prepare('UPDATE forensics SET attempts = attempts + 1, error = ?, updated_at = ? WHERE item_key = ?').run(String(error).slice(0, 500), nowIso(), key);
}

export const openImprovements = (db) => db.prepare(`SELECT * FROM improvements WHERE status IN ('open','accepted')`).all();
/** Apply mergeSuggestions() output: new rows, or +1 evidence on the matching open one (severity keeps its max).
 *  → the improvement ids this item produced or confirmed (inserted first, then bumped). */
export function applySuggestions(db, { inserts = [], bumps = [] }) {
  const ids = [];
  const now = nowIso();
  const ins = db.prepare(`INSERT INTO improvements (stage, file, fn, target, strategy, change, expected_effect, scenarios_json, classes_json, severity, evidence_n, evidence_json, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`);
  const get = db.prepare('SELECT evidence_json FROM improvements WHERE id = ?');
  // a repeat keeps the first scenarios (first wins); a row written before scenarios existed takes the new ones
  const upd = db.prepare(`UPDATE improvements SET evidence_n = evidence_n + 1, evidence_json = ?, severity = MAX(severity, ?), last_seen = ?,
    scenarios_json = COALESCE(scenarios_json, ?), strategy = COALESCE(strategy, ?) WHERE id = ?`);
  const sj = (xs) => (xs?.length ? JSON.stringify(xs) : null);
  db.transaction(() => {
    for (const s of inserts) ids.push(Number(ins.run(s.stage, s.file, s.fn, targetOf(s), s.strategy ?? null, s.change, s.expected_effect, sj(s.scenarios),
      JSON.stringify(s.classes || []), s.severity, JSON.stringify(s.evidence || []), now, now).lastInsertRowid));
    for (const b of bumps) {
      ids.push(b.id);
      const ev = safeJson(get.get(b.id)?.evidence_json) || [];
      if (ev.includes(b.evidence_key)) continue;
      upd.run(JSON.stringify([...ev, b.evidence_key].slice(-50)), b.severity, now, sj(b.scenarios), b.strategy ?? null, b.id);
    }
  })();
  return ids;
}

// ── Phase 4 (the worker's handle): DATA suggestions → one tested strategy candidate; the status follows the outcome ──
/** Open DATA suggestions no candidate is testing yet. */
export const untestedDataSuggestions = (db) => db.prepare(`SELECT * FROM improvements WHERE status = 'open' AND candidate IS NULL
  AND target IN ('strategy', 'step', 'template') ORDER BY id`).all();
/** DATA suggestions a candidate (id@version) is testing now — still open, candidate set. */
export const testingSuggestions = (db) => db.prepare("SELECT * FROM improvements WHERE status = 'open' AND candidate IS NOT NULL ORDER BY id").all();
export function markTesting(db, ids, candidate) {
  const st = db.prepare('UPDATE improvements SET candidate = ? WHERE id = ?');
  db.transaction(() => { for (const id of ids) st.run(candidate, Number(id)); })();
}
/** The system settles DATA suggestions (no human step): done | rejected with its reason; reviewed_by 'system'. */
export function settleSuggestions(db, ids, status, note) {
  for (const id of ids) setImprovementStatus(id, status, note, { db }, 'system');
}

// ── reads for the admin routes (read-only open; a missing store reads as empty) ──
export const listImprovements = ({ status = null, limit = 200 } = {}, opts) => withDb(opts, (db) => db.prepare(
  `SELECT * FROM improvements ${status ? 'WHERE status = ?' : ''} ORDER BY evidence_n * severity DESC, last_seen DESC LIMIT ?`)
  .all(...(status ? [status] : []), Math.min(Number(limit) || 200, 1000))
  .map((r) => ({ ...r, classes: safeJson(r.classes_json) || [], evidence: safeJson(r.evidence_json) || [] })), { readonly: true }) || [];

/** One improvement by id (the proposal file tests/behavior/proposed/<id>.json is written from it). → row | null */
export const getImprovement = (id, opts) => withDb(opts, (db) => {
  const r = db.prepare('SELECT * FROM improvements WHERE id = ?').get(Number(id));
  return r ? { ...r, classes: safeJson(r.classes_json) || [], evidence: safeJson(r.evidence_json) || [] } : null;
}, { readonly: true }) || null;

export const IMPROVEMENT_STATUSES = ['open', 'accepted', 'done', 'rejected'];
/** by = who set it (an admin's email, or 'internal-key' for ops tooling) → reviewed_by/reviewed_at. → rows changed */
export function setImprovementStatus(id, status, note = null, opts, by = null) {
  if (!IMPROVEMENT_STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${IMPROVEMENT_STATUSES.join('|')}`), { statusCode: 400 });
  const now = nowIso();
  return withDb(opts, (db) => db.prepare('UPDATE improvements SET status = ?, status_note = ?, status_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
    .run(status, note, now, now, by, Number(id)).changes);
}

/** Forensic rows (with their judge verdicts) asked in the last `days`; `prevDays` more for the trend. */
export const forensicsSince = (days = 30, { kind = null, limit = 20000 } = {}, opts) => withDb(opts, (db) => {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  return db.prepare(`SELECT item_key, kind, ref_id, session_id, json_extract(payload_json, '$.turn_id') AS turn_id, asked_at, route, defects_json, judge_state, judge_json, judge_usd, deep_state, deep_usd
    FROM forensics WHERE asked_at >= ? ${kind ? 'AND kind = ?' : ''} ORDER BY asked_at DESC LIMIT ?`)
    .all(since, ...(kind ? [kind] : []), limit)
    .map((r) => ({ ...r, defects: safeJson(r.defects_json) || [], judge: safeJson(r.judge_json) }));
}, { readonly: true }) || [];

/** Spend + verdict counts for the last `days` (for $/item and the daily projection). */
export const improveStats = (days = 1, opts) => withDb(opts, (db) => {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  return db.prepare(`SELECT kind, COUNT(*) AS items, SUM(judge_state = 'done') AS judged, SUM(json_extract(judge_json, '$.verdict') = 'weak') AS weak,
      SUM(deep_state = 'done') AS deep, ROUND(SUM(judge_usd), 4) AS judge_usd, ROUND(SUM(deep_usd), 4) AS deep_usd,
      SUM(judge_state = 'pending') AS judge_pending, SUM(deep_state = 'pending') AS deep_pending
    FROM forensics WHERE updated_at >= ? GROUP BY kind`).all(since);
}, { readonly: true }) || [];

/** The live improvement report's reads (Chad 11-04: "audits, their conclusions, the solutions") in one read-only open:
 *  pipeline counts per kind (window by asked_at; backlog all-time; last hour by judged_at/deep_at), improve $ (window, UTC
 *  today), the latest weak verdicts, the deep analyses, the improvements, and the forensic rows their evidence names.
 *  Filters: kind (pipeline, audits, conclusions), stage (audits by judge stage, improvements by stage), status (improvements).
 *  A store written before deep_json/judged_at existed reads them as NULL (the API opens read-only; the worker ALTERs).
 *  → null when the store does not exist yet. */
export const improveReportData = ({ days = 7, since = null, kind = null, stage = null, status = null, target = null, limit = 50, now = Date.now() } = {}, opts) => withDb(opts, (db) => {
  const ts = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const p = { since: since ? ts(Date.parse(since)) : ts(now - days * 86400000), hourAgo: ts(now - 3600000), today: `${ts(now).slice(0, 10)} 00:00:00`, kind, stage, status,
    lim: Math.min(Number(limit) || 50, 500) };
  const has = (c) => hasColumn(db, 'forensics', c);
  const judgedAt = has('judged_at') ? 'COALESCE(judged_at, updated_at)' : 'updated_at';
  const deepAt = has('deep_at') ? 'COALESCE(deep_at, updated_at)' : 'updated_at';
  const kindSql = kind ? 'AND kind = @kind' : '';
  const pipeline = db.prepare(`SELECT kind, COALESCE(SUM(asked_at >= @since), 0) AS items, COALESCE(SUM(asked_at >= @since AND judge_state = 'done'), 0) AS judged,
      COALESCE(SUM(asked_at >= @since AND json_extract(judge_json, '$.verdict') = 'weak'), 0) AS weak,
      COALESCE(SUM(asked_at >= @since AND deep_state = 'done'), 0) AS deep_done,
      SUM(judge_state = 'pending') AS judge_pending, SUM(deep_state = 'pending') AS deep_pending,
      SUM(judge_state = 'done' AND ${judgedAt} >= @hourAgo) AS judged_last_hour, SUM(deep_state = 'done' AND ${deepAt} >= @hourAgo) AS deep_last_hour,
      SUM(attempts >= 5 AND (judge_state = 'pending' OR deep_state = 'pending')) AS stuck
    FROM forensics WHERE 1 = 1 ${kindSql} GROUP BY kind ORDER BY kind`).all(p);
  const spend = db.prepare(`SELECT
      ROUND(COALESCE(SUM(CASE WHEN ${judgedAt} >= @since THEN judge_usd END), 0) + COALESCE(SUM(CASE WHEN ${deepAt} >= @since THEN deep_usd END), 0), 4) AS window_usd,
      ROUND(COALESCE(SUM(CASE WHEN ${judgedAt} >= @today THEN judge_usd END), 0) + COALESCE(SUM(CASE WHEN ${deepAt} >= @today THEN deep_usd END), 0), 4) AS today_usd
    FROM forensics`).get(p);
  const row = `item_key, kind, ref_id, session_id, json_extract(payload_json, '$.turn_id') AS turn_id,
    json_extract(payload_json, '$.question') AS question, asked_at, route`;
  const audits = db.prepare(`SELECT ${row}, defects_json, judge_json, judge_usd, deep_state, deep_usd, ${judgedAt} AS judged_at
    FROM forensics WHERE json_extract(judge_json, '$.verdict') = 'weak' ${kindSql} ${stage ? "AND json_extract(judge_json, '$.stage') = @stage" : ''}
    ORDER BY ${judgedAt} DESC LIMIT @lim`).all(p);
  const conclusions = db.prepare(`SELECT ${row}, judge_json, ${has('deep_json') ? 'deep_json' : 'NULL AS deep_json'}, deep_usd, ${deepAt} AS deep_at
    FROM forensics WHERE deep_state = 'done' ${kindSql} ORDER BY ${deepAt} DESC LIMIT @lim`).all(p);
  // target: 'code' | 'data' | one target name — filtered here (rows from a store not yet evolved read their inferred target)
  const improvements = db.prepare(`SELECT * FROM improvements WHERE 1 = 1 ${status ? 'AND status = @status' : ''} ${stage ? 'AND stage = @stage' : ''}
    ${since ? 'AND (last_seen >= @since OR status_at >= @since)' : ''} ORDER BY evidence_n * severity DESC, last_seen DESC`).all(p)
    .filter((r) => !target || target === targetClass(targetOf(r)) || target === targetOf(r)).slice(0, p.lim);
  const one = db.prepare(`SELECT ${row}, judge_json FROM forensics WHERE item_key = ?`);
  const evidence = new Map();
  for (const k of new Set(improvements.flatMap((r) => safeJson(r.evidence_json) || []))) { const r = one.get(k); if (r) evidence.set(k, r); }
  return { pipeline, spend, audits, conclusions, improvements, evidence };
}, { readonly: true });

/** The daily digest's reads (improve.js improveDigest shapes them): verdicts judged since `since`, improve $ since then, every
 *  improvement seen, created or reviewed since then, and the forensic rows its evidence names (with judged_at, to tell new
 *  evidence from old). since = ISO. → null when the store does not exist yet. */
export const improveDigestData = ({ since }, opts) => withDb(opts, (db) => {
  const p = { since: new Date(Date.parse(since)).toISOString().slice(0, 19).replace('T', ' ') };
  const has = (c) => hasColumn(db, 'forensics', c);
  const judgedAt = has('judged_at') ? 'COALESCE(judged_at, updated_at)' : 'updated_at';
  const deepAt = has('deep_at') ? 'COALESCE(deep_at, updated_at)' : 'updated_at';
  const judged = db.prepare(`SELECT item_key, kind, judge_json FROM forensics WHERE judge_state = 'done' AND ${judgedAt} >= @since`).all(p);
  const spend_usd = db.prepare(`SELECT COALESCE(SUM(CASE WHEN ${judgedAt} >= @since THEN judge_usd END), 0) + COALESCE(SUM(CASE WHEN ${deepAt} >= @since THEN deep_usd END), 0) AS usd FROM forensics`).get(p).usd;
  const improvements = db.prepare(`SELECT * FROM improvements WHERE last_seen >= @since OR first_seen >= @since OR status_at >= @since`).all(p);
  const one = db.prepare(`SELECT item_key, kind, ref_id, session_id, json_extract(payload_json, '$.turn_id') AS turn_id, ${judgedAt} AS judged_at FROM forensics WHERE item_key = ?`);
  const evidence = new Map();
  for (const k of new Set(improvements.flatMap((r) => safeJson(r.evidence_json) || []))) { const r = one.get(k); if (r) evidence.set(k, r); }
  // proposals with acceptance scenarios still waiting for Claude Code, and the last behaviour run of each scenario (tests/behavior/run.mjs)
  const proposals = hasColumn(db, 'improvements', 'scenarios_json')
    ? db.prepare("SELECT * FROM improvements WHERE status IN ('open', 'accepted') AND scenarios_json IS NOT NULL ORDER BY evidence_n * severity DESC LIMIT 100").all() : [];
  return { judged, spend_usd, improvements, evidence, proposals, runs: lastBehaviorRuns(db) };
}, { readonly: true });
const lastBehaviorRuns = (db) => (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'behavior_runs'").get()
  ? new Map(db.prepare('SELECT proposal, scenario, state, at FROM behavior_runs WHERE id IN (SELECT MAX(id) FROM behavior_runs GROUP BY proposal, scenario)').all()
    .map((r) => [`${r.proposal ?? ''}|${r.scenario}`, { state: r.state, at: r.at }])) : new Map());

/** The progress page's reads (improve-overview.js shapes them), one read-only open, no question text:
 *  judged/weak/score per UTC day for 30 days (by judged_at), the last 7 days vs the 7 before, judged in the last hour and
 *  today, the backlog, diagnoses this week, the improvements open or touched in 30 days, their evidence rows (ids only)
 *  and improve $ today. A store not yet evolved reads the new columns as NULL. → null when the store does not exist yet. */
export const improveOverviewData = ({ now = Date.now() } = {}, opts) => withDb(opts, (db) => {
  const ts = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const p = { d30: `${ts(now - 29 * 86400000).slice(0, 10)} 00:00:00`, d7: ts(now - 7 * 86400000), d14: ts(now - 14 * 86400000),
    hourAgo: ts(now - 3600000), today: `${ts(now).slice(0, 10)} 00:00:00` };
  const has = (t, c) => hasColumn(db, t, c);
  const judgedAt = has('forensics', 'judged_at') ? 'COALESCE(judged_at, updated_at)' : 'updated_at';
  const deepAt = has('forensics', 'deep_at') ? 'COALESCE(deep_at, updated_at)' : 'updated_at';
  const score = "CAST(json_extract(judge_json, '$.score') AS REAL)";
  const weak = "json_extract(judge_json, '$.verdict') = 'weak'";
  const daily = db.prepare(`SELECT substr(${judgedAt}, 1, 10) AS day, COUNT(*) AS judged, COALESCE(SUM(${weak}), 0) AS weak,
      SUM(${score}) AS score_sum, COUNT(${score}) AS score_n
    FROM forensics WHERE judge_state = 'done' AND ${judgedAt} >= @d30 GROUP BY day ORDER BY day`).all(p);
  const win = (from, to) => db.prepare(`SELECT COUNT(*) AS judged, COALESCE(SUM(${weak}), 0) AS weak, SUM(${score}) AS score_sum, COUNT(${score}) AS score_n
    FROM forensics WHERE judge_state = 'done' AND ${judgedAt} >= ? AND ${judgedAt} < ?`).get(from, to);
  const counts = db.prepare(`SELECT COALESCE(SUM(judge_state = 'done' AND ${judgedAt} >= @hourAgo), 0) AS judged_last_hour,
      COALESCE(SUM(judge_state = 'done' AND ${judgedAt} >= @today), 0) AS judged_today,
      COALESCE(SUM(deep_state = 'done' AND ${deepAt} >= @d7), 0) AS diagnosed_7d,
      COALESCE(SUM(attempts < 5 AND (judge_state = 'pending' OR deep_state = 'pending')), 0) AS backlog,
      COALESCE(SUM(kind = 'reply' AND created_at >= @today), 0) AS replies_today,
      ROUND(COALESCE(SUM(CASE WHEN ${judgedAt} >= @today THEN judge_usd END), 0) + COALESCE(SUM(CASE WHEN ${deepAt} >= @today THEN deep_usd END), 0), 4) AS today_usd
    FROM forensics`).get(p);
  const cols = ['scenarios_json', 'strategy', 'candidate', 'reviewed_by'].map((c) => (has('improvements', c) ? c : `NULL AS ${c}`)).join(', ');
  const improvements = db.prepare(`SELECT id, stage, file, fn, target, change, severity, evidence_n, evidence_json, status, status_note, status_at,
      first_seen, last_seen, ${cols}
    FROM improvements WHERE status IN ('open', 'accepted') OR last_seen >= @d30 OR status_at >= @d30`).all(p)
    .map((r) => ({ ...r, target: r.target || targetOf(r) }));
  const one = db.prepare(`SELECT item_key, kind, ref_id, session_id, json_extract(payload_json, '$.turn_id') AS turn_id FROM forensics WHERE item_key = ?`);
  const evidence = new Map();
  for (const r of improvements) {
    if (!['open', 'accepted'].includes(r.status) || targetClass(r.target) !== 'code') continue;
    for (const k of (safeJson(r.evidence_json) || []).slice(-3)) { const e = one.get(k); if (e) evidence.set(k, e); }
  }
  return { daily, w7: win(p.d7, ts(now + 1000)), wprev: win(p.d14, p.d7), counts, improvements, evidence };
}, { readonly: true });

/** The deep analyses (diagnosis, root cause, judge why) behind evidence keys — the edit designer's context. Never the question. */
export function diagnosesFor(db, keys = []) {
  const deep = hasColumn(db, 'forensics', 'deep_json') ? 'deep_json' : 'NULL AS deep_json';
  const one = db.prepare(`SELECT ${deep}, json_extract(judge_json, '$.why') AS why, json_extract(judge_json, '$.score') AS score FROM forensics WHERE item_key = ?`);
  return [...new Set(keys)].map((k) => { const r = one.get(k); if (!r) return null; const d = safeJson(r.deep_json) || {};
    return { diagnosis: d.diagnosis ?? null, root_cause: d.root_cause ?? null, judge_why: r.why ?? null, score: r.score ?? null }; }).filter(Boolean);
}

// ── the decision-theory loop's reads (jev-tuning/theories.js) ──
/** Weak verdicts whose judge named a Jev gate (+ the right option), newest first — the theory loop's input. Never more than `limit`. */
export const weakGateVerdicts = (db, { limit = 20 } = {}) => db.prepare(`SELECT item_key, json_extract(payload_json, '$.question') AS question,
    json_extract(payload_json, '$.turn_id') AS turn_id, judge_json FROM forensics WHERE judge_state = 'done'
    AND json_extract(judge_json, '$.verdict') = 'weak' AND json_extract(judge_json, '$.gate') IS NOT NULL
    ORDER BY COALESCE(judged_at, updated_at) DESC LIMIT ?`).all(limit)
  .map((r) => { const j = safeJson(r.judge_json) || {}; return { item_key: r.item_key, question: r.question, turn_id: r.turn_id, gate: j.gate, right: j.right ?? null,
    why: j.why ?? null, classes: j.classes || [], severity: j.severity ?? null }; });

/** Historic questions a strategy served (forensic reply payloads carry path.strategy.choice as `strategy`), newest first, distinct. */
export const strategyQuestions = (db, strategy, { limit = 6 } = {}) => db.prepare(`SELECT DISTINCT json_extract(payload_json, '$.question') AS q FROM forensics
    WHERE kind = 'reply' AND json_extract(payload_json, '$.strategy') = ? AND json_extract(payload_json, '$.question') IS NOT NULL
    ORDER BY asked_at DESC LIMIT ?`).all(strategy, limit).map((r) => r.q);

// ── behaviour scenarios (tests/behavior/run.mjs posts each run through the admin API) ──
export const BEHAVIOR_STATES = ['passing', 'failing'];
/** rows: [{ scenario, proposal?, state, checks, commit? }] → inserted count */
export function recordBehaviorRuns(rows = [], opts) {
  return withDb(opts, (db) => {
    const ins = db.prepare('INSERT INTO behavior_runs (scenario, proposal, state, checks_json, commit_sha, at) VALUES (?, ?, ?, ?, ?, ?)');
    const at = nowIso();
    let n = 0;
    db.transaction(() => { for (const r of rows) { if (!r?.scenario || !BEHAVIOR_STATES.includes(r.state)) continue;
      ins.run(String(r.scenario).slice(0, 200), r.proposal != null ? Number(r.proposal) : null, r.state, JSON.stringify(r.checks || []), r.commit ?? null, at); n++; } })();
    return n;
  });
}
/** The last run per (proposal, scenario). → Map 'proposal|scenario' → { state, at } (empty when the table is not there yet). */
export const behaviorRunStates = (opts) => withDb(opts, lastBehaviorRuns, { readonly: true }) || new Map();
