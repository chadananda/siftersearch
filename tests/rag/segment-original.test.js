// Segmenting a continuous original to the English paragraphing, by comprehension, returning cut POINTS.
//
// Chad, 2026-08-26: "the original has no original paragraph segmentation. if it has any, they are
// artificial… Length is not relevant. Comprehension must be used. I would suggest a prompt that minimizes
// token output to get the segmentation points we need."
//
// The anchors-not-segments choice is what makes the model's answer CHECKABLE: an invented phrase fails a
// substring test, where a re-emitted segment would have to be trusted.
import { describe, it, expect } from 'vitest';
import { normalizeArabic, findAnchor, numberLines, renderLines, buildSegmentPrompt, parseAnchors, spansFromAnchors,
  planChunks, lineWindowFor, refineWordStart, longestIncreasingRun, linesFromParagraphs }
  from '../../api/lib/rag/concepts/segment-original.js';

const ORIGINAL = 'انّ اوّل ما کتب الله علی العباد عرفان مشرق وحيه و مطلع امره '
  + 'انّ الّذين اوتوا بصآئر من الله يرون حدود الله السّبب الاعظم لنظم العالم '
  + 'يا ملأ الأرض اعلموا انّ اوامری سرج عنايتی بين عبادی و مفاتيح رحمتی لبريّتی';

describe('normalizeArabic', () => {
  it('ignores diacritics, which vary between editions of the same text', () => {
    expect(normalizeArabic('الّذين')).toBe(normalizeArabic('الذين'));
    expect(normalizeArabic('کتب')).toBe(normalizeArabic('كتب'));
  });
});

describe('findAnchor', () => {
  it('locates an anchor despite differing diacritics', () => {
    expect(findAnchor(ORIGINAL, 'انّ اوّل ما کتب')).toBe(0);
    expect(findAnchor(ORIGINAL, 'ان اول ما كتب')).toBe(0);      // undiacritised spelling
  });

  it('returns -1 for a phrase that is NOT in the original', () => {
    // The check that catches a model inventing something plausible.
    expect(findAnchor(ORIGINAL, 'هذا نص لم يرد في الأصل أبدا')).toBe(-1);
  });

  it('refuses an anchor too short to identify anything', () => {
    expect(findAnchor(ORIGINAL, 'و')).toBe(-1);
  });

  it('searches forward from a cursor, so anchors cannot run backwards', () => {
    const second = findAnchor(ORIGINAL, 'يا ملأ الأرض');
    expect(findAnchor(ORIGINAL, 'انّ اوّل ما کتب', second)).toBe(-1);
  });
});

describe('numberLines — the locator', () => {
  it('cuts the continuous text into numbered lines', () => {
    const lines = numberLines(ORIGINAL, { wordsPerLine: 6 });
    expect(lines[0]).toMatchObject({ n: 1, wordStart: 0 });
    expect(lines[1].wordStart).toBe(6);
    expect(renderLines(lines)).toMatch(/^1\| /);
  });
});

describe('buildSegmentPrompt', () => {
  const lines = numberLines(ORIGINAL, { wordsPerLine: 6 });
  const { system, user } = buildSegmentPrompt(['First paragraph.', 'Second paragraph.'], lines);

  it('tells the model the original is continuous and its breaks are meaningless', () => {
    expect(system).toMatch(/CONTINUOUS/);
    expect(system).toMatch(/editor's, not the author's/);
  });

  it('asks for a LINE NUMBER, and says the number is what matters', () => {
    // The words are what a model gets slightly wrong; the number is what can be trusted.
    expect(system).toMatch(/LINE NUMBER in the original/);
    expect(system).toMatch(/the LINE NUMBER is what matters/);
  });

  it('demands nothing but the cut points', () => {
    expect(system).toMatch(/no translation, no explanation, no restating/);
  });

  it('makes SKIP explicitly safe, so an unsure model does not guess', () => {
    expect(system).toMatch(/SKIP/);
    expect(system).toMatch(/a guessed one corrupts the alignment/);
  });

  it('shows the original AS numbered lines and numbers the English', () => {
    expect(user).toMatch(/1\| /);
    expect(user).toContain('[1] First paragraph.');
  });
});

