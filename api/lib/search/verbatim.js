// Verbatim lead (Chad 10-16, priority 1: "so we can actually find something we already know exists"). The known-item test
// found production ranking a passage's own 10-word fragment first only 16–83% of the time, below Meili keyword alone:
// cross-tradition diversity (Bahá'í capped at one slot) and RRF mixing demoted the exact match. A passage that CONTAINS
// the query's words in order leads, ahead of any diversity. Pure.

/** Folded for comparison: no diacritics, apostrophes, sentence markers, markup or punctuation; lower case; single spaces.
 *  Arabic/Persian: tashkil and tatweel removed, ي/ی and ك/ک unified. */
export function foldVerbatim(s) {
  return String(s || '').replace(/⁅\/?[a-z]?\d*⁆/gi, '').replace(/<[^>]+>/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‍‎‏‪-‮]/g, ' ')
    .toLowerCase().replace(/[’‘'ʼ`ʿʾ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Is this a verbatim lookup worth pinning? At least `min` words (shorter queries are topics, not quotations). */
export const isVerbatimQuery = (q, min = 5) => foldVerbatim(q).split(' ').filter(Boolean).length >= min;
/** A QUESTION is not a quotation: a passage that merely restates "what is the purpose of prayer" does not answer it (10-20:
 *  a PDF repeating the question led 'Abdu'l-Bahá's answer). Pure. */
export const isQuestion = (q) => /\?\s*$/.test(String(q || '')) || /^\s*(what|who|whom|whose|why|how|when|where|which|is|are|was|were|do|does|did|can|could|should|would|will|shall|may|must)\b/i.test(String(q || ''));

/** Entries (in their current order) whose text contains the query verbatim go first; the rest keep their order.
 *  textOf(entry) → the passage text. Returns a new array; never drops an entry. */
export function verbatimLead(entries, query, textOf) {
  if (!isVerbatimQuery(query) || isQuestion(query)) return entries;
  const q = foldVerbatim(query);
  const lead = [], rest = [];
  for (const e of entries) (foldVerbatim(textOf(e)).includes(q) ? lead : rest).push(e);
  return lead.length ? [...lead, ...rest] : entries;
}
