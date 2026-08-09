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
 * word windows down to 3 words (people's memory usually diverges from the real
 * text after the first few words: "Sorrow not if things…" vs "Sorrow not if, in
 * these days…"), each in straight- and curly-apostrophe forms (the corpus stores
 * curly U+2019). These are the OPPORTUNISTIC fast wins — imperfectly remembered
 * quotes are the NORM, and the fuzzy scorer below is the real engine.
 */
export function phraseQueryVariants(span) {
  const clean = String(span).replace(/[\s"“”]+/g, ' ').replace(/[.,;:!?…]+$/, '').trim();
  const words = clean.match(/\S+/g) || [];
  const lengths = [words.length, 8, 6, 4, 3].filter((n, i, a) => n >= 3 && a.indexOf(n) === i && n <= words.length);
  const out = [];
  for (const n of lengths) {
    const frag = words.slice(0, n).join(' ').replace(/[.,;:!?…]+$/, '');
    for (const variant of [frag, frag.replace(/'/g, '’'), frag.replace(/’/g, "'")]) {
      const q = `"${variant}"`;
      if (!out.includes(q)) out.push(q);
    }
  }
  return out;
}

// Small stopword set for distinctive-term scoring — enough to separate memorable
// content words ("mosquito", "citizens") from glue. Deliberately conservative.
const STOP = new Set(('a an and are as at be but by for from had has have he her his i if in into is it its me my not of on or our '
  + 'she so that the their them then there they this to us was we were what when where which who will with you your thing things '
  + 'say says said like about something quote passage verse').split(' '));

// Crude stem — memory and source differ in morphology ("weakest" vs "weak",
// "conquered" vs "conquer"). One suffix strip, never below 3 chars.
const stem = (w) => {
  for (const suf of ['iest', 'ing', 'est', 'ed', 'ly', 'es', 's']) {
    if (suf === 's' && w.endsWith('ss')) continue;   // grass, witness, holiness
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
};

const contentWords = (s) => (String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)).map(stem);

/**
 * The memorable content words of a remembered quote/description — what survives
 * imperfect human memory. Used to score search candidates.
 */
export function distinctiveTerms(text) {
  return [...new Set(contentWords(text))];
}

/**
 * How well does a candidate passage match the user's remembered wording/description?
 * Returns 0..1: fraction of the memory's distinctive terms present in the candidate,
 * with a bonus for consecutive runs (phrases surviving intact). Deterministic scoring
 * of CANDIDATES (not user-text classification) — cheap, explainable, unit-testable.
 */
export function scoreCandidate(memory, candidateText) {
  const terms = distinctiveTerms(memory);
  if (!terms.length) return 0;
  const hay = new Set(contentWords(candidateText));
  let hit = 0;
  for (const t of terms) if (hay.has(t)) hit++;
  const coverage = hit / terms.length;
  // Consecutive-run bonus: check the memory's word PAIRS surviving in order.
  const memSeq = contentWords(memory);
  const candSeq = contentWords(candidateText).join(' ');
  let pairs = 0, pairHits = 0;
  for (let i = 0; i + 1 < memSeq.length; i++) {
    pairs++;
    if (candSeq.includes(memSeq[i] + ' ' + memSeq[i + 1])) pairHits++;
  }
  const runBonus = pairs ? (pairHits / pairs) * 0.25 : 0;
  return Math.min(1, coverage * 0.85 + runBonus);
}
