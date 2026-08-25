// The ONE classification of extractor relations: which express a symbol's SENSE (and so belong in the
// interpretive lexicon) and which express something else.
//
// Why this is its own module: the extractor emits an OPEN vocabulary — it invents relations as the text
// warrants, and 20+ have appeared in production. The lexicon consumed a CLOSED whitelist of five inlined
// in a SQL string, and everything else was dropped SILENTLY. That is how "the clouds SIGNIFIES the
// annulment of laws, the abrogation of former Dispensations" sat extracted and proof-gated in
// concept_claims while the lexicon carried no abrogation sense at all (2026-08-25).
//
// Only 7 claims were affected corpus-wide — and two were exactly the senses the gold standard wanted.
// Impact is not proportional to count, so "only a few rows" is never the argument.
//
// An open producer feeding a closed consumer needs a DETECTOR, not just a longer list: `unknownRelations`
// reports anything classified by neither side, so the next invented verb surfaces instead of vanishing.
// Deps: none (pure).

// Symbol → what it MEANS. These build the sense inventory.
export const INTERPRETATION_RELATIONS = Object.freeze([
  'means', 'signifies', 'symbolizes', 'represents', 'denotes', 'refers-to', 'stands-for',
  'alludes-to', 'typifies', 'interprets', 'is-station-of', 'fulfills', 'foreshadows',
]);

// Real claims, but not claims about what a symbol MEANS.
//
// `teaches` is the load-bearing exclusion: 7,280 claims, 75% of everything extracted. "X teaches Y" is
// what a passage instructs, not what a symbol denotes — admitting it would swamp the sense inventory
// three-to-one with non-senses. `ranks` is likewise deliberate: relative importance is Shoghi Effendi's
// characteristic contribution (47 claims in GPB, none in the Íqán) and it is a judgement ABOUT a concept
// rather than a reading OF one.
export const NON_INTERPRETIVE_RELATIONS = Object.freeze([
  'teaches', 'ranks', 'is', 'are', 'prohibits', 'establishes', 'proclaims', 'affirms',
  'demonstrates', 'should-be', 'reveals', 'requires', 'warns', 'promises', 'condemns',
]);

const norm = (r) => String(r ?? '').trim().toLowerCase();
const KNOWN = new Set([...INTERPRETATION_RELATIONS, ...NON_INTERPRETIVE_RELATIONS]);

export const isInterpretation = (r) => INTERPRETATION_RELATIONS.includes(norm(r));

/**
 * Relations classified by NEITHER list — the detector. Feed it the distinct relations present in
 * concept_claims; a non-empty result means the extractor invented something the lexicon will drop.
 * Empty/null entries are ignored: a missing relation is a different defect, not an unknown vocabulary.
 */
export function unknownRelations(relations = []) {
  const seen = new Set();
  for (const r of relations) {
    const n = norm(r);
    if (n && !KNOWN.has(n)) seen.add(n);
  }
  return [...seen];
}
