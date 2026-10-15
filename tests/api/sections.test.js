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
