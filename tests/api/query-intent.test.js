/**
 * Query Intent Classification Tests (Phase 1 — RED)
 *
 * TDD: Written before implementation. Must all FAIL initially.
 * Tests query intent classification for semantic ratio adjustment.
 */

import { describe, it, expect } from 'vitest';

describe('Query Intent Classification', () => {
  it('should export classifyIntent function', async () => {
    const { classifyIntent } = await import('../../api/lib/query-intent.js');
    expect(typeof classifyIntent).toBe('function');
  });

  it('should return semanticRatio for factual queries', async () => {
    const { classifyIntent } = await import('../../api/lib/query-intent.js');

    const result = await classifyIntent('Who wrote the Kitab-i-Aqdas?', { mock: true });

    expect(result).toBeTruthy();
    expect(typeof result.semanticRatio).toBe('number');
    expect(result.semanticRatio).toBeGreaterThanOrEqual(0);
    expect(result.semanticRatio).toBeLessThanOrEqual(1);
    // Factual queries should lean toward keyword search
    expect(result.semanticRatio).toBeLessThan(0.6);
  });

  it('should return higher semanticRatio for conceptual queries', async () => {
    const { classifyIntent } = await import('../../api/lib/query-intent.js');

    const result = await classifyIntent("What is the Baha'i view on justice and unity?", { mock: true });

    expect(result.semanticRatio).toBeGreaterThan(0.5);
  });

  it('should return suggestedFilters when query mentions specific text', async () => {
    const { classifyIntent } = await import('../../api/lib/query-intent.js');

    const result = await classifyIntent('In the Kitab-i-Iqan, what does it say about the Bab?', { mock: true });

    expect(result.suggestedFilters).toBeTruthy();
    expect(typeof result.suggestedFilters).toBe('object');
  });

  it('should return default ratio when vLLM is unavailable', async () => {
    const { classifyIntent } = await import('../../api/lib/query-intent.js');

    // Force unavailable
    const result = await classifyIntent('test query', { forceUnavailable: true });

    expect(result.semanticRatio).toBe(0.5);
    expect(result.suggestedFilters).toEqual({});
  });
});
