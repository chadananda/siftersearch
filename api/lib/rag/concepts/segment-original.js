// concepts/segment-original — cut a CONTINUOUS original text to match the English paragraphing, by
// comprehension, returning only the cut POINTS.
//
// Chad, 2026-08-26: "the original has no original paragraph segmentation. if it has any, they are
// artificial… Length is not relevant. Comprehension must be used. I would suggest a prompt that minimizes
// token output to get the segmentation points we need."
//
// ── WHY NOT LENGTH ──────────────────────────────────────────────────────────────────────────────────────
// A proportional split assumes the two languages expand at a constant rate through a passage. They do not:
// a verse dense with Qur'ánic citation compresses in Arabic and runs long in English, and one long
// invocation can occupy a third of an English paragraph and a tenth of the original. Length gives an answer
// everywhere and is right nowhere in particular — the worst property for something whose errors are
// undetectable afterwards.
//
// ── WHY A LINE NUMBER, NOT COPIED TEXT ──────────────────────────────────────────────────────────────────
// Chad, 2026-08-26: "if you provide line numbers and have it return the line number and some words, that is
// the best. Otherwise it will output slightly wrong text and you will not be able to find it."
//
// My first version asked only for the opening WORDS and located the cut by finding them. That fails in the
// most damaging way available: a model copying Arabic back will drop a hamza, normalise a yá or modernise a
// spelling, the search then finds nothing, and a CORRECT alignment is discarded by its own verification. The
// output looks careful and quietly loses good work.
//
// The line number is an exact locus that survives any such drift. The words stay, but demoted to
// CONFIRMATION of the line — so a mismatch is reported, not fatal.
//
// Output stays tiny either way: one short line per English paragraph rather than a 6,000-word book
// re-emitted, which is the difference between a cheap call and an unaffordable one.
// Deps: none (pure); the caller supplies the model call.

/** Normalise Arabic/Persian for anchor lookup: strip diacritics and unify letters that vary by edition. */
export function normalizeArabic(s) {
  return String(s || '')
    .replace(/[ً-ْٰـ]/g, '')   // harakat, dagger alif, tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[کك]/g, 'ك').replace(/[گ]/g, 'گ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where does `anchor` occur in `text`, diacritics-insensitively? -1 when absent. Pure. */
export function findAnchor(text, anchor, from = 0) {
  const nText = normalizeArabic(text);
  const nAnchor = normalizeArabic(anchor);
  if (!nAnchor || nAnchor.length < 6) return -1;
  // Map the normalised index back to the raw string by walking both in step — the two differ in length
  // wherever a diacritic was dropped, so a normalised offset is not a raw offset.
  const nFrom = normalizeArabic(text.slice(0, from)).length;
  const at = nText.indexOf(nAnchor, nFrom);
  if (at < 0) return -1;
  let raw = 0, norm = 0;
  while (norm < at && raw < text.length) {
    const step = normalizeArabic(text[raw]).length;
    norm += step; raw += 1;
  }
  return raw;
}

/**
 * Break the continuous original into NUMBERED LINES for the prompt.
 *
 * Chad, 2026-08-26: "if you provide line numbers and have it return the line number and some words, that is
 * the best. Otherwise it will output slightly wrong text and you will not be able to find it."
 *
 * That is the difference between a locator and a hope. A model asked to copy Arabic back will drop a
 * hamza, normalise a yá, or silently modernise a spelling — and then the anchor cannot be found, so a
 * CORRECT alignment is thrown away by the verification step. The line number pins the position exactly and
 * survives any such drift; the words become CONFIRMATION of the line rather than the means of finding it.
 *
 * Lines are cut at ~`wordsPerLine` on whitespace: short enough that a line number is precise, long enough
 * that the numbering does not swamp the text.
 */
export function numberLines(originalText, { wordsPerLine = 12 } = {}) {
  const words = String(originalText || '').split(/\s+/).filter(Boolean);
  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push({ n: lines.length + 1, text: words.slice(i, i + wordsPerLine).join(' '), wordStart: i });
  }
  return lines;
}

/** Render numbered lines for the prompt. Pure. */
export const renderLines = (lines) => lines.map((l) => `${l.n}| ${l.text}`).join('\n');

