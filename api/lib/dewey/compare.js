// Is this document already in the library, when no exact match can be expected? (Chad 10-17: "come up with a good way to
// determine if this document is already in the library considering that no exact match can likely be expected".)
// Titles only say where to LOOK; the decision is made on the TEXT. Both sides are normalized hard (diacritics and
// transliteration folded, line-end hyphens rejoined, page markers, running headers/footers and Markdown dropped), cut into
// word 4-gram shingles — they survive OCR slips, reflowed lines and punctuation, and unrelated books share almost none —
// and compared in BOTH directions, with the ORDER of the shared text measured:
//   same work (another edition/transcription) · ours is inside a larger work (a compilation) · the library holds only part
//   of ours · ours merely quotes it / is quoted (shared text out of order) · unrelated.
// Pure functions; the holdings check (holdings.js) finds the candidates and calls compareTexts.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`ʻ]/g, '').toLowerCase();

/** Text → its words, normalized for comparison (repeated short lines = headers/footers, page markers and Markdown dropped). */
export function compareWords(text) {
  let lines = String(text || '').replace(/\r/g, '').replace(/(\p{L})-\n\s*(\p{L})/gu, '$1$2').split('\n');
  const count = new Map();
  for (const l of lines) { const k = fold(l).replace(/\d+/g, '#').trim(); if (k && k.split(/\s+/).length < 10) count.set(k, (count.get(k) || 0) + 1); }
  lines = lines.filter((l) => (count.get(fold(l).replace(/\d+/g, '#').trim()) || 0) < 3);
  return fold(lines.join(' ')
    .replace(/\[(page|p\.?|pg\.?)\s*[\divxlc]+\]/gi, ' ').replace(/^\s*(#+|>|-|\d+\.)\s+/gm, ' ').replace(/\*+|_+/g, ' '))
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const N = 4;
const shingleList = (words) => { const out = []; for (let i = 0; i + N <= words.length; i++) out.push(words.slice(i, i + N).join(' ')); return out; };

/** Longest increasing subsequence length (patience sort), for "is the shared text in the same order?" */
function lis(seq) {
  const tails = [];
  for (const x of seq) { let lo = 0, hi = tails.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < x) lo = m + 1; else hi = m; } tails[lo] = x; }
  return tails.length;
}

/**
 * Compare our document (words) with a library document (words).
 * → { ours_in_theirs, theirs_in_ours, in_order, length_ratio, relation }
 *   ours_in_theirs: share of OUR shingles found in theirs (how much of ours they hold)
 *   theirs_in_ours: share of THEIR shingles found in ours
 *   in_order: share of our matched shingles that fall in one increasing run through theirs (1 = same sequence)
 */
export function compareTexts(ourWords, theirWords, { ourLength = null, sample = false } = {}) {
  const ours = shingleList(ourWords), theirs = shingleList(theirWords);
  if (ours.length < 8 || theirs.length < 8) return { ours_in_theirs: 0, theirs_in_ours: 0, in_order: 0, length_ratio: 0, relation: 'too-short' };
  // EVERY position of each shingle, and each of ours matched to the first occurrence AFTER the previous match: a text that
  // repeats its formulas (a hadith collection's chains of narration — "حدثنا … عن …" thousands of times) read as
  // out of order when only the first occurrence counted — an exact copy of Al-Targhib wa al-Tarhib scored "quotes" (10-18)
  const pos = new Map();
  theirs.forEach((s, i) => { const a = pos.get(s); if (a) a.push(i); else pos.set(s, [i]); });
  const after = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] > x) hi = m; else lo = m + 1; } return lo < a.length ? a[lo] : a[0]; };
  const ourSet = new Set(ours);
  const matchedPos = [];
  let hit = 0, prev = -1;
  for (const s of ours) { const a = pos.get(s); if (a) { hit++; const p = after(a, prev); matchedPos.push(p); prev = p; } }
  let back = 0;
  for (const s of new Set(theirs)) if (ourSet.has(s)) back++;
  const ours_in_theirs = hit / ours.length;
  const theirs_in_ours = back / new Set(theirs).size;
  const in_order = matchedPos.length ? lis(matchedPos) / matchedPos.length : 0;
  // a SAMPLE (pages of a scan read by the preliminary OCR) is judged against the whole work's estimated length
  const length_ratio = theirWords.length / (ourLength || ourWords.length);
  return { ours_in_theirs: round(ours_in_theirs), theirs_in_ours: round(theirs_in_ours), in_order: round(in_order), length_ratio: round(length_ratio),
    ...(sample ? { sample: true } : {}), relation: relationOf({ ours_in_theirs, theirs_in_ours, in_order, length_ratio, sample }) };
}
const round = (x) => Math.round(x * 1000) / 1000;

