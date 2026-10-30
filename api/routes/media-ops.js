// The media internal API (X-Internal-Key; mounted by ops-reports.js under /api/admin): progress, per-talk status from the stage ledger,
// talks by stage, add, redo. Logic in api/lib/media/media-status.js (shared with Dewey). Plan: planning/media-ledger-plan-20261030.md
import { requireInternal } from '../lib/auth.js';
import { mediaProgress, mediaStatus, mediaAdd, mediaRedo } from '../lib/media/media-status.js';

export default async function mediaOps(fastify) {
  const guard = { preHandler: requireInternal };
  const by = (req) => String(req.headers['x-by'] || req.body?.by || 'ops').slice(0, 60);
  fastify.get('/ops/media/progress', guard, async () => mediaProgress());
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
}
