// Sub-documents from paragraph headings (api/lib/sections.js).
import { describe, it, expect } from 'vitest';
import { sectionsFromRows, isNoiseHeading } from '../../api/lib/sections.js';

const rows = (pairs) => pairs.map(([heading], i) => ({ id: 100 + i, paragraph_index: i, heading }));

describe('sectionsFromRows', () => {
  it('a run of paragraphs under one heading is one section with its range', () => {
    const s = sectionsFromRows(rows([['Foreword'], ['Foreword'], ['\\- Chapter I -'], ['Declaration of the Báb’s Mission'], ['Declaration of the Báb’s Mission']]));
    expect(s.map((x) => [x.title, x.start_index, x.end_index, x.paragraphs])).toEqual([
      ['Foreword', 0, 1, 2], ['Chapter I', 2, 2, 1], ['Declaration of the Báb’s Mission', 3, 4, 2]]);
    expect(s[2].first_para_id).toBe(103);
  });
  it('paragraphs without a heading, and noise headings, open no section', () => {
    const s = sectionsFromRows(rows([[''], ['12'], ['* * *'], ['Epilogue'], [null]]));
    expect(s.map((x) => x.title)).toEqual(['Epilogue']);
  });
  it('a heading that recurs later is a new section', () => {
    expect(sectionsFromRows(rows([['Notes'], ['Text'], ['Notes']])).map((x) => x.ord)).toEqual([0, 1, 2]);
  });
  it('noise', () => {
    expect(isNoiseHeading('Page 12')).toBe(true);
    expect(isNoiseHeading('x'.repeat(200))).toBe(true);
    expect(isNoiseHeading('The Dispensation of Bahá’u’lláh')).toBe(false);
  });
});

describe('outlineSections (phase 2: the source file’s heading levels)', async () => {
  const { outlineSections, paraNum } = await import('../../api/lib/sections.js');
  const MD = [
    '# The World Order of Bahá’u’lláh {.on id="para_1" type="title" subtype="book title"}',
    '### \\-1- {.h3 .toc3 id="para_6" type="header"}',
    '# The World Order of Bahá’u’lláh {.h1 .toc1 id="para_7" type="header" subtype="section header"}',
    '### February 27, 1929 {.h3 .toc3 id="para_8" type="header"}',
    'text {id="para_9" type="par"}',
    '### Sources of the Bahá’í World Order {.h3 .toc3 id="para_11" type="header"}',
    'text {id="para_12" type="par"}',
    '# The Dispensation of Bahá’u’lláh {.h1 .toc1 id="para_20" type="header"}',
    '### The Báb {.h3 .toc3 id="para_22" type="header"}',
    'text {id="para_23" type="par"}',
  ].join('\n');
  const rows = [9, 10, 12, 21, 23, 24].map((n, i) => ({ id: 1000 + n, paragraph_index: i, para_num: n }));
  it('top-level parts span their subsections; dates, numerals and the book title are not sections', () => {
    const s = outlineSections(MD, rows);
    expect(s.map((x) => [x.level, x.title, x.start_index, x.end_index])).toEqual([
      [1, 'The World Order of Bahá’u’lláh', 0, 2],
      [3, 'Sources of the Bahá’í World Order', 2, 2],
      [1, 'The Dispensation of Bahá’u’lláh', 3, 5],
      [3, 'The Báb', 4, 5],
    ]);
  });
  it('para numbers come from block_attrs', () => {
    expect(paraNum('{"id":"para_72","ilm_id":"4n"}')).toBe(72);
    expect(paraNum(null)).toBe(null);
  });
});
