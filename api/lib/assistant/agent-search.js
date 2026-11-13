// Anís agent's fused_search (tools.js): query as written → multiIndexSearch → withLinks. No LLM, no planner, no relax rungs (the agent writes precise queries).
// Deps: search.js multiIndexSearch, hit-links.js withLinks (injectable for tests)
import { withDeadline, TOOL_DEADLINE_MS } from './deadline.js';
import { part } from './tool-cache.js';
// past this the vector layers give way when BM25 already answers (search.js embedLateGate; Gemini embed 0.3–6 s on tower, 11-12)
export const AGENT_EMBED_DEADLINE_MS = Number(process.env.SIFTER_AGENT_EMBED_DEADLINE_MS ?? 900);
export function agentSearch(d = {}) {
  return (query, tradition, limit = 8, filters = {}) => withDeadline(() => run(query, tradition, limit, filters), d.deadlineMs ?? TOOL_DEADLINE_MS(), 'agent-search');
  async function run(query, tradition, limit, extra) {
    const t0 = Date.now();
    const multi = d.multiIndexSearch || (await import('../search.js')).multiIndexSearch;
    const link = d.withLinks || (await import('../hit-links.js')).withLinks;
    const r = await multi(String(query), { limit, embedDeadlineMs: AGENT_EMBED_DEADLINE_MS, filters: { ...(tradition ? { religion: tradition } : {}), ...extra } });
    part('search', Date.now() - t0);
    for (const [k, v] of Object.entries(r?._timings || r?.timings || {})) if (typeof v === 'number' && /^(embed|embed_late|qkeyword|phrase|qhype|qconcept|hydrate|rank|qdrant)$/.test(k)) part(`s.${k}`, v);
    const t1 = Date.now();
    const hits = (r?.hits || []).filter((h) => String(h.text || '').length <= 8000).slice(0, limit);
    const linked = await link(hits.map((h) => ({ ...h, doc_id: h.doc_id ?? h.document_id }))).catch(() => hits);
    part('link', Date.now() - t1);
    const out = linked.map((h) => ({ ...h, document_id: h.doc_id ?? h.document_id, source_url: h.url || h.source_url || null }));   // full text: the quote guard verifies against it; show() clips what the model sees
    out.ms = Date.now() - t0;
    return out;
  }
}