describe('parseAnchors', () => {
  it('reads english-number, line-number, words', () => {
    const a = parseAnchors('Sure:\n1\t1\tانّ اوّل ما\n2\t3\tيا ملأ الأرض');
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ index: 1, line: 1 });
    expect(a[1]).toMatchObject({ index: 2, line: 3 });
  });

  it('records SKIP as a null line rather than dropping the paragraph', () => {
    expect(parseAnchors('3\tSKIP')[0]).toMatchObject({ index: 3, line: null });
  });
});

describe('refineWordStart — where the quoted words earn their keep', () => {
  const lines = numberLines(ORIGINAL, { wordsPerLine: 6 });
  const words = ORIGINAL.split(/\s+/);

  it('finds the quoted words and returns their exact word offset', () => {
    expect(refineWordStart(words, lines, 4, 'يرون حدود الله')).toBe(words.indexOf('يرون'));
  });

  it('searches the NEIGHBOUR lines too — the model quotes where its PARAGRAPH starts, not where the line does', () => {
    // This is why 25 of 119 Seven Valleys spans read "unconfirmed" while every one checked was correct.
    expect(refineWordStart(words, lines, 5, 'يرون حدود الله')).toBe(words.indexOf('يرون'));
  });

  it('returns null when the words are nowhere near — so the line start is used instead', () => {
    expect(refineWordStart(words, lines, 1, 'كلمات غريبة تماما')).toBe(null);
  });

  it('refuses to act on too few words to be unambiguous', () => {
    expect(refineWordStart(words, lines, 1, 'و')).toBe(null);
  });
});

