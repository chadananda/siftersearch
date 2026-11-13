// Research-tool API for the Anís edge Worker (internal key): the agent's raw tool functions over HTTP, cached like agent.js does.
// POST /tool/:fn, POST /tools (batch), GET /tool-names. Deps: agent.js agentTools, tool-cache.js. DI: plugin opts { impl }.
import { requireInternal } from '../lib/auth.js';
import { toolCache, agentCache, cachedImpl, callScope } from '../lib/assistant/tool-cache.js';

const UNCACHED = ['researchLookup', 'researchCapture'];   // agent.js uses the raw functions for these

// Server pieces the Worker's pure core needs as remote functions (rights, link maps, compiled notes, OceanLibrary range links). Lazy imports.
export const edgeExtras = {
  encumberedAmong: async (ids) => (await import('../lib/assistant/researcher.js')).serverFallback.encumberedAmong(ids),   // → Set (encoded)
  urlsOf: async (all) => { const u = await (await import('../lib/assistant/researcher.js')).serverFallback.urlOf(all, true); return Object.fromEntries(all.map((x) => [x.id, u(x)])); },
  workNotes: async (title) => (await import('../lib/assistant/tools.js')).run('work_notes_lookup', { title }, {}),
  upgradeLinks: async (strings) => { const o = await import('../lib/ocean-links.js'); return Promise.all(strings.map((s) => (o.needsUpgrade(String(s)) ? o.upgradeOceanLinks(s) : s))); },
};
// Map/Set results (translationsOf, encumberedAmong) cross the wire as {__map}/{__set}; the Worker revives them.
export const encode = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? { __map: [...x] } : x instanceof Set ? { __set: [...x] } : x))));

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
    if (!opts.impl) Object.assign(cached, edgeExtras);
    return cached;
  };
  const one = async (impl, fn, args) => {
    const t0 = Date.now();
    if (typeof impl[fn] !== 'function') return { error: `unknown tool: ${fn}`, unknown: true };
    try { const r = await callScope(() => impl[fn](...(Array.isArray(args) ? args : []))); return { out: encode(r.out), cache: r.cache, parts: r.parts, ms: Date.now() - t0 }; }
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
