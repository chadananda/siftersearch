// The pairing rule for enrichment carried forward on re-ingest (indexer + sites-ingester both harvest bundles
// from rows with a matching normalized_hash). A note and its VERSION STAMP must travel together: a stamp with no
// note mints a paragraph that disambiguate's resume skips ("already at this version") while every coverage
// measure counts it un-disambiguated — the book then fails its next stage's gate forever with zero model calls
// ("did not reach verify", 2026-08-12). Same rule for HyPE questions and their thesis.
export function carriedEnrichment(row = {}) {
  const context = row.context || null;
  const hyp_questions = row.hyp_questions || null;
  return {
    hyp_thesis: hyp_questions ? row.hyp_thesis || null : null,
    hyp_questions,
    context,
    context_model: context ? row.context_model || null : null,
  };
}
