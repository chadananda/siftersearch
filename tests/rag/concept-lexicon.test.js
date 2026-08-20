// concepts/lexicon — SEED the authority-ranked, cited interpretive lexicon from the extracted interpretation
// claims. Deterministic aggregation (no AI). The cumulative artifact that grows top-down. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { lexiconEntry } from '../../api/lib/rag/concepts/lexicon.js';
import { makeRag } from './kit.js';

// NOTE (2026-08-20): this expectation was 'metaphorical' only because lexiconEntry HARDCODED that value —
// every entry claimed to be a metaphor, including "Chicago = the first Bahá'í center in the Western world".
// The relation here is `means`, which spans both layers ("the Sun of Truth MEANS Bahá'u'lláh" vs "Chicago
// MEANS..."), so the honest answer is null: under-bind rather than assert (§6). The clouds ARE metaphorical
// and the design says so — but that judgement belongs to the extractor, which sees the passage. Restoring it
// properly needs `layer` emitted per claim and a column on concept_claims to carry it.
describe('concepts/lexicon — pure', () => {
  it('lexiconEntry maps an interpretation claim to a cited, authority-stamped lexicon row', () => {
    const e = lexiconEntry(
      { subject: 'the clouds', relation: 'means', target: 'that which veils recognition of the Manifestation', proof_verbatim: 'the clouds of heaven', para_id: 'p9', doc_id: 21310 },
      { authority: 'God Passes By', authorityTier: 0, methodVersion: 'v1' });
    expect(e).toMatchObject({ symbol: 'the clouds', interpretation: 'that which veils recognition of the Manifestation', authority: 'God Passes By', authorityTier: 0, layer: null, proofParaId: 'p9', proofVerbatim: 'the clouds of heaven' });
  });
});

describe('concepts/lexicon.seed — run() on fake ports', () => {
  const interps = [
    { subject: 'the Covenant', relation: 'means', target: 'the enduring bond', proof_verbatim: 'the Covenant of God', para_id: 'p1', doc_id: 21310 },
    { subject: 'the clouds', relation: 'symbolizes', target: 'veils to recognition', proof_verbatim: 'the clouds', para_id: 'p2', doc_id: 21310 },
  ];
  it('seeds one authority-stamped lexicon entry per interpretation claim', async () => {
    const { rag, store } = makeRag({ seed: { docs: { 21310: { id: 21310, title: 'God Passes By' } }, conceptInterpretations: { 21310: interps } } });
    const stats = await rag.concepts.lexicon.seed(21310, { authorityTier: 0, version: 'v1' });
    expect(stats).toMatchObject({ claims: 2, entries: 2, written: 2 });
    expect(store.lexiconEntries[0]).toMatchObject({ symbol: 'the Covenant', authority: 'God Passes By', authorityTier: 0 });
  });
  it('dry-run writes nothing', async () => {
    const { rag, store } = makeRag({ seed: { conceptInterpretations: { 21310: interps } } });
    const stats = await rag.concepts.lexicon.seed(21310, { dryRun: true });
    expect(stats.written).toBe(0);
    expect(store.lexiconEntries).toHaveLength(0);
  });
});
