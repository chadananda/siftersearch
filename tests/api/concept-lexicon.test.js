// Interpretive lexicon (conceptual track §3/§6). RED-first: these encode the doctrine
// the module must obey, not the implementation.
//
// POLYSEMY IS THE GOVERNING DOCTRINE HERE (Chad, 2026-08-23):
//   "these are symbolic works. So even if the word cloud is used in a very specific story in the Bible,
//    it doesn't mean that it doesn't ALSO have symbolic meanings. We have to be very careful about not
//    trying to PICK the meaning, because there will always be multiple meanings that are implicit."
// So binding returns the SET of senses an occurrence carries, ranked — never a winner. The first version
// of this module returned fit[0] and let a weather word VETO the symbolic reading; both are now errors
// the tests below exist to prevent.
import { describe, it, expect } from 'vitest';
import {
  interpretiveRank, addEntry, bindSenses, scoreSense, conceptKey, RANK
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

describe('binding an occurrence — return every sense, never pick one', () => {
  const rainEntry = {
    root: 'سحاب', gloss: 'clouds', sense: 'the literal rain-bearing cloud of the natural world',
    authority: 'scholar', citation: { docId: 20810, paraId: 4212, span: 'clouds that carry the rain' },
  };
  const lex = addEntry(addEntry([], cloudsEntry), rainEntry);

  it('binds the authoritative sense when the context is plainly doctrinal', () => {
    const b = bindSenses(lex, { surface: 'clouds', context: 'the Son of Man coming in the clouds of heaven, the advent of the awaited One' });
    expect(b.length).toBeGreaterThan(0);
    expect(b.map((s) => s.root)).toContain('سحاب');
    expect(b[0].citation.docId).toBe(20810);
  });

  it('returns ALL fitting senses ranked — a set, never a single winner', () => {
    const b = bindSenses(lex, { surface: 'clouds', context: 'coming in the clouds of heaven at the advent of the promised Manifestation' });
    expect(Array.isArray(b)).toBe(true);
    expect(b.length).toBeGreaterThan(1);
    // ranked by score, then authority — but the lower-ranked sense is still PRESENT
    expect(b[0].score).toBeGreaterThanOrEqual(b[b.length - 1].score);
  });

  it('a mundane context must NOT veto the symbolic sense — the whole polysemy correction', () => {
    const b = bindSenses(lex, { surface: 'clouds', context: 'the sky was grey and heavy clouds brought rain over the fields' });
    const senses = b.map((s) => s.sense);
    expect(senses).toContain('the literal rain-bearing cloud of the natural world');
    // The symbolic reading SURVIVES a concrete context. In a symbolic work the weather is also a sign.
    expect(senses).toContain('that which veils recognition of the Manifestation');
  });

  it('ranks the doctrinal sense higher in a doctrinal context and the literal higher in a concrete one — without deleting either', () => {
    const doctrinal = bindSenses(lex, { surface: 'clouds', context: 'the advent of the promised Manifestation, the day of resurrection' });
    const concrete = bindSenses(lex, { surface: 'clouds', context: 'heavy clouds brought rain over the fields' });
    expect(doctrinal[0].sense).toBe('that which veils recognition of the Manifestation');
    expect(concrete[0].sense).toBe('the literal rain-bearing cloud of the natural world');
    expect(doctrinal).toHaveLength(2);
    expect(concrete).toHaveLength(2);
  });

  it('higher interpretive authority outranks lower at equal fit, but never suppresses it', () => {
    const shoghi = { ...cloudsEntry, authority: 'shoghi-effendi', sense: 'the veils of human learning',
      citation: { docId: 20894, paraId: 12, span: 'clouds signify the veils of human learning' } };
    const l2 = addEntry(addEntry([], cloudsEntry), shoghi);
    const b = bindSenses(l2, { surface: 'clouds', context: 'the advent of the promised Manifestation' });
    expect(b[0].authority).toBe('shoghi-effendi');
    expect(b).toHaveLength(2);
  });

  it('every returned sense is ADDITIVE — reading metaphorically never falsifies the literal', () => {
    const b = bindSenses(lex, { surface: 'clouds', context: 'coming in the clouds of heaven at the advent of the promised Manifestation' });
    for (const s of b) expect(s.replacesLiteral).toBe(false);
  });

  it('every returned sense carries its own citation — an uncited sense is an invention', () => {
    const b = bindSenses(lex, { surface: 'clouds', context: 'the advent of the promised Manifestation' });
    for (const s of b) {
      expect(s.citation?.docId).toBeTruthy();
      expect(String(s.citation?.span || '')).not.toHaveLength(0);
    }
  });

  it('returns an EMPTY ARRAY, never null, when the surface is unknown', () => {
    expect(bindSenses(lex, { surface: 'zebra', context: 'the advent of the promised One' })).toEqual([]);
    expect(bindSenses(lex, { surface: '', context: 'anything' })).toEqual([]);
  });

  it('scoreSense grades fit rather than gating it — no score is ever a hard zero for a real sense', () => {
    const doctrinal = scoreSense(cloudsEntry, { context: 'the advent of the promised Manifestation' });
    const mundane = scoreSense(cloudsEntry, { context: 'heavy rain over the fields' });
    expect(doctrinal).toBeGreaterThan(mundane);
    expect(mundane).toBeGreaterThan(0);   // a concrete context LOWERS the symbolic reading, never kills it
  });

  it('accepts an injected judge — real sense-scoring belongs to a model reading the passage', () => {
    const judge = () => 0.5;
    const b = bindSenses(lex, { surface: 'clouds', context: 'anything at all' }, { judge });
    expect(b).toHaveLength(2);
    expect(b.every((s) => s.score === 0.5)).toBe(true);
  });
});