describe('longestIncreasingRun — let the majority settle the order', () => {
  it('keeps the long run and drops the outlier, not the other way round', () => {
    expect(longestIncreasingRun([1, 99, 2, 3, 4])).toEqual([0, 2, 3, 4]);
    expect(longestIncreasingRun([5, 1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('is stable on already-ordered input and on nothing at all', () => {
    expect(longestIncreasingRun([1, 2, 3])).toEqual([0, 1, 2]);
    expect(longestIncreasingRun([])).toEqual([]);
  });

  it('ALLOWS a repeat — two English paragraphs may begin at the same place in the original', () => {
    // Our editions split what the original keeps together, so a shared start is truthful, not a conflict.
    expect(longestIncreasingRun([4, 4, 4])).toEqual([0, 1, 2]);
    expect(longestIncreasingRun([1, 5, 5, 6, 2])).toEqual([0, 1, 2, 3]);   // still drops the reversal
  });
});

describe('spansFromAnchors', () => {
  const opts = { wordsPerLine: 6 };

  it('cuts the original at the given line numbers', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 1, words: 'انّ اوّل ما کتب' }, { index: 2, line: 4, words: null }], 2, opts);
    expect(spans.map((s) => s.index)).toEqual([1, 2]);
    expect(spans[0].text).toMatch(/^انّ اوّل/);
    expect(rejected).toHaveLength(0);
  });

  it('KEEPS a correct line number whose words are slightly wrong — merely unconfirmed', () => {
    // The whole point of the redesign: a dropped diacritic must not discard a correct alignment.
    const { spans, unconfirmed } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 1, words: 'ان اول ما كتب' }], 1, opts);
    expect(spans).toHaveLength(1);
    expect(unconfirmed).toBe(0);          // normalisation confirms it despite the spelling drift
  });

  it('CUTS AT THE QUOTED WORDS, not the line boundary, when it can find them', () => {
    // A line boundary is up to wordsPerLine-1 words early, so the span carries a lead-in from the previous
    // passage. The words the model already returned remove that, for free.
    const { spans, exact } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 4, words: 'يرون حدود الله' }], 1, opts);
    expect(spans[0].text).toMatch(/^يرون حدود/);   // not the line's first word, the paragraph's
    expect(exact).toBe(1);
  });

  it('gives BOTH paragraphs the passage when they resolve to the same place', () => {
    // "He is the Most Glorious." is its own row in the English and part of the opening sentence in the
    // Arabic. Both rows get that passage — the original does not distinguish them, so neither should we.
    const { spans, shared } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 4, words: 'يرون حدود الله' }, { index: 2, line: 5, words: 'يرون حدود الله' }], 2, opts);
    expect(spans.map((s) => s.index)).toEqual([1, 2]);
    expect(spans[0].text).toBe(spans[1].text);
    expect(shared).toBe(2);
  });

  it('REPORTS an unconfirmed line rather than discarding it', () => {
    const { spans, unconfirmed } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 1, words: 'كلمات ليست في هذا السطر' }], 1, opts);
    expect(spans).toHaveLength(1);
    expect(unconfirmed).toBe(1);
  });

  it('REJECTS a line number out of range — that is a mis-location, not drift', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL, [{ index: 1, line: 9999 }], 1, opts);
    expect(spans).toHaveLength(0);
    expect(rejected[0].why).toMatch(/out of range/);
  });

  it('drops the ONE anchor that contradicts the order, not everything after it', () => {
    // Chad: "spurious matches are going to happen. we need to make our approach resilient to occasional
    // spurious matches." Greedy ordering let an outlier raise the floor and reject its correct neighbours.
    const { spans, rejected } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 1 }, { index: 2, line: 7 }, { index: 3, line: 2 }, { index: 4, line: 3 }], 4, opts);
    expect(spans.map((s) => s.index)).toEqual([1, 3, 4]);       // the majority survives
    expect(rejected.map((r) => r.index)).toEqual([2]);          // the outlier is the one dropped
    expect(rejected[0].why).toMatch(/contradicts the surrounding order/);
  });

  it('treats a model SKIP as a recorded gap', () => {
    const { rejected } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 1 }, { index: 2, line: null }], 2, opts);
    expect(rejected[0].why).toMatch(/skipped/);
  });

  it('reports coverage, so a thin segmentation is visible as thin', () => {
    const { coverage } = spansFromAnchors(ORIGINAL, [{ index: 1, line: 1 }], 4, opts);
    expect(coverage).toBe(0.25);
  });
});

describe('planChunks / lineWindowFor — fitting a long book, without letting length decide a cut', () => {
  it('keeps a whole work in ONE call when it fits', () => {
    // The honest default: the model sees the entire original and cannot mis-place a paragraph by never
    // having been shown its home.
    expect(planChunks(121)).toEqual([{ start: 0, end: 121 }]);
  });

  it('splits only what does not fit, covering every paragraph exactly once', () => {
    const chunks = planChunks(789, { parasPerChunk: 150 });
    expect(chunks[0]).toEqual({ start: 0, end: 150 });
    expect(chunks.at(-1).end).toBe(789);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end);
  });

  it('bounds a chunk BELOW by where the last one ended, so the model cannot go backwards', () => {
    const w = lineWindowFor({ floorLine: 200, paraCount: 150, englishCount: 789, lineCount: 6000 });
    expect(w.from).toBe(197);          // floor minus a little lookback for a paragraph straddling the seam
  });

  it('bounds it ABOVE generously — the estimate decides what to SHOW, never where to cut', () => {
    const w = lineWindowFor({ floorLine: 1, paraCount: 150, englishCount: 789, lineCount: 6000 });
    expect(w.to).toBeGreaterThan(150 * (6000 / 789));   // comfortably past the proportional guess
    expect(w.to).toBeLessThanOrEqual(6000);
  });

  it('never runs past the end of the original', () => {
    expect(lineWindowFor({ floorLine: 490, paraCount: 150, englishCount: 121, lineCount: 517 }).to).toBe(517);
  });
});

