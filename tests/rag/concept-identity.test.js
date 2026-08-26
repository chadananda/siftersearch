// Concept identity — the prerequisite for cross-referencing a concept from a historical text back to its
// expression in the core Writings.
//
// Measured 2026-08-25: 6,449 distinct subjects across 9,707 claims, only 162 appearing in 3+ books.
// `Mashriqu'l-Adhkár` alone had NINE surface forms differing only in diacritics and apostrophe style;
// `Administrative Order` and `the Administrative Order` were two identities holding 117 claims.
// Deterministic folding collapses 674 such groups covering 3,626 claims — 37% of everything extracted.
//
// TWO TIERS, deliberately, and conflating them is how an identity model over-merges:
//   canonicalSurface() — folds TRUE variants (diacritics, case, article, apostrophes). Safe to merge on.
//   recallKeys()       — translit-invariant skeleton keys, reusing the entity track's skeletonKeys.
//                        RECALL ONLY. Proposes candidates; never merges on its own.
import { describe, it, expect } from 'vitest';
import { canonicalSurface, recallKeys, groupBySurface, isLikelyConcept } from '../../api/lib/rag/concepts/identity.js';

describe('canonicalSurface — deterministic variant folding', () => {
  it('folds the definite article', () => {
    expect(canonicalSurface('the Administrative Order')).toBe(canonicalSurface('Administrative Order'));
  });

  it('folds diacritics and apostrophe style — nine Mashriqu\'l-Adhkár variants were one concept', () => {
    const forms = ["Mashriqu'l-Adhkar", "Mashriqu'l-Adhkár", 'Mashriqu’l-Adhkár',
      'Mashriqu’l-Aḏhkár', 'Mas̱hriqu’l-Aḏhkár', "the Mas̱hriqu'l-Aḏhkár"];
    expect(new Set(forms.map(canonicalSurface)).size).toBe(1);
  });

  it('folds case', () => expect(canonicalSurface('The Faith')).toBe(canonicalSurface('faith')));

  it('does NOT merge genuinely different concepts', () => {
    expect(canonicalSurface('the Covenant')).not.toBe(canonicalSurface('the Cause'));
    expect(canonicalSurface('the Báb')).not.toBe(canonicalSurface("Bahá'u'lláh"));
  });

  it('is stable and idempotent', () => {
    const once = canonicalSurface('the Kitáb-i-Aqdas');
    expect(canonicalSurface(once)).toBe(once);
  });

  it('never returns empty for a real surface', () => {
    expect(canonicalSurface('the Covenant').length).toBeGreaterThan(0);
  });
});

describe('recallKeys — candidates only, never a merge decision', () => {
  it('is translit-invariant across spellings of one term', () => {
    const a = recallKeys("Mashriqu'l-Adhkár"), b = recallKeys('the Mas̱hriqu’l-Aḏhkár');
    expect([...a].some((k) => b.has(k))).toBe(true);
  });

  it('returns a Set so callers cannot treat it as an ordered ranking', () => {
    expect(recallKeys('the Covenant')).toBeInstanceOf(Set);
  });

  it('tolerates empty input without throwing', () => {
    expect(recallKeys('')).toBeInstanceOf(Set);
    expect(recallKeys(null).size).toBe(0);
  });
});

describe('groupBySurface', () => {
  it('groups variants and reports the members it merged, so a merge is auditable', () => {
    const g = groupBySurface(['Administrative Order', 'the Administrative Order', 'the Covenant']);
    const admin = g.find((x) => x.members.length > 1);
    expect(admin.members.sort()).toEqual(['Administrative Order', 'the Administrative Order']);
    expect(g).toHaveLength(2);
  });

  it('picks the most frequent surface as the display form, not the first seen', () => {
    const g = groupBySurface(['the Faith', 'Faith', 'the Faith', 'the Faith']);
    expect(g[0].canonical).toBe('the Faith');
  });
});

// The OTHER half of the identity problem, and the one folding cannot fix: the extractor emits ad-hoc
// noun phrases from the passage alongside real concepts. Sampled singles included "pioneering at home",
// "double crusade", "Teaching Conferences", "garb of a prisoner" — none of which is a doctrinal concept.
// Project doctrine: the concept type is significant doctrinal/technical terms, NEVER generic phrases.
describe('isLikelyConcept — a heuristic FLAG, never a deletion', () => {
  it('accepts established doctrinal terms', () => {
    for (const s of ['the Covenant', 'the Most Great Peace', 'Mashriqu’l-Adhkár', 'the Sun of Truth'])
      expect(isLikelyConcept(s)).toBe(true);
  });

  it('flags passage-specific phrases seen in the real data', () => {
    for (const s of ['pioneering at home', 'garb of a prisoner', 'Education of children', 'double crusade'])
      expect(isLikelyConcept(s)).toBe(false);
  });

  it('never judges by frequency — a rare concept in a barely-read corpus is still a concept', () => {
    // "the two Witnesses" occurs ONCE today only because 61% of the Íqán has never been extracted.
    // Pruning by count would encode our coverage gaps as doctrinal judgements.
    expect(isLikelyConcept('the two Witnesses')).toBe(true);
  });
});
