// placeOf / citeLabel (refs/place.js): the place IN the work shown in citations. Pure cases + a cited reply carrying it.
import { describe, it, expect } from 'vitest';
import { placeOf, citeLabel } from '../../api/lib/refs/place.js';
import { toPassage } from '../../api/lib/assistant/tool-kit.js';
import { linkMarkers } from '../../api/lib/assistant/respond.js';
import { passageHeader } from '../../api/lib/assistant/prompt.js';

describe('placeOf', () => {
  it('book with a section.paragraph or named number: the locator (no extra number)', () => {
    expect(placeOf({ locator: '#117.2', para_no: 41 })).toBe('#117.2');
    expect(placeOf({ locator: 'Arabic #5', para_no: 7 })).toBe('Arabic #5');
    expect(placeOf({ locator: '#12', para_no: 12 })).toBe('#12');
  });
  it('heading-only locator: heading, then the 1-based paragraph number', () => expect(placeOf({ locator: 'The Seven Valleys', para_no: 9 })).toBe('The Seven Valleys, #9'));
  it('flat doc: paragraph number only; heading block (no para_no) and zero show nothing', () => {
    expect(placeOf({ para_no: 12 })).toBe('#12');
    expect(placeOf({ para_no: null })).toBeNull(); expect(placeOf({ para_no: 0 })).toBeNull();
    expect(placeOf({ paragraph_index: 0 })).toBeNull();   // block index is never displayed
  });
  it('container: subdocument first, then locator or paragraph', () => {
    expect(placeOf({ subdocument: 'Tablet of Ahmad', para_no: 4 })).toBe('Tablet of Ahmad, #4');
    expect(placeOf({ subdocument: 'Tablet of Ahmad', locator: '#4' })).toBe('Tablet of Ahmad, #4');
  });
  it('missing fields: null, never invented; never a pilcrow', () => { expect(placeOf({})).toBeNull(); expect(placeOf({ para_no: 5 })).not.toMatch(/¶/); });
  it('citeLabel', () => { expect(citeLabel('Gleanings', '#117.2')).toBe('Gleanings, #117.2'); expect(citeLabel('Gleanings', null)).toBe('Gleanings'); });
});

describe('cited reply', () => {
  const rows = [
    { id: 1, title: 'Gleanings', locator: '#117.2', para_no: 41, paragraph_index: 40, source_url: 'https://x/g' },
    { id: 2, title: 'Prayers and Meditations', subdocument: 'Tablet of Ahmad', para_no: 4, paragraph_index: 4, source_url: 'https://x/p' },
    { id: 3, title: 'A Flat Essay', para_no: 7, paragraph_index: 8, source_url: 'https://x/e' },
  ].map(toPassage);
  it('Passage carries place', () => expect(rows.map((r) => r.place)).toEqual(['#117.2', 'Tablet of Ahmad, #4', '#7']));
  it('the whole citation text is the link', () => {
    const q = rows.map((r) => ({ source_title: r.title, citation_url: r.source_url, place: r.place }));
    expect(linkMarkers('As said [1] and [2] and [3].', q)).toBe('As said ([Gleanings, #117.2](https://x/g)) and ([Prayers and Meditations, Tablet of Ahmad, #4](https://x/p)) and ([A Flat Essay, #7](https://x/e)).');
  });
  it('the writer is shown the place', () => expect(passageHeader({ source_title: 'Gleanings', place: '#117.2', text: 'x' }, 0)).toContain('at #117.2'));
});
