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
};
