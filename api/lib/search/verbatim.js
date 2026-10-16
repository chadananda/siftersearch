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

/** Entries (in their current order) whose text contains the query verbatim go first; the rest keep their order.
 *  textOf(entry) → the passage text. Returns a new array; never drops an entry. */
export function verbatimLead(entries, query, textOf) {
  if (!isVerbatimQuery(query)) return entries;
  const q = foldVerbatim(query);
  const lead = [], rest = [];
  for (const e of entries) (foldVerbatim(textOf(e)).includes(q) ? lead : rest).push(e);
  return lead.length ? [...lead, ...rest] : entries;
}
