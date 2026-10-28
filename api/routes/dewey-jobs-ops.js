// Dewey job registry over the internal API (X-Internal-Key): the WORKER contract (claim · event · blob · complete · fail), job detail,
// the operator valve and email preference. Nothing here fetches or unpacks — workers do (scripts/dewey/worker); tower hands out orders,
// takes streamed files onto disk and records. Mounted by ops-reports.js (prefix /api/admin).
import { createReadStream } from 'node:fs';
import { requireInternal } from '../lib/auth.js';
import * as repo from '../lib/repos/dewey-jobs-repo.js';
import { makeWorkerApi } from '../lib/dewey/jobs/worker.js';
import { parseTarget } from '../lib/dewey/net-guard.js';
import { makeRegistry, canonicalUrl } from '../lib/dewey/jobs/registry.js';
import { whoOf } from '../lib/dewey/jobs/policy.js';
import { isTerminal } from '../lib/dewey/jobs/states.js';

export default async function deweyJobsOps(fastify) {
  const api = makeWorkerApi();
  const worker = (req) => String(req.headers['x-dewey-worker'] || req.body?.worker || '').slice(0, 60);
  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload));
  const guard = { preHandler: requireInternal };

  fastify.post('/ops/dewey-jobs/claim', guard, async (req) => api.claim(worker(req) || 'worker', req.body?.ops));
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
  // a batch: a parent job with one fetch child per page/link, in the order given (workers claim by id). Used by operators for lists of talks.
  // body { by, channel?, name, emailMe?, items:[{ url, title?, speaker?, year?, resolve?: 'audio-page' }] }
  fastify.post('/ops/dewey-jobs/start-batch', guard, async (req, reply) => {
    const { by, channel = 'email', name = 'a list of links', emailMe = true } = req.body || {}, items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 700) : [];
    if (!whoOf(by).includes('@') || !items.length) return reply.code(400).send({ error: 'by (an email) and items are required' });
    const reg = makeRegistry(repo);
    const parent = await reg.startJob({ kind: 'batch', by, channel, params: { name, count: items.length, first: items[0].url }, notify: { chat: true, email: !!emailMe } });
    if (parent.refused) return reply.code(429).send(parent);
    if (!parent.created) return { job_id: parent.job.id, already: true };
    let n = 0;
    for (const [i, it] of items.entries()) {
      try { parseTarget(it.url); } catch { continue; }
      const r = await reg.startJob({ kind: 'fetch', by, channel, parentId: parent.job.id, key: `batch:${parent.job.id}:${i}`, free: true, maxAttempts: 48,
        params: { url: canonicalUrl(it.url), ...(it.resolve === 'audio-page' ? { resolve: 'audio-page' } : {}), title: it.title || null, speaker: it.speaker || null, year: it.year || null } });
      if (r.created) n++;
    }
    await reg.advance(parent.job.id, 'processing', { step: 'children', detail: `${n} links` });
    await reg.rollup(parent.job.id);
    return { job_id: parent.job.id, children: n };
  });
  // repoint children of a batch to working source URLs: body { parent, map: { "<original page url or path ending>": "<new url>" } }; the child is retried at once.
  fastify.post('/ops/dewey-jobs/repoint', guard, async (req, reply) => {
    const { parent, map } = req.body || {};
    if (!parent || !map || typeof map !== 'object') return reply.code(400).send({ error: 'parent and map required' });
    const reg = makeRegistry(repo), done = [];
    for (const k of await repo.childrenOf(Number(parent))) {
      const hit = Object.entries(map).find(([from]) => from && k.params?.url && k.params.url.endsWith(from));
      if (!hit || k.kind !== 'fetch' || isTerminal(k.state)) continue;
      try { parseTarget(hit[1]); } catch { continue; }
      await repo.updateJob(k.id, { params: { ...k.params, page: k.params.page || k.params.url, url: hit[1], resolve: undefined }, state: 'received', step: 'retry', lease_until: null, worker: null, next_run_at: null, attempts: 0 });
      await repo.addEvent(k.id, 'repointed', { from: k.params.url, to: hit[1] });
      done.push(k.id);
    }
    return { repointed: done.length, ids: done };
  });
  fastify.post('/ops/dewey-jobs/:id/cancel', guard, async (req) => {
    const reg = makeRegistry(repo), job = await repo.getJob(Number(req.params.id));
    if (!job) return { status: 'none' };
    const b = req.body || {}, why = String(b.reason || '').slice(0, 400) || null, result = { reason: why || 'cancelled', by: b.by || 'an operator', did: b.did || null, next: b.next || null };
    await repo.addEvent(job.id, 'cancel', { reason: why || '(none recorded)', by: result.by, did: result.did, next: result.next });
    if (isTerminal(job.state)) return { job, note: 'already finished; the reason was recorded as an event' };
    const done = await reg.advance(job.id, 'cancelled', { result });   // the parent first, so the roll-up cannot call it "skipped"
    for (const k of await repo.childrenOf(job.id)) await reg.advance(k.id, 'cancelled', { result: { reason: 'cancelled', why: why || 'the job was cancelled', by: result.by } }).catch(() => {});
    return { job: done };
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
