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
 * The strictly-increasing run through `values` with the greatest total weight, as indexes into the input.
 *
 * Weighted rather than longest, because "most matches" is the wrong objective when the matches differ in
 * confidence: two weak pairings should not evict one strong one. O(n²), which is nothing at book scale.
 */
export function heaviestIncreasingRun(values, weights) {
  const n = values.length;
  if (!n) return [];
  const best = weights.slice();
  const prev = new Array(n).fill(-1);
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && best[j] + weights[i] > best[i]) { best[i] = best[j] + weights[i]; prev[i] = j; }
    }
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (best[i] > best[end]) end = i;
  const out = [];
  for (let i = end; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/**
 * Align two sequences of the same work, in order.
 *
 * `ours` and `theirs` are arrays of { key, text } — `text` being the ENGLISH on both sides (for a translated
 * work, the aligned source's own translation field), since that is the only common language.
 *
 * Monotonic, but NOT greedily so. A book's paragraphs do not reorder, so a match that moves backwards is a
 * mis-match — yet enforcing that with a hard cursor makes one bad match catastrophic instead of merely
 * wrong: the cursor jumps, and every correct match in the skipped stretch becomes unreachable. Measured on
 * doc 20811, where a single coincidental pairing (dice 0.67) advanced the cursor past their ¶0-28 and cost
 * 25 real alignments at the head of the Four Valleys — which then read as text the source had not published.
 *
 * Chad, 2026-08-26: "spurious matches are going to happen. we need to make our approach resilient to
 * occasional spurious matches."
 *
 * So it runs in two passes: propose a best candidate per paragraph over a SOFT window, then keep the
 * heaviest strictly-increasing run through those candidates. Monotonicity still holds absolutely in the
 * output, but the anomaly is now the thing discarded rather than the thing obeyed.
 *
 * Returns { matches, unmatchedOurs, unmatchedTheirs, stats }. Anything below `minScore` is left UNMATCHED
 * rather than bound to its best-available candidate — a paragraph with no original is a fact we can record;
 * a paragraph bound to the wrong original is a fact we cannot detect later.
 */
export function alignSequences(ours, theirs, { minScore = 0.7, window = 12 } = {}) {
  // PASS 1 — propose. The cursor still tracks the running offset (that is what keeps this O(n·window)), but
  // it is SOFT: the window reaches back as well as forward, so a bad jump costs a little accuracy in the
  // next few paragraphs instead of erasing everything the jump skipped.
  const cand = [];
  let cursor = 0;
  for (let i = 0; i < ours.length; i++) {
    let best = -1, bestScore = 0;
    const from = Math.max(0, cursor - window);
    const to = Math.min(theirs.length - 1, cursor + window);
    for (let j = from; j <= to; j++) {
      const s = dice(ours[i].text, theirs[j].text);
      if (s > bestScore) { bestScore = s; best = j; }
    }
    if (best >= 0 && bestScore >= minScore) {
      cand.push({ ourIndex: i, theirIndex: best, score: bestScore });
      if (best >= cursor) cursor = best + 1;
    }
  }

  // PASS 2 — decide. The heaviest strictly-increasing run restores absolute monotonicity and uniqueness on
  // their side, choosing by total match STRENGTH so a confident pairing is not dropped to preserve two weak
  // ones. Everything not on that run is a contradiction of the majority, which is what a spurious match is.
  const keep = heaviestIncreasingRun(cand.map((c) => c.theirIndex), cand.map((c) => c.score));
  const matches = keep.map((k) => {
    const c = cand[k];
    return { ourKey: ours[c.ourIndex].key, theirKey: theirs[c.theirIndex].key,
      ourIndex: c.ourIndex, theirIndex: c.theirIndex, score: Number(c.score.toFixed(3)) };
  });
  const takenTheirs = new Set(matches.map((m) => m.theirIndex));

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

/**
 * Which of OUR paragraphs appear anywhere in `theirs` — used to locate a WORK inside a document.
 *
 * Deliberately NOT monotonic, which is the opposite of what alignSequences does and the reason this exists.
 * Binding content must be monotonic: a backwards pairing there attaches one passage's original to another's
 * doctrine. But locating a work only needs a neighbourhood, and monotonicity makes that job fragile —
 * measured on doc 20811, where ONE coincidental match (our ¶90 to their ¶29, dice 0.67) came early in the
 * sequence and forbade every later match from using their ¶0-28, silently costing 25 real alignments at the
 * head of the Four Valleys. A lone outlier is harmless here because largestCluster discards it; a poisoned
 * monotonic chain is not, because it looks like an absence of text.
 */
export function matchedRegion(ours, theirs, { minScore = 0.55 } = {}) {
  const theirWords = theirs.map((t) => contentWords(t.text));
  const out = [];
  ours.forEach((o, i) => {
    const ow = contentWords(o.text);
    if (theirWords.some((tw) => dice(ow, tw) >= minScore)) out.push(i);
  });
  return out;
}

/**
 * Pearson correlation of PARAGRAPH LENGTHS between two editions at a given offset.
 *
 * Language-independent, so it works where no shared vocabulary does: a Persian paragraph and its English
 * rendering have no words in common, but they have a shape — a long paragraph translates long, a one-line
 * verse translates short. Across a whole book that shape is a fingerprint.
 */
export function lengthCorrelation(ourLens, theirLens, offset) {
  const xs = [], ys = [];
  for (let k = 0; k < theirLens.length; k++) {
    const i = offset + k;
    if (i < 0 || i >= ourLens.length) continue;
    xs.push(ourLens[i]); ys.push(theirLens[k]);
  }
  const n = xs.length;
  if (n < 20) return { n, r: 0 };                 // too few pairs for the shape to mean anything
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  const d = Math.sqrt(sxx * syy);
  return { n, r: d ? sxy / d : 0 };
}

/**
 * Is this edition paragraph-for-paragraph with ours, and at what offset?
 *
 * WHEN THIS HOLDS, IT BEATS EVERYTHING ELSE. Some Answered Questions measured r=0.9755 at offset 7 and
 * ≤0.18 at every other offset — over all 781 paragraphs, not a sample. That is a deterministic, free and
 * checkable pairing, where the alternative was four paid model calls segmenting a text whose paragraphing
 * was already correct. Cheap enough to try FIRST on any new source.
 *
 * It must be DECISIVE to be used: a strong correlation that is barely better than its neighbour means the
 * offset is not really determined, and an off-by-one here would shift a whole book by one paragraph — the
 * kind of error that reads as plausible forever. Refuses rather than reporting a best guess.
 */
export function bestOrdinalOffset(ourLens, theirLens, { maxOffset = 60, minR = 0.9, minMargin = 0.25 } = {}) {
  const scored = [];
  for (let off = -maxOffset; off <= maxOffset; off++) scored.push({ off, ...lengthCorrelation(ourLens, theirLens, off) });
  scored.sort((a, b) => b.r - a.r);
  const [best, next] = scored;
  const margin = best.r - (next?.r ?? 0);
  return {
    offset: best.off, r: Number(best.r.toFixed(4)), n: best.n,
    runnerUp: next ? { offset: next.off, r: Number(next.r.toFixed(4)) } : null,
    margin: Number(margin.toFixed(4)),
    decisive: best.r >= minR && margin >= minMargin,
    why: best.r < minR ? `correlation ${best.r.toFixed(3)} below ${minR} — the editions are not paragraph-for-paragraph`
      : margin < minMargin ? `offset ${best.off} only ${margin.toFixed(3)} better than ${next.off} — not determined`
        : null,
  };
}
