// concept_entities has NO writer anywhere in the codebase (verified: 0 INSERT/UPDATE), so an index that only
// reads that table can never fill. The lexicon DOES exist — 1,651 cited interpretations — and is what makes
// §6's "query one concept across traditions" possible today. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { lexiconDoc } from '../../api/lib/search/concepts.js';

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
