// Shared harness for a pipeline stage script: honour an API run-request, open a run record, count outcomes,
// close the run. Exists so every stage reports the SAME shape and no stage can silently do nothing —
// "never started", "ran and found nothing", and "stuck mid-batch" are different rows, not the same silence.
// Deps: pipeline/stage-state (records), pipeline/peak (window). Used by convert/ingest scripts.
import { nowInPeak, peakEndsAt } from '../../api/lib/pipeline/peak.js';
import * as state from '../../api/lib/pipeline/stage-state.js';
import { queryOne, query } from '../../api/lib/db.js';

/**
 * Should this stage run right now? Peak-only by default, but an explicit API request beats the window —
 * an operator asking for a batch should not have to wait for tomorrow's pricing calendar.
 * @returns {Promise<{run: boolean, why: string, requestId: number|null}>}
 */
export async function shouldRun(stage, { anyTime = false } = {}) {
  const req = await queryOne(
    `SELECT id FROM pipeline_run WHERE stage = ? AND status = 'requested' ORDER BY id LIMIT 1`, [stage])
    .catch(() => null);
  if (req) return { run: true, why: 'requested via API', requestId: req.id };
  if (anyTime) return { run: true, why: '--any-time', requestId: null };
  if (nowInPeak()) return { run: true, why: 'peak window (grounding paused)', requestId: null };
  // "grounding owns the box" is a claim about grounding, not about the clock — so CHECK IT. With the plan at
  // 881/893 the grounding queue is empty, so every off-peak tick skipped for an owner that was not there:
  // an 8-hour window (16:30–00:30 UTC) idle on both sides while 4,023 books sat holding sources. Neither
  // convert nor ingest makes an AI call (pure fs + sqlite), so an idle box costs nothing but CPU to use.
  // The guard is unchanged whenever grounding IS working, and the next tick hands the box straight back
  // (batches are --limit bounded), so this can defer but never contend (2026-08-14).
  const busy = await queryOne(
    `SELECT COUNT(*) AS n FROM grounding_queue WHERE status IN ('queued','running')`, [],
    'stage-runner:grounding-depth')
    // Fail CLOSED. This catch is deliberate and directional: an unreadable guard yields null, which falls
    // through to the skip below. Swallowing to null is only safe because null means "do less", not "do more".
    .catch(() => null);
  const ends = peakEndsAt();
  if (busy && Number(busy.n) === 0) {
    return { run: true, why: 'off-peak, but the grounding queue is EMPTY — using an otherwise idle box', requestId: null };
  }
  // busy===null means the depth could not be READ (missing table, DB blip). An unreadable guard must never
  // authorise work, so fall through to the original skip rather than assume the box is free.
  const depth = busy ? `${busy.n} queued/running` : 'depth unreadable';
  return { run: false, why: `off-peak — grounding owns the box (${depth})${ends ? `, until ${ends.toISOString()}` : ''}`, requestId: null };
}

/**
 * Wrap the body of a stage. Always closes the run — including on a throw, so a crash leaves an ERROR row
 * rather than a run stuck at 'running' forever (which is exactly what "stuck" detection reads).
 * @param {string} stage
 * @param {(tally: {in:number,out:number,rejected:number,failed:number,reason:(r:string)=>void}) => Promise<any>} body
 */
export async function runStage(stage, opts, body) {
  const decision = await shouldRun(stage, opts);
  if (!decision.run) { console.log(`${stage}: skipping — ${decision.why}`); return { skipped: true, why: decision.why }; }
  console.log(`${stage}: running — ${decision.why}`);

  // Consume the request FIRST: if the body throws, the request must not re-fire forever.
  if (decision.requestId) {
    await query(`UPDATE pipeline_run SET status = 'consumed', finished_at = unixepoch() WHERE id = ?`,
      [decision.requestId]).catch(() => {});
  }

  const reasons = {};
  const tally = { in: 0, out: 0, rejected: 0, failed: 0, reason: (r) => { const k = String(r || 'unknown').slice(0, 80); reasons[k] = (reasons[k] || 0) + 1; } };
  // RECORDING MUST NOT BE ABLE TO STOP THE WORK. If the state tables are missing (a deploy that lands before
  // its migration) or the DB is briefly unavailable, the stage still runs — unrecorded and loudly so, rather
  // than not at all. Observability is not allowed to become a new single point of failure.
  let runId = null;
  try { runId = await state.beginRun(stage); }
  catch (err) { console.log(`${stage}: WARNING could not open a run record (${err.message}) — running unrecorded`); }
  let lastError = null;
  try {
    return await body(tally);
  } catch (err) {
    lastError = err?.message || String(err);
    throw err;
  } finally {
    if (runId != null) {
      await state.endRun(runId, {
        itemsIn: tally.in, itemsOut: tally.out, rejected: tally.rejected, failed: tally.failed,
        reasons, lastError,
        // Carry the backlog into the note so "how many are left?" is answerable from the run record alone:
        // /ingest/status' "waiting" counts only items already touched, because the work-list comes from SQL.
        note: tally.backlog != null ? `${decision.why} · backlog ${tally.backlog}` : decision.why,
      }).catch((e) => console.log(`${stage}: failed to close run record: ${e.message}`));
    }
    console.log(`${stage}: in=${tally.in} out=${tally.out} rejected=${tally.rejected} failed=${tally.failed}${lastError ? ` error=${lastError}` : ''}`);
  }
}
