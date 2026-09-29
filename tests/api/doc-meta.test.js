// Flexible document metadata: any document gets one sourced record, a prompt context line and an index document.
import { describe, it, expect } from 'vitest';
import { buildDocMeta, contextLine, indexDoc } from '../../api/lib/doc-meta.js';

describe('buildDocMeta', () => {
  it('builds a book record from the library row and frontmatter', () => {
    const m = buildDocMeta({ doc: { id: 5, title: 'The Dawn-Breakers', author: 'Nabíl-i-Aʻẓam', year: '1932', religion: "Baha'i",
      metadata: '{"translator":"Shoghi Effendi"}' }, fm: { subjects: ['Bábí history', 'Shaykh Aḥmad'] } });
    expect(m).toMatchObject({ kind: 'book', title: 'The Dawn-Breakers', author: 'Nabíl-i-Aʻẓam', translator: 'Shoghi Effendi', year: 1932 });
    expect(m.subjects).toEqual(['Bábí history', 'Shaykh Aḥmad']);
    expect(m.sources.translator).toBe('library');
  });
  it('builds a tablet record through the Phelps + oceanoflights merge, keeping the author', () => {
    const m = buildDocMeta({ doc: { id: 9, title: 'Generated title', author: "Bahá'u'lláh" },
      fm: { bookid: 'Bahaullah-PUB06-024-ar', title: 'Generated title', title_source: 'generated-excerpt' },
      pi: { PIN: 'BH07104', Recipient: 'Nabíl', Place: 'Akka', Date: '1299-09 [1882-Jul]' } });
    expect(m).toMatchObject({ kind: 'tablet', pin: 'BH07104', recipient: 'Nabíl', place: 'Akka', author: "Bahá'u'lláh" });
    expect(m.title).toBeUndefined();                       // a generated title is not a title
  });
});

describe('contextLine / indexDoc', () => {
  const tablet = buildDocMeta({ doc: { id: 9, author: "Bahá'u'lláh" }, fm: { bookid: 'x', title_source: 'established', title: 'Lawḥ-i-Naṣír', subjects: ['covenant'] },
    pi: { PIN: 'BH1', Recipient: 'Ḥájí Muḥammad Naṣír', Place: 'Adrianople', Date: '1283 [1866-1867]' } });
  it('writes a context line a prompt can use', () => {
    expect(contextLine(tablet)).toBe("Tablet: «Lawḥ-i-Naṣír» by Bahá'u'lláh; addressed to Ḥájí Muḥammad Naṣír; revealed in Adrianople; dated 1866-1867; on covenant");
  });
  it('flattens the record for the doc_meta index', () => {
    expect(indexDoc(tablet)).toMatchObject({ id: 9, kind: 'tablet', title: 'Lawḥ-i-Naṣír', place: 'Adrianople', year_from: 1866, year_to: 1867, pin: 'BH1' });
  });
});
