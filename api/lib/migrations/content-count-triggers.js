// The docs_with_content counter triggers on content (migration 39), rewritten by migration 179 (10-23). The originals asked
// `(SELECT COUNT(*) … WHERE doc_id = NEW.doc_id AND deleted_at IS NULL …) = 0` on EVERY row: a range scan over the doc's
// live rows per insert (O(n²) for a book), per soft-delete likewise. NOT EXISTS is the same predicate and stops at the first
// live row (idx_content_doc_deleted). Pure SQL strings so tests run the old and new forms side by side.
export const DOC_COUNT_TRIGGERS_V39 = {
  trg_content_insert_doc_count: `CREATE TRIGGER trg_content_insert_doc_count AFTER INSERT ON content
    WHEN NEW.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL AND id != NEW.id) = 0
    BEGIN
      UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs_with_content';
    END`,
  trg_content_delete_doc_count: `CREATE TRIGGER trg_content_delete_doc_count AFTER UPDATE OF deleted_at ON content
    WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      AND (SELECT COUNT(*) FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL) = 0
    BEGIN
      UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'docs_with_content';
    END`,
};

export const DOC_COUNT_TRIGGERS = {
  trg_content_insert_doc_count: `CREATE TRIGGER trg_content_insert_doc_count AFTER INSERT ON content
    WHEN NEW.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL AND id != NEW.id)
    BEGIN
      UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs_with_content';
    END`,
  trg_content_delete_doc_count: `CREATE TRIGGER trg_content_delete_doc_count AFTER UPDATE OF deleted_at ON content
    WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL)
    BEGIN
      UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'docs_with_content';
    END`,
};

/** DROP + CREATE per trigger, as one atomic batch (no window in which a row escapes the counter). */
export const docCountTriggerStatements = (defs = DOC_COUNT_TRIGGERS) => Object.entries(defs)
  .flatMap(([name, sql]) => [{ sql: `DROP TRIGGER IF EXISTS ${name}` }, { sql }]);
