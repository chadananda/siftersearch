// Verbatim lead (api/lib/search/verbatim.js): an exact quotation's own passage leads, in every script.
import { describe, it, expect } from 'vitest';
import { foldVerbatim, isVerbatimQuery, verbatimLead } from '../../api/lib/search/verbatim.js';

const e = (id, text) => ({ id, text });
const textOf = (x) => x.text;

describe('verbatim lead', () => {
  it('the passage containing the quoted words leads; others keep their order', () => {
    const list = [e(1, 'unrelated words here'), e(2, 'other text'), e(3, 'Know thou that every hearing ear, if kept pure and undefiled, must at all times')];
    expect(verbatimLead(list, 'every hearing ear if kept pure and undefiled', textOf).map((x) => x.id)).toEqual([3, 1, 2]);
  });
  it('diacritics, apostrophes, markers and punctuation never decide', () => {
    expect(foldVerbatim('⁅s1⁆Bahá’u’lláh, the <b>Glory</b> of God!⁅/s1⁆')).toBe('bahaullah the glory of god');
  });
  it('Arabic/Persian: tashkil, tatweel and letter variants fold', () => {
    expect(foldVerbatim('يَسْأَلُونَ رَسُولَ اللَّهِ')).toBe(foldVerbatim('یسألون رسول الله'));
    expect(foldVerbatim('كتاب')).toBe(foldVerbatim('کتاب'));
  });
  it('short queries are topics, not quotations', () => {
    expect(isVerbatimQuery('the soul')).toBe(false);
    expect(verbatimLead([e(1, 'a'), e(2, 'the soul')], 'the soul', textOf).map((x) => x.id)).toEqual([1, 2]);
  });
});
