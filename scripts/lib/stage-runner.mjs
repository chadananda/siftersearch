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
  const ends = peakEndsAt();
  return { run: false, why: `off-peak — grounding owns the box${ends ? `, until ${ends.toISOString()}` : ''}`, requestId: null };
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
        reasons, lastError, note: decision.why,
      }).catch((e) => console.log(`${stage}: failed to close run record: ${e.message}`));
    }
    console.log(`${stage}: in=${tally.in} out=${tally.out} rejected=${tally.rejected} failed=${tally.failed}${lastError ? ` error=${lastError}` : ''}`);
  }
}
