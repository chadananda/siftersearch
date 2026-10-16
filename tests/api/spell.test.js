// Query spell-correction against the library vocabulary (api/lib/search/spell.js).
import { describe, it, expect } from 'vitest';
import { foldWord, wordsOf, edits1, correctWord, correctQuery } from '../../api/lib/search/spell.js';

const vocab = new Map([['prayer', 9000], ['allows', 800], ['change', 7000], ['holiness', 1200], ['righteousness', 3000],
  ['mankind', 5000], ['شهادت', 400], ['خضوع', 300], ['خشوع', 250], ['bahaullah', 40000], ['prayyer', 3]]);

describe('spell correction', () => {
  it('folds as the indexes do', () => {
    expect(foldWord('Bahá’u’lláh')).toBe('bahaullah');
    expect(foldWord('يَسْأَلُونَ')).toBe(foldWord('یسألون'));
    expect(wordsOf('⁅s1⁆The Prayer, and change⁅/s1⁆')).toEqual(['the', 'prayer', 'and', 'change']);
  });
  it('edits1: deletions, swaps, substitutions, insertions', () => {
    const e = edits1('abc', 'ab');
    expect(e.has('ac')).toBe(true);    // deletion
    expect(e.has('bac')).toBe(true);   // swap
    expect(e.has('abb')).toBe(true);   // substitution
    expect(e.has('abca')).toBe(true);  // insertion
    expect(e.has('abc')).toBe(false);
  });
  it('a reader’s slips are corrected to the library’s word (Chad: "often misspelled")', () => {
    expect(correctWord('prayr', vocab)).toBe('prayer');
    expect(correctWord('chnge', vocab)).toBe('change');
    expect(correctWord('alloows', vocab)).toBe('allows');
    expect(correctWord('Hooliness', vocab)).toBe('holiness');
    expect(correctWord('rihgteousnes', vocab)).toBe('righteousness');        // two edits, long word
    expect(correctWord('شاهدت', vocab)).toBe('شهادت');                      // Persian swap
  });
  it('a rare form next to an overwhelmingly common one is an OCR/typo form', () => {
    expect(correctWord('prayyer', vocab)).toBe('prayer');
  });
  it('known words, short words and nonsense are kept', () => {
    expect(correctWord('mankind', vocab)).toBeNull();
    expect(correctWord('the', vocab)).toBeNull();
    expect(correctWord('zzzzqx', vocab)).toBeNull();
  });
  it('a query keeps its other words and reports what changed', () => {
    const r = correctQuery('prayyer alloows chnge', vocab);
    expect(r.query).toBe('prayer allows change');
    expect(r.corrections.map((c) => c.to)).toEqual(['prayer', 'allows', 'change']);
    expect(correctQuery('Bahá’u’lláh and mankind', vocab)).toEqual({ query: 'Bahá’u’lláh and mankind', corrections: [] });
    expect(correctQuery('anything', new Map())).toEqual({ query: 'anything', corrections: [] });
  });
});
