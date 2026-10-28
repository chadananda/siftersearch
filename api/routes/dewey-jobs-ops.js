// Dewey job registry over the internal API (X-Internal-Key): the WORKER contract (claim · event · blob · complete · fail), job detail,
// the operator valve and email preference. Nothing here fetches or unpacks — workers do (scripts/dewey/worker); tower hands out orders,
// takes streamed files onto disk and records. Mounted by ops-reports.js (prefix /api/admin).
import { createReadStream } from 'node:fs';
import { requireInternal } from '../lib/auth.js';
import * as repo from '../lib/repos/dewey-jobs-repo.js';
import { makeWorkerApi } from '../lib/dewey/jobs/worker.js';
import { makeRegistry } from '../lib/dewey/jobs/registry.js';
import { whoOf } from '../lib/dewey/jobs/policy.js';

export default async function deweyJobsOps(fastify) {
  const api = makeWorkerApi();
  const worker = (req) => String(req.headers['x-dewey-worker'] || req.body?.worker || '').slice(0, 60);
  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload));
  const guard = { preHandler: requireInternal };

  fastify.post('/ops/dewey-jobs/claim', guard, async (req) => api.claim(worker(req) || 'worker'));
  fastify.post('/ops/dewey-jobs/:id/event', guard, async (req) => api.event(Number(req.params.id), worker(req), req.body || {}));
  fastify.post('/ops/dewey-jobs/:id/complete', guard, async (req) => api.complete(Number(req.params.id), worker(req), req.body?.result || {}));
  fastify.post('/ops/dewey-jobs/:id/fail', guard, async (req) => api.fail(Number(req.params.id), worker(req), req.body?.error, req.body?.retryable !== false));
  fastify.put('/ops/dewey-jobs/:id/blob', { ...guard, bodyLimit: 3 * 1024 ** 3 }, async (req, reply) => {
    try {
      return await api.receiveBlob(Number(req.params.id), worker(req), { name: String(req.query?.name || 'file'), kind: req.query?.kind === 'media' ? 'media' : 'doc', sha256: req.headers['x-sha256'] || null, stream: req.body });
    } catch (e) { return reply.code(e.statusCode || 500).send({ error: e.message }); }
  });
  // a small input held on tower (a ZIP that came by email, <= 25 MB), for the worker to read
  fastify.get('/ops/dewey-jobs/:id/input', guard, async (req, reply) => {
    const job = await repo.getJob(Number(req.params.id));
    if (!job?.params?.spool || !/^[\w./-]+$/.test(job.params.spool) || job.params.spool.includes('..')) return reply.code(404).send({ error: 'no input' });
    return reply.header('content-type', 'application/octet-stream').send(createReadStream(job.params.spool));
  });
  fastify.get('/ops/dewey-jobs/:id', guard, async (req, reply) => {
    const job = await repo.getJob(Number(req.params.id));
    if (!job) return reply.code(404).send({ error: 'no such job' });
    return { job, children: await repo.childrenOf(job.id), events: await repo.eventsOf(job.id, 100) };
  });
  fastify.post('/ops/dewey-jobs/:id/cancel', guard, async (req) => {
    const reg = makeRegistry(repo), job = await repo.getJob(Number(req.params.id));
    if (!job) return { status: 'none' };
    for (const k of await repo.childrenOf(job.id)) await reg.advance(k.id, 'cancelled', { result: { reason: 'cancelled' } }).catch(() => {});
    return { job: await reg.advance(job.id, 'cancelled', { result: { reason: 'cancelled by an operator' } }) };
  });
  // the operator valve: {off:true, reason?} pauses all new Dewey jobs; {off:false} lifts it. DEWEY_V2=0 in the environment does the same at boot.
  fastify.post('/ops/dewey-jobs/pause', guard, async (req) => {
    const off = req.body?.off !== false;
    await repo.setFlag('paused', off ? (req.body?.reason || '1') : '0');
    return { paused: off };
  });
  fastify.post('/ops/dewey-jobs/email-pref', guard, async (req) => {
    const who = whoOf(req.body?.who); if (!who.includes('@')) return { error: 'who must be an email address' };
    await repo.setFlag(`email-pref:${who}`, req.body?.on === false ? '0' : '1');
    return { who, email: req.body?.on !== false };
  });
}
