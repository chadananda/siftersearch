// The lexicon's relation whitelist — an OPEN producer feeding a CLOSED consumer.
//
// The extractor invents relations freely (20+ seen: teaches, means, symbolizes, signifies, represents,
// ranks, is, proclaims, affirms, prohibits, foreshadows…). getConceptInterpretations() accepted five.
// Anything else was dropped SILENTLY — which is how "the clouds SIGNIFIES the annulment of laws, the
// abrogation of former Dispensations" sat extracted and proof-gated in concept_claims while the lexicon
// had no abrogation sense and recall for clouds stuck at 50% (2026-08-25).
//
// Only 7 claims were affected corpus-wide, and two of them were the exact senses the gold standard wanted:
// impact is not proportional to count, so "it's only a few rows" is never the test.
import { describe, it, expect } from 'vitest';
import { INTERPRETATION_RELATIONS, NON_INTERPRETIVE_RELATIONS, unknownRelations } from '../../api/lib/rag/concepts/relations.js';

describe('interpretation relations', () => {
  it('includes the definitional verbs of scriptural exegesis', () => {
    for (const r of ['means', 'signifies', 'symbolizes', 'represents', 'denotes', 'interprets']) {
      expect(INTERPRETATION_RELATIONS).toContain(r);
    }
  });

  it('still EXCLUDES teaches — 7,280 claims of doctrine content, not symbol sense', () => {
    // The lexicon maps symbol → meaning. "X teaches Y" is what a passage instructs, a different claim.
    // Including it would swamp the sense inventory 75:25 with non-senses.
    expect(INTERPRETATION_RELATIONS).not.toContain('teaches');
    expect(NON_INTERPRETIVE_RELATIONS).toContain('teaches');
  });

  it('excludes ranks — that is relative importance, which is GPB\'s characteristic contribution', () => {
    expect(INTERPRETATION_RELATIONS).not.toContain('ranks');
    expect(NON_INTERPRETIVE_RELATIONS).toContain('ranks');
  });

  it('classifies every relation seen in production as one or the other', () => {
    const seen = ['teaches', 'means', 'symbolizes', 'is-station-of', 'signifies', 'interprets', 'ranks',
      'fulfills', 'is', 'are', 'prohibits', 'establishes', 'proclaims', 'affirms', 'demonstrates',
      'should-be', 'reveals', 'foreshadows', 'represents'];
    expect(unknownRelations(seen)).toEqual([]);
  });
});

describe('unknownRelations — the detector that stops silent drops', () => {
  it('reports a relation belonging to NEITHER list, so a new one surfaces instead of vanishing', () => {
    expect(unknownRelations(['means', 'newly-invented-verb'])).toEqual(['newly-invented-verb']);
  });

  it('returns empty when everything is classified', () => {
    expect(unknownRelations(['means', 'teaches'])).toEqual([]);
  });

  it('is case- and whitespace-insensitive — the model does not guarantee formatting', () => {
    expect(unknownRelations([' MEANS ', 'Teaches'])).toEqual([]);
  });

  it('ignores empty/null entries rather than reporting them as unknown relations', () => {
    expect(unknownRelations(['', null, undefined, 'means'])).toEqual([]);
  });
});
