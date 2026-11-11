// "#section.paragraph" places for sectioned books (WOB letters cited "#182" on 11-11).
import { describe, it, expect } from 'vitest';
import { topSections, sectionPlace } from '../../api/lib/refs/section-place.js';
import { withSectionPlaces } from '../../api/lib/paragraphs-repo.js';
import { placeOf } from '../../api/lib/refs/place.js';

const SECS = [
  { level: 1, title: 'The World Order of Bahá’u’lláh', start_index: 0, end_index: 16, paragraphs: 17 },
  { level: 3, title: 'A sub-heading', start_index: 5, end_index: 9, paragraphs: 5 },
  { level: 1, title: 'The Goal of a New World Order', start_index: 17, end_index: 40, paragraphs: 24 },
];
const shape = { tops: topSections(SECS), body: [1, 2, 3, 4, 6, 7, 18, 19, 20, 25] };   // 0, 5, 17 are headings

describe('section places', () => {
  it('keeps only top-level sections, and none when there is a single one', () => {
    expect(topSections(SECS).map((s) => s.title)).toEqual(['The World Order of Bahá’u’lláh', 'The Goal of a New World Order']);
    expect(topSections([SECS[0]])).toEqual([]);
  });
  it('numbers paragraphs 1-based within their top section, skipping headings', () => {
    expect(sectionPlace(shape, 1)).toEqual({ locator: '#1.1', section: 'The World Order of Bahá’u’lláh' });
    expect(sectionPlace(shape, 6)).toEqual({ locator: '#1.5', section: 'The World Order of Bahá’u’lláh' });
    expect(sectionPlace(shape, 20)).toEqual({ locator: '#2.3', section: 'The Goal of a New World Order' });
    expect(sectionPlace(shape, 17)).toBeNull();   // a heading
    expect(sectionPlace(shape, 99)).toBeNull();   // outside every section
  });
  it('hydrated rows of a sectioned book cite "<letter>, #s.p"; traditionally numbered rows are left alone', async () => {
    const rows = [
      { doc_id: 20894, paragraph_index: 20, para_no: 182, locator: 'The Outpouring of Divine Grace', title: 'The World Order of Bahá’u’lláh', blocktype: 'paragraph' },
      { doc_id: 20894, paragraph_index: 6, para_no: 5, locator: '#117.2', title: 'x', blocktype: 'paragraph' },
    ];
    await withSectionPlaces(rows, { shape: async () => shape });
    expect(placeOf(rows[0])).toBe('The Goal of a New World Order, #2.3');
    expect(rows[1].locator).toBe('#117.2');
  });
  it('a failed read leaves the rows as they were', async () => {
    const rows = [{ doc_id: 1, paragraph_index: 3, para_no: 3, locator: null, title: 't' }];
    await withSectionPlaces(rows, { shape: async () => { throw new Error('db'); } });
    expect(rows[0].locator).toBeNull();
  });
});
