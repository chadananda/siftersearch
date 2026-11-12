// Anís agent's fused_search (tools.js): query as written → multiIndexSearch → withLinks. No LLM, no planner, no relax rungs (the agent writes precise queries).
// Deps: search.js multiIndexSearch, hit-links.js withLinks (injectable for tests)
import { withDeadline, TOOL_DEADLINE_MS } from './deadline.js';
export function agentSearch(d = {}) {
  return (query, tradition, limit = 8, filters = {}) => withDeadline(() => run(query, tradition, limit, filters), d.deadlineMs ?? TOOL_DEADLINE_MS(), 'agent-search');
  async function run(query, tradition, limit, extra) {
    const t0 = Date.now();
    const multi = d.multiIndexSearch || (await import('../search.js')).multiIndexSearch;
    const link = d.withLinks || (await import('../hit-links.js')).withLinks;
    const r = await multi(String(query), { limit, premiseLayer: true, filters: { ...(tradition ? { religion: tradition } : {}), ...extra } });
    const hits = (r?.hits || []).filter((h) => String(h.text || '').length <= 8000).slice(0, limit);
    const linked = await link(hits.map((h) => ({ ...h, doc_id: h.doc_id ?? h.document_id }))).catch(() => hits);
    const out = linked.map((h) => ({ ...h, document_id: h.doc_id ?? h.document_id, source_url: h.url || h.source_url || null }));   // full text: the quote guard verifies against it; show() clips what the model sees
    out.ms = Date.now() - t0;
    return out;
  }
}
