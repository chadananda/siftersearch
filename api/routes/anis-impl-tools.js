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
  // the Worker's Anthropic usage into the ledger (ai_usage) — every paid call counted, real readers never capped
  logUsage: async (rows) => { const { logAIUsage } = await import('../lib/ai-services.js'); for (const r of rows || []) logAIUsage({ provider: r.provider || 'anthropic', model: r.model, serviceType: r.service_type || 'chat', caller: r.caller, promptTokens: r.prompt_tokens || 0, completionTokens: r.completion_tokens || 0, cachedTokens: r.cached_tokens || 0, cacheWriteTokens: r.cache_write_tokens || 0 }); return (rows || []).length; },
  upgradeLinks: async (strings) => { const o = await import('../lib/ocean-links.js'); return Promise.all(strings.map((s) => (o.needsUpgrade(String(s)) ? o.upgradeOceanLinks(s) : s))); },
};
// Map/Set results (translationsOf, encumberedAmong) cross the wire as {__map}/{__set}; the Worker revives them.
export const encode = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? { __map: [...x] } : x instanceof Set ? { __set: [...x] } : x))));

/** Every passage / work in a research result made complete for display, so the Worker draws links and widgets from the research
 *  itself and the display never calls back (Chad 11-13): its book's cover_url + year (one docs read by ids), and an OceanLibrary
 *  book-level link → the passage's own paragraph range (located by its opening words). In place on the encoded JSON. */
const BOOK_LEVEL = /^https:\/\/(?:www\.)?oceanlibrary\.com\/[^/?#\s]+\/?$/;
const opening = (x) => { const t = String(x || '').replace(/⁅\/?[sp]\d+⁆/g, '').replace(/\s+/g, ' ').trim();
  return t.length <= 90 ? t : t.slice(0, 90).replace(/\s+\S*$/, ''); };
export async function finishResearch(out, { docsOf, rangeOf }) {
  const items = [];
  const walk = (v, d) => { if (!v || typeof v !== 'object' || d > 4) return; if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; }
    if (Number(v.document_id ?? v.doc_id)) items.push(v); for (const x of Object.values(v)) walk(x, d + 1); };
  walk(out, 0);
  if (!items.length) return out;
  const need = [...new Set(items.filter((v) => !('cover_url' in v)).map((v) => Number(v.document_id ?? v.doc_id)))];
  const by = new Map((need.length ? await docsOf(need).catch(() => []) : []).map((d) => [Number(d.id), d]));
  await Promise.all(items.map(async (v) => {
    const d = by.get(Number(v.document_id ?? v.doc_id));
    if (d && !('cover_url' in v)) { v.cover_url = d.cover_url ?? null; if (v.year == null && d.year != null) v.year = d.year; }
    for (const k of ['source_url', 'url', 'citation_url']) {
      if (!BOOK_LEVEL.test(v[k] || '') || !v.text) continue;
      const r = await rangeOf(v[k], opening(v.text)).catch(() => null);
      if (r && r.includes('paraId=')) v[k] = r;
    }
  }));
  return out;
}

export default async function anisToolsRoutes(fastify, opts = {}) {
  const rangeOf = opts.rangeOf ?? (async (url, words) => (await import('../lib/ocean-links.js')).oceanQuoteUrl(url, words));
  const docsOf = opts.docs ?? (async (ids) => (await (await import('../lib/docs-repo.js')).listDocs({ ids, fields: ['id', 'cover_url', 'year'], count: false, limit: ids.length })).docs || []);
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
    try { const r = await callScope(() => impl[fn](...(Array.isArray(args) ? args : []))); return { out: await finishResearch(encode(r.out), { docsOf, rangeOf }), cache: r.cache, parts: r.parts, ms: Date.now() - t0 }; }
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
