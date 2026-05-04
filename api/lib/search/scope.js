// Scope-aware Meili index registry.
//
// Resolves chatbot_location → scope_config → list of Meili paragraph indexes
// to query. The wall between primary RAG and site-only content is enforced
// here: site-only Meili indexes are NEVER included in the default scope.
//
// Used by api/lib/search.js (multiIndexSearch, hybridSearch) and
// api/lib/jafar-pipeline.js. The site registry is injected at boot via
// setSiteRegistry() — typically called from api/index.js after loading
// sites.yaml via sites-ingester::loadAllSiteConfigs().

export const INDEXES = {
  DOCUMENTS: 'documents',
  PARAGRAPHS: 'paragraphs',
  HYPE_QUESTIONS: 'hype_questions',
};

let siteRegistry = null;

/**
 * Inject the site registry. Call once at boot from api/index.js.
 *
 * @param {Object<string, {scope: string, meili_index_prefix: string}>} configs
 */
export function setSiteRegistry(configs) {
  siteRegistry = configs || {};
}

/**
 * Meili paragraph index name for a given site prefix. Pass null/undefined
 * for the primary corpus index.
 */
export function getParagraphIndex(prefix = null) {
  if (!prefix) return INDEXES.PARAGRAPHS;
  return `siftersearch_${prefix}_paragraphs`;
}

/**
 * Meili HyPE-questions index name for a given site prefix. Pass null for
 * the primary HyPE index. v2-only — not used in v1 since HyPE is gated off
 * for all external sites.
 */
export function getHypeIndex(prefix = null) {
  if (!prefix) return INDEXES.HYPE_QUESTIONS;
  return `siftersearch_${prefix}_hype`;
}

/**
 * Resolve a scope_config to the list of paragraph index names to query.
 *
 * @param {{primary?: boolean, sites?: string[]}} scope_config
 * @returns {string[]} Meili index names
 */
export function getScopeIndexes(scope_config = { primary: true, sites: [] }) {
  const out = [];
  if (scope_config.primary) out.push(INDEXES.PARAGRAPHS);
  for (const prefix of scope_config.sites || []) {
    out.push(getParagraphIndex(prefix));
  }
  return out;
}

/**
 * Default search scope — primary corpus + every supplemental site in the
 * registry. Site-only sites are EXCLUDED. Used when the chat API receives
 * no chatbot_location.
 */
export function getDefaultScope() {
  if (!siteRegistry) return { primary: true, sites: [] };
  const sites = [];
  for (const cfg of Object.values(siteRegistry)) {
    if (cfg.scope === 'supplemental' && cfg.meili_index_prefix) {
      sites.push(cfg.meili_index_prefix);
    }
  }
  return { primary: true, sites };
}

/**
 * Resolve a chatbot_location (e.g. 'bahaiteachings.org') to its scope_config.
 *
 * Rules:
 *   - null/unknown          → default scope (primary + supplementals)
 *   - site-only location    → ONLY that site (no primary, no others) — the
 *                             wall: opinion content stays in its own corpus
 *   - supplemental location → default scope (chatbot identity is for v2
 *                             ranking-boost, not exclusion)
 */
export function getScopeForLocation(chatbot_location) {
  if (!chatbot_location) return getDefaultScope();
  if (!siteRegistry) return { primary: true, sites: [] };
  const cfg = siteRegistry[chatbot_location];
  if (!cfg) return getDefaultScope();
  if (cfg.scope === 'site-only') {
    return { primary: false, sites: [cfg.meili_index_prefix] };
  }
  return getDefaultScope();
}
