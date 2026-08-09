// Quote-source lookup helpers for Jafar's quote_request fast path.
// "Where is this quote from: '…'?" must resolve by EXACT PHRASE against the corpus —
// never by semantic similarity, which returns thematic cousins from other traditions.
// Pure functions (no deps) so the extraction rules are unit-testable.

// Matches a span inside straight/curly double quotes, curly single quotes, or
// guillemets. Straight single quotes are NOT span delimiters (apostrophes).
const QUOTE_SPAN_RE = /["“‘«]([^"“”‘’«»]{10,400})["”’»]/g;

// Lead-ins that mark a source-identification ask even without quote marks:
// "where is this quote from: …", "who said …", "who wrote the line …".
const LEADIN_RE = /^(?:where\s+(?:is|does|did|was)\s+(?:this|the|that)\s+(?:quote|line|passage|verse|phrase|saying)[^:]*[:,-]\s*|who\s+(?:said|wrote|penned)\s*[:,-]?\s*|what\s+is\s+the\s+source\s+of\s*[:,-]?\s*)/i;

const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;

/**
 * Extract the quoted span the user wants sourced, or null when the message has
 * no identifiable quotation (e.g. "show me a quote about love" — a passage
 * REQUEST, not source identification — must fall through to normal research).
 */
export function extractQuotedSpan(text) {
  const spans = [];
  let m;
  QUOTE_SPAN_RE.lastIndex = 0;
  while ((m = QUOTE_SPAN_RE.exec(String(text))) !== null) spans.push(m[1].trim());
  const best = spans.filter((s) => wordCount(s) >= 3).sort((a, b) => b.length - a.length)[0];
  if (best) return best;
  // No quote marks — accept only when an explicit source-identification lead-in
  // starts the message; the remainder is the quote.
  const stripped = String(text).trim().replace(LEADIN_RE, '');
  if (stripped !== String(text).trim() && wordCount(stripped) >= 4) {
    return stripped.replace(/[?!.\s]+$/, '').trim();
  }
  return null;
}

/**
 * Progressive Meili PHRASE queries for a span — full phrase first, then leading
 * 8 / 6 words, each in straight- and curly-apostrophe forms (the corpus stores
 * curly U+2019). Phrase-only by design: an unquoted fallback would reintroduce
 * the "vaguely similar ideas from other religions" failure this path exists to kill.
 */
export function phraseQueryVariants(span) {
  const clean = String(span).replace(/[\s"“”]+/g, ' ').replace(/[.,;:!?]+$/, '').trim();
  const words = clean.match(/\S+/g) || [];
  const lengths = [words.length, 8, 6].filter((n, i, a) => n >= 3 && a.indexOf(n) === i && n <= words.length);
  const out = [];
  for (const n of lengths) {
    const frag = words.slice(0, n).join(' ');
    for (const variant of [frag, frag.replace(/'/g, '’'), frag.replace(/’/g, "'")]) {
      const q = `"${variant}"`;
      if (!out.includes(q)) out.push(q);
    }
  }
  return out;
}
