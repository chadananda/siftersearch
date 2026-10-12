import { describe, it, expect } from 'vitest';
import { indexerArgs } from '../../api/lib/ops/phrase-index-job.js';

describe('phrase-index ops job', () => {
  it('a spend cap is required', () => expect(() => indexerArgs({ docs: [1] })).toThrow(/maxUsd/));
  it('docs or scope → indexer args', () => {
    expect(indexerArgs({ docs: [1, 2], maxUsd: 20, budgetKey: 'k' })).toEqual(['scripts/phrase-index/indexer.mjs', '--docs', '1,2', '--embed', '--qdrant', '--max-usd', '20', '--budget-key', 'k']);
    expect(indexerArgs({ scope: 'supplemental', maxUsd: 75 })).toContain('--scope');
  });
});
