// Segmenting a continuous original to the English paragraphing, by comprehension, returning cut POINTS.
//
// Chad, 2026-08-26: "the original has no original paragraph segmentation. if it has any, they are
// artificial… Length is not relevant. Comprehension must be used. I would suggest a prompt that minimizes
// token output to get the segmentation points we need."
//
// The anchors-not-segments choice is what makes the model's answer CHECKABLE: an invented phrase fails a
// substring test, where a re-emitted segment would have to be trusted.
import { describe, it, expect } from 'vitest';
import { normalizeArabic, findAnchor, numberLines, renderLines, buildSegmentPrompt, parseAnchors, spansFromAnchors }
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

  it('REJECTS a line number that runs backwards', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL,
      [{ index: 1, line: 4 }, { index: 2, line: 1 }], 2, opts);
    expect(spans.map((s) => s.index)).toEqual([1]);
    expect(rejected[0].why).toMatch(/backwards/);
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
