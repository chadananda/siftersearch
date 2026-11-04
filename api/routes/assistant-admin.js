// Admin: GET /api/admin/anis/overview?days=30 — the Anís hub's data (activity, costs, assessment, System-1) in one call.
// Threads + turns carry their traced searches (search_trace); /anis/turns/:id/{trace,replay} — search introspection (11-04).
// Auth: requireInternal = admin JWT or X-Internal-Key, so ops tooling can read a thread when an answer goes wrong.
// Each section fails on its own (a missing store shows as unavailable, never breaks the page).
import { requireInternal } from '../lib/auth.js';
import { getAnisOverview } from '../lib/assistant/admin-overview.js';
import { threadsOverview, threadDetail, strategyGaps, turnTrace, parseTurnId } from '../lib/assistant/admin-threads.js';
import { tracesForThread, tracesForTurn, childTraces, docTitles } from '../lib/repos/search-trace-repo.js';
import { auditsSince } from '../lib/repos/audit-store-repo.js';
import { listAnisThreads, anisThread, anisThreadMessages } from '../lib/repos/anis-threads-repo.js';
import { forensicsSince, listImprovements, setImprovementStatus, improveStats, IMPROVEMENT_STATUSES } from '../lib/repos/improve-repo.js';
import { forensicsReport, rankImprovements } from '../lib/audit/improve.js';

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

  // per round: searches[] (tool, query, filters, ms, top 10 hits), writer_passages[] (with standing), cited[] (Chad 11-04)
  fastify.get('/anis/threads/:id', { preHandler: requireInternal }, async (request, reply) => {
    const t = await threadDetail({ thread: anisThread, messages: anisThreadMessages, traces: tracesForThread, titles: docTitles }, request.params.id);
    return t || reply.code(404).send({ error: 'no such thread' });
  });

  // ONE turn ("<thread>:<round>"): every search it made (top 20 each), the writer's passages, what the reply cites
  fastify.get('/anis/turns/:id/trace', { preHandler: requireInternal }, async (request, reply) => {
    const t = await turnTrace({ thread: anisThread, messages: anisThreadMessages, traces: tracesForTurn, titles: docTitles }, request.params.id);
    return t || reply.code(404).send({ error: 'no such turn (expected <thread>:<round>)' });
  });

  // Re-run every engine search the turn made on today's code: old vs new ranked lists. No planner, no LLM, no reply, no trace.
  fastify.post('/anis/turns/:id/replay', { preHandler: requireInternal }, async (request, reply) => {
    if (!parseTurnId(request.params.id)) return reply.code(400).send({ error: 'expected <thread>:<round>' });
    const rows = await tracesForTurn(request.params.id);
    if (!rows.length) return reply.code(404).send({ error: 'no traced searches for this turn' });
    const { replayTurn } = await import('../lib/search/trace-replay.js');
    return { turn: request.params.id, ...(await replayTurn(rows, { children: childTraces, titles: docTitles })) };
  });

  // The audits as a ranked work queue (Chad 10-12: audit-identified strategy extensions are the highest priority).
  fastify.get('/anis/strategy-gaps', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, default: 30 } } } },
  }, async (request) => ({ days: request.query.days || 30, ...strategyGaps(auditsSince(request.query.days || 30)) }));
  // Improvement cycle (Chad 11-04; api/workers/improve-worker.js): forensic stage × class queue for replies and searches, with
  // the Opus judge's tally — and the deduped improvement suggestions, ranked evidence × severity, with a status to set.
  fastify.get('/anis/forensics', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90, default: 7 },
      stage: { type: 'string' }, examples: { type: 'integer', minimum: 0, maximum: 10, default: 3 } } } },
  }, async (request) => {
    const days = request.query.days || 7;
    const all = forensicsSince(2 * days);
    const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    return { days, stage: request.query.stage || null, stats_24h: improveStats(1),
      ...forensicsReport(all.filter((r) => r.asked_at >= cut), all.filter((r) => r.asked_at < cut), { stage: request.query.stage || null, examples: request.query.examples ?? 3 }) };
  });

  fastify.get('/anis/improvements', {
    preHandler: requireInternal,
    schema: { querystring: { type: 'object', properties: { status: { type: 'string', enum: IMPROVEMENT_STATUSES }, limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 } } } },
  }, async (request) => ({ improvements: rankImprovements(listImprovements({ status: request.query.status || null, limit: request.query.limit || 100 })) }));

  fastify.post('/anis/improvements/:id/status', {
    preHandler: requireInternal,
    schema: { body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: IMPROVEMENT_STATUSES }, note: { type: 'string', maxLength: 2000 } } } },
  }, async (request, reply) => {
    const changed = setImprovementStatus(request.params.id, request.body.status, request.body.note ?? null);
    return changed ? { ok: true, id: Number(request.params.id), status: request.body.status } : reply.code(404).send({ error: 'no such improvement' });
  });
}