/**
 * Numbered units built from the source's OWN paragraphs instead of arbitrary word-runs.
 *
 * Reach for this when the source's paragraphing is real rather than an artefact. bahai.org prints the
 * Persian Some Answered Questions in 781 numbered paragraphs against our 789 English ones — that is the
 * author's own division, not an editor's, and cutting it into 12-word lines would throw away a better
 * anchor than any we could construct. The unit becomes a whole paragraph, so a cut cannot land mid-sentence
 * and no span carries a lead-in.
 */
export function linesFromParagraphs(paras) {
  let at = 0;
  return paras.map((text, i) => {
    const line = { n: i + 1, text: String(text), wordStart: at };
    at += String(text).split(/\s+/).filter(Boolean).length;
    return line;
  });
}

/**
 * The prompt. Asks for a LINE NUMBER plus a few words — the number locates, the words confirm.
 *
 * States outright that the original is continuous and its printed breaks are an editor's, because a model
 * shown a pre-broken text will otherwise respect those breaks, which is the error being corrected.
 */
export function buildSegmentPrompt(englishParas, lines, { anchorWords = 4 } = {}) {
  const numbered = englishParas.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
  return {
    system: `You align a translation to its ORIGINAL text.

The original is given as NUMBERED LINES. It is CONTINUOUS prose — the line breaks are mechanical and the paragraph breaks of any printed edition are an editor's, not the author's. The English paragraphing is the meaningful one.

For each numbered English paragraph, find the LINE NUMBER in the original where that paragraph's content BEGINS.

Output ONE line per English paragraph, tab-separated:
<english number><TAB><original line number><TAB><first ${anchorWords} words of that line>

Rules:
• Nothing else — no translation, no explanation, no restating the passage.
• Line numbers must INCREASE down your answer, because both texts run in the same order.
• If you cannot locate a paragraph confidently, output its number, a tab, and SKIP. A skipped paragraph is expected and harmless; a guessed one corrupts the alignment.
• The words are only to confirm the line — the LINE NUMBER is what matters.`,
    user: `ORIGINAL (numbered lines):\n${renderLines(lines)}\n\n---\nENGLISH PARAGRAPHS:\n${numbered}`,
  };
}

/** Parse "12\t340\tانّ اوّل ما کتب" lines. Tolerant of stray prose around them. Pure. */
export function parseAnchors(raw) {
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const skip = line.match(/^\s*\[?(\d{1,4})\]?\s*[\t:.\-—]\s*SKIP\s*$/i);
    if (skip) { out.push({ index: Number(skip[1]), line: null, words: null }); continue; }
    const m = line.match(/^\s*\[?(\d{1,4})\]?\s*[\t|:.\-—]\s*(\d{1,5})\s*[\t|:.\-—]?\s*(.*)$/);
    if (!m) continue;
    out.push({ index: Number(m[1]), line: Number(m[2]), words: (m[3] || '').trim() || null });
  }
  return out;
}

/**
 * Find the model's quoted words NEAR the line it named, and return their exact word offset.
 *
 * THIS IS WHERE THE WORDS EARN THEIR KEEP. The line number alone cuts on a 12-word boundary, so a span
 * begins up to eleven words before its paragraph does — measured on the Seven Valleys, where all 20 pairs I
 * read were content-correct and most carried a short lead-in from the previous passage. Locating the quoted
 * words turns the line into an exact cut, using data the model already returned at no extra cost.
 *
 * Searched over the named line and its NEIGHBOURS, because the model quotes the words its PARAGRAPH begins
 * with, which need not be the words the line begins with. That is why 25 of 119 Seven Valleys spans came
 * back "unconfirmed" while every one I checked was right: the check was too narrow, not the answer wrong.
 *
 * Matching is on the first three normalised words: enough to be unambiguous in a 25-word neighbourhood, few
 * enough that one drifted spelling later in the phrase does not lose a correct location.
 */
export function refineWordStart(words, lines, lineNo, anchorWords, { lookaround = 1 } = {}) {
  const target = normalizeArabic(anchorWords || '').split(' ').filter(Boolean).slice(0, 3);
  if (target.length < 2) return null;
  const first = lines[Math.max(0, lineNo - 1 - lookaround)];
  const last = lines[Math.min(lines.length - 1, lineNo - 1 + lookaround)];
  const to = Math.min(words.length, last.wordStart + last.text.split(/\s+/).length);
  for (let i = first.wordStart; i <= to - target.length; i++) {
    if (target.every((t, j) => normalizeArabic(words[i + j]) === t)) return i;
  }
  return null;
}

