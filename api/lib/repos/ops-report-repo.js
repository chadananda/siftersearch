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

export const getRun = async (id) => parse(await queryOne('SELECT * FROM ops_report_runs WHERE id = ?', [id]));
export const latest = async (name) => parse(await queryOne(`SELECT * FROM ops_report_runs WHERE name = ? AND status = 'done' ORDER BY id DESC LIMIT 1`, [name]));
export const recent = async (limit = 20) => (await queryAll('SELECT id, name, params, status, requested_at, finished_at, ms, error FROM ops_report_runs ORDER BY id DESC LIMIT ?', [limit])).map(parse);

/** Oldest queued run → mark running. → run or null */
export async function claimNext({ skip = [], only = [] } = {}) {
  const where = [`status = 'queued'`], args = [];
  if (only.length) { where.push(`name IN (${only.map(() => '?').join(',')})`); args.push(...only); }
  if (skip.length) { where.push(`name NOT IN (${skip.map(() => '?').join(',')})`); args.push(...skip); }
  // carry runs protect paid work (HyPE, alignment): they go ahead of plain re-ingest batches
  // quick answers first (spend, audits, verify), then carry runs (they protect paid work), then bulk batches
  const r = await queryOne(`SELECT * FROM ops_report_runs WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN name IN ('spend', 'languages', 'ctai-audit', 'carry-verify', 'block-mismatch') THEN 0 WHEN name = 'reingest-carry' THEN 1 ELSE 2 END, id LIMIT 1`, args);
  if (!r) return null;
  const u = await query(`UPDATE ops_report_runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'`, [now(), r.id]);
  return u?.changes === 0 ? null : parse(r);   // another lane took it
}

/** Drop a QUEUED run (a running one is left to finish). → the run row */
export async function cancel(id) {
  await query(`UPDATE ops_report_runs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'queued'`, [now(), id]);
  return getRun(id);
}

export async function finish(id, { result = null, error = null, ms = null }) {
  await query('UPDATE ops_report_runs SET status = ?, finished_at = ?, ms = ?, result = ?, error = ? WHERE id = ?',
    [error ? 'failed' : 'done', now(), ms, result == null ? null : JSON.stringify(result), error, id]);
}

/** A worker restart leaves runs 'running' forever — requeue them on start. */
export const requeueStale = () => query(`UPDATE ops_report_runs SET status = 'queued', started_at = NULL WHERE status = 'running'`);
