/**
 * Progress Tracking Service
 *
 * Tracks progress of import and indexing operations for UI display.
 *
 * Import Progress: Current batch of documents being imported (resets each run)
 * Indexing Progress: Documents indexed in Meilisearch vs total with content
 */

import { queryOne } from '../lib/db.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

// Lazy import to avoid circular dependency with search.js
let _meili = null;
let _INDEXES = null;
async function getMeiliClient() {
  if (!_meili) {
    const search = await import('../lib/search.js');
    _meili = search.getMeili;
    _INDEXES = search.INDEXES;
  }
  return { getMeili: _meili, INDEXES: _INDEXES };
}

// In-memory tracking for current import batch
let importJob = null;

/**
 * Start tracking a new import batch
 * @param {number} totalDocs - Total documents to import in this batch
 * @param {string} source - Source of import (e.g., 'watcher', 'admin', 'initial-scan')
 */
export function startImportBatch(totalDocs, source = 'unknown') {
  importJob = {
    id: `import_${Date.now()}`,
    source,
    total: totalDocs,
    completed: 0,
    failed: 0,
    skipped: 0,
    startedAt: new Date().toISOString(),
    status: 'importing'
  };
  logger.info({ ...importJob }, 'Import batch started');
  return importJob.id;
}

/**
 * Update import progress
 * @param {string} result - 'completed', 'failed', or 'skipped'
 */
export function updateImportProgress(result = 'completed') {
  if (!importJob) return;

  if (result === 'completed') {
    importJob.completed++;
  } else if (result === 'failed') {
    importJob.failed++;
  } else if (result === 'skipped') {
    importJob.skipped++;
  }

  // Check if batch is complete
  const processed = importJob.completed + importJob.failed + importJob.skipped;
  if (processed >= importJob.total) {
    importJob.status = 'complete';
    importJob.completedAt = new Date().toISOString();
    logger.info({ ...importJob }, 'Import batch completed');
  }
}

/**
 * Clear import progress (called when batch completes or is cancelled)
 */
export function clearImportBatch() {
  const completed = importJob;
  importJob = null;
  return completed;
}

/**
 * Get current import progress
 * Returns null if no import is running
 */
export function getImportProgress() {
  if (!importJob) return null;

  const processed = importJob.completed + importJob.failed + importJob.skipped;
  return {
    ...importJob,
    processed,
    percentComplete: importJob.total > 0 ? Math.round((processed / importJob.total) * 100) : 0
  };
}

/**
 * Get ingestion progress (docs with content vs total docs)
 * Shows how many documents have been parsed/ingested vs total in library
 */
export async function getIngestionProgress() {
  try {
    // Filter by deleted_at IS NULL to match library.js stats endpoint
    const [totalResult, withContentResult, paragraphResult] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM docs WHERE deleted_at IS NULL'),
      queryOne('SELECT COUNT(DISTINCT doc_id) as count FROM content WHERE deleted_at IS NULL'),
      queryOne('SELECT COUNT(*) as count FROM content WHERE deleted_at IS NULL')
    ]);

    const totalDocs = totalResult?.count || 0;
    const docsWithContent = withContentResult?.count || 0;
    const docsPending = totalDocs - docsWithContent;
    const totalParagraphs = paragraphResult?.count || 0;

    return {
      totalDocs,
      docsWithContent,
      docsPending,
      totalParagraphs,  // Total paragraphs ingested (stable LibSQL count)
      percentComplete: totalDocs > 0 ? Math.round((docsWithContent / totalDocs) * 100) : 100
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get ingestion progress');
    return null;
  }
}

/**
 * Get indexing progress (docs in Meilisearch vs docs with content)
 * Returns null if Meilisearch is disabled
 */
export async function getIndexingProgress() {
  // Indexing progress only makes sense when Meilisearch is enabled
  if (!config.search.enabled) {
    return null;
  }

  try {
    // Get docs with content from SQLite (filter deleted to match library.js stats)
    const contentCount = await queryOne('SELECT COUNT(DISTINCT doc_id) as count FROM content WHERE deleted_at IS NULL');
    const docsWithContent = contentCount?.count || 0;

    // Get indexed docs from Meilisearch documents index
    // Using index stats instead of facets (facets have a 100 value limit by default)
    let indexedDocs = 0;
    let indexedParagraphs = 0;
    try {
      const { getMeili, INDEXES } = await getMeiliClient();
      const meili = await getMeili();
      if (meili) {
        // Get document count directly from documents index stats
        const docStats = await meili.index(INDEXES.DOCUMENTS).getStats();
        indexedDocs = docStats.numberOfDocuments || 0;

        // Also get paragraph count for display
        const paraStats = await meili.index(INDEXES.PARAGRAPHS).getStats();
        indexedParagraphs = paraStats.numberOfDocuments || 0;
      }
    } catch {
      // Meilisearch not available - show as 0 indexed
      indexedDocs = 0;
      indexedParagraphs = 0;
    }

    return {
      totalWithContent: docsWithContent,
      indexed: indexedDocs,
      indexedParagraphs,
      pending: Math.max(0, docsWithContent - indexedDocs),
      percentComplete: docsWithContent > 0 ? Math.round((indexedDocs / docsWithContent) * 100) : 100
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get indexing progress');
    return null;
  }
}

/**
 * Get combined progress for API response
 */
export async function getAllProgress() {
  const [importProgress, indexingProgress] = await Promise.all([
    Promise.resolve(getImportProgress()),
    getIndexingProgress()
  ]);

  return {
    import: importProgress,
    indexing: indexingProgress
  };
}

export default {
  startImportBatch,
  updateImportProgress,
  clearImportBatch,
  getImportProgress,
  getIngestionProgress,
  getIndexingProgress,
  getAllProgress
};
