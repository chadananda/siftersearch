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

// Cache for count queries — 5s TTL; partial indexes make COUNT queries fast
const countCache = { data: null, timestamp: 0, ttl: 30000 };

const EMPTY_COUNTS = { totalDocs: 0, docsWithContent: 0, totalParagraphs: 0, unsyncedParagraphs: 0, cooldownDocCount: 0 };

export async function getCachedContentCounts() {
  return getCachedCounts();
}

async function getCachedCounts() {
  const now = Date.now();
  if (countCache.data && (now - countCache.timestamp) < countCache.ttl) {
    return countCache.data;
  }

  try {
    // Use docs table for totals (tiny table, instant) — never scan the 3.5M-row content table
    // paragraph_count on docs is maintained by the ingester, so SUM is authoritative
    // Only hit content table for unsynced count (partial index makes it fast)
    const [docAgg, unsyncedParagraphs, cooldownDocs] = await Promise.all([
      queryOne(`SELECT COUNT(*) as total_docs,
                       SUM(CASE WHEN paragraph_count > 0 THEN 1 ELSE 0 END) as docs_with_content,
                       SUM(paragraph_count) as total_paragraphs
                FROM docs WHERE deleted_at IS NULL`),
      queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 0 AND deleted_at IS NULL'),
      queryOne(`SELECT COUNT(*) as count FROM docs
                WHERE deleted_at IS NULL AND updated_at > datetime('now', '-14400 seconds')`)
    ]);

    const result = {
      totalDocs: docAgg?.total_docs || 0,
      docsWithContent: docAgg?.docs_with_content || 0,
      totalParagraphs: docAgg?.total_paragraphs || 0,
      unsyncedParagraphs: unsyncedParagraphs?.count || 0,
      cooldownDocCount: cooldownDocs?.count || 0
    };

    countCache.data = result;
    countCache.timestamp = Date.now();
    return result;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get content counts');
    if (countCache.data) return countCache.data;
    return EMPTY_COUNTS;
  }
}

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
    const counts = await getCachedCounts();
    const docsPending = counts.totalDocs - counts.docsWithContent;

    return {
      totalDocs: counts.totalDocs,
      docsWithContent: counts.docsWithContent,
      docsPending,
      totalParagraphs: counts.totalParagraphs,
      percentComplete: counts.totalDocs > 0 ? Math.round((counts.docsWithContent / counts.totalDocs) * 100) : 100
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get ingestion progress');
    return null;
  }
}

/**
 * Get indexing progress (paragraphs synced to Meilisearch vs total paragraphs)
 * Tracks actual search readiness — how many paragraphs are searchable.
 * Returns null if Meilisearch is disabled.
 */
export async function getIndexingProgress() {
  if (!config.search.enabled) {
    return null;
  }

  try {
    const counts = await getCachedCounts();
    const totalParagraphs = counts.totalParagraphs;
    const pendingParagraphs = counts.unsyncedParagraphs;
    const syncedParagraphs = totalParagraphs - pendingParagraphs;

    // Active sync job (single row lookup, trivial)
    let activeJob = null;
    try {
      const job = await queryOne(`
        SELECT id, status, total_items, completed_items, failed_items, started_at
        FROM sync_jobs WHERE status IN ('running', 'pending')
        ORDER BY created_at DESC LIMIT 1
      `);
      if (job) {
        activeJob = {
          id: job.id, status: job.status,
          totalItems: job.total_items || 0, completedItems: job.completed_items || 0,
          failedItems: job.failed_items || 0, startedAt: job.started_at,
          percentComplete: job.total_items > 0 ? Math.round((job.completed_items / job.total_items) * 100) : 0
        };
      }
    } catch { /* sync_jobs table may not exist yet */ }

    return {
      totalWithContent: counts.docsWithContent,
      indexed: counts.totalDocs,
      indexedParagraphs: syncedParagraphs,
      totalParagraphs, syncedParagraphs,
      pending: pendingParagraphs,
      percentComplete: totalParagraphs > 0 ? Math.round((syncedParagraphs / totalParagraphs) * 100) : 100,
      activeJob
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
