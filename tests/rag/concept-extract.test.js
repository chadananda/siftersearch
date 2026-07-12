// concepts/extract — cited doctrinal/concept claims (work→concept→teaching), proof-gated, on fake ports.
// RED-FIRST: written before the stage; defines the contract.
import { describe, it, expect } from 'vitest';
import { parseConceptClaims, conceptProofOk, conceptClaimRow } from '../../api/lib/rag/concepts/extract.js';
import { fakeLLM, makeRag } from './kit.js';

describe('concepts/extract — pure helpers', () => {
  it('parseConceptClaims recovers complete claim objects (tolerant of truncation)', () => {
    const raw = '{"claims":[{"concept":"the Covenant","relation":"means","teaching":"the enduring bond","proof":"the Covenant of God","root":"Mítháq"},{"concept":"trunc';
    expect(parseConceptClaims(raw)).toEqual([{ concept: 'the Covenant', relation: 'means', teaching: 'the enduring bond', proof: 'the Covenant of God', root: 'Mítháq' }]);
  });
  it('conceptProofOk requires a verbatim span of the paragraph', () => {
    const text = 'he expounded the station of the manifestation and the meaning of the covenant.';
    expect(conceptProofOk('meaning of the covenant', text)).toBe(true);
    expect(conceptProofOk('not present here', text)).toBe(false);
  });
  it('conceptClaimRow defers concept identity and carries proof + root', () => {
    const row = conceptClaimRow({ concept: 'the Covenant', relation: 'means', teaching: 'the bond', proof: 'x', root: 'Mítháq' },
      { docId: 21310, pid: 'p1', methodVersion: 'v1', extractor: 'concept-v1', batch: 'b1' });
    expect(row).not.toHaveProperty('concept_id');
    expect(row).toMatchObject({ relation: 'means', proofVerbatim: 'x', root: 'Mítháq', batch: 'b1' });
    expect(row.semanticKey).toContain('|means|');
  });
});

describe('concepts/extract — run() on fake ports', () => {
  const para = { id: 1, pid: 'p1', kind: 'paragraph', contextModel: 'v1', context: '@GPB — the Covenant',
    text: 'He expounded the meaning of the Covenant of God and the station of the Manifestation.' };
  const reply = { content: JSON.stringify({ claims: [
    { concept: 'the Covenant', relation: 'means', teaching: 'the bond between God and humanity', proof: 'the meaning of the Covenant of God', root: 'Mítháq' },
    { concept: 'X', relation: 'means', teaching: 'y', proof: 'this is not in the paragraph' }, // proof-gate drops
  ] }) };

  it('extracts proof-gated concept claims, dropping unproven ones, identity deferred', async () => {
    const { rag, store } = makeRag({ seed: { paras: { 21310: [para] }, coverage: { 21310: 1 } }, llm: fakeLLM([reply]) });
    const stats = await rag.concepts.extract(21310, { version: 'v1', batch: 'test' });
    expect(stats).toMatchObject({ claims: 2, dropped: 1, written: 1 });
    expect(store.conceptClaims[0]).toMatchObject({ concept: 'the Covenant', relation: 'means' });
    expect(store.conceptClaims.every((c) => !('concept_id' in c))).toBe(true);
  });

  it('gates on disambiguation', async () => {
    const { rag } = makeRag({ seed: { paras: { 21310: [para] }, coverage: { 21310: 0.4 } } });
    await expect(rag.concepts.extract(21310)).rejects.toThrow(/disambiguated/);
  });
});
