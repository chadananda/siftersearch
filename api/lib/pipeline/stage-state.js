// The pipeline's memory. Stages RECORD what they did here; nobody re-derives it by counting columns.
// This is the fix for the class of bug that has cost this project the most: three different definitions of
// "done" disagreeing, and progress being inferred from side effects so that "never started" and "nothing to
// do" looked identical. Deps: db (content, single-writer via query()).
//
// CONVENTION: every timestamp is an epoch INTEGER. Mixing epoch ints with ISO text produced three separate
// comparison bugs in one day — one silently matching zero rows, one silently matching every row.
import { query, queryOne, queryAll } from '../db.js';

export const STAGES = ['convert', 'ingest'];
export const TERMINAL = ['done', 'rejected'];          // reached an outcome; not retried by a normal pass
export const RETRYABLE = ['pending', 'failed'];        // eligible for the next run

const now = () => Math.floor(Date.now() / 1000);
const q = (d) => d?.query || query;
const q1 = (d) => d?.queryOne || queryOne;
const qa = (d) => d?.queryAll || queryAll;

// ── Runs: one row per execution of a stage, so "when did this last actually run?" is a lookup ──────────
export async function beginRun(stage, deps = {}) {
  await q(deps)(`INSERT INTO pipeline_run (stage, status, started_at) VALUES (?, 'running', ?)`, [stage, now()]);
  const row = await q1(deps)(`SELECT id FROM pipeline_run WHERE stage = ? ORDER BY id DESC LIMIT 1`, [stage]);
  return row?.id ?? null;
}

export async function endRun(runId, { itemsIn = 0, itemsOut = 0, rejected = 0, failed = 0, reasons = {}, lastError = null, note = null } = {}, deps = {}) {
  if (runId == null) return;
  await q(deps)(`UPDATE pipeline_run SET status = ?, finished_at = ?, items_in = ?, items_out = ?,
      items_rejected = ?, items_failed = ?, reasons_json = ?, last_error = ?, note = ? WHERE id = ?`,
  [lastError ? 'error' : 'ok', now(), itemsIn, itemsOut, rejected, failed,
    JSON.stringify(reasons || {}), lastError ? String(lastError).slice(0, 500) : null, note, runId]);
}

// ── Per-item state: the FACT of what happened to this thing at this stage ──────────────────────────────
/**
 * @param {string} itemRef stable id (stub doc id as text, or library-relative path)
 * @param {string} stage
 * @param {object} o { status, version, reason, error, docId, payload, bumpAttempt }
 */
export async function markStage(itemRef, stage, o = {}, deps = {}) {
  const ref = String(itemRef);
  await q(deps)(`INSERT INTO ingest_stage (item_ref, stage, status, version, attempts, reason, last_error, doc_id, payload_json, started_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(item_ref, stage) DO UPDATE SET
        status = excluded.status,
        version = COALESCE(excluded.version, ingest_stage.version),
        attempts = ingest_stage.attempts + ?,
        reason = excluded.reason,
        last_error = excluded.last_error,
        doc_id = COALESCE(excluded.doc_id, ingest_stage.doc_id),
        payload_json = COALESCE(excluded.payload_json, ingest_stage.payload_json),
        updated_at = excluded.updated_at`,
  [ref, stage, o.status || 'pending', o.version ?? null, o.bumpAttempt ? 1 : 0,
    o.reason ?? null, o.error ? String(o.error).slice(0, 500) : null, o.docId ?? null,
    o.payload ? JSON.stringify(o.payload) : null, o.startedAt ?? now(), now(),
    o.bumpAttempt ? 1 : 0]);
}

export async function getStage(itemRef, stage, deps = {}) {
  return q1(deps)(`SELECT * FROM ingest_stage WHERE item_ref = ? AND stage = ?`, [String(itemRef), stage]);
}

/** Items this stage should pick up: never attempted, or failed and under the attempt ceiling. */
export async function claimable(stage, { limit = 40, maxAttempts = 3 } = {}, deps = {}) {
  return qa(deps)(`SELECT * FROM ingest_stage
      WHERE stage = ? AND status IN ('pending','failed') AND attempts < ?
      ORDER BY attempts ASC, updated_at ASC LIMIT ?`, [stage, maxAttempts, limit]);
}

// ── The ONE call that answers "what is going on" without investigation ─────────────────────────────────
/**
 * Per stage: counts by status, why things were rejected, the last run and its throughput, whether anything
 * is stuck (running far longer than a run should take), and the most recent error.
 */
export async function ingestStatus({ stuckMinutes = 45 } = {}, deps = {}) {
  const counts = await qa(deps)(`SELECT stage, status, COUNT(*) n FROM ingest_stage GROUP BY stage, status`);
  const reasons = await qa(deps)(`SELECT stage, reason, COUNT(*) n FROM ingest_stage
      WHERE status = 'rejected' AND reason IS NOT NULL GROUP BY stage, reason ORDER BY n DESC`);
  const runs = await qa(deps)(`SELECT * FROM pipeline_run WHERE id IN
      (SELECT MAX(id) FROM pipeline_run GROUP BY stage)`);
  const recent = await qa(deps)(`SELECT id, stage, status, started_at, finished_at, items_in, items_out,
      items_rejected, items_failed, last_error FROM pipeline_run ORDER BY id DESC LIMIT 20`);
  const errors = await qa(deps)(`SELECT stage, item_ref, last_error, attempts, updated_at FROM ingest_stage
      WHERE status = 'failed' AND last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 10`);

  const byStage = {};
  for (const stage of STAGES) byStage[stage] = { status: {}, rejected_reasons: [], last_run: null, stuck: false, waiting: 0, done: 0 };
  for (const c of counts) {
    byStage[c.stage] ||= { status: {}, rejected_reasons: [], last_run: null, stuck: false, waiting: 0, done: 0 };
    byStage[c.stage].status[c.status] = c.n;
  }
  for (const r of reasons) if (byStage[r.stage]) byStage[r.stage].rejected_reasons.push({ reason: r.reason, count: r.n });
  for (const run of runs) {
    if (!byStage[run.stage]) continue;
    byStage[run.stage].last_run = run;
    // A run still 'running' long past any plausible batch is STUCK — the state we could not see before.
    byStage[run.stage].stuck = run.status === 'running' && (now() - run.started_at) > stuckMinutes * 60;
  }
  for (const [, v] of Object.entries(byStage)) {
    v.waiting = (v.status.pending || 0) + (v.status.failed || 0);
    v.done = v.status.done || 0;
  }
  return { generated_at: new Date().toISOString(), stages: byStage, recent_runs: recent, recent_errors: errors };
}

/** Put failed items back in the queue (after a fix). Returns how many were reset. */
export async function retryFailed(stage, { limit = 500 } = {}, deps = {}) {
  const rows = await qa(deps)(`SELECT item_ref FROM ingest_stage WHERE stage = ? AND status = 'failed' LIMIT ?`, [stage, limit]);
  if (!rows.length) return 0;
  await q(deps)(`UPDATE ingest_stage SET status = 'pending', attempts = 0, last_error = NULL, updated_at = ?
      WHERE stage = ? AND status = 'failed'`, [now(), stage]);
  return rows.length;
}
