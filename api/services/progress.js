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
 * Get indexing progress (docs in Meilisearch vs docs with content)
 * Returns null if Meilisearch is disabled
 */
export async function getIndexingProgress() {
  // Indexing progress only makes sense when Meilisearch is enabled
  if (!config.search.enabled) {
    return null;
  }

  try {
    // Get docs with content from SQLite
    const contentCount = await queryOne('SELECT COUNT(DISTINCT doc_id) as count FROM content');
    const docsWithContent = contentCount?.count || 0;

    // Get indexed docs from Meilisearch by counting unique document_ids in paragraphs
    let indexedDocs = 0;
    try {
      const { getMeili, INDEXES } = await getMeiliClient();
      const meili = getMeili();
      if (meili) {
        // Query for unique doc_ids that have paragraphs indexed
        // Using facets to get unique document_id count
        const result = await meili.index(INDEXES.PARAGRAPHS).search('', {
          limit: 0,
          facets: ['document_id']
        });
        indexedDocs = Object.keys(result.facetDistribution?.document_id || {}).length;
      }
    } catch {
      // Meilisearch not available - show as 0 indexed
      indexedDocs = 0;
    }

    return {
      totalWithContent: docsWithContent,
      indexed: indexedDocs,
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
  getIndexingProgress,
  getAllProgress
};
