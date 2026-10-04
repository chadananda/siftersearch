import { describe, it, expect } from 'vitest';
import { effectiveAuthor, paragraphAuthor } from '../../api/lib/authorship/effective.js';

describe('effectiveAuthor', () => {
  it('prefers content.authors, then para_meta, then the doc author', () => {
    expect(effectiveAuthor({ authors: '[{"name":"Shoghi Effendi","role":"author","basis":"trailer","on_behalf":true}]', para_meta: '{"author":"X"}', author: 'Bahá’u’lláh' }))
      .toEqual({ author: 'Shoghi Effendi', quoted: [], onBehalf: true, isReferenceLine: false, fromBook: false });
    expect(effectiveAuthor({ para_meta: '{"author":"Shoghi Effendi"}', author: 'Helen Hornby' }).author).toBe('Shoghi Effendi');
    expect(effectiveAuthor({ author: 'Adib Taherzadeh' }).author).toBe('Adib Taherzadeh');
  });
  it('lists quoted writers and flags reference lines', () => {
    const mixed = effectiveAuthor({ authors: [{ name: 'Thom Thompson', role: 'author' }, { name: 'Bahá’u’lláh', role: 'quoted' }] });
    expect(mixed.quoted).toEqual(['Bahá’u’lláh']);
    expect(effectiveAuthor({ authors: [{ name: 'Shoghi Effendi', role: 'reference' }], author: 'Helen Hornby' }).isReferenceLine).toBe(true);
  });
  it('a writer judged to be someone else has no author (not the catalogue author)', () => {
    expect(effectiveAuthor({ authors: [{ name: null, other: true, role: 'author', basis: 'system1' }], author: 'Martha Root' }).author).toBe(null);
  });
  it('the book default keeps the catalogue spelling', () => {
    expect(effectiveAuthor({ authors: [{ name: '‘Abdu’l-Bahá', role: 'author', basis: 'book' }], author: '’Abdu’l-Bahá' }).author).toBe('’Abdu’l-Bahá');
  });
});

describe('paragraphAuthor (the author every index stores)', () => {
  it("is the paragraph's own writer when named, else the book's", () => {
    expect(paragraphAuthor({ authors: '[{"name":"Shoghi Effendi","role":"author","conf":0.9}]', author: 'Helen Hornby' })).toBe('Shoghi Effendi');
    expect(paragraphAuthor({ authors: null, author: 'Helen Hornby' })).toBe('Helen Hornby');
  });
});
