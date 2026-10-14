// Ops reports over the internal API — the ONLY way scripts and agents ask production about library health. Runs are
// queued here and executed by siftersearch-reports; nothing in this route scans a table. Auth: requireInternal.
import { requireInternal } from '../lib/auth.js';
import { enqueue, getRun, latest, recent, cancel } from '../lib/repos/ops-report-repo.js';
import { reportNames } from '../lib/ops/reports.js';
import { ApiError } from '../lib/errors.js';

export default async function opsReportRoutes(fastify) {
  const known = (name) => { if (!reportNames().includes(name)) throw ApiError.notFound?.(`unknown report ${name}`) ?? Object.assign(new Error(`unknown report ${name}`), { statusCode: 404 }); };
  fastify.get('/ops/reports', { preHandler: requireInternal }, async () => ({ reports: reportNames(), recent: await recent(20) }));
  fastify.post('/ops/reports/:name', { preHandler: requireInternal }, async (req) => {
    known(req.params.name);
    return enqueue(req.params.name, req.body?.params ?? null, req.user?.email || 'internal');
  });
  fastify.get('/ops/reports/:name/latest', { preHandler: requireInternal }, async (req) => { known(req.params.name); return (await latest(req.params.name)) || { status: 'none' }; });
  fastify.get('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await getRun(Number(req.params.id))) || { status: 'none' });
  fastify.delete('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await cancel(Number(req.params.id))) || { status: 'none' });
}
