// Keyword tokens for the BM25 sparse index: folding, stable ids, document and query vectors.
import { describe, it, expect } from 'vitest';
import { foldKeyword, tokens, tokenId, bm25Doc, bm25Query } from '../../api/lib/keyword-tokens.js';

describe('tokens', () => {
  it('folds Arabic-script variants and vowel marks so unvocalised queries match vocalised text', () => {
    expect(tokens('قُلْ يا قَوْمِ')).toEqual(tokens('قل یا قوم'));
    expect(tokens('الكتاب')).toEqual(tokens('الکتاب'));
  });
  it('drops Latin diacritics and case', () => {
    expect(tokens('Bahá’u’lláh Ṭihrán')).toEqual(['baha', 'u', 'llah', 'tihran']);
    expect(foldKeyword('ÉCOLE')).toBe('ecole');
  });
  it('empty → no tokens', () => { expect(tokens('')).toEqual([]); expect(tokens(null)).toEqual([]); });
});

describe('tokenId', () => {
  it('is a stable uint32', () => {
    expect(tokenId('baha')).toBe(tokenId('baha'));
    expect(tokenId('baha')).not.toBe(tokenId('bahai'));
    expect(Number.isInteger(tokenId('x')) && tokenId('x') >= 0 && tokenId('x') < 2 ** 32).toBe(true);
  });
});

describe('bm25Doc / bm25Query', () => {
  it('repeated words weigh more but saturate; longer docs weigh each word less', () => {
    const once = bm25Doc('justice is light', 3), twice = bm25Doc('justice justice is light', 3);
    const j = tokenId('justice');
    const w = (v) => v.values[v.indices.indexOf(j)];
    expect(w(twice)).toBeGreaterThan(w(once));
    expect(w(twice)).toBeLessThan(2 * w(once));
    expect(w(bm25Doc('justice is light and so on and on', 3))).toBeLessThan(w(once));
  });
  it('query uses each distinct token once', () => {
    expect(bm25Query('light light of the world').indices).toHaveLength(4);
  });
  it('empty document → null', () => { expect(bm25Doc('', 10)).toBeNull(); });
});
