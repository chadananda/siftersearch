// Deterministic quotation detector: the user gave WORDING to find (quoted span of 4+ words, or a find/source request + phrase).
// Pure, ms, independent of Jev — search-plan.js applies it in the backstop and over any Jev answer. → { phrase, via } | null
const MIN_WORDS = 4;
const words = (s) => s.split(/\s+/).filter(Boolean).length;
// double, curly and guillemet quotes only: a straight single quote is an apostrophe (Bahá'u'lláh, 'Abdu'l-Bahá)
const QUOTED = /["“„«]([^"“”„«»]+)["”»]/g;
const ASK = /\b(find|locate|look(?:ing)? (?:for|up)|track down|identify|source (?:of|for)|where (?:is|does|did|can i find|do i find)|who (?:said|wrote)|which (?:book|tablet|work|prayer|letter)|what(?:'s| is) the source)\b/i;
const THING = /\b(quote|quotation|passage|phrase|saying|line|sentence|words|verse|excerpt)\b/i;
const LEAD = /(?:including|containing|that (?:says|reads|goes|has|includes|contains)|which (?:says|reads|goes)|reading|saying|with the words|beginning|starting with|:)\s+(.+)$/i;
// asks for MORE of an author's words that elaborate on an idea (a theme), not for one wording: "I recall Shoghi Effendi saying
// … — can you find more quotes or works where he elaborates on this" (r4, 11-01) is topic. Only the frame path yields to it.
const THEME = /\b(elaborat\w*|expand(?:s|ed|ing)? (?:on|upon)|more (?:quotes|quotations|passages|works|writings)|other (?:quotes|quotations|passages|works|writings))\b/i;
// a question about what words MEAN, where they come from, or how they compare is define/topic, never a wording hunt (r5:
// "does the root sense shape the 'turn not away from it' in the Hidden Word?" and "how is '<phrase>' different from …").
const MEANING = /\b(etymolog\w*|(?:the|its|a|word'?s?) roots?\b|root (?:of|sense|meaning)|from the root|what (?:does|do|did) .{1,80} mean\b|meaning of|the sense of|in the sense|how (?:is|are|does|do) .{1,120} (?:differ\w*|compare\w*|similar)|differen(?:t|ce) (?:from|between)|compare\w*|contrast\w*)\b/i;
/** Etymology / meaning / comparison question (no source request). */
export const isMeaningQuestion = (text) => MEANING.test(String(text || '')) && !/\b(find|locate|source (?:of|for)|where (?:is|does|did|can i find)|who (?:said|wrote)|which (?:book|tablet|work))\b/i.test(String(text || ''));
/** HTML tags and runs of whitespace a reader's message may carry (never part of a wording or a query). */
export const stripMarkup = (s) => String(s || '').replace(/<\/?(?:b|i|em|strong|u|span|a)\b[^>]{0,200}>/gi, '').replace(/<[^>]{0,200}>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clean = (s) => s.replace(/^[\s"“„«'‘]+|[\s"”»'’.?!,;:]+$/g, '').replace(/\s+/g, ' ');

// a quoted EXAMPLE of an idea ("the Golden Rule … like "do to others what you want for yourself"", r6) is not wording to find
// ("passages like "…"" still asks for that wording)
const EXAMPLE = /\b(?:like|such as|something like|e\.g\.|for example|for instance)\s*[:,]?\s*$/i;
const isExample = (before) => EXAMPLE.test(before) && !/\b(?:quote|quotation|passage|phrase|saying|line|sentence|word|verse|excerpt)s?\s+(?:like|such as)\s*$/i.test(before);
// a span quoted back from a reply, words left out or not ("the station which overshadoweth…" for "the station which, as
// ordained by God, overshadoweth…", r6): its words in order, at most 6 words apart
const echoes = (hay, span) => {
  const w = fold(span).split(' ').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(` ${w.join('(?: \\S+){0,6} ')} `).test(hay);
};

/**
 * `said`: the assistant's earlier replies in this thread — a span the user quotes BACK from them is a reference to the
 * conversation ("you said …"), not wording to find (r5, 11-01).
 */
export function detectQuotation(text, { said = [] } = {}) {
  const t = stripMarkup(text);
  if (!t || isMeaningQuestion(t)) return null;
  const echoed = said.length ? ` ${said.map(fold).join(' | ')} ` : '';
  const spans = [...t.matchAll(QUOTED)].filter((m) => !isExample(t.slice(0, m.index))).map((m) => clean(m[1]))
    .filter((s) => words(s) >= MIN_WORDS && !(echoed && echoes(echoed, s)));
  if (spans.length) return { phrase: spans.sort((a, b) => words(b) - words(a))[0], via: 'quoted' };
  if (ASK.test(t) && THING.test(t) && !THEME.test(t)) {
    const rest = t.match(LEAD)?.[1];
    const phrase = rest ? clean(rest) : '';
    if (words(phrase) >= MIN_WORDS) return { phrase, via: 'frame' };
  }
  return null;
}
