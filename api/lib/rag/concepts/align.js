// concepts/align — pair OUR paragraphs of a translated work with the ORIGINAL-language paragraphs of the
// same work, as a monotonic sequence alignment. Pure: no network, no database. The caller supplies both
// sides; ctai.js fetches one of them and the backfill writes the result to content.original_text.
//
// ── WHY NOT BY POSITION ──────────────────────────────────────────────────────────────────────────────────
// Our segmentation and the aligned-text source's are independent segmentations of the same book. Measured on
// the Kitáb-i-Íqán (2026-08-25): ours 292 paragraphs, CTAI's 291 pairs — because CTAI folds the opening
// invocation ("In the name of our Lord, the Exalted, the Most High") into its first pair. Index-matching
// would therefore be correct for the first paragraph and off by one for the remaining 291, silently
// attaching every paragraph's original to its neighbour's doctrine.
//
// ── WHY THE SIMILARITY MEASURE IS LENGTH-AWARE ───────────────────────────────────────────────────────────
// The obvious containment score — shared words ÷ the SHORTER text — rates a 3-word pair a perfect 1.00
// against any long paragraph that happens to contain those words. Measured with that metric, 50+ Íqán
// paragraphs "matched" pair 289 (a 24-character fragment) at 1.00, and the alignment came out with 55
// non-monotonic steps that looked like genuine reordering. Dice — 2×shared ÷ combined length — cannot be
// fooled that way: it penalises a length mismatch by construction. With Dice the same data gives 289/292
// matched at ≥0.7, ZERO non-monotonic steps and ZERO pairs claimed twice.
//
// So both properties below are load-bearing, and both came from measurement rather than assumption.
// Deps: none.

const STOP_SHORT = 4;            // words this long or shorter carry no discriminative signal

// Persian and Arabic share a script; only these four letters are Persian-exclusive. Same rule the app's
// language detector uses — duplicated deliberately, because this library takes no app imports, and the
// alternative (trusting the upstream source's own label) is what got it wrong.
const PERSIAN_ONLY = /[پچژگ]/;
const ARABIC_SCRIPT = /[؀-ۿ]/;

/**
 * Language of an original-language passage: 'fa', 'ar', or null when the text is not in Arabic script.
 *
 * MUST BE PER-PARAGRAPH, not per-work. The Kitáb-i-Íqán is Persian — "a model of Persian prose" (Chad,
 * 2026-08-25) — while the Hidden Words has an Arabic part AND a Persian part, and Gleanings is compiled
 * from tablets in both. So there is no single answer for a book, only for a passage.
 *
 * Do NOT take this from the upstream source's own label: CTAI reports source_lang 'ar' for the Íqán, and
 * trusting that stamped 290 Persian paragraphs as Arabic. Language drives model routing and the Anthropic
 * spend policy, so a wrong label is not cosmetic — it misroutes the text to a model that cannot read it.
 */
export function detectSourceLang(text) {
  const s = String(text || '');
  if (!ARABIC_SCRIPT.test(s)) return null;
  return PERSIAN_ONLY.test(s) ? 'fa' : 'ar';
}

