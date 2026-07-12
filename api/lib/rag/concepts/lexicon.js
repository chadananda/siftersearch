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
export function lexiconEntry(c, { authority, authorityTier, methodVersion }) {
  return {
    symbol: c.subject,
    interpretation: c.target || c.statement || '',
    authority, authorityTier, layer: 'metaphorical',
    proofDocId: c.doc_id, proofParaId: c.para_id, proofVerbatim: c.proof_verbatim,
    methodVersion,
  };
}
