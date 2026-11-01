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
const clean = (s) => s.replace(/^[\s"“„«'‘]+|[\s"”»'’.?!,;:]+$/g, '').replace(/\s+/g, ' ');

export function detectQuotation(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const spans = [...t.matchAll(QUOTED)].map((m) => clean(m[1])).filter((s) => words(s) >= MIN_WORDS);
  if (spans.length) return { phrase: spans.sort((a, b) => words(b) - words(a))[0], via: 'quoted' };
  if (ASK.test(t) && THING.test(t) && !THEME.test(t)) {
    const rest = t.match(LEAD)?.[1];
    const phrase = rest ? clean(rest) : '';
    if (words(phrase) >= MIN_WORDS) return { phrase, via: 'frame' };
  }
  return null;
}
