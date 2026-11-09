import { describe, it, expect } from 'vitest';
import { indexerArgs, remeasureAfter } from '../../api/lib/ops/phrase-index-job.js';

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
  it('tier selects paragraphs by doctrinal tier across both scopes; unknown tiers refused; docs win', () => {
    const a = indexerArgs({ tier: 'core', maxUsd: 5 });
    expect(a.slice(0, 3)).toEqual(['scripts/phrase-index/indexer.mjs', '--tier', 'core']);
    expect(a).not.toContain('--scope');
    expect(indexerArgs({ tier: 'all', maxUsd: 5 })).not.toContain('--tier');
    expect(indexerArgs({ docs: [1], tier: 'gray', maxUsd: 5 })).not.toContain('--tier');
    expect(() => indexerArgs({ tier: 'x', maxUsd: 5 })).toThrow(/unknown tier/);
  });
  it('limit caps the paragraphs read (bounded benchmark runs)', () => {
    expect(indexerArgs({ docs: [1], maxUsd: 1, limit: 6000 }).slice(-2)).toEqual(['--limit', '6000']);
    expect(indexerArgs({ docs: [1], maxUsd: 1 })).not.toContain('--limit');
  });
  it('a docs run re-measures its docs into the ledger; scope and scan-only runs do not', async () => {
    const calls = []; const q = async (...a) => calls.push(a);
    expect(await remeasureAfter({ docs: ['7', 9], maxUsd: 1 }, q)).toBe(true);
    expect(calls).toEqual([['coverage-refresh', { ids: [7, 9] }, 'phrase-index']]);
    expect(await remeasureAfter({ scope: 'library', maxUsd: 1 }, q)).toBe(false);
    expect(await remeasureAfter({ docs: [1], scanOnly: true }, q)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