/**
 * The longest strictly-increasing run through `values`, as the indexes that belong to it.
 *
 * Chad, 2026-08-26: "spurious matches are going to happen. we need to make our approach resilient to
 * occasional spurious matches."
 *
 * Both texts run in the same order, so line numbers must increase — but enforcing that GREEDILY makes one
 * bad answer catastrophic rather than merely wrong: a single anchor that jumps too far raises the floor and
 * every correct anchor after it is rejected as "backwards". Measured on the Secret of Divine Civilization,
 * where "line 6 runs backwards from 16" and "line 98 runs backwards from 113" mean the OUTLIER won and its
 * well-placed neighbours were discarded.
 *
 * Taking the longest increasing subsequence instead lets the majority decide: the outlier is the one dropped,
 * because it is the one that cannot be reconciled with the rest. O(n log n), patience-sorting.
 */
export function longestIncreasingRun(values) {
  const tails = [];        // tails[k] = index into `values` of the smallest tail of a run of length k+1
  const prev = new Array(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tails[mid]] < values[i]) lo = mid + 1; else hi = mid;
    }
    // A tie is not an improvement: two paragraphs cannot begin at the same line, and keeping the EARLIER one
    // is the sane reading (the earlier paragraph owns the earlier text).
    if (tails[lo] !== undefined && values[tails[lo]] === values[i]) continue;
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const out = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/**
 * Turn line-numbered anchors into spans of the original.
 *
 * The LINE NUMBER places the cut. The words are checked against that line only as CONFIRMATION, and a
 * mismatch is REPORTED rather than fatal — because the words are the part the model gets slightly wrong,
 * and discarding a correct line number over a dropped diacritic is exactly the failure this design removes.
 * An out-of-range or backwards line number IS fatal to that paragraph: those are mis-locations.
 */
export function spansFromAnchors(originalText, anchors, englishCount, { wordsPerLine = 12, lines: given } = {}) {
  // `lines` may be supplied by the caller (linesFromParagraphs) when the source's own paragraphing is the
  // better unit. Re-deriving them here would silently disagree with what the model was actually shown.
  const lines = given ?? numberLines(originalText, { wordsPerLine });
  const words = String(originalText || '').split(/\s+/).filter(Boolean);
  const found = [];
  const rejected = [];
  let lastStart = 0;

  // Unambiguous errors first — a skip and an impossible line number need no comparison with anything else.
  const ordered = [...anchors].sort((x, y) => x.index - y.index);
  const usable = [];
  for (const a of ordered) {
    if (a.line == null) { rejected.push({ ...a, why: 'model skipped' }); continue; }
    if (a.line < 1 || a.line > lines.length) { rejected.push({ ...a, why: `line ${a.line} out of range (1..${lines.length})` }); continue; }
    usable.push(a);
  }
  // Then let the MAJORITY settle the ordering, rather than whichever anchor happened to come first.
  const keep = new Set(longestIncreasingRun(usable.map((a) => a.line)));
  usable.forEach((a, i) => { if (!keep.has(i)) rejected.push({ ...a, why: `line ${a.line} contradicts the surrounding order` }); });

  for (const a of usable.filter((_, i) => keep.has(i))) {
    const line = lines[a.line - 1];
    // Refine the line to an exact word offset where the quoted words can be found near it; fall back to the
    // line start otherwise. Never allowed to move BACKWARDS past the previous span — a refinement that
    // reorders the book would undo the one property the line numbers are here to guarantee.
    const refined = refineWordStart(words, lines, a.line, a.words);
    const wordStart = refined != null && refined >= lastStart ? refined : line.wordStart;
    // Two paragraphs resolving to the same position is a REJECTION, not an empty span quietly dropped by the
    // length filter: it means the model placed both in one spot, and that is worth seeing.
    if (found.length && wordStart <= lastStart) {
      rejected.push({ ...a, why: `resolves at or before ¶${found.at(-1).index}` });
      continue;
    }
    found.push({ index: a.index, wordStart, line: a.line, confirmed: refined != null, exact: wordStart === refined });
    lastStart = wordStart;
  }
  const spans = found.map((f, i) => ({
    index: f.index, line: f.line, confirmed: f.confirmed, exact: f.exact,
    text: words.slice(f.wordStart, i + 1 < found.length ? found[i + 1].wordStart : undefined).join(' ').trim(),
  })).filter((s) => s.text.length > 20);
  return {
    spans, rejected,
    unconfirmed: spans.filter((s) => !s.confirmed).length,
    // How many cuts landed on the exact word rather than the enclosing line — the quality number that
    // matters for a bilingual layer, since an inexact cut carries a lead-in from the previous passage.
    exact: spans.filter((s) => s.exact).length,
    coverage: englishCount ? Number((spans.length / englishCount).toFixed(3)) : 0,
  };
}

