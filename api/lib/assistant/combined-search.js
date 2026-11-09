// respond@3 ROLLBACK ONLY: the planner-LLM library search (executeSearch). Not a tool, not in REGISTRY, no tree node may call it
// (tests/api/anis-tool-contract.test.js); trees use fused_search (spell, tiers, filters) + Jev-filled planning units instead.
import { canonicalTradition } from './tradition-name.js';
import { engineFilters } from './tool-kit.js';
/** combinedSearch({ query, limit, filters, tradition, messages, defaults, scope_config }, { search }) → { passages } */
export async function combinedSearch(a, ctx = {}) {
  const search = ctx.search || (await import('../../routes/chat.js')).executeSearch;
  const { documentId, ...f } = engineFilters(a.filters);
  // the model's tradition is the planner's default; filters.tradition is a hard filter
  const defaults = 'defaults' in a ? a.defaults : 'messages' in a ? undefined : a.tradition ? { religion: canonicalTradition(a.tradition) } : {};
  const r = await search({ query: a.query, mode: 'passages', limit: a.limit ?? 8, ...(a.scope_config !== undefined ? { scope_config: a.scope_config } : {}), ...f,
    ...(documentId != null ? { document_id: documentId } : {}),
    plan: { messages: 'messages' in a ? a.messages : [{ role: 'user', content: a.query }], ...(defaults !== undefined ? { defaults } : {}) } });
  return { passages: r?.passages || [] };
}
/** The model-facing tool definition for the rollback researcher (query + preferred tradition only). */
export const COMBINED_TOOL = { type: 'function', function: { name: 'combined_search',
  description: 'Search the library (primary texts, authorised interpretation, history, scholarship). Phrase the query in the words the texts themselves would use; name an author or work in the query to narrow it.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Words to search for, as the texts would say them' },
    tradition: { type: 'string', description: "A preferred tradition (the planner's default, not a hard filter), e.g. Baha'i, Islam, Christianity — omit for all" } }, required: ['query'] } } };
