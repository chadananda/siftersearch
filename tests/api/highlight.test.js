import { describe, it, expect } from 'vitest';
import { highlightText, queryTerms } from '../../api/lib/search/highlighting.js';

describe('highlightText', () => {
  it('folds diacritics and apostrophes, marks the original characters, whole words with prefix match', () => {
    expect(highlightText('The words of Bahá’u’lláh on prayers.', 'Bahaullah prayer'))
      .toBe('The words of <mark>Bahá’u’lláh</mark> on <mark>prayers</mark>.');
  });
  it('ignores question words and short words; leaves text without matches alone', () => {
    expect(queryTerms('Where does Bahá’u’lláh say the earth is one country?')).toEqual(['bahaullah', 'earth', 'one', 'country']);
    expect(highlightText('Nothing here.', 'earth')).toBe('Nothing here.');
    expect(highlightText('earthly things', 'earth')).toBe('<mark>earthly</mark> things');
    expect(highlightText('unearth', 'earth')).toBe('unearth');
  });
});
