// Promotion: turn scattered lexicon entries into ONE record per concept, so a concept can be asked about
// across traditions and linked to its counterparts. Nothing wrote concept_entities before this. RED-FIRST.
import { describe, it, expect } from 'vitest';
import { conceptKeyOf, groupConcepts } from '../../api/lib/rag/concepts/promote.js';

const e = (symbol, interpretation, opts = {}) => ({
  symbol, interpretation, authority: opts.authority || 'God Passes By',
  authority_tier: opts.tier ?? 0, root: opts.root ?? null, layer: opts.layer ?? null,
  proof_doc_id: opts.doc ?? 1, proof_verbatim: opts.proof || 'p',
});

describe('conceptKeyOf — identity is the ROOT, not the English label', () => {
  it('keys on the root when present, so two senses of one English word stay apart', () => {
    expect(conceptKeyOf(e('justice', 'personal equity', { root: 'انصاف' })))
      .not.toBe(conceptKeyOf(e('justice', 'societal order', { root: 'عدل' })));
  });
  it('falls back to the normalised symbol when no root was captured', () => {
    expect(conceptKeyOf(e('The Clouds', 'x'))).toBe(conceptKeyOf(e('the  clouds', 'y')));
  });
});

describe('groupConcepts', () => {
  it('produces ONE record per concept, not one per interpretation', () => {
    const out = groupConcepts([e('the Covenant', 'the enduring bond'), e('the Covenant', 'binds the believers')]);
    expect(out).toHaveLength(1);
    expect(out[0].interpretations).toHaveLength(2);
  });
  it('canonical is the MOST-USED form, matching how person names are canonicalised', () => {
    const out = groupConcepts([e('the clouds', 'a'), e('the clouds', 'b'), e('The Clouds of Heaven', 'c')]);
    expect(out[0].canonical).toBe('the clouds');
  });
  it('keeps every variant as a rendering — the reader may know only one', () => {
    // Variants group only when they share a ROOT. Same root, different surface forms:
    const out = groupConcepts([e('the clouds', 'a', { root: 'سحاب' }), e('The Clouds of Heaven', 'b', { root: 'سحاب' })]);
    expect(out).toHaveLength(1);
    expect(out[0].renderings).toEqual(expect.arrayContaining(['the clouds', 'The Clouds of Heaven']));
  });
  it('does NOT merge a root-less entry into a rooted one, even with the same English label', () => {
    // This is the collapse §6 exists to prevent: insáf (personal equity) and ‘adl (societal justice) both
    // gloss "justice". Folding an unrooted "justice" into a rooted one could silently merge two different
    // concepts. Under-bind: leave them separate until evidence says otherwise (that is reconcile's job).
    const out = groupConcepts([e('justice', 'a'), e('justice', 'b', { root: 'عدل' })]);
    expect(out).toHaveLength(2);
  });
  it('summary comes from the HIGHEST authority — a lower reading never overrides a higher one', () => {
    const out = groupConcepts([
      e('the clouds', 'a scholar gloss', { authority: 'Some Scholar', tier: 50 }),
      e('the clouds', 'that which veils recognition', { authority: 'The Kitab-i-Iqan', tier: 3 }),
    ]);
    expect(out[0].summary).toBe('that which veils recognition');
    expect(out[0].authority).toBe('The Kitab-i-Iqan');
  });
  it('importance rises with the number of DISTINCT authorities, not raw repetition', () => {
    const many = [e('x', 'a'), e('x', 'b'), e('x', 'c')];                       // one authority, thrice
    const varied = [e('y', 'a'), e('y', 'b', { authority: 'The Iqan', tier: 3 })]; // two authorities
    expect(groupConcepts(varied)[0].importance).toBeGreaterThan(groupConcepts(many)[0].importance);
  });
  it('carries the root through onto the record it identifies', () => {
    const out = groupConcepts([e('justice', 'a', { root: 'عدل' }), e('justice', 'b', { root: 'عدل' })]);
    expect(out).toHaveLength(1);
    expect(out[0].root).toBe('عدل');
  });
  it('drops entries with no symbol rather than creating a nameless concept', () => {
    expect(groupConcepts([e('', 'orphan'), e(null, 'orphan')])).toEqual([]);
  });
});
