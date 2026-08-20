// concepts/lexicon — SEED the interpretive lexicon: the cumulative, authority-ranked, CITED map of
// symbol → interpretation. Deterministic aggregation (no AI) of the interpretation-claims the extract found
// in a higher text (the higher texts ARE interpretation, so extracting them POPULATES the lexicon). Grows
// TOP-DOWN as books are processed in authority order; later spent bottom-up by concepts/reconcile. Each entry
// carries its authority + interpretive tier + verbatim proof.
export async function seed(ctx, docId, opts = {}) {
  const authority = opts.authority ?? (await ctx.store.getDocMeta(docId)).title ?? String(docId);
  const authorityTier = opts.authorityTier ?? ctx.config.authorityTiers?.[docId] ?? 50; // lower = higher authority
  const version = opts.version ?? ctx.config.versions?.conceptExtract ?? 'concept-extract-v1';
  const claims = await ctx.store.getConceptInterpretations(docId);
  const entries = claims.map((c) => lexiconEntry(c, { authority, authorityTier, methodVersion: version }));
  // Idempotent: clear this doc's prior lexicon entries (same method version) before re-seeding, so a re-run
  // after more claims are extracted refreshes rather than duplicates.
  if (!opts.dryRun) await ctx.store.clearLexicon?.(docId, version);
  const written = opts.dryRun ? 0 : await ctx.store.saveLexiconEntries(entries);
  const stats = { claims: claims.length, entries: entries.length, written };
  ctx.log.info?.({ docId, ...stats }, 'concepts/lexicon.seed');
  return stats;
}

// An interpretation claim (symbol → what an authority says it means) becomes a cited lexicon entry.
// §6 requires literal and metaphorical to be DISTINCT, ATTRIBUTED layers. This used to be hardcoded to
// 'metaphorical', so every entry claimed to be a metaphor — including "Chicago = the first Bahá'í center in
// the Western world", a plain fact about a city, which is precisely the over-binding §6 warns against.
//
// Only three of the extractor's relations are unambiguously figurative. `means` and `teaches` span both —
// "the Sun of Truth MEANS Bahá'u'lláh" is metaphor, "Chicago MEANS the first Bahá'í center" is not — and only
// the extractor sees enough to tell. So an undetermined layer is NULL, never a default guess: under-bind
// rather than assert. A claim that states its own layer is always honoured.
//
// The complete fix is for the extractor to emit `layer` per claim; that needs a column on concept_claims
// (migration 90 has none) and so a migration + CURRENT_VERSION bump. Deliberately not smuggled in here.
const FIGURATIVE = new Set(['symbolizes', 'interprets', 'fulfills']);
export function layerOf(c) {
  if (c?.layer === 'literal' || c?.layer === 'metaphorical') return c.layer;
  return FIGURATIVE.has(String(c?.relation || '').toLowerCase()) ? 'metaphorical' : null;
}

export function lexiconEntry(c, { authority, authorityTier, methodVersion }) {
  return {
    symbol: c.subject,
    interpretation: c.target || c.statement || '',
    authority, authorityTier, layer: layerOf(c),
    proofDocId: c.doc_id, proofParaId: c.para_id, proofVerbatim: c.proof_verbatim,
    methodVersion,
  };
}
