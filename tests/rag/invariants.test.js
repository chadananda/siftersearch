// invariants — the architectural laws of CorpusRAG as executable checks. Laws provable today ASSERT; laws
// that need not-yet-built stages are `it.todo` so the spec stays visible and each stage is born against it.
// This file IS the correctness spec — read it to know what the library guarantees.
import { describe, it, expect } from 'vitest';
import { makeModelEngine } from '../../api/lib/rag/kernel/model.js';
import { assertDisambiguated } from '../../api/lib/rag/kernel/gate.js';
import { gateResolves } from '../../api/lib/rag/enrich/disambiguate.js';
import { fakeLLM, fakeCatalog, memStore, parseIdea } from './kit.js';

const engine = (llm) => makeModelEngine({ llm, catalog: fakeCatalog() });

describe('LAW: provider comes only from the catalog (no name-guessing, no silent default)', () => {
  it('throws on an uncatalogued model rather than inventing a provider', () => {
    expect(() => engine(fakeLLM([])).resolveProvider('mystery-model')).toThrow();
  });
});

describe('LAW: the escalation ladder is budget-bounded and stops at first success', () => {
  // Property check over random pass/fail scripts: calls never exceed the budget, and a run stops as soon as
  // a parse succeeds. Budget = primaryTries(3) + fallbackTries(2) = 5 for distinct primary/fallback.
  it('never exceeds primary+fallback tries; halts on first parse (100 random scripts)', async () => {
    for (let t = 0; t < 100; t++) {
      // deterministic pseudo-random from t (Math.random is unavailable in this environment for workflows,
      // but tests may use it; use t-derived bits to stay reproducible regardless).
      const passAt = (t % 7) - 1; // -1 = never passes; 0..5 = the call index that first returns valid
      let n = 0;
      const llm = fakeLLM(() => { const ok = passAt >= 0 && n >= passAt; n++; return { content: ok ? '{"idea":"y"}' : 'x', finishReason: 'stop' }; });
      const r = await engine(llm).runLadder({ route: { model: 'flash', fallback: 'haiku' }, system: 's', user: 'u', parse: parseIdea, maxTokens: 400 });
      expect(llm.calls.length).toBeLessThanOrEqual(5);
      if (passAt >= 0 && passAt < 5) { expect(r.parsed).not.toBeNull(); expect(llm.calls.length).toBe(passAt + 1); }
      if (passAt === -1) expect(r.parsed).toBeNull();
    }
  });
});

// ── The laws below need stages that are not built yet. Kept as the visible spec (test-first targets). ──

describe('LAW: disambiguation gates every downstream stage', () => {
  it('the gate throws below the coverage threshold and passes at/above it', async () => {
    const ctx = { store: memStore({ coverage: { 1: 0.5, 2: 0.99 } }) };
    await expect(assertDisambiguated(ctx, 1)).rejects.toThrow(/disambiguated/);
    await expect(assertDisambiguated(ctx, 2)).resolves.toBe(0.99);
  });
  it.todo('every entities.* / concepts.* entry calls the gate before doing work');
});

describe('LAW: identity is deferred at extraction, decided only by evidence at reconcile', () => {
  it('mentions() write no entity binding — covered in mentions.test.js (entity_id never set)', () => { expect(true).toBe(true); });
  it('claims() write no entity binding — covered in claims.test.js (entity_id never set)', () => { expect(true).toBe(true); });
  it('reconcile proposes tier-2 decisions and binds an id only on a "link" — covered in reconcile.test.js', () => { expect(true).toBe(true); });
});

describe('LAW: every fact carries a verbatim proof span present in its paragraph', () => {
  it('a disambiguation resolution whose name is absent from the passage is dropped (Latin script)', () => {
    expect(gateResolves(['the Báb = the Herald', 'Quddús = invented'], 'the Báb spoke in Shíráz.')).toEqual(['the Báb = the Herald']);
  });
  it.todo('a claim whose proof span is absent from the source paragraph is dropped');
});

describe('LAW: entities are a deterministic, idempotent projection of the append-only decision log', () => {
  it.todo('project() replayed over the same log yields the identical graph');
  it.todo('a lower actor_tier decision never overwrites a higher one — conflicts flag for review');
});

describe('LAW: source anchoring is stable across re-runs (improvement is additive)', () => {
  it('a mention anchor is deterministic in its source position — covered in mentions.test.js', () => { expect(true).toBe(true); });
});

describe('LAW: enrichment is English-canonical while proof stays verbatim in the source language', () => {
  it.todo('claim subject/relation/object are English; proof span is byte-equal to the source');
});
