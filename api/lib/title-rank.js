// Title lookup ranking — the work the user NAMED must win.
//
// THE BUG THIS FIXES (2026-09-24, reproduced live): asked "What does The Dawn-Breakers say about the
// Conference of Badasht?", the chat replied "The Dawn-Breakers does not specifically discuss the Conference
// of Badasht." Badasht is one of that book's most famous chapters and the book is fully indexed.
//
// find_document_for_citation sorted candidates by AUTHORITY first, using title relevance only as a
// tie-break. authorityScore awards +60 for a canonical author, so "The Advent of Divine Justice"
// (Shoghi Effendi, 60+) outranked "The Dawn-Breakers" (Nabíl, 0) for the query "The Dawn-Breakers". The
// document subagent then read the wrong book, found no Badasht in it, and reported that as fact.
//
// THE RULE: how well the TITLE matches decides first; authority breaks ties only among titles that match
// equally well — which is the job it was added for (the canonical Íqán over "Notes on the Íqán"). Re-ranking
// only reorders: nothing is filtered out, so a weak match is demoted rather than deleted.
//
// Deps: none (pure). Consumed by routes/chat.js (find_document_for_citation) and routes/public-api.js
// (GET /library/documents).

// Fold diacritics and apostrophe variants — the corpus stores "Bahá’u’lláh" with a curly apostrophe and
// "Kitáb-i-Íqán" with accents, while a user types neither.
const fold = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’ʼʻ`']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// A leading article is not part of how people name a work: "Kitab-i-Iqan" IS "The Kitáb-i-Íqán".
const core = (s) => fold(s).replace(/^(the|a|an) /, '');

export const TIER = { EXACT: 4, PREFIX: 3, ALL_WORDS: 2, SOME_WORDS: 1, NONE: 0 };

/** How well `title` answers the name the user typed. Higher is better. */
export function titleTier(query, title) {
  const q = core(query), t = core(title);
  if (!q || !t) return TIER.NONE;
  if (q === t) return TIER.EXACT;
  if (t.startsWith(q) || q.startsWith(t)) return TIER.PREFIX;
  const words = q.split(' ').filter(Boolean);
  const hit = words.filter((w) => t.includes(w)).length;
  if (hit === words.length) return TIER.ALL_WORDS;
  // A single shared word is not a title match: "Paris Talks" vs "Talks in Paris and London" earns this,
  // and must still lose to the exact title — which the tiers guarantee.
  return hit > 0 ? TIER.SOME_WORDS : TIER.NONE;
}

/**
 * Order candidates for a named-work lookup.
 * Title tier → authority (`_authority`, set by the caller) → original engine order.
 */
export function rankByTitle(query, hits) {
  return hits
    .map((h, idx) => ({ h, tier: titleTier(query, h.title), auth: h._authority ?? h.authority_score ?? 0, idx }))
    .sort((a, b) => (b.tier - a.tier) || (b.auth - a.auth) || (a.idx - b.idx))
    .map((x) => x.h);
}
