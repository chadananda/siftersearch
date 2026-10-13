import { describe, it, expect } from 'vitest';
import { indexerArgs } from '../../api/lib/ops/phrase-index-job.js';

describe('phrase-index ops job', () => {
  it('a spend cap is required', () => expect(() => indexerArgs({ docs: [1] })).toThrow(/maxUsd/));
  it('docs or scope → indexer args', () => {
    expect(indexerArgs({ docs: [1, 2], maxUsd: 20, budgetKey: 'k' })).toEqual(['scripts/phrase-index/indexer.mjs', '--docs', '1,2', '--embed', '--qdrant', '--max-usd', '20', '--budget-key', 'k']);
    expect(indexerArgs({ scope: 'supplemental', maxUsd: 75 })).toContain('--scope');
  });
  it('field hype/concepts → its own store + collection; unknown fields refused', () => {
    const a = indexerArgs({ docs: [8312], field: 'concepts', maxUsd: 5 });
    expect(a.slice(a.indexOf('--field'), a.indexOf('--field') + 6)).toEqual(['--field', 'concepts', '--store', '/tank/sifter/concept-vectors/vectors.db', '--collection', 'concepts']);
    expect(indexerArgs({ docs: [1], field: 'hype', maxUsd: 1 })).toContain('/tank/sifter/hype-vectors/vectors.db');
    expect(() => indexerArgs({ docs: [1], field: 'phrases', maxUsd: 1 })).toThrow(/unknown field/);
  });
});
