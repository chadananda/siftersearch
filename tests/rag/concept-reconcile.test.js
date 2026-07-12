// concepts/reconcile — bind a symbol occurrence to its authoritative meaning in the lexicon, by evidence +
// authority, proof-gated. Literal + metaphorical kept as separate layers; under-bind when ambiguous. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { parseConceptVerdict, conceptDecisionRow, buildUser, SYSTEM } from '../../api/lib/rag/concepts/reconcile.js';
import { fakeLLM, makeRag } from './kit.js';

describe('concepts/reconcile — pure helpers', () => {
  it('parseConceptVerdict reads bind/under-bind + layer', () => {
    expect(parseConceptVerdict('{"verdict":"bind","lexicon_id":7,"layer":"metaphorical","confidence":0.9}'))
      .toMatchObject({ verdict: 'bind', lexiconId: 7, layer: 'metaphorical' });
    expect(parseConceptVerdict('{"verdict":"under-bind"}')).toMatchObject({ verdict: 'under-bind' });
    expect(parseConceptVerdict('junk')).toBeNull();
  });
  it('the prompt keeps literal + metaphorical as separate layers and under-binds when unsure', () => {
    expect(SYSTEM).toMatch(/under-bind/i);
    expect(SYSTEM).toMatch(/literal/i);
  });
  it('conceptDecisionRow carries the bound lexicon id + layer, tier-2 proposal', () => {
    const row = conceptDecisionRow(parseConceptVerdict('{"verdict":"bind","lexicon_id":7,"layer":"metaphorical","decisive":"eschatological fit","confidence":0.9}'),
      { symbol: 'the clouds', occurrences: [11, 12] }, [{ id: 7 }]);
    expect(row).toMatchObject({ kind: 'bind', actorTier: 2, status: 'proposed' });
    expect(row.payload).toMatchObject({ symbol: 'the clouds', lexiconId: 7, layer: 'metaphorical' });
  });
});

describe('concepts/reconcile — run() on fake ports', () => {
  const groups = [
    { symbol: 'the clouds', occurrences: [11], paraIds: ['p1'] },
    { symbol: 'a weather cloud', occurrences: [12], paraIds: ['p2'] },
  ];
  const adjudicate = (_o, _i, msgs) => {
    const u = msgs[1].content;
    if (u.includes('weather')) return { content: '{"verdict":"under-bind","confidence":0.4,"decisive":"literal, not eschatological"}' };
    return { content: '{"verdict":"bind","lexicon_id":7,"layer":"metaphorical","confidence":0.9,"decisive":"advent context fits"}' };
  };

  it('binds a fitting symbol to the authoritative interpretation; under-binds the literal one', async () => {
    const seed = { conceptGroups: { 8632: groups }, coverage: { 8632: 1 }, lexicon: [{ id: 7, interpretation: 'veils from recognizing the Manifestation', authority: 'Íqán', authorityTier: 3, layer: 'metaphorical' }] };
    const { rag, store } = makeRag({ seed, llm: fakeLLM(adjudicate) });
    const stats = await rag.concepts.reconcile(8632, { model: 'flash', fallback: 'haiku' });
    expect(stats).toMatchObject({ groups: 2, adjudicated: 2, proposed: 2 });
    expect(stats.byKind).toEqual({ bind: 1, 'under-bind': 1 });
    const bind = store.conceptDecisions.find((d) => d.kind === 'bind');
    expect(bind.payload).toMatchObject({ lexiconId: 7 });
  });

  it('gates on disambiguation', async () => {
    const { rag } = makeRag({ seed: { conceptGroups: { 8632: groups }, coverage: { 8632: 0.4 } } });
    await expect(rag.concepts.reconcile(8632, { model: 'flash', fallback: 'haiku' })).rejects.toThrow(/disambiguated/);
  });
});