describe('linesFromParagraphs — when the source’s own paragraphing is real', () => {
  const paras = ['اول ما کتب الله علی العباد', 'يا ملأ الأرض اعلموا انّ اوامری', 'انّ الّذين اوتوا بصآئر'];

  it('numbers whole paragraphs and tracks where each begins', () => {
    const lines = linesFromParagraphs(paras);
    expect(lines.map((l) => l.n)).toEqual([1, 2, 3]);
    expect(lines[1].wordStart).toBe(6);
    expect(lines[2].wordStart).toBe(12);
  });

  it('cuts on paragraph boundaries, so no span carries a lead-in', () => {
    const lines = linesFromParagraphs(paras);
    const { spans } = spansFromAnchors(paras.join(' '), [{ index: 1, line: 2 }], 1, { lines });
    expect(spans[0].text).toBe('يا ملأ الأرض اعلموا انّ اوامری انّ الّذين اوتوا بصآئر');
  });

  it('uses the caller’s units rather than re-deriving different ones', () => {
    // Re-deriving would silently disagree with what the model was actually shown.
    const lines = linesFromParagraphs(paras);
    const { rejected } = spansFromAnchors(paras.join(' '), [{ index: 1, line: 4 }], 1, { lines });
    expect(rejected[0].why).toMatch(/out of range \(1\.\.3\)/);
  });
});

describe('lineWindowFor when a book is driven in slices', () => {
  it('scales the window to the WHOLE book, not to the slice being processed', () => {
    // Using the slice made lines-per-paragraph five times too large, so every request offered the entire
    // original — a 95k-token prompt the tunnel then timed out on.
    const whole = lineWindowFor({ floorLine: 1, paraCount: 100, englishCount: 789, lineCount: 781 });
    const slice = lineWindowFor({ floorLine: 1, paraCount: 100, englishCount: 100, lineCount: 781 });
    expect(whole.to).toBeLessThan(300);
    expect(slice.to).toBe(781);                 // what the bug looked like
  });
});

describe('no length floor — a threshold that drops content produces absence, not an error', () => {
  // Chad, 2026-08-26: "why do you have a threshold? you keep making up rules that mangle our content."
  // A `text.length > 20` filter here deleted short scripture outright: "هو الأبهى" is nine characters.
  const SHORT = 'هو الأبهى و هذا كتاب من لدنا الى الذين آمنوا';

  it('KEEPS a span shorter than a line of prose', () => {
    const lines = linesFromParagraphs(['هو الأبهى', 'و هذا كتاب من لدنا الى الذين آمنوا']);
    const { spans, short } = spansFromAnchors(SHORT, [{ index: 1, line: 1 }, { index: 2, line: 2 }], 2, { lines });
    expect(spans.map((s) => s.index)).toEqual([1, 2]);
    expect(spans[0].text).toBe('هو الأبهى');
    expect(short).toBe(1);                 // reported so it can be looked at — never removed
  });

  it('two rows sharing the ONLY passage both keep it — neither is emptied out', () => {
    const lines = linesFromParagraphs(['هو الأبهى']);
    const { spans } = spansFromAnchors('هو الأبهى', [{ index: 1, line: 1 }, { index: 2, line: 1 }], 2, { lines });
    expect(spans.map((s) => s.text)).toEqual(['هو الأبهى', 'هو الأبهى']);
  });

  it('still excludes a genuinely EMPTY span', () => {
    const lines = linesFromParagraphs(['', 'هو الأبهى']);
    const { spans } = spansFromAnchors('هو الأبهى', [{ index: 1, line: 1 }], 1, { lines });
    expect(spans.every((s) => s.text.length > 0)).toBe(true);
  });
});
