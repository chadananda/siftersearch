// entities/dedup-guard — cross-name dedup by GROUNDED FACTS (not names). Pure helpers + run() on fakes.
import { describe, it, expect } from 'vitest';
import { parseDedup, groupCandidates, buildUser, SYSTEM } from '../../api/lib/rag/entities/dedup-guard.js';
import { fakeLLM, makeRag } from './kit.js';

describe('dedup-guard — pure helpers', () => {
  it('groupCandidates folds grounded hits into per-entity fact bundles', () => {
    const g = groupCandidates([
      { entityId: 9, name: 'Qazvíní', fact: 'died at Baghdád 1874' },
      { entityId: 9, name: 'Qazvíní', fact: 'the Báb’s amanuensis' },
      { entityId: 12, name: 'Other', fact: 'unrelated' },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ entityId: 9, facts: ['died at Baghdád 1874', 'the Báb’s amanuensis'] });
  });

  it('parseDedup reads same/canonical or null', () => {
    expect(parseDedup('{"same":9,"canonical":9,"reason":"same death+role"}')).toMatchObject({ same: 9, canonical: 9 });
    expect(parseDedup('{"same":null}')).toMatchObject({ same: null });
    expect(parseDedup('xx')).toBeNull();
  });

  it('the prompt decides by FACTS not names and defaults to DISTINCT when thin', () => {
    expect(SYSTEM).toMatch(/not their names/i);
    expect(SYSTEM).toMatch(/Prefer DISTINCT/i);
    expect(buildUser({ id: 1001, name: 'Mírzá Aḥmad', facts: [{ statement: 'died Baghdád 1874' }] },
      [{ entityId: 9, name: 'Qazvíní', facts: ['died Baghdád 1874'] }])).toContain('#9');
  });
});

describe('dedup-guard — run() on fake ports', () => {
  const seedBase = {
    entityFacts: { 1001: { id: 1001, name: 'Mírzá Aḥmad', facts: [{ statement: 'served as the Báb’s amanuensis at Baghdád' }, { statement: 'died at Baghdád in 1874' }] } },
    grounded: [{ entityId: 9, name: '‘Abdu’l-Karím-i-Qazvíní', fact: 'the Báb’s amanuensis; died at Baghdád 1874' }],
  };

  it('proposes a MERGE when a grounded entity shares the load-bearing facts under a different name', async () => {
    const llm = fakeLLM([{ content: '{"same":9,"canonical":9,"reason":"same death place/year + amanuensis role"}' }]);
    const { rag, store } = makeRag({ seed: seedBase, llm });
    const stats = await rag.entities.dedupGuard({ entityIds: [1001], model: 'flash', fallback: 'haiku' });
    expect(stats).toMatchObject({ checked: 1, searched: 1, adjudicated: 1, proposed: 1 });
    expect(store.decisions).toHaveLength(1);
    expect(store.decisions[0]).toMatchObject({ kind: 'merge', status: 'proposed', payload: { canonical: 9, merge: [1001] } });
  });

  it('keeps namesakes APART (no merge) when the model returns same:null', async () => {
    const llm = fakeLLM([{ content: '{"same":null,"reason":"different death year → namesake"}' }]);
    const { rag, store } = makeRag({ seed: seedBase, llm });
    const stats = await rag.entities.dedupGuard({ entityIds: [1001], model: 'flash', fallback: 'haiku' });
    expect(stats.proposed).toBe(0);
    expect(store.decisions).toHaveLength(0);
  });

  it('skips an entity with no facts — cannot dedup by evidence, never guesses (no model call)', async () => {
    const llm = fakeLLM([{ content: '{"same":9}' }]);
    const { rag } = makeRag({ seed: { entityFacts: { 2002: { id: 2002, name: 'Bare Name', facts: [] } }, grounded: [] }, llm });
    const stats = await rag.entities.dedupGuard({ entityIds: [2002], model: 'flash', fallback: 'haiku' });
    expect(stats).toMatchObject({ checked: 1, searched: 0, adjudicated: 0, proposed: 0 });
    expect(llm.calls.length).toBe(0);
  });

  it('dry-run returns the merge decisions without writing them', async () => {
    const llm = fakeLLM([{ content: '{"same":9,"canonical":9,"reason":"same"}' }]);
    const { rag, store } = makeRag({ seed: seedBase, llm });
    const stats = await rag.entities.dedupGuard({ entityIds: [1001], dryRun: true, model: 'flash', fallback: 'haiku' });
    expect(stats.decisions).toHaveLength(1);
    expect(store.decisions).toHaveLength(0);
  });
});
