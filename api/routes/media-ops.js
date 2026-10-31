// The media internal API (X-Internal-Key; mounted by ops-reports.js under /api/admin): progress, per-talk status from the stage ledger,
// talks by stage, add, redo, worker-image promotion. Logic in api/lib/media/media-status.js (shared with Dewey). Plan: planning/media-ledger-plan-20261030.md
import { join, dirname } from 'path';
import { requireInternal } from '../lib/auth.js';
import { mediaProgress, mediaStatus, mediaAdd, mediaRedo } from '../lib/media/media-status.js';

export default async function mediaOps(fastify) {
  const guard = { preHandler: requireInternal };
  const by = (req) => String(req.headers['x-by'] || req.body?.by || 'ops').slice(0, 60);
  fastify.get('/ops/media/progress', guard, async () => mediaProgress());
  // per-host load history (gauge-log.js): ?host=Podsprocket&hours=6&rows=1 → summary (+ raw rows)
  fastify.get('/ops/media/gauges', guard, async (req) => {
    const q = req.query || {}, G = await import('../lib/media/gauge-log.js'), { STATE_FILE } = await import('../lib/media/cloud.js');
    const hours = Math.min(Number(q.hours) || 6, 24 * G.KEEP_DAYS), now = Date.now();
    const rows = await G.readGaugeLog(join(dirname(STATE_FILE), 'gauges'), { sinceMs: now - hours * 3600_000, host: q.host || '', now });
    return { hours, hosts: G.summarizeGauges(rows), ...(q.rows === '1' ? { rows: rows.slice(-2000) } : {}) };
  });
  fastify.get('/ops/media/items', guard, async (req) => {
    const q = req.query || {};
    if (q.q) return { matches: await (await import('../lib/repos/media-ledger-repo.js')).findTalks(String(q.q)) };
    if (!q.stage) return { error: 'stage (with status or missing=1) or q required' };
    return { items: await (await import('../lib/repos/media-ledger-repo.js')).itemsByStage({ stage: String(q.stage), status: String(q.status || 'done'), missing: q.missing === '1' || q.missing === 'true', afterId: q.after, limit: q.limit }) };
  });
  fastify.get('/ops/media/items/:ref', guard, async (req, reply) => {
    const r = await mediaStatus(req.params.ref);
    return r.item || r.matches?.length ? r : reply.code(404).send({ error: 'no such talk', ...r });
  });
  fastify.post('/ops/media/items', guard, async (req, reply) => {
    const r = await mediaAdd({ urls: [].concat(req.body?.urls || req.body?.url || []), paths: [].concat(req.body?.paths || req.body?.path || []), by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
  fastify.post('/ops/media/items/:id/redo', guard, async (req, reply) => {
    const r = await mediaRedo({ ids: [req.params.id], stages: [].concat(req.body?.stages || []), by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
  // promote an Aorus-accepted whole-recording image (the pods' immutable image; never an ssh edit of data/run on tower)
  fastify.post('/ops/media/worker-image', guard, async (req, reply) => {
    const b = req.body || {}, r = await (await import('../lib/media/cloud.js')).promoteWorker({ image: b.image, evidence: b.evidence, home_image: b.home_image, quiet_hosts: b.quiet_hosts, by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
}
