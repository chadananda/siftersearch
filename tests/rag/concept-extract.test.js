// concepts/extract — cited doctrinal/concept claims (work→concept→teaching), proof-gated, on fake ports.
// RED-FIRST: written before the stage; defines the contract.
import { buildBilingualSystem } from '../../api/lib/rag/concepts/bilingual.js';
import { describe, it, expect } from 'vitest';
import { parseConceptClaims, conceptProofOk, conceptClaimRow } from '../../api/lib/rag/concepts/extract.js';
import { fakeLLM, makeRag } from './kit.js';

describe('concepts/extract — pure helpers', () => {
  it('parseConceptClaims recovers complete claim objects (tolerant of truncation)', () => {
    const raw = '{"claims":[{"concept":"the Covenant","relation":"means","teaching":"the enduring bond","proof":"the Covenant of God","root":"Mítháq"},{"concept":"trunc';
    expect(parseConceptClaims(raw)).toEqual([{ concept: 'the Covenant', relation: 'means', teaching: 'the enduring bond', proof: 'the Covenant of God', root: 'Mítháq' }]);
  });
  it('conceptProofOk requires a verbatim span, and says WHICH text it came from', () => {
    const text = 'he expounded the station of the manifestation and the meaning of the covenant.';
    expect(conceptProofOk('meaning of the covenant', text)).toBe('en');
    expect(conceptProofOk('not present here', text)).toBe(null);
  });

  it('accepts a proof quoted from the ORIGINAL, not only from the rendering', () => {
    // Bilingual extraction shows the model both texts and asks it to keep the proof verbatim in the SOURCE.
    // Checking only the English discarded 102 of 103 claims on the first real Íqán run.
    const hay = [{ lang: 'en', norm: 'and the meaning of the covenant.' },
      { lang: 'fa', norm: 'و معنی میثاق الهی را بیان فرمود', raw: 'و معنی میثاق الهی را بیان فرمود' }];
    expect(conceptProofOk('معنی میثاق الهی', hay)).toBe('fa');
    expect(conceptProofOk('meaning of the covenant', hay)).toBe('en');
    expect(conceptProofOk('چیزی که در متن نیست', hay)).toBe(null);
  });

  it('tolerates diacritics the model drops when re-quoting the original', () => {
    // A correct proof must not be rejected for a missing hamza — the failure that made the segmenter
    // discard good alignments, with the same signature: a stage reporting that nothing survived.
    const hay = [{ lang: 'en', norm: 'x' },
      { lang: 'ar', norm: 'إنّ الّذين اوتوا بصآئر من الله', raw: 'إنّ الّذين اوتوا بصآئر من الله' }];
    expect(conceptProofOk('ان الذين اوتوا بصائر', hay)).toBe('ar');
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

describe('the bilingual prompt states what only Shoghi Effendi has', () => {
  // Chad, 2026-08-26: "if it was [his], the translation itself has tremendous authority (as the only
  // translation by a designated interpreter)… be sure we remind the extraction prompt of the unique nature
  // of shoghi effendi translations as authoritative doctrinally in a way that no other translation can be."
  it('says the standing is unique and cannot be acquired by another translator', () => {
    const sys = buildBilingualSystem({}, { title: 'the Kitáb-i-Íqán' }, { translationAuthority: 'shoghi-effendi' });
    expect(sys).toMatch(/sole designated interpreter/);
    expect(sys).toMatch(/ONLY translation that carries doctrinal authority/);
    expect(sys).toMatch(/no other rendering .* has it or can acquire it/);
  });

  it('does NOT let that authority foreclose the other senses', () => {
    // Chad, 2026-08-26: "even though Shoghi Effendi translations identify a legitimate reading, probably the
    // main legitimate reading, that does not infer that other meanings are totally illegitimate… saying
    // 'his word-choice fixes which sense' is both under-appreciating and over-simplifying interpretation."
    const sys = buildBilingualSystem({}, { title: 'x' }, { translationAuthority: 'shoghi-effendi' });
    expect(sys).toMatch(/DOES NOT EXHAUST THE PASSAGE/);
    expect(sys).toMatch(/does not delete the other senses/);
    expect(sys).toMatch(/record the sense his rendering establishes, marked as authoritative, AND the further senses/);
    expect(sys).not.toMatch(/FIXES which sense/);          // the formulation being corrected
    expect(sys).not.toMatch(/HE HAS DECIDED IT/);
  });

  it('agrees with its own polysemy section instead of contradicting it', () => {
    // The prompt told the model to record every sense a symbolic passage supports, and in the same breath
    // that the translator's word-choice fixed one. Both cannot be followed.
    const sys = buildBilingualSystem({}, { title: 'x' }, { translationAuthority: 'shoghi-effendi' });
    expect(sys).toMatch(/carries more than one meaning at once/);
    expect(sys).toMatch(/record them ALL/);
  });

  it('does NOT grant that standing to a committee or provisional rendering', () => {
    const sys = buildBilingualSystem({}, { title: 'the Kitáb-i-Aqdas' }, { translationAuthority: 'committee' });
    expect(sys).toMatch(/THE ORIGINAL GOVERNS HERE/);
    expect(sys).not.toMatch(/sole designated interpreter/);
  });

  it('tells the model it may quote its proof from EITHER text', () => {
    // The instruction used to say "quoted exactly from the passage", and the model quoted Persian while the
    // gate searched English — 102 of 103 claims discarded.
    const sys = buildBilingualSystem({}, { title: 'x' }, { translationAuthority: 'shoghi-effendi' });
    expect(sys).toMatch(/Quote from EITHER text/);
  });
});