export function normalizeEn(s) {
  return String(s || '')
    .replace(/^\s*\[\d+\]\s*/, '')                    // our own paragraph marker, not the text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // Muḥammad ↔ Muhammad: the sources differ in diacritics
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export const contentWords = (s) => normalizeEn(s).split(' ').filter((w) => w.length >= STOP_SHORT);

/**
 * Dice coefficient over content words: 2×|shared| / (|a| + |b|), multiset-aware. 0..1.
 * Length-aware BY CONSTRUCTION — see the header note on why containment is not usable here.
 */
export function dice(a, b) {
  const A = contentWords(a), B = contentWords(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map();
  for (const w of A) counts.set(w, (counts.get(w) || 0) + 1);
  let shared = 0;
  for (const w of B) {
    const n = counts.get(w);
    if (n) { shared++; counts.set(w, n - 1); }
  }
  return (2 * shared) / (A.length + B.length);
}

/**
 * Align two sequences of the same work, in order.
 *
 * `ours` and `theirs` are arrays of { key, text } — `text` being the ENGLISH on both sides (for a translated
 * work, the aligned source's own translation field), since that is the only common language.
 *
 * Monotonic by construction: a book's paragraphs do not reorder, so a match that would move backwards is a
 * mis-match, not a discovery. Enforcing it is what turns a per-paragraph guess into a sequence alignment.
 * `window` bounds the search around the running offset, which also makes the pass O(n·window) rather than
 * O(n·m).
 *
 * Returns { matches, unmatchedOurs, unmatchedTheirs, stats }. Anything below `minScore` is left UNMATCHED
 * rather than bound to its best-available candidate — a paragraph with no original is a fact we can record;
 * a paragraph bound to the wrong original is a fact we cannot detect later.
 */
export function alignSequences(ours, theirs, { minScore = 0.7, window = 12 } = {}) {
  const matches = [];
  const takenTheirs = new Set();
  let cursor = 0;                                     // lowest index in `theirs` still available

  for (let i = 0; i < ours.length; i++) {
    let best = -1, bestScore = 0;
    const from = Math.max(cursor, 0);
    const to = Math.min(theirs.length - 1, cursor + window);
    for (let j = from; j <= to; j++) {
      if (takenTheirs.has(j)) continue;
      const s = dice(ours[i].text, theirs[j].text);
      if (s > bestScore) { bestScore = s; best = j; }
    }
    if (best >= 0 && bestScore >= minScore) {
      matches.push({ ourKey: ours[i].key, theirKey: theirs[best].key, ourIndex: i, theirIndex: best,
        score: Number(bestScore.toFixed(3)) });
      takenTheirs.add(best);
      cursor = best + 1;                              // monotonic: never look back
    }
  }

  const matchedOurs = new Set(matches.map((m) => m.ourIndex));
  const scores = matches.map((m) => m.score).sort((a, b) => a - b);
  return {
    matches,
    unmatchedOurs: ours.map((o, i) => ({ ...o, index: i })).filter((_, i) => !matchedOurs.has(i)),
    unmatchedTheirs: theirs.map((t, j) => ({ ...t, index: j })).filter((_, j) => !takenTheirs.has(j)),
    stats: {
      ours: ours.length, theirs: theirs.length, matched: matches.length,
      coverage: ours.length ? Number((matches.length / ours.length).toFixed(3)) : 0,
      minScore: scores[0] ?? null,
      medianScore: scores.length ? scores[Math.floor(scores.length / 2)] : null,
    },
  };
}

/**
 * The densest contiguous stretch of matched indexes — where a WORK sits inside a document.
 *
 * A work occupies one continuous run of a book's paragraphs; a match far from the rest is a coincidence of
 * shared vocabulary, not a second location. Taking the outer range instead bound the Four Valleys to
 * [90, 209] of doc 20811 because a few of its phrases also match the Seven Valleys — re-offering 32
 * paragraphs that had already been aligned to a different original (2026-08-26).
 *
 * `maxGap` is in paragraphs: a run continues across short unmatched stretches (a poem, a heading, a passage
 * our edition paragraphs differently) and breaks at a real discontinuity.
 */
export function largestCluster(indexes, { maxGap = 12 } = {}) {
  const sorted = [...indexes].sort((a, b) => a - b);
  if (!sorted.length) return [0, -1];
  let best = [sorted[0], sorted[0]], bestN = 1;
  let start = sorted[0], n = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= maxGap) { n += 1; continue; }
    if (n > bestN) { bestN = n; best = [start, sorted[i - 1]]; }
    start = sorted[i]; n = 1;
  }
  if (n > bestN) best = [start, sorted.at(-1)];
  return best;
}
