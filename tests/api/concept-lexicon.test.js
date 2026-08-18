// Interpretive lexicon (conceptual track §3/§6). RED-first: these encode the doctrine
// the module must obey, not the implementation.
import { describe, it, expect } from 'vitest';
import {
  interpretiveRank, addEntry, bindOccurrence, conceptKey, RANK
} from '../../api/lib/rag/concepts/lexicon.js';

const cite = { docId: 20810, paraId: 4211, span: 'the clouds of heaven are the abrogation of laws' };
const cloudsEntry = {
  root: 'سحاب', gloss: 'clouds', sense: 'that which veils recognition of the Manifestation',
  authority: 'bahaullah', citation: cite
};

describe('interpretive authority ranking', () => {
  it('ranks the LAST authorized interpreter highest — precedence of designated role, not station', () => {
    expect(interpretiveRank('shoghi-effendi')).toBeGreaterThan(interpretiveRank('abdul-baha'));
    expect(interpretiveRank('abdul-baha')).toBeGreaterThan(interpretiveRank('bahaullah'));
  });
  it('puts every authorized voice above any scholar — scholars fill gaps, never override', () => {
    expect(interpretiveRank('bahaullah')).toBeGreaterThan(interpretiveRank('scholar'));
    expect(interpretiveRank('unknown-source')).toBe(RANK.NONE);
  });
});

describe('lexicon entries are CITED interpretations, never invented meaning', () => {
  it('accepts an entry carrying a real proof citation', () => {
    const lex = addEntry([], cloudsEntry);
    expect(lex).toHaveLength(1);
    expect(lex[0].citation.docId).toBe(20810);
  });
  it('REJECTS an entry with no citation', () => {
    expect(() => addEntry([], { ...cloudsEntry, citation: null })).toThrow(/citation/i);
  });
  it('REJECTS an entry whose citation has no proof span', () => {
    expect(() => addEntry([], { ...cloudsEntry, citation: { docId: 20810, paraId: 4211 } })).toThrow(/span/i);
  });
});

describe('concept identity is the ROOT, not the English label', () => {
  it('keys on the original-language root so one English word cannot collapse two concepts', () => {
    // insáf (personal equity) and ‘adl (societal justice) both gloss as "justice"
    expect(conceptKey({ root: 'انصاف', gloss: 'justice' }))
      .not.toBe(conceptKey({ root: 'عدل', gloss: 'justice' }));
  });
  it('treats the same root under different romanizations as ONE concept', () => {
    expect(conceptKey({ root: 'عدل', gloss: 'justice' })).toBe(conceptKey({ root: 'عدل', gloss: 'equity' }));
  });
});

describe('binding an occurrence — under-bind rather than force', () => {
  const lex = addEntry([], cloudsEntry);
  it('binds when the context fits the authoritative sense', () => {
    const b = bindOccurrence(lex, { surface: 'clouds', context: 'the Son of Man coming in the clouds of heaven, the advent of the awaited One' });
    expect(b).not.toBeNull();
    expect(b.root).toBe('سحاب');
    expect(b.citation.docId).toBe(20810);
  });
  it('does NOT bind a surface match whose context does not fit (a weather cloud)', () => {
    expect(bindOccurrence(lex, { surface: 'clouds', context: 'the sky was grey and heavy clouds brought rain over the fields' })).toBeNull();
  });
  it('adds the interpretive layer WITHOUT claiming the literal reading is wrong', () => {
    const b = bindOccurrence(lex, { surface: 'clouds', context: 'coming in the clouds of heaven at the advent of the promised Manifestation' });
    expect(b.layer).toBe('metaphorical');
    expect(b.replacesLiteral).toBe(false);
  });
});
