// ops-report-repo — the queue + results of server-side ops reports (ops_report_runs, migration 146).
// Callers: api/routes/ops-reports.js (enqueue/read), api/workers/reports-worker.js (claim/finish). Deps: db.js.
import { query, queryOne, queryAll } from '../db.js';

const now = () => new Date().toISOString();
const parse = (r) => (r ? { ...r, params: r.params ? JSON.parse(r.params) : null, result: r.result ? JSON.parse(r.result) : null } : null);

/** Queue a run; an identical queued/running run is reused instead of piling up. → run row */
export async function enqueue(name, params = null, requestedBy = 'internal') {
  const p = params ? JSON.stringify(params) : null;
  const same = await queryOne(`SELECT * FROM ops_report_runs WHERE name = ? AND COALESCE(params, '') = COALESCE(?, '') AND status IN ('queued', 'running') ORDER BY id DESC LIMIT 1`, [name, p]);
  if (same) return parse(same);
  const r = await query('INSERT INTO ops_report_runs (name, params, status, requested_by, requested_at) VALUES (?, ?, ?, ?, ?)', [name, p, 'queued', requestedBy, now()]);
  return getRun(Number(r.lastInsertRowid));
}

/** Queued or running runs of one job — to tell "already on its way" when params differ (a priority flag). */
export const pendingRuns = async (name) => (await queryAll(`SELECT id, params, status FROM ops_report_runs WHERE status IN ('queued', 'running') AND name = ?`, [name])).map(parse);

/** RUNNING runs of these jobs (the live views: what is being worked on now). */
export const runningRuns = async (names = []) => (names.length ? (await queryAll(`SELECT id, name, params FROM ops_report_runs WHERE status = 'running' AND name IN (${names.map(() => '?').join(',')})`, names)).map(parse) : []);

export const getRun = async (id) => parse(await queryOne('SELECT * FROM ops_report_runs WHERE id = ?', [id]));
export const latest = async (name) => parse(await queryOne(`SELECT * FROM ops_report_runs WHERE name = ? AND status = 'done' ORDER BY id DESC LIMIT 1`, [name]));
export const recent = async (limit = 20) => (await queryAll('SELECT id, name, params, status, requested_at, finished_at, ms, error FROM ops_report_runs ORDER BY id DESC LIMIT ?', [limit])).map(parse);

/** Oldest queued run → mark running. → run or null */
export async function claimNext({ skip = [], only = [] } = {}) {
  const where = [`status = 'queued'`], args = [];
  if (only.length) { where.push(`name IN (${only.map(() => '?').join(',')})`); args.push(...only); }
  if (skip.length) { where.push(`name NOT IN (${skip.map(() => '?').join(',')})`); args.push(...skip); }
  // a run queued with params.priority = true goes first in its lane (10-18: re-fetching nine finished SLP results should not
  // wait hours behind 58 fresh OCR jobs)
  // carry runs protect paid work (HyPE, alignment): they go ahead of plain re-ingest batches
  // quick answers first (spend, audits, verify), then carry runs (they protect paid work), then bulk batches
  const r = await queryOne(`SELECT * FROM ops_report_runs WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN params LIKE '%"priority":true%' THEN 0 ELSE 1 END,
      CASE WHEN name IN ('spend', 'languages', 'ctai-audit', 'carry-verify', 'block-mismatch') THEN 0 WHEN name = 'reingest-carry' THEN 1 ELSE 2 END, id LIMIT 1`, args);
  if (!r) return null;
  const u = await query(`UPDATE ops_report_runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'`, [now(), r.id]);
  // through the single writer the count is rows[0].changes, not .changes — reading only .changes let every lane "win" the
  // same run (10-16: three indexers ran job 105 while 106/107 waited). No count at all = not claimed.
  const changes = u?.changes ?? u?.rows?.[0]?.changes;
  return changes === 1 ? parse(r) : null;   // another lane took it
}

/** Drop a QUEUED run (a running one is left to finish). → the run row */
export async function cancel(id) {
  // a RUNNING run can be cancelled too (10-20: a library-wide authorship run had to be paused overnight): it is marked now,
  // stops at its next yield point when the service drains, and is never requeued (requeueStale takes 'running' only)
  await query(`UPDATE ops_report_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'running')`, [now(), id]);
  return getRun(id);
}

/** A yielding job's resume point (merged into its params) — the requeued run continues there instead of from the start. */
export async function saveResume(id, params) {
  await query(`UPDATE ops_report_runs SET params = ? WHERE id = ? AND status = 'running'`, [JSON.stringify(params), id]);
}

export async function finish(id, { result = null, error = null, ms = null }) {
  // a run cancelled while it ran keeps 'cancelled' (its result is still recorded)
  await query(`UPDATE ops_report_runs SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE ? END, finished_at = ?, ms = ?, result = ?, error = ? WHERE id = ?`,
    [error ? 'failed' : 'done', now(), ms, result == null ? null : JSON.stringify(result), error, id]);
}

/** A worker restart leaves runs 'running' forever — requeue them on start. */
/** Interrupted runs back to the queue — ONLY the jobs the calling service runs (only): a service restarting must never
 *  requeue, and so double-run, another service's live job (10-19: reports' restart requeued reports-carry's). */
export const requeueStale = ({ only = [] } = {}) => (only.length
  ? query(`UPDATE ops_report_runs SET status = 'queued', started_at = NULL WHERE status = 'running' AND name IN (${only.map(() => '?').join(',')})`, only)
  : Promise.resolve({ changes: 0 }));
