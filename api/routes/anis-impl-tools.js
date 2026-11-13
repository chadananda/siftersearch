// Research-tool API for the Anís edge Worker (internal key): the agent's raw tool functions over HTTP, cached like agent.js does.
// POST /tool/:fn, POST /tools (batch), GET /tool-names. Deps: agent.js agentTools, tool-cache.js. DI: plugin opts { impl }.
import { requireInternal } from '../lib/auth.js';
import { toolCache, agentCache, cachedImpl, callScope } from '../lib/assistant/tool-cache.js';

const UNCACHED = ['researchLookup', 'researchCapture'];   // agent.js uses the raw functions for these

export default async function anisToolsRoutes(fastify, opts = {}) {
  let built = null;   // impl built once per process, lazily
  const get = async (turn) => {
    if (opts.impl) return (built ??= buildImpl(opts.impl, toolCache()));
    // live: turn (channel/site) only feeds the question log of researchLookup, so the impl is per-turn when a turn is given
    if (turn?.channel || turn?.site) return buildImpl((await import('../lib/assistant/agent.js')).agentTools({ turn }), agentCache);
    return (built ??= buildImpl((await import('../lib/assistant/agent.js')).agentTools(), agentCache));
  };
  const buildImpl = (raw, cache) => {
    const cached = cachedImpl(raw, cache);
    for (const k of UNCACHED) if (typeof raw[k] === 'function') cached[k] = raw[k];
    return cached;
  };
  const one = async (impl, fn, args) => {
    const t0 = Date.now();
    if (typeof impl[fn] !== 'function') return { error: `unknown tool: ${fn}`, unknown: true };
    try { const r = await callScope(() => impl[fn](...(Array.isArray(args) ? args : []))); return { out: r.out, cache: r.cache, parts: r.parts, ms: Date.now() - t0 }; }
    catch (err) { return { error: err.message }; }
  };
  fastify.post('/tool/:fn', { preHandler: requireInternal }, async (request, reply) => {
    const r = await one(await get(request.body?.turn), request.params.fn, request.body?.args);
    if (r.unknown) return reply.code(404).send({ error: r.error });
    return r;
  });
  fastify.post('/tools', { preHandler: requireInternal }, async (request) => {
    const impl = await get(request.body?.turn);
    return { results: await Promise.all((request.body?.calls || []).map(async (c) => { const { unknown, ...r } = await one(impl, c?.fn, c?.args); return r; })) };
  });
  fastify.get('/tool-names', { preHandler: requireInternal }, async () => {
    const impl = await get();
    return { names: Object.keys(impl), functions: Object.keys(impl).filter((k) => typeof impl[k] === 'function') };
  });
}
export { anisToolsRoutes };
