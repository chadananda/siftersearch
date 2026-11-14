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
/** A sentence ending in "." or "!" is a statement, and a long text is pasted words: "What you are about to hear is the fifth version
 *  of…" (a talk's own sentence, 11-13) begins with a question word but is a quotation. */
export const QUESTION_MAX_WORDS = 12;
export const isQuestion = (q) => {
  const s = String(q || '').trim();
  if (/\?["'”’)\]]*$/.test(s)) return true;
  if (/[.!]["'”’)\]]*$/.test(s)) return false;
  return /^(what|who|whom|whose|why|how|when|where|which|is|are|was|were|do|does|did|can|could|should|would|will|shall|may|must)\b/i.test(s)
    && foldVerbatim(s).split(' ').filter(Boolean).length <= QUESTION_MAX_WORDS;
};

/** Entries (in their current order) whose text contains the query verbatim go first; the rest keep their order.
 *  textOf(entry) → the passage text. Returns a new array; never drops an entry. */
export function verbatimLead(entries, query, textOf) {
  if (!isVerbatimQuery(query) || isQuestion(query)) return entries;
  const q = foldVerbatim(query);
  const lead = [], rest = [];
  for (const e of entries) (foldVerbatim(textOf(e)).includes(q) ? lead : rest).push(e);
  return lead.length ? [...lead, ...rest] : entries;
}

/** The entries that lead a search on a quotation: weighty passages (factor ≥ 1) holding the words verbatim, then TALKS holding
 *  them — a talk is a library document with a fully searchable transcript (Chad 11-13), so its own exact words find it even
 *  though talks weigh 0.4 (10-31). Other low-weight copies (scraped sites) still never lead on the words alone (10-20). Pure. */
export function exactLead(entries, query, { textOf, factorOf, isTalk }) {
  if (!isVerbatimQuery(query) || isQuestion(query)) return [];
  const q = foldVerbatim(query), has = (e) => foldVerbatim(textOf(e)).includes(q);
  return [...entries.filter((e) => (factorOf(e) ?? 1) >= 1 && has(e)), ...entries.filter((e) => (factorOf(e) ?? 1) < 1 && isTalk(e) && has(e))];
}

/** The content words of a text: folded (no diacritics), Latin letters only, longer than three letters (forensics' word test). Pure. */
export const contentWords = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z]+/).filter((w) => w.length > 3));
/** Share of the phrase's content words that the text holds (0..1); a phrase with none counts as fully held (1). Pure. */
export function wordShare(phrase, text) {
  const q = contentWords(phrase);
  if (!q.size) return 1;
  const w = contentWords(text);
  return [...q].filter((x) => w.has(x)).length / q.size;
}