/**
 * Split a long book into chunks of English paragraphs.
 *
 * A whole work in one call is the honest default and is what runs for anything up to `parasPerChunk` — the
 * model sees the entire original and cannot mis-place a paragraph by not having been shown its home. Chunking
 * exists only because some books do not fit: Some Answered Questions is 789 paragraphs against ~78,000 words.
 */
export function planChunks(englishCount, { parasPerChunk = 150 } = {}) {
  const chunks = [];
  for (let start = 0; start < englishCount; start += parasPerChunk) {
    chunks.push({ start, end: Math.min(start + parasPerChunk, englishCount) });
  }
  return chunks.length ? chunks : [{ start: 0, end: 0 }];
}

/**
 * Which lines of the original to show a chunk.
 *
 * Bounded BELOW by where the previous chunk ended, because the alignment is monotonic — offering lines the
 * previous chunk already consumed invites the model to place a paragraph backwards, which is the one error
 * the verifier can catch but should not have to. `lookback` keeps a little context behind the floor so a
 * paragraph straddling the seam is still findable.
 *
 * Bounded ABOVE generously (`slack`), because a proportional estimate of where a chunk ends is exactly the
 * length assumption this module rejects: it is used to decide how much text to SHOW, never where to cut.
 */
export function lineWindowFor({ floorLine = 1, paraCount, englishCount, lineCount, slack = 2.5, lookback = 3 } = {}) {
  const linesPerPara = englishCount ? lineCount / englishCount : lineCount;
  const from = Math.max(1, floorLine - lookback);
  const to = Math.min(lineCount, Math.ceil(from + paraCount * linesPerPara * slack));
  return { from, to };
}

/**
 * The whole segmentation, once, so the two sources (oceanoflights pages, bahai.org library) cannot drift
 * apart in how they chunk, offset, or verify. The caller supplies only the model call.
 *
 * `lines` is optional: pass linesFromParagraphs(...) where the source's own paragraphing is real, and leave
 * it out to cut a continuous stream into word-runs.
 *
 * THE OFFSET RULE, in one place because it has already been got wrong once: English numbers are CHUNK-LOCAL
 * ([1] restarts every chunk) and are made absolute here; LINE numbers are not, because renderLines prints
 * each line's own `n`, so the model answers in absolute numbers from the start.
 */
export async function segmentToEnglish({ englishTexts, originalText, lines: given, callModel,
  parasPerChunk = 150, wordsPerLine = 12, anchorWords = 4 } = {}) {
  const lines = given ?? numberLines(originalText, { wordsPerLine });
  const chunks = planChunks(englishTexts.length, { parasPerChunk });
  const anchors = [];
  let floorLine = 1;
  for (const ch of chunks) {
    const win = lineWindowFor({ floorLine, paraCount: ch.end - ch.start,
      englishCount: englishTexts.length, lineCount: lines.length });
    const shown = lines.slice(win.from - 1, win.to);
    const reply = await callModel(buildSegmentPrompt(englishTexts.slice(ch.start, ch.end), shown, { anchorWords }));
    for (const a of parseAnchors(reply)) anchors.push({ ...a, index: a.index + ch.start });
    const last = anchors.filter((a) => a.line != null).at(-1);
    if (last) floorLine = last.line;
  }
  return { ...spansFromAnchors(originalText, anchors, englishTexts.length, { wordsPerLine, lines }),
    chunks: chunks.length, anchors: anchors.length, lineCount: lines.length };
}