// Thresholds calibrated on real pairs (tests/api/dewey-compare.test.js): a clean vs an OCR'd copy of one text shares ~55–90%
// of 4-grams; two unrelated books on the same subject share under 3%; a book that quotes a passage shares it out of
// order with the rest. STRONG = most of it; SOME = a real shared passage.
export const STRONG = 0.45, SOME = 0.12, ORDERED = 0.6, OCR_STRONG = 0.3;   // Marion Yazdi 34% in order (10-17)
// tesseract on a decent scan keeps most 4-grams; a sample's own pages must still be mostly found to call it held

export function relationOf({ ours_in_theirs: a, theirs_in_ours: b, in_order: o, length_ratio: r, sample = false }) {
  if (sample) {   // only some pages of ours were read: theirs cannot be "mostly in ours"; length comes from the page count
    // OCR'd text loses 4-grams to every misread word: a LONG IN-ORDER run is the signal (Roy Wilhelm 10-17: 40–42% in
    // order against two copies of the same notes; Marion Yazdi 34% — unrelated texts share ~1–3%)
    const strong = a >= STRONG || (a >= OCR_STRONG && o >= 0.85);
    if (strong && o >= ORDERED) return r > 1.5 ? 'inside' : r < 0.67 ? 'partial' : 'same';
    return a >= SOME ? (o >= ORDERED ? 'overlap' : 'quotes') : 'unrelated';
  }
  // a held work INSIDE a larger one of ours (a held book + new chapters, a fuller edition): theirs is mostly in ours, ours
  // much longer and only partly theirs — PARTIAL, worth adding. Called 'same' before (10-18 benchmark, 6 of 6), losing the
  // new chapters.
  if (b >= STRONG && o >= ORDERED && r < 0.8 && a < 0.8) return 'partial';
  if (a >= STRONG && b >= STRONG && o >= ORDERED) return 'same';                 // another copy, edition or transcription
  if (a >= STRONG && o >= ORDERED && r > 1.5) return 'inside';                    // ours is part of a larger library work
  if (a >= STRONG && o >= ORDERED) return 'same';
  if (b >= STRONG && r < 0.67) return 'partial';                                  // the library holds only part of ours
  if (a >= SOME || b >= SOME) return o >= ORDERED ? 'overlap' : 'quotes';         // a shared passage; out of order = quotation
  return 'unrelated';
}

/** Which relation makes it HELD, PARTLY held, or neither. */
export const HELD = new Set(['same', 'inside']);

/** ~n probes spread evenly through the document: sentences of 12–40 words (or 20-word windows), to find candidate documents. */
export function probes(text, n = 30) {
  const sentences = String(text || '').replace(/\r/g, '').replace(/(\p{L})-\n\s*(\p{L})/gu, '$1$2').replace(/\s+/g, ' ')
    .split(/(?<=[.!?;:])\s+(?=[“"'‘(\p{Lu}])/u).map((s) => s.replace(/[#*_>]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((s) => { const w = s.split(' ').length; return w >= 12 && w <= 40 && !/\[(page|p\.?)\s*\d+\]/i.test(s); });
  // no usable sentences (OCR without capitals, verse, scripts without sentence case) → 20-word windows
  const pool = sentences.length >= Math.min(n, 3) ? sentences : (() => {
    const w = String(text || '').replace(/[#*_>]+/g, ' ').split(/\s+/).filter(Boolean);
    const out = []; for (let i = 0; i + 20 <= w.length; i += 20) out.push(w.slice(i, i + 20).join(' ')); return out;
  })();
  if (pool.length <= n) return pool;
  const step = pool.length / n;
  return Array.from({ length: n }, (_, k) => pool[Math.floor(k * step + step / 2)]);
}
