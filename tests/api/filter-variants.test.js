// Meili CONTAINS is apostrophe-sensitive and the corpus stores both ' and ’ (and ‘) — one spelling
// silently drops the other half of an author's works.
import { describe, it, expect } from 'vitest';
import { containsClause } from '../../api/lib/search.js';

describe('containsClause', () => {
  it('ORs every apostrophe style so the stored form never decides the match', () => {
    const c = containsClause('author', "Bahá'u'lláh");
    for (const v of ["Bahá'u'lláh", 'Bahá’u’lláh', 'Bahá‘u‘lláh']) expect(c).toContain(`author CONTAINS "${v}"`);
    expect(c.startsWith('(') && c.endsWith(')')).toBe(true);
  });

  it('is a single clause when there is no apostrophe', () => {
    expect(containsClause('author', 'Shoghi Effendi')).toBe('author CONTAINS "Shoghi Effendi"');
  });

  it('escapes quotes', () => {
    expect(containsClause('collection', 'a"b')).toBe('collection CONTAINS "a\\"b"');
  });
});
