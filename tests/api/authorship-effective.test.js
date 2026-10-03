import { describe, it, expect } from 'vitest';
import { effectiveAuthor } from '../../api/lib/authorship/effective.js';

describe('effectiveAuthor', () => {
  it('prefers content.authors, then para_meta, then the doc author', () => {
    expect(effectiveAuthor({ authors: '[{"name":"Shoghi Effendi","role":"author","basis":"trailer","on_behalf":true}]', para_meta: '{"author":"X"}', author: 'Bahá’u’lláh' }))
      .toEqual({ author: 'Shoghi Effendi', quoted: [], onBehalf: true, isReferenceLine: false });
    expect(effectiveAuthor({ para_meta: '{"author":"Shoghi Effendi"}', author: 'Helen Hornby' }).author).toBe('Shoghi Effendi');
    expect(effectiveAuthor({ author: 'Adib Taherzadeh' }).author).toBe('Adib Taherzadeh');
  });
  it('lists quoted writers and flags reference lines', () => {
    const mixed = effectiveAuthor({ authors: [{ name: 'Thom Thompson', role: 'author' }, { name: 'Bahá’u’lláh', role: 'quoted' }] });
    expect(mixed.quoted).toEqual(['Bahá’u’lláh']);
    expect(effectiveAuthor({ authors: [{ name: 'Shoghi Effendi', role: 'reference' }], author: 'Helen Hornby' }).isReferenceLine).toBe(true);
  });
});
