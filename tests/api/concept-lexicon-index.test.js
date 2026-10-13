// concept_entities has NO writer anywhere in the codebase (verified: 0 INSERT/UPDATE), so an index that only
// reads that table can never fill. The lexicon DOES exist — 1,651 cited interpretations — and is what makes
// §6's "query one concept across traditions" possible today. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { lexiconDoc, proofParagraph, symbolNamed } from '../../api/lib/search/concepts.js';

const row = {
  id: 7, symbol: 'the clouds', interpretation: 'that which veils people from recognizing the Manifestation',
  authority: 'The Kitáb-i-Íqán', authority_tier: 3, layer: 'metaphorical',
  proof_doc_id: 20810, proof_para_id: 'p9', proof_verbatim: 'the clouds of heaven',
};

describe('lexiconDoc', () => {
  it('is searchable by the SYMBOL a reader would actually type', () => {
    expect(lexiconDoc(row)).toMatchObject({ symbol: 'the clouds', interpretation: expect.stringContaining('veils') });
  });
  it('carries the authority and its tier, so a higher reading can outrank a lower one', () => {
    expect(lexiconDoc(row)).toMatchObject({ authority: 'The Kitáb-i-Íqán', authority_tier: 3 });
  });
  it('keeps the verbatim proof and its source — an uncited interpretation is exactly what §6 forbids', () => {
    expect(lexiconDoc(row)).toMatchObject({ proof_verbatim: 'the clouds of heaven', proof_doc_id: 20810 });
  });
  it('tags kind=lexicon so promoted ENTITY records can share the index without colliding', () => {
    expect(lexiconDoc(row).kind).toBe('lexicon');
  });
  it('namespaces the id so a lexicon row and an entity row can never overwrite each other', () => {
    expect(String(lexiconDoc(row).id)).toBe('lex_7');
  });
  it('does not invent a layer it was not given', () => {
    expect(lexiconDoc({ ...row, layer: null }).layer).toBeNull();
  });
});

// Concept layer (Chad 10-12: "make sure we use all the indexes we create").
describe('symbolNamed — a lexicon entry fires only for a symbol the question names', () => {
  it('names it by its content words', () => {
    expect(symbolNamed('the sun', 'What does the sun symbolize?')).toBe(true);
    expect(symbolNamed('the clouds', 'what are the clouds in the Íqán')).toBe(true);
    expect(symbolNamed('the Covenant', "What is the Covenant of Bahá'u'lláh?")).toBe(true);
  });
  it('a partial name is not a match', () => {
    expect(symbolNamed('Sun of Truth', 'What does the sun symbolize?')).toBe(false);
    expect(symbolNamed('light', 'What does the sun symbolize?')).toBe(false);
  });
  it('a symbol of only stop words never fires', () => {
    expect(symbolNamed('the', 'the the the')).toBe(false);
  });
});

describe('proofParagraph — a proof resolves to its content row', () => {
  const rows = [
    { id: 10, text: 'Unrelated.', block_attrs: '{"id":"para_1"}' },
    { id: 11, text: 'He stubbornly ⁅s1⁆refuses⁅/s1⁆ to embrace the light.', block_attrs: '{"id":"para_2"}' },
  ];
  it('by block id when the text agrees', () => {
    expect(proofParagraph(rows, { proof_para_id: 'para_2', proof_verbatim: 'stubbornly refuses to embrace' })).toBe(11);
  });
  it('by verbatim when the block id points elsewhere', () => {
    expect(proofParagraph(rows, { proof_para_id: 'para_1', proof_verbatim: 'stubbornly refuses to embrace' })).toBe(11);
  });
  it('null when neither is found', () => {
    expect(proofParagraph(rows, { proof_para_id: 'para_9', proof_verbatim: 'not here' })).toBeNull();
  });
});
