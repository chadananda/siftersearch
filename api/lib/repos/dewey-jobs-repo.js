// dewey-jobs-repo — Dewey's job registry (dewey_jobs / dewey_job_events / dewey_usage / dewey_flags, migration 185): the one record of
// "what was asked, what happened, who must be told". Small writes only. Callers: lib/dewey/jobs/*, routes/dewey-jobs.js, ops reports.
import { query, queryOne, queryAll } from '../db.js';

const J = (v) => (v == null ? null : JSON.stringify(v));
const P = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const now = () => new Date().toISOString();
const changed = (r) => Number(r?.rows?.[0]?.changes ?? r?.changes ?? 0);
export const TERMINAL = ['published', 'failed', 'cancelled', 'skipped', 'handed-off'];
const parse = (r) => r && { ...r, params: P(r.params, {}), steps: P(r.steps, []), counts: P(r.counts, {}), notify: P(r.notify, {}), result: P(r.result), question: P(r.question) };

/** Create a job, or return the live one with the same idem_key. → { job, created } */
export async function createJob({ kind, by = null, channel = null, params = {}, idemKey = null, parentId = null, notify = {}, itemId = null, state = 'received', maxAttempts = 3 }) {
  const at = now();
  if (idemKey) {
    const same = await queryOne('SELECT * FROM dewey_jobs WHERE idem_key = ? LIMIT 1', [idemKey], 'dewey-jobs:idem');
    if (same) return { job: parse(same), created: false };
  }
  const r = await query(`INSERT OR IGNORE INTO dewey_jobs (parent_id, kind, created_by, channel, params, idem_key, state, notify, item_id, max_attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [parentId, kind, by, channel, J(params), idemKey, state, J(notify), itemId, maxAttempts, at, at], 'dewey-jobs:create');
  if (!changed(r) && idemKey) return { job: await jobByIdem(idemKey), created: false };   // lost the race to a twin
  return { job: await getJob(Number(r.lastInsertRowid)), created: true };
}
export const jobByIdem = async (k) => parse(await queryOne('SELECT * FROM dewey_jobs WHERE idem_key = ?', [k], 'dewey-jobs:by-idem'));
export const getJob = async (id) => parse(await queryOne('SELECT * FROM dewey_jobs WHERE id = ?', [Number(id)], 'dewey-jobs:get'));
export const childrenOf = async (id) => (await queryAll('SELECT * FROM dewey_jobs WHERE parent_id = ? ORDER BY id', [Number(id)], 'dewey-jobs:children')).map(parse);
export const findByItem = async (itemId) => parse(await queryOne('SELECT * FROM dewey_jobs WHERE item_id = ? ORDER BY id DESC LIMIT 1', [Number(itemId)], 'dewey-jobs:by-item'));

/** Change fields (objects JSON-encoded); with expectState the update applies only if the job is still in that state. → true if applied */
export async function updateJob(id, fields = {}, { expectState = null } = {}) {
  const set = { ...fields, updated_at: now() };
  for (const k of ['params', 'steps', 'counts', 'notify', 'result', 'question']) if (set[k] !== undefined) set[k] = J(set[k]);
  const keys = Object.keys(set);
  const r = await query(`UPDATE dewey_jobs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?${expectState ? ' AND state = ?' : ''}`,
    [...keys.map((k) => set[k]), Number(id), ...(expectState ? [expectState] : [])], 'dewey-jobs:update');
  return changed(r) === 1;
}

/** Non-terminal jobs due now: no lease (or expired) and next_run_at reached. Oldest first. */
export async function dueJobs(at = now(), limit = 50) {
  return (await queryAll(`SELECT * FROM dewey_jobs WHERE finished_at IS NULL AND (next_run_at IS NULL OR next_run_at <= ?) AND (lease_until IS NULL OR lease_until <= ?)
    ORDER BY id LIMIT ?`, [at, at, limit], 'dewey-jobs:due')).map(parse);
}
export const openJobs = async (limit = 200) => (await queryAll('SELECT * FROM dewey_jobs WHERE finished_at IS NULL ORDER BY id LIMIT ?', [limit], 'dewey-jobs:open')).map(parse);
export const jobsOf = async (by, { limit = 20, activeOnly = false } = {}) => (await queryAll(`SELECT * FROM dewey_jobs WHERE parent_id IS NULL AND LOWER(created_by) = LOWER(?)
  ${activeOnly ? 'AND finished_at IS NULL' : ''} ORDER BY id DESC LIMIT ?`, [String(by), limit], 'dewey-jobs:of')).map(parse);

/** The oldest queued claimable worker order of these ops ('fetch' | 'unpack'), leased to `worker` for leaseMs. → job | null */
export async function claimOrder(worker, ops, leaseMs = 10 * 60_000) {
  const at = now(), until = new Date(Date.now() + leaseMs).toISOString();
  const cands = (await queryAll(`SELECT * FROM dewey_jobs WHERE finished_at IS NULL AND kind IN (${ops.map(() => '?').join(',')}) AND state IN ('received', 'fetching')
    AND (lease_until IS NULL OR lease_until <= ?) AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY id LIMIT 5`, [...ops, at, at], 'dewey-jobs:claim-scan')).map(parse);
  for (const j of cands) {
    const r = await query(`UPDATE dewey_jobs SET lease_until = ?, worker = ?, state = 'fetching', attempts = attempts + 1, updated_at = ? WHERE id = ? AND (lease_until IS NULL OR lease_until <= ?) AND finished_at IS NULL`,
      [until, worker, at, j.id, at], 'dewey-jobs:claim');
    if (changed(r) === 1) return getJob(j.id);
  }
  return null;
}
export const schedule = (id, at) => query('UPDATE dewey_jobs SET next_run_at = ? WHERE id = ?', [at, Number(id)], 'dewey-jobs:schedule');   // no updated_at bump: that stays "last real change"
export const renewLease = (id, leaseMs = 10 * 60_000) => query('UPDATE dewey_jobs SET lease_until = ? WHERE id = ? AND finished_at IS NULL', [new Date(Date.now() + leaseMs).toISOString(), Number(id)], 'dewey-jobs:lease');

export const addEvent = (jobId, type, data = null) => query('INSERT INTO dewey_job_events (job_id, at, type, data) VALUES (?, ?, ?, ?)', [Number(jobId), now(), String(type).slice(0, 40), J(data)], 'dewey-jobs:event');
export const eventsOf = async (jobId, limit = 50) => (await queryAll('SELECT * FROM dewey_job_events WHERE job_id = ? ORDER BY id DESC LIMIT ?', [Number(jobId), limit], 'dewey-jobs:events')).map((e) => ({ ...e, data: P(e.data) })).reverse();
/** Seconds the last `limit` runs of a step took (events type 'step-done' with data.step/data.s), for the ETA median. */
export const stepSeconds = async (kind, step, limit = 25) => (await queryAll(`SELECT json_extract(e.data, '$.s') AS s FROM dewey_job_events e JOIN dewey_jobs j ON j.id = e.job_id
  WHERE e.type = 'step-done' AND j.kind = ? AND json_extract(e.data, '$.step') = ? ORDER BY e.id DESC LIMIT ?`, [kind, step, limit], 'dewey-jobs:step-seconds')).map((r) => Number(r.s)).filter((n) => n > 0);

// ── usage per person per UTC day (caps) ──
const COLS = ['jobs', 'bytes', 'pages', 'research', 'usd'];
export const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);
export async function bumpUsage(who, delta = {}, day = dayOf()) {
  const v = COLS.map((c) => Number(delta[c]) || 0);
  await query(`INSERT INTO dewey_usage (day, who, jobs, bytes, pages, research, usd) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day, who) DO UPDATE SET ${COLS.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`, [day, String(who).toLowerCase(), ...v], 'dewey-jobs:usage-bump');
}
export const usageOf = async (who, day = dayOf()) => (await queryOne('SELECT * FROM dewey_usage WHERE day = ? AND who = ?', [day, String(who).toLowerCase()], 'dewey-jobs:usage'))
  || { day, who, jobs: 0, bytes: 0, pages: 0, research: 0, usd: 0 };
export const usageTotal = async (day = dayOf()) => Number((await queryOne('SELECT COALESCE(SUM(usd), 0) AS usd FROM dewey_usage WHERE day = ?', [day], 'dewey-jobs:usage-total'))?.usd) || 0;
export const usageByWho = async (day = dayOf()) => queryAll('SELECT * FROM dewey_usage WHERE day = ? ORDER BY usd DESC LIMIT 50', [day], 'dewey-jobs:usage-all');

// ── operator flags (pause switch, one-shot notes) ──
export const getFlag = async (k) => (await queryOne('SELECT v FROM dewey_flags WHERE k = ?', [k], 'dewey-jobs:flag'))?.v ?? null;
export const setFlag = (k, v) => query(`INSERT INTO dewey_flags (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`, [k, v == null ? null : String(v), now()], 'dewey-jobs:flag-set');
export const flagsLike = async (prefix) => queryAll(`SELECT k, v FROM dewey_flags WHERE k LIKE ? ORDER BY k`, [`${prefix}%`], 'dewey-jobs:flags');

/** Recent top-level jobs that are finished or waiting for a decision and carry notice flags — the caller filters by stage (decision | final)
 *  against notify.emailed / notify.chatted, so each stage is announced once. */
export async function noticeCandidates(limit = 200) {
  return (await queryAll(`SELECT * FROM dewey_jobs WHERE parent_id IS NULL AND created_by IS NOT NULL AND (finished_at IS NOT NULL OR state = 'awaiting-decision') AND updated_at > ?
    AND json_extract(notify, '$.quiet') IS NULL ORDER BY id LIMIT ?`, [new Date(Date.now() - 3 * 864e5).toISOString(), limit], 'dewey-jobs:notice')).map(parse);
}

/** For the ops report and system-checks: jobs by kind/state, the oldest open job, stuck ones (no update for stuckMin). */
export async function summary() {
  const byState = await queryAll('SELECT kind, state, COUNT(*) AS n FROM dewey_jobs GROUP BY kind, state', [], 'dewey-jobs:summary');
  // "stuck" = no real change for longer than the kind should take: a download or unzip 30 min, one file of an archive 6 h, a tracked item 48 h
  const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
  const stuck = await queryAll(`SELECT id, kind, state, step, created_by, updated_at FROM dewey_jobs WHERE finished_at IS NULL AND state != 'awaiting-decision' AND COALESCE(step, '') NOT IN ('research', 'waiting') AND (
      (kind IN ('fetch', 'archive') AND updated_at < ?) OR (kind = 'file' AND updated_at < ?) OR (kind NOT IN ('fetch', 'archive', 'file') AND updated_at < ?)) ORDER BY id LIMIT 50`, [ago(30), ago(360), ago(2880)], 'dewey-jobs:stuck');
  const oldest = await queryOne('SELECT id, kind, state, created_at FROM dewey_jobs WHERE finished_at IS NULL ORDER BY id LIMIT 1', [], 'dewey-jobs:oldest');
  const failures = await queryAll(`SELECT error, COUNT(*) AS n FROM dewey_jobs WHERE state = 'failed' AND error IS NOT NULL GROUP BY error ORDER BY n DESC LIMIT 10`, [], 'dewey-jobs:failures');
  const cost = await queryAll(`SELECT substr(created_at, 1, 10) AS day, ROUND(SUM(cost_usd), 4) AS usd FROM dewey_jobs GROUP BY 1 ORDER BY 1 DESC LIMIT 7`, [], 'dewey-jobs:cost');
  return { by_state: byState, stuck, oldest_open: oldest || null, top_failures: failures, cost_by_day: cost };
}
