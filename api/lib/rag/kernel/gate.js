// kernel/gate — enforce pipeline order: no entity/concept stage runs on a document whose disambiguation is
// incomplete (extracting from un-disambiguated text builds on sand). Coverage comes from the store (host
// schema); the threshold is a config knob. Throws to stop the calling stage.
export async function assertDisambiguated(ctx, docId, { threshold = 0.99 } = {}) {
  const ratio = await ctx.store.getDisambigCoverage(docId);
  if (ratio < threshold) {
    throw new Error(`CorpusRAG: doc ${docId} is ${(ratio * 100).toFixed(1)}% disambiguated (< ${(threshold * 100)}%) — run disambiguate first`);
  }
  return ratio;
}
