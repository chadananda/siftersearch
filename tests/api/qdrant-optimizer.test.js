// Optimizer thread cap for searched Qdrant collections (ops qdrant-optimizer): only searched collections, sane thread counts.
import { describe, it, expect } from 'vitest';
import { optimizerThreadsPatch } from '../../api/lib/search/qdrant-layers.js';

describe('optimizerThreadsPatch', () => {
  it('builds the PATCH body for a searched collection', () => {
    expect(optimizerThreadsPatch('phrases', 8)).toEqual({ optimizers_config: { max_optimization_threads: 8 } });
    expect(optimizerThreadsPatch('hype', null)).toEqual({ optimizers_config: { max_optimization_threads: null } });
  });
  it('refuses other collections and bad thread counts', () => {
    expect(() => optimizerThreadsPatch('phrases_f16', 8)).toThrow(/not a searched/);
    for (const t of [0, -1, 65, 2.5, NaN, '8']) expect(() => optimizerThreadsPatch('phrases', t)).toThrow(/threads must/);
  });
});
