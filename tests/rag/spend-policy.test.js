// Spend policy + cost metering — the guardrail that keeps paid providers on Persian only, and the meter that
// makes per-book spend visible. These are executable statements of the standing rule: "haiku/sonnet = PERSIAN
// ONLY; English/Arabic/Hebrew are deepseek-only, fallbacks included."
import { describe, it, expect } from 'vitest';
import { assertSpendAllowed, costOf, withUsageScope, currentScope } from '../../api/lib/rag-adapter/usage.js';
import { setAIContext } from '../../api/lib/ai-context.js';

const call = (lang, model, provider) => () => assertSpendAllowed({ provider, model, lang, stage: 'reconcile' });

describe('spend policy — paid providers are Persian-only', () => {
  it('allows anthropic for Persian (flash cannot read it — a capability necessity)', () => {
    expect(call('fa', 'claude-sonnet-4-6', 'anthropic')).not.toThrow();
    expect(call('fa', 'claude-haiku-4-5-20251001', 'anthropic')).not.toThrow();
  });

  it('REFUSES anthropic for english/arabic/hebrew — including as a fallback', () => {
    for (const lang of ['en', 'ar', 'he']) {
      expect(call(lang, 'claude-haiku-4-5-20251001', 'anthropic')).toThrow(/Persian-only/);
    }
  });

  it('refuses fatally, so the run aborts loudly instead of silently churning paid calls', () => {
    try { call('en', 'claude-haiku-4-5-20251001', 'anthropic')(); expect.unreachable(); }
    catch (e) { expect(e.fatal).toBe(true); }
  });

  it('fails CLOSED: an unscoped call (no language known) may not use a paid provider', () => {
    expect(call(undefined, 'claude-haiku-4-5-20251001', 'anthropic')).toThrow(/Persian-only/);
  });

  it('never blocks deepseek — the free path stays open for every language', () => {
    for (const lang of ['en', 'ar', 'he', 'fa', undefined]) {
      expect(call(lang, 'deepseek-v4-flash', 'deepseek')).not.toThrow();
    }
  });
});

describe('cost metering', () => {
  it('prices a call from the registry (per-1K) and discounts cached prompt tokens', () => {
    // sonnet: input $0.003/1K, output $0.015/1K
    expect(costOf({ model: 'claude-sonnet-4-6', promptTokens: 1000, completionTokens: 1000 }))
      .toBeCloseTo(0.003 + 0.015, 6);
    // 1000 prompt tokens all cache-read → 10% of input price
    expect(costOf({ model: 'claude-sonnet-4-6', promptTokens: 1000, cachedTokens: 1000, completionTokens: 0 }))
      .toBeCloseTo(0.0003, 6);
  });

  it('returns 0 for an unpriced/unknown model rather than throwing', () => {
    expect(costOf({ model: 'not-a-real-model', promptTokens: 999 })).toBe(0);
  });

  it('propagates the doc/stage scope through async work (how a cost finds its book)', async () => {
    await withUsageScope({ docId: 15256, lang: 'fa', stage: 'disambiguate' }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentScope()).toMatchObject({ docId: 15256, lang: 'fa', stage: 'disambiguate' });
    });
    expect(currentScope().docId).toBeUndefined(); // scope does not leak outside the run
  });

  // A run advances through stages inside ONE scope, so the stage must be updatable mid-run. withUsageScope
  // SPREADS its argument into a fresh store, so mutating the caller's own object silently never lands — which
  // shipped every call to the log as service_type 'chat' with no stage, despite the doc attributing correctly.
  it('reflects a stage change made DURING the run (setAIContext writes the live store)', async () => {
    const passed = { docId: 13433, lang: 'en', stage: null };
    await withUsageScope(passed, async () => {
      setAIContext({ stage: 'reconcile' });
      await new Promise((r) => setTimeout(r, 1));
      expect(currentScope().stage).toBe('reconcile');   // the store saw it
      passed.stage = 'bogus';
      expect(currentScope().stage).toBe('reconcile');   // ...and the caller's detached object cannot spoof it
    });
  });
});
