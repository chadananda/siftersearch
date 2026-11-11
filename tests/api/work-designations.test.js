// Common designations (Chad 11-11): "KIQ" is the Kitáb-i-Íqán, "World order letters" is WOB, "the Dispensation" is a letter inside it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBookIndex, lexicalSearch } from '../../api/lib/assistant/book-finder.js';
import { workName, namesOf } from '../../api/lib/assistant/work-request.js';

const list = JSON.parse(readFileSync(new URL('../../config/work-names.json', import.meta.url), 'utf8')).works;
const docs = [
  { id: 1, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", paragraph_count: 290 },
  { id: 20894, title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', paragraph_count: 400 },
  { id: 3, title: 'The Promised Day Is Come', author: 'Shoghi Effendi', paragraph_count: 300 },
  ...Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, title: `Filler Work ${i} on Order and Peace`, author: 'x', paragraph_count: 10 })),
];
const sections = [{ section_id: 9, doc_id: 20894, title: 'The Dispensation of Bahá’u’lláh', book: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', start_index: 300, end_index: 420, paragraphs: 120 }];
const index = buildBookIndex({ docs, sections, aliases: list });

describe('designations', () => {
  it('abbreviations and short names find their book', () => {
    expect(lexicalSearch(index, 'KIQ')[0].doc.id).toBe(1);
    expect(lexicalSearch(index, 'world order letters?')[0].doc.id).toBe(20894);
    expect(lexicalSearch(index, 'what does PDC say about the rulers?')[0].doc.id).toBe(3);
  });
  it('a letter inside a book is found by its short name', () => {
    const top = lexicalSearch(index, 'the Dispensation')[0];
    expect(top.kind).toBe('section');
    expect(top.sec.section_id).toBe(9);
  });
  it('a bare designation opens the work, and a work knows its other names', () => {
    expect(workName('KIQ')).toBe('Kitáb-i-Íqán');
    expect(workName('WOB')).toMatch(/World Order/);
    expect(workName('Dispensation')).toBeNull();   // a section entry is the section finder's, never a work name
    expect(namesOf('The World Order of Bahá’u’lláh')).toContain('World Order letters');
  });
});
