// Segmenting a continuous original to the English paragraphing, by comprehension, returning cut POINTS.
//
// Chad, 2026-08-26: "the original has no original paragraph segmentation. if it has any, they are
// artificial… Length is not relevant. Comprehension must be used. I would suggest a prompt that minimizes
// token output to get the segmentation points we need."
//
// The anchors-not-segments choice is what makes the model's answer CHECKABLE: an invented phrase fails a
// substring test, where a re-emitted segment would have to be trusted.
import { describe, it, expect } from 'vitest';
import { normalizeArabic, findAnchor, buildSegmentPrompt, parseAnchors, spansFromAnchors }
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

describe('buildSegmentPrompt', () => {
  const { system, user } = buildSegmentPrompt(['First paragraph.', 'Second paragraph.'], ORIGINAL);

  it('tells the model the original is continuous and its breaks are meaningless', () => {
    // A model shown a pre-broken text will otherwise respect those breaks — the exact error to avoid.
    expect(system).toMatch(/CONTINUOUS/);
    expect(system).toMatch(/editor's, not the author's/);
  });

  it('demands anchors only — never the passage restated', () => {
    expect(system).toMatch(/ONE line per English paragraph/);
    expect(system).toMatch(/no translation, no explanation, no restating/);
  });

  it('makes SKIP explicitly safe, so an unsure model does not guess', () => {
    expect(system).toMatch(/SKIP/);
    expect(system).toMatch(/a guessed one corrupts the alignment/);
  });

  it('numbers the English so the reply can be matched back', () => {
    expect(user).toContain('[1] First paragraph.');
    expect(user).toContain('[2] Second paragraph.');
  });
});

describe('parseAnchors', () => {
  it('reads the tab-separated form and tolerates stray prose', () => {
    const a = parseAnchors('Here you go:\n1\tانّ اوّل ما\n2\tيا ملأ الأرض\n\nhope that helps');
    expect(a).toHaveLength(2);
    expect(a[1]).toMatchObject({ index: 2 });
  });

  it('records SKIP as a null anchor rather than dropping the line', () => {
    expect(parseAnchors('3\tSKIP')[0]).toEqual({ index: 3, anchor: null });
  });
});

describe('spansFromAnchors', () => {
  it('cuts the original at the verified anchors', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL, [
      { index: 1, anchor: 'انّ اوّل ما کتب' },
      { index: 3, anchor: 'يا ملأ الأرض' },
    ], 3);
    expect(spans.map((s) => s.index)).toEqual([1, 3]);
    expect(spans[0].text).toMatch(/^انّ اوّل/);
    expect(rejected).toHaveLength(0);
  });

  it('DROPS an anchor that is not in the original instead of placing it', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL, [
      { index: 1, anchor: 'انّ اوّل ما کتب' },
      { index: 2, anchor: 'نص مخترع تماما لا وجود له' },
    ], 2);
    expect(spans).toHaveLength(1);
    expect(rejected[0].why).toMatch(/not present/);
  });

  it('DROPS an anchor that would run backwards', () => {
    // Order is the one structural fact we can rely on; a backwards anchor is a mis-location, not a finding.
    const { spans, rejected } = spansFromAnchors(ORIGINAL, [
      { index: 1, anchor: 'يا ملأ الأرض' },
      { index: 2, anchor: 'انّ اوّل ما کتب' },
    ], 2);
    expect(spans.map((s) => s.index)).toEqual([1]);
    expect(rejected).toHaveLength(1);
  });

  it('reports coverage, so a thin segmentation is visible as thin', () => {
    const { coverage } = spansFromAnchors(ORIGINAL, [{ index: 1, anchor: 'انّ اوّل ما کتب' }], 4);
    expect(coverage).toBe(0.25);
  });

  it('treats a model SKIP as a recorded gap, not a failure', () => {
    const { spans, rejected } = spansFromAnchors(ORIGINAL, [
      { index: 1, anchor: 'انّ اوّل ما کتب' }, { index: 2, anchor: null },
    ], 2);
    expect(spans).toHaveLength(1);
    expect(rejected[0].why).toMatch(/skipped/);
  });
});
