/**
 * Reranker Tests (Phase 1 — RED)
 *
 * TDD: Written before implementation. Must all FAIL initially.
 * Tests cross-encoder reranking with Voyage/Cohere/local fallback chain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Reranker', () => {
  it('should export rerank function', async () => {
    const { rerank } = await import('../../api/lib/reranker.js');
    expect(typeof rerank).toBe('function');
  });

  it('should rerank results using mock Voyage API', async () => {
    const { rerank } = await import('../../api/lib/reranker.js');

    const query = "What is progressive revelation?";
    const candidates = [
      { id: 'a', text: 'He discussed the topic at length.', _rankingScore: 0.8 },
      { id: 'b', text: 'Progressive revelation means each Messenger brings teachings suited to the age.', _rankingScore: 0.7 },
      { id: 'c', text: 'The weather was pleasant that day.', _rankingScore: 0.9 },
    ];

    // With a real reranker, result 'b' should outrank 'c' despite lower keyword score
    const reranked = await rerank(query, candidates, { provider: 'mock' });

    expect(Array.isArray(reranked)).toBe(true);
    expect(reranked.length).toBeLessThanOrEqual(candidates.length);
    // Each result should have a rerank_score
    reranked.forEach(r => {
      expect(typeof r.rerank_score).toBe('number');
    });
  });

  it('should pass through original results when reranking is disabled', async () => {
    const { rerank } = await import('../../api/lib/reranker.js');

    const candidates = [
      { id: 'a', text: 'Text A', _rankingScore: 0.9 },
      { id: 'b', text: 'Text B', _rankingScore: 0.8 },
    ];

    const result = await rerank('query', candidates, { enabled: false });

    expect(result).toEqual(candidates);
  });

  it('should fall back gracefully when API is unavailable', async () => {
    const { rerank } = await import('../../api/lib/reranker.js');

    const candidates = [
      { id: 'a', text: 'Text A', _rankingScore: 0.9 },
    ];

    // Force unavailable provider
    const result = await rerank('query', candidates, { provider: 'voyage', apiKey: 'invalid' });

    // Should return original candidates, not throw
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('should respect timeout and fall back', async () => {
    const { rerank } = await import('../../api/lib/reranker.js');

    const candidates = [{ id: 'a', text: 'Text', _rankingScore: 0.5 }];

    // Very short timeout should trigger fallback
    const result = await rerank('query', candidates, { timeout: 1 });

    expect(Array.isArray(result)).toBe(true);
  });

  it('should apply document tier weighting before reranking', async () => {
    const { applyTierWeighting } = await import('../../api/lib/reranker.js');

    const results = [
      { id: 'a', _rankingScore: 0.8, tier: 'background' },
      { id: 'b', _rankingScore: 0.7, tier: 'primary' },
      { id: 'c', _rankingScore: 0.75, tier: 'secondary' },
    ];

    const weighted = applyTierWeighting(results);

    // Primary (0.7 * 1.2 = 0.84) should outrank background (0.8 * 0.8 = 0.64)
    expect(weighted[0].id).toBe('b');
    expect(weighted[weighted.length - 1].id).toBe('a');
  });
});
