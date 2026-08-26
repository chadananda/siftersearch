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
 * Turn line-numbered anchors into spans of the original.
 *
 * The LINE NUMBER places the cut. The words are checked against that line only as CONFIRMATION, and a
 * mismatch is REPORTED rather than fatal — because the words are the part the model gets slightly wrong,
 * and discarding a correct line number over a dropped diacritic is exactly the failure this design removes.
 * An out-of-range or backwards line number IS fatal to that paragraph: those are mis-locations.
 */
export function spansFromAnchors(originalText, anchors, englishCount, { wordsPerLine = 12 } = {}) {
  const lines = numberLines(originalText, { wordsPerLine });
  const words = String(originalText || '').split(/\s+/).filter(Boolean);
  const found = [];
  const rejected = [];
  let lastLine = 0;
  for (const a of [...anchors].sort((x, y) => x.index - y.index)) {
    if (a.line == null) { rejected.push({ ...a, why: 'model skipped' }); continue; }
    if (a.line < 1 || a.line > lines.length) { rejected.push({ ...a, why: `line ${a.line} out of range (1..${lines.length})` }); continue; }
    if (a.line < lastLine) { rejected.push({ ...a, why: `line ${a.line} runs backwards from ${lastLine}` }); continue; }
    const line = lines[a.line - 1];
    // Confirmation only: did the model's words actually come from that line?
    const confirmed = !a.words || normalizeArabic(line.text).includes(normalizeArabic(a.words).slice(0, 12));
    found.push({ index: a.index, wordStart: line.wordStart, line: a.line, confirmed });
    lastLine = a.line;
  }
  const spans = found.map((f, i) => ({
    index: f.index, line: f.line, confirmed: f.confirmed,
    text: words.slice(f.wordStart, i + 1 < found.length ? found[i + 1].wordStart : undefined).join(' ').trim(),
  })).filter((s) => s.text.length > 20);
  return {
    spans, rejected,
    unconfirmed: spans.filter((s) => !s.confirmed).length,
    coverage: englishCount ? Number((spans.length / englishCount).toFixed(3)) : 0,
  };
}
