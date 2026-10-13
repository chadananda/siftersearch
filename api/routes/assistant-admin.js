// Admin: GET /api/admin/anis/overview?days=30 — the Anís hub's data (activity, costs, assessment, System-1) in one call.
// Each section fails on its own (a missing store shows as unavailable, never breaks the page).
import { queryAll } from '../lib/db.js';
import { requireTier } from '../lib/auth.js';
import { anisActivity, anisCosts, anisAssessment, anisSystem1 } from '../lib/anis/admin-overview.js';
import { threadsOverview, threadDetail, strategyGaps } from '../lib/anis/admin-threads.js';
import { auditsSince } from '../lib/repos/audit-store-repo.js';
import { listAnisThreads, anisThread, anisThreadMessages } from '../lib/repos/anis-threads-repo.js';

export default async function anisAdminRoutes(fastify) {
  fastify.get('/anis/overview', {
    preHandler: requireTier('admin'),
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => {
    const days = request.query.days || 30;
    const safe = async (fn) => { try { return await fn(); } catch (err) { return { available: false, error: String(err.message || err).slice(0, 200) }; } };
    const [activity, costs, assessment, system1] = await Promise.all([
      safe(() => anisActivity({ queryAll }, days)),
      safe(() => anisCosts({ queryAll }, days)),
      safe(() => anisAssessment({}, days)),
      safe(() => anisSystem1({}, days)),
    ]);
    return { days, activity, costs, assessment, system1 };
  });

  // Threads (Chad 10-12): every Anís conversation with each reply's audit — filter=strategy shows where a better search
  // strategy was warranted.
  fastify.get('/anis/threads', {
    preHandler: requireTier('admin'),
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
      filter: { type: 'string', enum: ['all', 'strategy', 'problems', 'pending'], default: 'all' } } } },
  }, async (request) => threadsOverview({ listThreads: listAnisThreads }, { days: request.query.days || 30, filter: request.query.filter || 'all' }));

  fastify.get('/anis/threads/:id', { preHandler: requireTier('admin') }, async (request, reply) => {
    const t = await threadDetail({ thread: anisThread, messages: anisThreadMessages }, request.params.id);
    return t || reply.code(404).send({ error: 'no such thread' });
  });

  // The audits as a ranked work queue (Chad 10-12: audit-identified strategy extensions are the highest priority).
  fastify.get('/anis/strategy-gaps', {
    preHandler: requireTier('admin'),
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => ({ days: request.query.days || 30, ...strategyGaps(auditsSince(request.query.days || 30)) }));
}
