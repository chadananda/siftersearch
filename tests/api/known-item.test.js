// Known-item test core (api/lib/ops/known-item.js): what a reader brings — ten words, three, misspelled, half-remembered.
import { describe, it, expect } from 'vitest';
import { fragmentOf, distinctive3, misspell, rankOf, pickDoc, knownItemTest } from '../../api/lib/ops/known-item.js';

describe('known-item queries', () => {
  it('ten consecutive words; markers stripped', () => {
    expect(fragmentOf('⁅s1⁆one two three⁅/s1⁆', 10)).toBe('one two three');
    expect(fragmentOf(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '), 10, () => 0).split(' ')).toHaveLength(10);
  });
  it('three distinctive words of a short stretch, in order, never function words', () => {
    const q = distinctive3('The earth is but one country, and mankind its citizens.', () => 0);
    expect(q).toBe('earth country mankind');
  });
  it('misspelled: accents dropped, one slip per long word', () => {
    const m = misspell('Bahá’u’lláh covenant soul', () => 0.5);
    expect(m).not.toMatch(/[áí’]/);
    expect(m.split(' ')[2]).toBe('soul');           // short words untouched
    expect(m.split(' ')[1]).not.toBe('covenant');
  });
  it('rank by id or identical copy; weighted pick', () => {
    expect(rankOf([9, 7], { id: 5, normalized_hash: 'h' }, new Map([[7, 'h']]))).toBe(2);
    expect(pickDoc([{ id: 1, paragraph_count: 1 }, { id: 2, paragraph_count: 99 }], () => 0.5).id).toBe(2);
  });
  it('end to end: every variant on every layer, recall@1/10/30, production misses with their query', async () => {
    const text = 'Know thou that every hearing ear, if kept pure and undefiled, must at all times and from every direction hear the voice';
    const r = await knownItemTest({ perBucket: 1, rand: () => 0.3 }, {
      religions: ['Islam'],
      docsOfReligion: async () => [{ id: 1, title: 'X', author: 'Someone', religion: 'Islam', paragraph_count: 3 }],
      paragraphAt: async () => ({ id: 10, doc_id: 1, text, normalized_hash: 'h', blocktype: 'paragraph' }),
      hashesByIds: async () => new Map(),
      recall: async () => 'hearing ear kept clean',
      layers: { kw: async (q) => (q.split(' ').length >= 10 ? [10] : [4, 5, 10]), production: async () => [3] },
    });
    expect(r.variants).toEqual(['exact10', 'words3', 'typo3', 'recall']);
    expect(r.overall.exact10.kw.recall_at_1).toBe(1);
    expect(r.overall.words3.kw).toMatchObject({ recall_at_1: 0, recall_at_10: 1 });
    expect(r.production_misses.recall[0]).toMatchObject({ query: 'hearing ear kept clean', found_by: ['kw'] });
  });
});
