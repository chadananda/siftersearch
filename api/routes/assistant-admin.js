// Admin: GET /api/admin/anis/overview?days=30 — the Anís hub's data (activity, costs, assessment, System-1) in one call.
// Auth: requireInternal = admin JWT or X-Internal-Key, so ops tooling can read a thread when an answer goes wrong.
// Each section fails on its own (a missing store shows as unavailable, never breaks the page).
import { requireInternal } from '../lib/auth.js';
import { getAnisOverview } from '../lib/assistant/admin-overview.js';
import { threadsOverview, threadDetail, strategyGaps } from '../lib/assistant/admin-threads.js';
import { auditsSince } from '../lib/repos/audit-store-repo.js';
import { listAnisThreads, anisThread, anisThreadMessages } from '../lib/repos/anis-threads-repo.js';

export default async function anisAdminRoutes(fastify) {
  fastify.get('/anis/overview', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => getAnisOverview(request.query.days || 30));   // off the event loop, cached (admin-overview.js)

  // Threads (Chad 10-12): every Anís conversation with each reply's audit — filter=strategy shows where a better search
  // strategy was warranted.
  fastify.get('/anis/threads', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
      filter: { type: 'string', enum: ['all', 'strategy', 'problems', 'pending'], default: 'all' } } } },
  }, async (request) => threadsOverview({ listThreads: listAnisThreads }, { days: request.query.days || 30, filter: request.query.filter || 'all' }));

  fastify.get('/anis/threads/:id', { preHandler: requireInternal }, async (request, reply) => {
    const t = await threadDetail({ thread: anisThread, messages: anisThreadMessages }, request.params.id);
    return t || reply.code(404).send({ error: 'no such thread' });
  });

  // The audits as a ranked work queue (Chad 10-12: audit-identified strategy extensions are the highest priority).
  fastify.get('/anis/strategy-gaps', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => ({ days: request.query.days || 30, ...strategyGaps(auditsSince(request.query.days || 30)) }));
}
