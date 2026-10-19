// Ops reports over the internal API — the ONLY way scripts and agents ask production about library health. Runs are
// queued here and executed by siftersearch-reports; nothing in this route scans a table. Auth: requireInternal.
import { requireInternal } from '../lib/auth.js';
import { enqueue, getRun, latest, recent, cancel } from '../lib/repos/ops-report-repo.js';
import { reportNames } from '../lib/ops/reports.js';
import { ApiError } from '../lib/errors.js';

export default async function opsReportRoutes(fastify) {
  const known = (name) => { if (!reportNames().includes(name)) throw ApiError.notFound?.(`unknown report ${name}`) ?? Object.assign(new Error(`unknown report ${name}`), { statusCode: 404 }); };
  // Index coverage (planning/index-coverage-plan.md): every layer by tradition × scope, or one document — ledger reads only
  fastify.get('/ops/coverage', { preHandler: requireInternal }, async () => (await import('../lib/repos/coverage-repo.js')).coverageSummary());
  fastify.get('/ops/coverage/:docId', { preHandler: requireInternal }, async (req) => ({ doc_id: Number(req.params.docId),
    layers: await (await import('../lib/repos/coverage-repo.js')).docCoverage(req.params.docId) }));
  // WHAT IS SIFTERSEARCH WORKING ON (Chad 10-19: "I cannot see what siftersearch is working on"; "a coordinator service and
  // an internal API with health for each service"): every service's heartbeat (version, health, work in flight), the ops
  // jobs running now, and the Anís answers being researched (api/lib/service-heartbeat.js, jobs/async-jobs.js)
  fastify.get('/ops/services', { preHandler: requireInternal }, async () => {
    const { readServices, headCommit } = await import('../lib/service-heartbeat.js');
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    let answers = [];
    try {
      const dir = join(process.cwd(), 'data', 'jobs');
      answers = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } })
        .filter((j) => j?.status === 'running').map((j) => ({ key: j.key, kind: j.kind, running_s: Math.round((Date.now() - j.started_at) / 1000) }));
    } catch { /* no jobs yet */ }
    const runs = (await recent(40)).filter((r) => r.status === 'running' || r.status === 'queued')
      .map((r) => ({ id: r.id, name: r.name, status: r.status, started_at: r.started_at, requested_at: r.requested_at }));
    return { head: headCommit(), services: readServices(), ops_jobs: runs, anis_answers: answers };
  });
  fastify.get('/ops/reports', { preHandler: requireInternal }, async () => ({ reports: reportNames(), recent: await recent(20) }));
  fastify.post('/ops/reports/:name', { preHandler: requireInternal }, async (req) => {
    known(req.params.name);
    return enqueue(req.params.name, req.body?.params ?? null, req.user?.email || 'internal');
  });
  fastify.get('/ops/reports/:name/latest', { preHandler: requireInternal }, async (req) => { known(req.params.name); return (await latest(req.params.name)) || { status: 'none' }; });
  fastify.get('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await getRun(Number(req.params.id))) || { status: 'none' });
  fastify.delete('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await cancel(Number(req.params.id))) || { status: 'none' });
}
