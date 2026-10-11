// The model registry is the price source of truth for the spend ledger (Chad 10-11: "keep the model registry up to
// date. I've mentioned this several times"). Pins the current Anthropic set and the 5.5-only rule.
import { describe, it, expect } from 'vitest';
import { MODEL_REGISTRY, calculateCost, effectivePricing } from '../../api/lib/model-registry.js';

// The live list from GET https://api.anthropic.com/v1/models on 2026-10-11 — add new ids here AND to the registry.
const LIVE_ANTHROPIC = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-5',
  'claude-sonnet-5', 'claude-fable-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];

describe('Anthropic models in the registry', () => {
  it('every live model is priced (a missing id logs $0 — invisible spend)', () => {
    for (const id of LIVE_ANTHROPIC) {
      expect(MODEL_REGISTRY[id], id).toBeTruthy();
      expect(MODEL_REGISTRY[id].pricing.input, id).toBeGreaterThan(0);
    }
  });
  it('only the 5.5 family is in use; everything older is marked deprecated', () => {
    const live = Object.entries(MODEL_REGISTRY).filter(([, m]) => m.provider === 'anthropic' && !m.deprecated).map(([id]) => id).sort();
    expect(live).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
  });
  it('Haiku 5.5 bills 5× past 100k prompt tokens', () => {
    expect(calculateCost('claude-haiku-5-5', 100000, 1000)).toBeCloseTo(0.0105, 6);   // $0.10/M in + $0.50/M out
    expect(calculateCost('claude-haiku-5-5', 100001, 1000)).toBeCloseTo(0.0525, 4);   // $0.50/M in + $2.50/M out
    expect(effectivePricing('claude-sonnet-5-5', 500000).input).toBe(0.002);          // no surcharge block → flat
  });
});

describe('5.5 family request shape', () => {
  it('is flagged noTemperature (the API rejects the parameter)', () => {
    for (const id of ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']) expect(MODEL_REGISTRY[id].noTemperature, id).toBe(true);
  });
});
