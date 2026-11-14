// Verbatim lead (api/lib/search/verbatim.js): an exact quotation's own passage leads, in every script.
import { describe, it, expect } from 'vitest';
import { foldVerbatim, isVerbatimQuery, verbatimLead, exactLead } from '../../api/lib/search/verbatim.js';

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

describe('exact lead: talks (Chad 11-13 — transcripts are fully searchable)', () => {
  const opts = { textOf: (x) => x.text, factorOf: (x) => x.f, isTalk: (x) => x.coll === 'Media' };
  const q = 'The future of the African continent, with the African people, is bright.';
  it('a talk holding the exact words leads, though talks weigh 0.4', () => {
    const list = [{ id: 1, f: 2.8, text: 'Africa will arise' }, { id: 2, f: 0.4, coll: 'Media', text: 'So I looked. The future of the African continent, with the African people, is bright. No doubt.' }];
    expect(exactLead(list, q, opts).map((x) => x.id)).toEqual([2]);
  });
  it('a weighty passage with the same words stays ahead of the talk', () => {
    const list = [{ id: 2, f: 0.4, coll: 'Media', text: q }, { id: 3, f: 2.8, text: q }];
    expect(exactLead(list, q, opts).map((x) => x.id)).toEqual([3, 2]);
  });
  it('a low-weight scraped copy still never leads on the words alone (10-20); a question is not a quotation', () => {
    expect(exactLead([{ id: 4, f: 0.6, coll: 'Web', text: q }], q, opts)).toEqual([]);
    expect(exactLead([{ id: 2, f: 0.4, coll: 'Media', text: 'is the future of the African continent bright' }], 'Is the future of the African continent bright?', opts)).toEqual([]);
  });
});

describe('quotation recall (11-13)', () => {
  it('a quotation query searches phrases at the exact-recall setting, wider than the everyday one', async () => {
    const { SEARCH_PARAMS } = await import('../../api/lib/search/qdrant-layers.js');
    expect(SEARCH_PARAMS.phraseExact.rescore).toBe(true);
    expect(SEARCH_PARAMS.phraseExact.oversampling).toBeGreaterThan(SEARCH_PARAMS.phrase.oversampling);
    expect(SEARCH_PARAMS.phraseExact.hnsw_ef).toBeGreaterThan(SEARCH_PARAMS.phrase.hnsw_ef);
  });
});
