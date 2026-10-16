// Known-item test core (api/lib/ops/known-item.js): fragments, ranks (copies count), weighted picks, summary.
import { describe, it, expect } from 'vitest';
import { fragmentOf, rankOf, pickDoc, summarize, knownItemTest } from '../../api/lib/ops/known-item.js';

describe('known-item', () => {
  it('fragment: middle words, markers stripped; short text whole', () => {
    expect(fragmentOf('⁅s1⁆one two three⁅/s1⁆', 10)).toBe('one two three');
    const f = fragmentOf(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' '), 10, () => 0);
    expect(f.split(' ')).toHaveLength(10);
    expect(f.startsWith('w2 ')).toBe(true);
  });
  it('rank by id or identical copy', () => {
    const t = { id: 5, normalized_hash: 'h' };
    expect(rankOf([1, 2, 5], t)).toBe(3);
    expect(rankOf([9, 7], t, new Map([[7, 'h']]))).toBe(2);
    expect(rankOf([9], t)).toBe(0);
  });
  it('paragraph-weighted pick', () => {
    expect(pickDoc([{ id: 1, paragraph_count: 1 }, { id: 2, paragraph_count: 99 }], () => 0.5).id).toBe(2);
  });
  it('end to end with injected layers: recall per bucket, misses listed', async () => {
    const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const r = await knownItemTest({ perBucket: 2, rand: () => 0.3 }, {
      religions: ['Islam'],
      docsOfReligion: async () => [{ id: 1, title: 'The Qur’án', author: 'Muhammad', religion: 'Islam', paragraph_count: 5 }],
      paragraphAt: async () => ({ id: 10, doc_id: 1, text, normalized_hash: 'h', blocktype: 'paragraph' }),
      hashesByIds: async () => new Map(),
      layers: { good: async () => [10], bad: async () => [3], production: async () => [4] },
    });
    expect(r.queries).toBe(2);
    const b = r.summary[0];
    expect(b.layers.good.recall_at_1).toBe(1);
    expect(b.layers.bad.recall_at_10).toBe(0);
    expect(r.production_missed_but_a_layer_found[0].found_by).toEqual(['good']);
  });
});
