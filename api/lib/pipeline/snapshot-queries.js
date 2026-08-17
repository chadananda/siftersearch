// The snapshot's expensive queries, in ONE place, so the diagnostic that EXPLAINs them and the code that
// RUNS them cannot drift apart. A query plan captured for a slightly different string is worse than no
// plan: it answers a question nobody asked, confidently.
//
// Why this exists: by-language was rewritten (95.8s → 50.8s), then given a covering index on Chad's call,
// and the index did NOTHING (55.0s with it in place). Two rounds of reasoning about what SQLite "must" be
// doing, both wrong. The next change gets made against the planner's actual output (2026-08-15).

/** Per-language doc/paragraph tally + embedding/sync backlog. The single most expensive query in the system. */
export const BY_LANGUAGE_SQL = `
        WITH per_doc AS (
          SELECT doc_id,
            COUNT(*) AS paras,
            SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS pend_emb,
            SUM(CASE WHEN synced = 0 AND embedding IS NOT NULL THEN 1 ELSE 0 END) AS pend_sync,
            SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced
          FROM content WHERE deleted_at IS NULL GROUP BY doc_id)
        SELECT d.language,
          COUNT(d.id) as doc_count,
          COALESCE(SUM(pd.paras), 0) as paragraph_count,
          COALESCE(SUM(pd.pend_emb), 0) as pending_embedding,
          COALESCE(SUM(pd.pend_sync), 0) as pending_sync,
          COALESCE(SUM(pd.synced), 0) as synced
        FROM docs d
        LEFT JOIN per_doc pd ON pd.doc_id = d.id
        WHERE d.deleted_at IS NULL
        GROUP BY d.language
        ORDER BY paragraph_count DESC`;

/** Just the CTE — the half believed to carry the cost. EXPLAINing it alone isolates the scan from the join. */
export const PER_DOC_ROLLUP_SQL = `
          SELECT doc_id,
            COUNT(*) AS paras,
            SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS pend_emb,
            SUM(CASE WHEN synced = 0 AND embedding IS NOT NULL THEN 1 ELSE 0 END) AS pend_sync,
            SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced
          FROM content WHERE deleted_at IS NULL GROUP BY doc_id`;

/** A control: the same shape WITHOUT the embedding expression, to test whether that is what blocks the index. */
export const PER_DOC_NO_EMBEDDING_SQL = `
          SELECT doc_id, COUNT(*) AS paras, SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced
          FROM content WHERE deleted_at IS NULL GROUP BY doc_id`;

export const NAMED_QUERIES = {
  'by-language': BY_LANGUAGE_SQL,
  'per-doc-rollup': PER_DOC_ROLLUP_SQL,
  'per-doc-no-embedding': PER_DOC_NO_EMBEDDING_SQL,
  // The REPLACEMENT queries. lang-pending-embedding is now the slowest thing in the system (50.1s), i.e.
  // the fix I shipped for by-language became the worst query it was meant to cure. I assumed the partial
  // index on `embedding IS NULL` would drive it and touch only ~34k pending rows. That is an assumption,
  // and assumptions about this exact query family have been wrong four times running — so it gets EXPLAINed
  // before it gets edited (2026-08-17).
  'lang-totals': LANG_TOTALS_SQL,
  'lang-pending-embedding': LANG_PENDING_EMBEDDING_SQL,
  'lang-pending-sync': LANG_PENDING_SYNC_SQL,
};


// ── The by-language rollup, WITHOUT scanning every paragraph ────────────────────────────────────────────
// EXPLAIN QUERY PLAN settled it: the old form was already an index scan
// (SCAN content USING INDEX idx_content_doc_id_cover), so the 55s was never wide-row reads — it was simply
// visiting ~6.7M index entries to GROUP BY doc_id. No index can shortcut counting every row, which is why
// the covering index added in migration 116 was never used and bought nothing.
//
// So stop counting every row. Totals come from docs (158k rows), and the BACKLOG comes from queries that
// touch only pending paragraphs (~34k) via the existing partial indexes. Three cheap queries instead of one
// enormous one (Chad approved 2026-08-15).
//
// TRADE-OFF, stated plainly: paragraph_count now comes from the denormalised docs.paragraph_count rather
// than from COUNT(content.id). If that column ever drifts from reality, this reports the drift. That is a
// real cost, accepted because the alternative is a 55-second freeze six times a day — and drift in
// docs.paragraph_count is itself worth surfacing rather than papering over with a full recount.

export const LANG_TOTALS_SQL = `
  SELECT COALESCE(language, '') AS language,
         COUNT(*) AS doc_count,
         COALESCE(SUM(paragraph_count), 0) AS paragraph_count
    FROM docs WHERE deleted_at IS NULL
   GROUP BY COALESCE(language, '')`;

/** Pending-embedding backlog per language. Touches ONLY rows with embedding IS NULL (partial index). */
export const LANG_PENDING_EMBEDDING_SQL = `
  SELECT COALESCE(d.language, '') AS language, COUNT(*) AS n
    FROM content c JOIN docs d ON d.id = c.doc_id
   WHERE c.embedding IS NULL AND c.deleted_at IS NULL AND d.deleted_at IS NULL
   GROUP BY COALESCE(d.language, '')`;

/** Pending-sync backlog per language. Touches ONLY unsynced rows (partial index). */
export const LANG_PENDING_SYNC_SQL = `
  SELECT COALESCE(d.language, '') AS language, COUNT(*) AS n
    FROM content c JOIN docs d ON d.id = c.doc_id
   WHERE c.synced = 0 AND c.embedding IS NOT NULL AND c.deleted_at IS NULL AND d.deleted_at IS NULL
   GROUP BY COALESCE(d.language, '')`;

/**
 * Merge the three results into the shape the snapshot has always published. Pure, so the arithmetic —
 * especially `synced`, which is now DERIVED — is testable without a database.
 */
export function mergeByLanguage(totals = [], pendingEmb = [], pendingSync = []) {
  const emb = Object.fromEntries(pendingEmb.map((r) => [r.language, Number(r.n) || 0]));
  const syn = Object.fromEntries(pendingSync.map((r) => [r.language, Number(r.n) || 0]));
  return totals
    .map((t) => {
      const paragraph_count = Number(t.paragraph_count) || 0;
      const pending_embedding = emb[t.language] || 0;
      const pending_sync = syn[t.language] || 0;
      // Derived, and CLAMPED at zero: if docs.paragraph_count under-counts relative to the live rows, the
      // subtraction can go negative, and a negative "synced" would be a nonsense number presented as fact.
      const synced = Math.max(0, paragraph_count - pending_embedding - pending_sync);
      return { language: t.language, doc_count: Number(t.doc_count) || 0, paragraph_count,
        pending_embedding, pending_sync, synced };
    })
    .sort((a, b) => b.paragraph_count - a.paragraph_count);
}
