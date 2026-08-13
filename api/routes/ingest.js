// Ingestion control + status over the API. Mounted at /api/admin/ingest.
// The point of this file: answering "is ingestion working?" must be ONE request, never an investigation.
// Before it existed, "never started", "running", and "nothing to do" were indistinguishable from off-box —
// current_activity only measures AI spend (conversion spends none) and the missing-books queue is TTL-frozen.
//
// Deliberate design: the API does NOT execute worker processes. It RECORDS a request; the stage's own cron
// process picks it up on its next tick and honours it even outside the peak window. Keeping execution in the
// worker and intent in the API is why a control-plane request can never half-run or block a request thread.
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import * as state from '../lib/pipeline/stage-state.js';
import { nowInPeak, peakEndsAt } from '../lib/pipeline/peak.js';

export default async function ingestRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  // ── THE one status call ────────────────────────────────────────────────────────────────────────────
  // Per stage: counts by status, why things were rejected, the last run + its throughput, whether a run is
  // stuck, and the most recent per-item errors. Plus whether the window even allows work right now, so a
  // deliberately-paused pipeline never reads as broken.
  fastify.get('/ingest/status', admin, async () => {
    const st = await state.ingestStatus();
    const inPeak = nowInPeak();
    const requested = await queryAll(
      `SELECT stage, id, started_at FROM pipeline_run WHERE status = 'requested' ORDER BY id`);
    return {
      ...st,
      window: {
        // Conversion/ingest run in the PEAK window precisely because grounding is paused then.
        ingest_allowed_now: inPeak,
        reason: inPeak ? 'peak window — grounding paused, ingestion runs' : 'off-peak — grounding owns the box',
        peak_ends_at: inPeak ? peakEndsAt()?.toISOString() : null,
      },
      pending_requests: requested,
    };
  });

  fastify.get('/ingest/runs', admin, async (req) => {
    const stage = req.query?.stage;
    const limit = Math.min(Number(req.query?.limit) || 30, 200);
    const rows = stage
      ? await queryAll(`SELECT * FROM pipeline_run WHERE stage = ? ORDER BY id DESC LIMIT ?`, [stage, limit])
      : await queryAll(`SELECT * FROM pipeline_run ORDER BY id DESC LIMIT ?`, [limit]);
    return { runs: rows };
  });

  // Everything known about one item, across stages — "what happened to this book?" without grepping logs.
  fastify.get('/ingest/item/:ref', admin, async (req) => {
    const rows = await queryAll(`SELECT * FROM ingest_stage WHERE item_ref = ? ORDER BY stage`, [String(req.params.ref)]);
    if (!rows.length) throw ApiError.notFound(`no pipeline state for item ${req.params.ref}`);
    return { item_ref: String(req.params.ref), stages: rows };
  });

  // Why did things get rejected? Rejection is DATA, not a log line — this is how the quality gate gets tuned.
  fastify.get('/ingest/rejections', admin, async (req) => {
    const stage = req.query?.stage || 'convert';
    const limit = Math.min(Number(req.query?.limit) || 50, 500);
    const [reasons, items] = await Promise.all([
      queryAll(`SELECT reason, COUNT(*) n FROM ingest_stage WHERE stage = ? AND status = 'rejected'
                GROUP BY reason ORDER BY n DESC`, [stage]),
      queryAll(`SELECT item_ref, reason, payload_json, updated_at FROM ingest_stage
                 WHERE stage = ? AND status = 'rejected' ORDER BY updated_at DESC LIMIT ?`, [stage, limit]),
    ]);
    return { stage, reasons, items };
  });

  // ── Control ────────────────────────────────────────────────────────────────────────────────────────
  // Ask a stage to run at its next tick, even outside the peak window. The API records intent only.
  fastify.post('/ingest/run/:stage', admin, async (req) => {
    const stage = String(req.params.stage);
    if (!state.STAGES.includes(stage)) throw ApiError.badRequest(`unknown stage '${stage}' (expected: ${state.STAGES.join(', ')})`);
    const existing = await queryOne(`SELECT id FROM pipeline_run WHERE stage = ? AND status = 'requested'`, [stage]);
    if (existing) return { stage, requested: true, run_id: existing.id, note: 'a request was already pending' };
    await query(`INSERT INTO pipeline_run (stage, status, started_at, note) VALUES (?, 'requested', unixepoch(), ?)`,
      [stage, `requested via API${nowInPeak() ? '' : ' (off-peak — will run anyway)'}`]);
    const row = await queryOne(`SELECT id FROM pipeline_run WHERE stage = ? ORDER BY id DESC LIMIT 1`, [stage]);
    logger.info({ stage, runId: row?.id }, 'ingest: run requested via API');
    return { stage, requested: true, run_id: row?.id, note: 'the stage picks this up on its next tick and ignores the peak gate' };
  });

  // After a fix, put failed items back in the queue. Rejected items are NOT touched: a rejection is a
  // judgement about the source (scanned PDF, no text layer), not a transient error to retry blindly.
  fastify.post('/ingest/retry/:stage', admin, async (req) => {
    const stage = String(req.params.stage);
    if (!state.STAGES.includes(stage)) throw ApiError.badRequest(`unknown stage '${stage}'`);
    const n = await state.retryFailed(stage, { limit: Math.min(Number(req.body?.limit) || 500, 5000) });
    logger.info({ stage, reset: n }, 'ingest: failed items returned to the queue');
    return { stage, reset: n };
  });
}
