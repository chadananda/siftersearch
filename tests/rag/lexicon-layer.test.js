// §6: "Literal + metaphorical are distinct, attributed layers." lexiconEntry hardcoded 'metaphorical', so
// every entry claimed to be a metaphor — including "Chicago = the first Bahá'í center in the Western world",
// a literal fact about a city. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { lexiconEntry } from '../../api/lib/rag/concepts/lexicon.js';

const meta = { authority: 'God Passes By', authorityTier: 0, methodVersion: 'v1' };
const claim = (relation) => ({ subject: 'x', target: 'y', relation, proof_verbatim: 'p', para_id: 'p1', doc_id: 1 });

describe('lexiconEntry layer', () => {
  it('marks an explicitly figurative relation metaphorical', () => {
    expect(lexiconEntry(claim('symbolizes'), meta).layer).toBe('metaphorical');
  });
  it('marks prophetic interpretation/fulfilment metaphorical', () => {
    expect(lexiconEntry(claim('interprets'), meta).layer).toBe('metaphorical');
    expect(lexiconEntry(claim('fulfills'), meta).layer).toBe('metaphorical');
  });
  it('does NOT claim a layer it cannot determine — "means" spans both', () => {
    // "the Sun of Truth MEANS Bahá'u'lláh" is metaphor; "Chicago MEANS the first Bahá'í center" is literal.
    // Only the extractor sees enough to judge, so an undetermined layer must be null, never a default guess.
    expect(lexiconEntry(claim('means'), meta).layer).toBeNull();
    expect(lexiconEntry(claim('teaches'), meta).layer).toBeNull();
  });
  it('honours a layer the claim states explicitly, whatever the relation', () => {
    expect(lexiconEntry({ ...claim('means'), layer: 'literal' }, meta).layer).toBe('literal');
    expect(lexiconEntry({ ...claim('symbolizes'), layer: 'literal' }, meta).layer).toBe('literal');
  });
  it('never invents a layer for an unknown relation', () => {
    expect(lexiconEntry(claim('ranks'), meta).layer).toBeNull();
    expect(lexiconEntry(claim(undefined), meta).layer).toBeNull();
  });
});
