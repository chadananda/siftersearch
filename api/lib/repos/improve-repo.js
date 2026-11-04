// improve-repo — the improvement cycle's own SQLite (IMPROVE_DB, default /tank/sifter/audit/improve.db beside audits.db):
// per-item forensics + Opus judge verdicts, deep-analysis suggestions (deduped, evidence-counted), worker cursors.
// Written by api/workers/improve-worker.js; the admin routes read it and set a suggestion's status. Not the content DB.
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

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
CREATE TABLE IF NOT EXISTS improve_cursor (name TEXT PRIMARY KEY, value TEXT, updated_at TEXT);`;

/** Open (and create) the store. Callers close it; tests pass ':memory:'. */
export function openImproveDb(path = IMPROVE_DB(), { readonly = false } = {}) {
  if (readonly && path !== ':memory:' && !existsSync(path)) return null;
  if (!readonly && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, readonly ? { readonly: true, fileMustExist: true } : {});
  db.pragma('busy_timeout = 5000');
  if (!readonly) { db.pragma('journal_mode = WAL'); db.exec(SCHEMA); }
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
  db.prepare(`UPDATE forensics SET judge_state = 'done', judge_json = ?, judge_usd = ?, judge_tokens_json = ?, deep_state = ?, error = NULL, updated_at = ? WHERE item_key = ?`)
    .run(JSON.stringify(judge), usd, JSON.stringify(usage || null), judge.verdict === 'weak' ? 'pending' : 'none', nowIso(), key);
}
export function saveDeepDone(db, key, { usd }) {
  db.prepare(`UPDATE forensics SET deep_state = 'done', deep_usd = ?, error = NULL, updated_at = ? WHERE item_key = ?`).run(usd, nowIso(), key);
}
export function noteFailure(db, key, error) {
  db.prepare('UPDATE forensics SET attempts = attempts + 1, error = ?, updated_at = ? WHERE item_key = ?').run(String(error).slice(0, 500), nowIso(), key);
}

export const openImprovements = (db) => db.prepare(`SELECT * FROM improvements WHERE status IN ('open','accepted')`).all();
/** Apply mergeSuggestions() output: new rows, or +1 evidence on the matching open one (severity keeps its max). */
export function applySuggestions(db, { inserts = [], bumps = [] }) {
  const now = nowIso();
  const ins = db.prepare(`INSERT INTO improvements (stage, file, fn, change, expected_effect, classes_json, severity, evidence_n, evidence_json, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`);
  const get = db.prepare('SELECT evidence_json FROM improvements WHERE id = ?');
  const upd = db.prepare('UPDATE improvements SET evidence_n = evidence_n + 1, evidence_json = ?, severity = MAX(severity, ?), last_seen = ? WHERE id = ?');
  db.transaction(() => {
    for (const s of inserts) ins.run(s.stage, s.file, s.fn, s.change, s.expected_effect, JSON.stringify(s.classes || []), s.severity, JSON.stringify(s.evidence || []), now, now);
    for (const b of bumps) {
      const ev = safeJson(get.get(b.id)?.evidence_json) || [];
      if (ev.includes(b.evidence_key)) continue;
      upd.run(JSON.stringify([...ev, b.evidence_key].slice(-50)), b.severity, now, b.id);
    }
  })();
}

// ── reads for the admin routes (read-only open; a missing store reads as empty) ──
export const listImprovements = ({ status = null, limit = 200 } = {}, opts) => withDb(opts, (db) => db.prepare(
  `SELECT * FROM improvements ${status ? 'WHERE status = ?' : ''} ORDER BY evidence_n * severity DESC, last_seen DESC LIMIT ?`)
  .all(...(status ? [status] : []), Math.min(Number(limit) || 200, 1000))
  .map((r) => ({ ...r, classes: safeJson(r.classes_json) || [], evidence: safeJson(r.evidence_json) || [] })), { readonly: true }) || [];

export const IMPROVEMENT_STATUSES = ['open', 'accepted', 'done', 'rejected'];
export function setImprovementStatus(id, status, note = null, opts) {
  if (!IMPROVEMENT_STATUSES.includes(status)) throw Object.assign(new Error(`status must be one of ${IMPROVEMENT_STATUSES.join('|')}`), { statusCode: 400 });
  return withDb(opts, (db) => db.prepare('UPDATE improvements SET status = ?, status_note = ?, status_at = ? WHERE id = ?').run(status, note, nowIso(), Number(id)).changes);
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
