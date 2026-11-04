// Search forensics (09-24; ranked lists + Anís context + replay 11-04). requireInternal (X-Internal-Key), so a dev agent
// reads search history through the API — never sqlite (CLAUDE.md data-access rule). CLI: scripts/ops/ops.mjs search-trace|search-replay.
//   GET  /search-trace                 many: recent / slowest / zero-result / by question, thread, turn, tool, doc
//   GET  /search-trace/:traceId        ONE search, its ranked list titled, the same question at other times, a planned row's calls
//   POST /search-trace/:traceId/replay re-run on today's code (no planner, no LLM, untraced) → old vs new ranks
//   GET  /search-stats?days=7          p50/p95, zero-result rate, which layer leads, cache rate — overall, per endpoint, per version
// Deps: repos/search-trace-repo, search-trace (shape), search/trace-replay.
import { requireInternal } from '../lib/auth.js';
import * as repo from '../lib/repos/search-trace-repo.js';
import { summarizeTraces, expandTrace, hitDocIds } from '../lib/search-trace.js';

const yes = (v) => v === '1' || v === 'true' || v === true;

/** ?doc= → doc ids: a number is a doc id; words are a title substring. */
export async function docFilter(doc, r = repo) {
  if (doc == null || doc === '') return null;
  const s = String(doc).trim();
  if (/^\d+$/.test(s)) return [Number(s)];
  return r.docIdsByTitle(s);
}

export default async function searchTraceAdminRoutes(fastify, { deps = repo, replay = {} } = {}) {
  const r = deps;
  fastify.get('/search-trace', { preHandler: requireInternal }, async (request) => {
    const q = request.query || {};
    const docIds = await docFilter(q.doc, r);
    if (docIds && !docIds.length) return { count: 0, summary: summarizeTraces([]), traces: [], note: `no document title matches "${q.doc}"` };
    const rows = await r.listTraces({ days: q.days, endpoint: q.endpoint, query: q.query, zeroOnly: yes(q.zeroOnly), slowerThan: q.slowerThan, layer: q.layer,
      sort: q.sort, limit: q.limit, thread: q.thread, turn: q.turn, tool: q.tool, docIds });
    const titles = await r.docTitles(hitDocIds(rows)).catch(() => new Map());
    const traces = rows.map((row) => {
      const t = expandTrace(row, titles);
      // "where did this doc rank": the rank(s) the asked-for doc held in each list
      if (docIds) t.doc_ranks = (t.hits || []).filter((h) => docIds.includes(Number(h.doc_id))).map((h) => ({ rank: h.rank, doc_id: h.doc_id, title: h.title }));
      return t;
    });
    return { count: rows.length, summary: summarizeTraces(rows), ...(docIds ? { doc_ids: docIds } : {}), traces };
  });

  fastify.get('/search-trace/:traceId', { preHandler: requireInternal }, async (request, reply) => {
    const row = await r.getTrace(request.params.traceId);
    if (!row) { reply.code(404); return { error: 'trace not found' }; }
    const [siblings, children] = await Promise.all([r.sameQuestion(row.query_hash, row.trace_id), row.endpoint === 'planned' ? r.childTraces(row.trace_id) : []]);
    const titles = await r.docTitles(hitDocIds([row, ...children])).catch(() => new Map());
    return { trace: expandTrace(row, titles), same_question: siblings, ...(children.length ? { engine_calls: children.map((c) => expandTrace(c, titles)) } : {}) };
  });

  fastify.post('/search-trace/:traceId/replay', { preHandler: requireInternal }, async (request, reply) => {
    const row = await r.getTrace(request.params.traceId);
    if (!row) { reply.code(404); return { error: 'trace not found' }; }
    const { replayTrace } = await import('../lib/search/trace-replay.js');
    return replayTrace(row, { children: r.childTraces, titles: r.docTitles, ...replay });
  });

  fastify.get('/search-stats', { preHandler: requireInternal }, async (request) => {
    const days = parseInt(request.query?.days, 10) || 7;
    const rows = await r.tracesSince(days);
    const byEndpoint = {}, byVersion = {}, byTool = {};
    for (const x of rows) {
      (byEndpoint[x.endpoint || 'unknown'] ||= []).push(x);
      (byVersion[x.search_version || 'unknown'] ||= []).push(x);
      if (x.tool) (byTool[x.tool] ||= []).push(x);
    }
    const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, summarizeTraces(v)]));
    return {
      days, overall: summarizeTraces(rows),
      by_endpoint: map(byEndpoint),
      // Per-version, so "did that change help?" is answerable from data rather than memory.
      by_search_version: map(byVersion),
      by_tool: map(byTool),
      worst_zero_result_questions: rows.filter((x) => !x.result_count)
        .reduce((acc, x) => { acc[x.query] = (acc[x.query] || 0) + 1; return acc; }, {}),
    };
  });
}
