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
// ── WHY ANCHORS, NOT SEGMENTS ───────────────────────────────────────────────────────────────────────────
// The model returns ONLY the first few words of each original span. Two reasons, and the second matters
// more than the saving:
//   1. Output is a few words per paragraph instead of the whole book re-emitted — the difference between a
//      cheap call and an unaffordable one, on texts of 6,000+ words.
//   2. An anchor is CHECKABLE. Every returned anchor must occur VERBATIM in the original and the offsets
//      must strictly increase; a model that invents a plausible phrase is caught by a substring test rather
//      than believed. Asking for the segments themselves would mean trusting a rewrite of scripture.
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
 * The prompt. Asks for anchors ONLY — an index and the first few words of the original at that point.
 *
 * Deliberately says the original is unsegmented and that its printed breaks mean nothing, because that is
 * the fact the task turns on and a model shown a pre-broken text will otherwise respect those breaks.
 */
export function buildSegmentPrompt(englishParas, originalText, { anchorWords = 4 } = {}) {
  const numbered = englishParas.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
  return {
    system: `You align a translation to its ORIGINAL text.

The original below is CONTINUOUS. Any paragraph breaks in it are an editor's, not the author's — ignore them entirely. The English paragraphing is the meaningful one.

For each numbered English paragraph, find where in the ORIGINAL that paragraph's content BEGINS, and report the first ${anchorWords} words of the original at that point — copied EXACTLY, character for character, from the original text.

Rules:
• Output ONE line per English paragraph: the number, a tab, then the ${anchorWords} words. Nothing else — no translation, no explanation, no restating the passage.
• The anchors must appear in the SAME ORDER as the original text runs.
• If you cannot locate a paragraph with confidence, output its number, a tab, and the single word SKIP. A skipped paragraph is expected and harmless; a guessed one corrupts the alignment.
• Never write words that are not present verbatim in the original.`,
    user: `ORIGINAL (continuous):\n${originalText}\n\n---\nENGLISH PARAGRAPHS:\n${numbered}`,
  };
}

/** Parse "12\tانّ اوّل ما کتب" lines. Tolerant of stray prose around them. Pure. */
export function parseAnchors(raw) {
  const out = [];
  for (const line of String(raw || '').split('\n')) {
    const m = line.match(/^\s*\[?(\d{1,4})\]?\s*[\t:.\-—]\s*(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    out.push({ index: Number(m[1]), anchor: /^SKIP$/i.test(text) ? null : text });
  }
  return out;
}

/**
 * Turn verified anchors into spans of the original.
 *
 * Every anchor is checked to occur VERBATIM (diacritics-insensitively) and to advance monotonically. One
 * that fails either test is dropped, and its English paragraph simply gets no original — which is the
 * outcome this whole design protects: a paragraph with no original is recordable, one bound to the wrong
 * span is not.
 */
export function spansFromAnchors(originalText, anchors, englishCount) {
  const found = [];
  let cursor = 0;
  const rejected = [];
  for (const a of anchors.sort((x, y) => x.index - y.index)) {
    if (!a.anchor) { rejected.push({ ...a, why: 'model skipped' }); continue; }
    const at = findAnchor(originalText, a.anchor, cursor);
    if (at < 0) { rejected.push({ ...a, why: 'anchor not present in the original' }); continue; }
    found.push({ index: a.index, start: at });
    cursor = at + 1;
  }
  const spans = found.map((f, i) => ({
    index: f.index,
    text: originalText.slice(f.start, i + 1 < found.length ? found[i + 1].start : undefined).trim(),
  })).filter((s) => s.text.length > 20);
  return { spans, rejected, coverage: englishCount ? Number((spans.length / englishCount).toFixed(3)) : 0 };
}
