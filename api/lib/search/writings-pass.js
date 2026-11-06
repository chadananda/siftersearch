// The WRITINGS PASS (spec #1, planning/anis-suggestions-analysis-20261106.md): on a route Jev chose that owes the Writings
// (NEEDS_WRITINGS — shared with forensics.js, so the rule and the recipe cannot drift), planned-search runs one extra engine
// call filtered to the Writers (Bahá'u'lláh, the Báb, 'Abdu'l-Bahá, Shoghi Effendi — never the House or the Research
// Department) BESIDE the broad pass. Its writings/guardian-tier hits lead the Bahá'í share only; other traditions' places
// in an unscoped list are unchanged (interfaith by design, #246/#193). Pure. Deps: source-tier.
import { sourceTier, byTier } from '../assistant/source-tier.js';

/** Routes (Jev's shape / Anís's recipe) that owe a Writings-filtered pass. */
export const NEEDS_WRITINGS = new Set(['teachings', 'topic', 'best-expression', 'survey-subject', 'examine-position']);
/** The trace tool/endpoint stamp the pass carries (forensics searchedWritings reads it). */
export const WRITINGS_TOOL = 'planned:writings';

const LEADS = new Set(['writings', 'guardian']);
const isBahai = (h) => sourceTier(h) != null;   // sourceTier is null for other traditions and web results
const BAHAI_SCOPE = /bah/i;

/** Does this plan owe the pass? Jev's own route only (a backstop default 'topic' is no route), no author asked for (the author
 *  pass leads then), and no other tradition or author filter in force. Pure. */
export function owesWritings(plan = {}) {
  if (!String(plan.provenance || '').startsWith('jev')) return false;
  if (!NEEDS_WRITINGS.has(plan.shape) || plan.prefer || plan.quote) return false;
  const f = plan.filters || {};
  if (f.author || f.documentId) return false;
  return !f.religion || BAHAI_SCOPE.test(String(f.religion));
}

/**
 * Broad hits + the Writings pass's hits → one list. The pass's writings/guardian hits (tier order, search rank within a tier)
 * lead the Bahá'í share, the broad Bahá'í hits follow. Scoped to the Bahá'í Faith, the whole list is that share. Unscoped,
 * only the places Bahá'í hits held are refilled — every other tradition keeps its places and its count. Pure.
 */
export function withWritings(broad = [], writingsHits = [], { limit = 10, scoped = false } = {}) {
  const lead = byTier(writingsHits.filter((h) => LEADS.has(sourceTier(h)))).map((h) => ({ ...h, _writings: true }));
  if (!lead.length) return broad;
  const seen = new Set();
  const take = (h) => (h && !seen.has(h.id) ? (seen.add(h.id), h) : null);
  if (scoped) return [...lead, ...broad].map(take).filter(Boolean).slice(0, Math.max(limit, 1));
  const queue = [...lead, ...broad.filter(isBahai)];
  const out = [];
  for (const h of broad) {
    if (!isBahai(h)) { out.push(h); seen.add(h.id); continue; }
    let next = null;
    while (queue.length && !(next = take(queue.shift())));
    if (next) out.push(next);
  }
  return out;
}
