// entities/verify — the search-verification GATE that makes "done" enforceable. A book counts as grounded
// only when its cast (bound entities), its cited claims, and its HyPE questions actually RETURN from the live
// search indexes — not merely exist in tables. All querying is delegated to the adapter
// (store.getGroundingCoverage, which probes Meili + the DB); this stage holds only the pass/fail RULES and
// lists exactly what is missing, so the driver refuses to advance to the next book until it passes.
export async function run(ctx, docId, opts = {}) {
  const cov = await ctx.store.getGroundingCoverage(docId, opts);
  const missing = [];
  if (!(cov.castCount > 0)) missing.push('cast: no bound entities');
  if (!(cov.claimCount > 0)) missing.push('claims: none cited');
  if (!(cov.hypeIndexed > 0)) missing.push('hype: not returning from search');
  if (!(cov.paragraphsIndexed > 0)) missing.push('paragraphs: not indexed for search');
  for (const p of (cov.probes || [])) {
    if (!(p.hits > 0)) missing.push(`probe(${p.kind}): "${p.query}" returns nothing`);
  }
  const ok = missing.length === 0;
  const result = { docId, ok, checks: cov, missing };
  ctx.log.info?.({ docId, ok, missing }, 'entities/verify');
  return result;
}
