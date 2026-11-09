// placeOf / citeLabel (refs/place.js): the place IN the work shown in citations. Pure cases + a cited reply carrying it.
import { describe, it, expect } from 'vitest';
import { placeOf, citeLabel } from '../../api/lib/refs/place.js';
import { toPassage } from '../../api/lib/assistant/tool-kit.js';
import { linkMarkers } from '../../api/lib/assistant/respond.js';
import { passageHeader } from '../../api/lib/assistant/prompt.js';

describe('placeOf', () => {
  it('book with a traditional number or section: the locator', () => {
    expect(placeOf({ locator: 'CXVII', paragraph_index: 40 })).toBe('CXVII');
    expect(placeOf({ locator: 'The Seven Valleys', paragraph_index: 9 })).toBe('The Seven Valleys');
  });
  it('flat doc: paragraph number only', () => expect(placeOf({ paragraph_index: 12 })).toBe('¶12'));
  it('container: subdocument first, then locator or paragraph', () => {
    expect(placeOf({ subdocument: 'Tablet of Ahmad', paragraph_index: 4 })).toBe('Tablet of Ahmad, ¶4');
    expect(placeOf({ subdocument: 'Tablet of Ahmad', locator: '¶4' })).toBe('Tablet of Ahmad, ¶4');
  });
  it('missing fields: null, never invented', () => { expect(placeOf({})).toBeNull(); expect(placeOf({ paragraph_index: null })).toBeNull(); });
  it('citeLabel', () => { expect(citeLabel('Gleanings', 'CXVII')).toBe('Gleanings, CXVII'); expect(citeLabel('Gleanings', null)).toBe('Gleanings'); });
});

describe('cited reply', () => {
  const rows = [
    { id: 1, title: 'Gleanings', locator: 'CXVII', paragraph_index: 40, source_url: 'https://x/g' },
    { id: 2, title: 'Prayers and Meditations', subdocument: 'Tablet of Ahmad', paragraph_index: 4, source_url: 'https://x/p' },
    { id: 3, title: 'A Flat Essay', paragraph_index: 7, source_url: 'https://x/e' },
  ].map(toPassage);
  it('Passage carries place', () => expect(rows.map((r) => r.place)).toEqual(['CXVII', 'Tablet of Ahmad, ¶4', '¶7']));
  it('the whole citation text is the link', () => {
    const q = rows.map((r) => ({ source_title: r.title, citation_url: r.source_url, place: r.place }));
    expect(linkMarkers('As said [1] and [2] and [3].', q)).toBe('As said ([Gleanings, CXVII](https://x/g)) and ([Prayers and Meditations, Tablet of Ahmad, ¶4](https://x/p)) and ([A Flat Essay, ¶7](https://x/e)).');
  });
  it('the writer is shown the place', () => expect(passageHeader({ source_title: 'Gleanings', place: 'CXVII', text: 'x' }, 0)).toContain('at CXVII'));
});
