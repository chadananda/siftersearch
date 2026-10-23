// Migration 180 (10-23 content write cost): content indexes no query needs — each one a b-tree every INSERT into content
// also writes — and the missing indexes that made every DELETE FROM content scan a child table (foreign_keys is ON in
// better-sqlite3: deleting a parent row looks up each child by its key column, a FULL SCAN when no index leads with it).
// Evidence per index: planning/content-write-cost-20261023.md (tower inventory via the table-schema ops report).
// Only exact duplicates / exact prefixes under the same WHERE, and indexes on a column no SQL anywhere filters on.

export const CONTENT_INDEX_DROPS = {
  // identical (doc_id, updated_at DESC) WHERE synced = 0 AND deleted_at IS NULL — made by hand on tower, in no migration
  idx_content_doc_upd_unsynced: 'exact duplicate of idx_content_dirty_doc_updated',
  // (synced) vs (synced, deleted_at), both WHERE synced = 0 AND deleted_at IS NULL
  idx_content_unsynced: 'exact prefix of idx_content_unsynced_partial (same WHERE)',
  // (enhanced_synced) vs (enhanced_synced, deleted_at), both WHERE enhanced_synced = 0 AND deleted_at IS NULL
  idx_content_unsynced_enhanced: 'exact prefix of idx_content_enhanced_unsynced (same WHERE)',
  // (doc_id) vs (doc_id, deleted_at), both WHERE deleted_at IS NULL — tower only
  idx_content_doc_id_cover: 'exact prefix of idx_content_doc_deleted (same WHERE)',
  // no SQL in api/ scripts/ worker/ filters, joins or groups content by content_hash (the ingester matches hashes in
  // memory over the doc's rows, fetched by doc_id); 0 plans in 30 days of slow_query_log. A random-key b-tree: one more
  // leaf page dirtied per inserted row.
  idx_content_hash: 'content_hash is never a predicate',
  idx_content_hash_embedding: 'content_hash is never a predicate',
};

/** Child tables whose FOREIGN KEY → content(id) had no index on the key (tower 10-23: paragraph_extractions 18k rows,
 *  the rest empty). paragraph-dependents.js also deletes by these columns before every re-ingest DELETE. */
export const CONTENT_CHILD_FK_INDEXES = [
  { table: 'paragraph_extractions', column: 'content_id', name: 'idx_paragraph_extractions_content' },
  { table: 'paragraph_roles', column: 'content_id', name: 'idx_paragraph_roles_content' },
  { table: 'quote_instances', column: 'content_id', name: 'idx_quote_instances_content' },
  { table: 'set_members', column: 'source_paragraph_id', name: 'idx_set_members_source_paragraph' },
  { table: 'significance_markers', column: 'source_paragraph_id', name: 'idx_significance_markers_source_paragraph' },
  { table: 'pending_bridge_relations', column: 'evidence_paragraph_id', name: 'idx_pending_bridge_relations_evidence_paragraph' },
];

export const dropStatements = () => Object.keys(CONTENT_INDEX_DROPS).map((n) => `DROP INDEX IF EXISTS ${n}`);   // tests
export const childIndexSql = ({ table, column, name }) => `CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${column})`;
