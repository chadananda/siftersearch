/**
 * Soft-delete a document and all its content
 * Preserves embeddings for 30 days to avoid regenerating when re-importing similar content.
 * Content is immediately removed from Meilisearch search index.
 */
export async function removeDocument(documentId) {
  const now = new Date().toISOString();

  // Soft-delete: set deleted_at timestamp instead of DELETE
  // This preserves embeddings for potential reuse
  await content.softDeleteByDoc(documentId);
  await query('UPDATE docs SET deleted_at = ? WHERE id = ?', [now, documentId]);

  // Remove from Meilisearch immediately (exclude from search)
  try {
    await deleteFromMeilisearch(documentId);
  } catch (err) {
    // Log but don't fail - Meilisearch might not have this document
    logger.warn({ err: err.message, documentId }, 'Failed to remove from Meilisearch (may not exist)');
  }

  logger.info({ documentId }, 'Document soft-deleted (embeddings retained for 30 days)');
  return { documentId, removed: true, softDeleted: true };
}

/**
 * Hard-delete documents that have been soft-deleted for more than 30 days
 * Called periodically to clean up old embeddings
 */
export async function purgeOldDeletedContent(retentionDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  // Delete content first (foreign key), then docs
  const contentResult = await content.hardDeleteExpired(cutoffStr);
  const docsResult = await query(
    'DELETE FROM docs WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoffStr]
  );

  const contentDeleted = contentResult?.changes || 0;
  const docsDeleted = docsResult?.changes || 0;

  if (contentDeleted > 0 || docsDeleted > 0) {
    logger.info({
      contentDeleted,
      docsDeleted,
      retentionDays,
      cutoff: cutoffStr
    }, 'Purged old soft-deleted content');
  }

  return { contentDeleted, docsDeleted };
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats() {
  const docCount = await queryOne('SELECT COUNT(*) as count FROM docs');
  const contentTotal = await queryOne('SELECT COUNT(*) as count FROM content');
  const contentEmbedded = await queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL');
  const contentUnembedded = await queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NULL');
  const contentSynced = await queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 1');
  const contentUnsynced = await queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 0');

  return {
    documents: docCount?.count || 0,
    content: {
      total: contentTotal?.count || 0,
      embedded: contentEmbedded?.count || 0,
      unembedded: contentUnembedded?.count || 0,
      synced: contentSynced?.count || 0,
      unsynced: contentUnsynced?.count || 0
    }
  };
}

/**
 * Get documents that need embedding
 */
export async function getUnprocessedDocuments(limit = 100) {
  const results = await queryAll(`
    SELECT d.*,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.embedding IS NULL) as unembedded_count
    FROM docs d
    WHERE EXISTS (
      SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.embedding IS NULL
    )
    LIMIT ?
  `, [limit]);

  return results;
}

/**
 * Check if a file has been ingested (by path)
 * Excludes soft-deleted documents
 */
export async function isFileIngested(filePath) {
  const doc = await queryOne(
    'SELECT id, file_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL',
    [filePath]
  );
  return doc !== null;
}

/**
 * Get document by file path
 */
export async function getDocumentByPath(filePath) {
  // Exclude soft-deleted documents
  return queryOne(
    'SELECT * FROM docs WHERE file_path = ? AND deleted_at IS NULL',
    [filePath]
  );
}

/**
 * Get document by body hash (content without frontmatter)
 * Excludes soft-deleted documents
 */
export async function getDocumentByBodyHash(bodyHash) {
  return queryOne(
    'SELECT * FROM docs WHERE body_hash = ? AND deleted_at IS NULL',
    [bodyHash]
  );
}

/**
 * Check if body_hash exists at a different path (content was moved)
 * Excludes soft-deleted documents
 * @param {string} bodyHash - The body hash to check
 * @param {string} excludePath - The path to exclude from the search
 * @returns {Object|null} - The document at the new location, or null
 */
export async function getMovedDocumentByBodyHash(bodyHash, excludePath) {
  return queryOne(
    'SELECT * FROM docs WHERE body_hash = ? AND file_path != ? AND deleted_at IS NULL',
    [bodyHash, excludePath]
  );
}
