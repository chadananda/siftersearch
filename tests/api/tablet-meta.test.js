// Tablet metadata merge: Phelps' Partial Inventory + oceanoflights frontmatter + linked notes → one sourced record.
import { describe, it, expect } from 'vitest';
import { parsePiDate, expandCodes, mergeTabletMeta, tabletContextLine } from '../../api/lib/tablet-meta.js';

describe('parsePiDate', () => {
  it('reads a full Hijri date with its bracketed Gregorian', () => {
    expect(parsePiDate('1265-09-01 [1849-Jul-21]')).toMatchObject({ hijri: '1265-09-01', gregorian: '1849-07-21', from: 1849, to: 1849, approx: false });
  });
  it('reads a Gregorian year range', () => {
    expect(parsePiDate('1264-1265 [1848-1849]')).toMatchObject({ from: 1848, to: 1849 });
  });
  it('converts a bare Hijri year and marks it approximate', () => {
    const d = parsePiDate('1260-10 ca. (Kangan)');
    expect(d.approx).toBe(true);
    expect(d.from).toBe(1844);
  });
  it('returns years null for an unknown date, and null for none', () => {
    expect(parsePiDate('unknown (Chihriq?)')).toMatchObject({ from: null, approx: true });
    expect(parsePiDate('')).toBeNull();
  });
});

describe('expandCodes', () => {
  const bib = { SWB: { citation: 'Selections from the Writings of the Báb', url: 'https://bahai.org/swb' } };
  it('splits Phelps codes and resolves them in the bibliography', () => {
    const out = expandCodes('SWB#09 (p.077-113x),  BPRY.226-227x', bib);
    expect(out[0]).toEqual({ code: 'SWB', locator: '09 (p.077-113x)', citation: 'Selections from the Writings of the Báb', url: 'https://bahai.org/swb' });
    expect(out[1]).toMatchObject({ code: 'BPRY', locator: '226-227x', citation: null });
  });
});

describe('mergeTabletMeta', () => {
  const pi = { PIN: 'BH00566', Title: '', Recipient: 'Mulla Husayn', Date: '1260-05 [1844-May]', Place: 'Shiraz',
    Period: 'C-Mákú', Volume_title: 'The Persian Bayan', Manuscripts: 'INBA62,  INBA24', Translations: 'SWB#09 (p.077)',
    'First line (translated)': 'All praise and glory…', 'Word count': '1,200' };
  const fm = { bookid: 'Bahaullah-PUB06-082-ar', title: 'On Steadfastness', title_source: 'generated-topical',
    description: 'Urges steadfastness.', subjects: ['steadfastness', 'tests'], genre: 'tablet', place_revealed: "'Akká",
    attachments_json: JSON.stringify([{ kind: 'audio', name: 'a.m4a', url: 'https://x/a.m4a' }, { kind: 'pdf', name: 'x_notes_fa.pdf', url: 'https://x/n.pdf' }]) };
  const m = mergeTabletMeta({ fm, pi, notes: [{ docId: 7, title: 'Notes', language: 'fa' }] });
  it('takes circumstance from Phelps over oceanoflights', () => {
    expect(m.place).toBe('Shiraz');
    expect(m.sources.place).toBe('Partial Inventory v6.01');
    expect(m.recipient).toBe('Mulla Husayn');
    expect(m.date).toMatchObject({ from: 1844 });
  });
  it('keeps a generated OOL title apart from a real title', () => {
    expect(m.title).toBeUndefined();
    expect(m.title_generated).toBe('On Steadfastness');
  });
  it('carries content, media, notes and both links', () => {
    expect(m.subjects).toEqual(['steadfastness', 'tests']);
    expect(m.audio).toEqual([{ name: 'a.m4a', url: 'https://x/a.m4a' }]);
    expect(m.notes_attachments[0].name).toBe('x_notes_fa.pdf');
    expect(m.notes[0].docId).toBe(7);
    expect(m.links).toEqual({ oceanoflights: 'https://oceanoflights.org/bahaullah-pub06-082-ar/', inventory: 'https://portlandiator.github.io/PI_browser/?id=BH00566' });
    expect(m.word_count).toBe(1200);
    expect(m.manuscripts).toEqual(['INBA62', 'INBA24']);
  });
  it('writes a one-line context for HyPE and disambiguation', () => {
    expect(tabletContextLine(m)).toBe('addressed to Mulla Husayn; revealed in Shiraz; dated 1844-05; on steadfastness, tests');
  });
});
