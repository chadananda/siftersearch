/**
 * Content Sync Worker
 *
 * Background service that keeps Content Table and Meilisearch in sync.
 * Polls for unsynced content and pushes to Meilisearch in batches.
 *
 * Architecture: Files → Content Table → Meilisearch
 * This worker handles the "Content Table → Meilisearch" part automatically.
 */

import { queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getMeili, initializeIndexes } from '../lib/search.js';
import { content } from '../lib/content.js';

// Configuration - tuned for throughput while yielding event loop
const SYNC_INTERVAL_MS = 10000;  // Poll every 10 seconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // Cleanup stale Meili docs every 5 minutes
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // Full sync check every hour
const BATCH_SIZE = 50;           // Paragraphs per batch (smaller = faster on large indexes)
const MAX_BATCH_BYTES = 90 * 1024 * 1024;  // 90MB limit (Meili has 100MB)
const YIELD_DELAY_MS = 5;        // Small delay to yield event loop

let syncInterval = null;
let cleanupInterval = null;
let fullSyncInterval = null;
let isRunning = false;

// Small delay to yield event loop and prevent blocking health checks
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let isCleanupRunning = false;
let isFullSyncRunning = false;
let indexesInitialized = false;
let syncStats = {
  lastRun: null,
  lastSuccess: null,
  documentsSynced: 0,
  paragraphsSynced: 0,
  errors: 0,
  lastCleanup: null,
  documentsDeleted: 0,
  lastFullSync: null,
  fullSyncMarked: 0,
  embeddingsPropagated: 0
};

// Old helper functions (propagateExistingEmbeddings, getUnsyncedDocuments,
// getUnsyncedParagraphs, findEmbeddingsByNormalizedHash) have been replaced
// by the content API (api/lib/content.js). All content table reads/writes
// now go through that module.

/**
 * Get document metadata from docs table
 */
async function getDocumentMeta(docId) {
  return queryOne(`
    SELECT id, title, author, religion, collection, language, year, description, filename
    FROM docs WHERE id = ?
  `, [docId]);
}

// Authority is now calculated from library meta.yaml files
import { getAuthority } from '../lib/authority.js';

/**
 * Convert embedding blob to float array for Meilisearch
 * Validates that all values are finite numbers (no NaN or Infinity)
 */
function blobToFloatArray(blob) {
  if (!blob) return null;

  let floatArray;

  // If already an array, use it directly
  if (Array.isArray(blob)) {
    floatArray = blob;
  } else {
    // Handle Buffer/Uint8Array
    const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    floatArray = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
  }

  // Validate all values are finite numbers (Meilisearch rejects NaN/Infinity)
  const hasInvalidValues = floatArray.some(v => !Number.isFinite(v));
  if (hasInvalidValues) {
    logger.warn({ invalidCount: floatArray.filter(v => !Number.isFinite(v)).length }, 'Embedding contains NaN/Infinity values, skipping');
    return null;  // Return null to skip this embedding
  }

  return floatArray;
}

/**
 * Wait for a Meilisearch task to complete.
 * Returns the finished task object. Throws if the task failed.
 */
async function waitForMeiliTask(meili, enqueuedTask, timeoutMs = 300000) {
  const taskUid = typeof enqueuedTask === 'number' ? enqueuedTask : enqueuedTask.taskUid;
  const task = await meili.tasks.waitForTask(taskUid, { timeout: timeoutMs });

  if (task.status === 'failed') {
    const errMsg = task.error?.message || 'Unknown Meilisearch task error';
    throw new Error(`Meilisearch task ${taskUid} failed: ${errMsg}`);
  }

  return task;
}

/**
 * Sync a single document's paragraphs to Meilisearch.
 *
 * VERIFIED SYNC: Does NOT mark synced=1 until Meilisearch confirms
 * each task succeeded. If Meilisearch rejects a batch, those paragraphs
 * stay dirty and will be retried on the next cycle.
 */
async function syncDocument(docId) {
  const meili = await getMeili();
  if (!meili) {
    logger.warn('Meilisearch not available, skipping sync');
    return { success: false, reason: 'meilisearch_unavailable' };
  }

  // Get document metadata
  const doc = await getDocumentMeta(docId);
  if (!doc) {
    logger.warn({ docId }, 'Document not found in docs table');
    return { success: false, reason: 'doc_not_found' };
  }

  // Get dirty paragraphs via content API
  const paragraphs = await content.getDirtyParagraphsForDoc(docId);
  if (paragraphs.length === 0) {
    return { success: true, synced: 0 };
  }

  const authority = getAuthority(doc);

  // Build Meilisearch document metadata
  const meiliDoc = {
    id: doc.id,
    title: doc.title,
    author: doc.author,
    religion: doc.religion,
    collection: doc.collection,
    language: doc.language,
    year: doc.year ? parseInt(doc.year, 10) : null,
    description: doc.description,
    filename: doc.filename,
    authority,
    chunk_count: paragraphs.length,
    created_at: new Date().toISOString()
  };

  // Build paragraph records for Meilisearch
  // Validate embedding dimensions — wrong-dimension embeddings become null (FTS-only)
  const meiliParagraphs = paragraphs.map(p => {
    let embedding = blobToFloatArray(p.embedding);

    // Dimension gate: reject wrong-size embeddings rather than poisoning the batch
    if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
      logger.warn({ id: p.id, dims: embedding.length, expected: content.EXPECTED_EMBEDDING_DIMS },
        'Skipping wrong-dimension embedding for Meilisearch (paragraph will be FTS-only)');
      embedding = null;
    }

    const record = {
      id: p.id,
      doc_id: p.doc_id,
      paragraph_index: p.paragraph_index,
      text: p.text,
      context: p.context || null,
      translation: p.translation || null,
      translation_segments: p.translation_segments || null,
      title: doc.title,
      author: doc.author,
      filename: doc.filename,
      religion: doc.religion,
      collection: doc.collection,
      language: doc.language,
      year: doc.year ? parseInt(doc.year, 10) : null,
      authority,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      created_at: new Date().toISOString()
    };

    // Only include _vectors when we have a valid embedding — sending null vectors
    // forces Meilisearch to update its HNSW vector index for every document,
    // which is extremely slow on a 1.6M+ document index with 3072 dimensions
    if (embedding) {
      record._vectors = { default: embedding };
    }

    return record;
  });

  try {
    // Index document metadata — wait for confirmation
    const documentsIndex = meili.index('documents');
    const docTask = await documentsIndex.addDocuments([meiliDoc]);
    await waitForMeiliTask(meili, docTask);

    // Index paragraphs in batches — wait for each batch to confirm
    const paragraphsIndex = meili.index('paragraphs');
    const confirmedIds = [];

    for (let i = 0; i < meiliParagraphs.length; i += BATCH_SIZE) {
      const batch = meiliParagraphs.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(p => p.id);

      try {
        const task = await paragraphsIndex.addDocuments(batch);
        await waitForMeiliTask(meili, task);
        // Meilisearch confirmed this batch — these IDs are safe to mark synced
        confirmedIds.push(...batchIds);
      } catch (batchErr) {
        // This batch failed — leave these paragraphs dirty for retry
        logger.error({ docId, batchStart: i, batchSize: batch.length, err: batchErr.message },
          'Meilisearch rejected paragraph batch — will retry next cycle');
      }

      // Yield event loop between batches
      if (YIELD_DELAY_MS > 0) await delay(YIELD_DELAY_MS);
    }

    // Only mark CONFIRMED paragraphs as synced (via content API)
    if (confirmedIds.length > 0) {
      await content.markSynced(confirmedIds);
    }

    // Clean up orphaned paragraph IDs from Meilisearch for this document
    try {
      const dbIds = await content.getIdsForDoc(docId);
      const dbIdSet = new Set(dbIds.map(r => r.id));

      let offset = 0;
      const meiliIds = [];
      while (true) {
        const result = await paragraphsIndex.getDocuments({
          filter: `doc_id = ${docId}`,
          fields: ['id'],
          limit: 1000,
          offset
        });
        if (!result.results || result.results.length === 0) break;
        meiliIds.push(...result.results.map(r => r.id));
        if (result.results.length < 1000) break;
        offset += 1000;
      }

      const orphanIds = meiliIds.filter(id => !dbIdSet.has(id));
      if (orphanIds.length > 0) {
        await paragraphsIndex.deleteDocuments(orphanIds);
        logger.info({ docId, orphans: orphanIds.length }, 'Cleaned up orphaned paragraph IDs from Meilisearch');
      }
    } catch (cleanupErr) {
      logger.warn({ docId, err: cleanupErr.message }, 'Failed to clean up orphaned paragraphs');
    }

    const failed = paragraphs.length - confirmedIds.length;
    if (failed > 0) {
      logger.warn({ docId, confirmed: confirmedIds.length, failed }, 'Partial sync — some paragraphs will retry');
    } else {
      logger.info({ docId, paragraphs: confirmedIds.length }, 'Document synced to Meilisearch (verified)');
    }

    return { success: true, synced: confirmedIds.length, failed };

  } catch (err) {
    logger.error({ docId, err: err.message }, 'Failed to sync document to Meilisearch');
    return { success: false, reason: err.message };
  }
}

/**
 * Run one sync cycle
 */
async function runSyncCycle() {
  if (isRunning) {
    logger.debug('Sync cycle already running, skipping');
    return;
  }

  isRunning = true;
  syncStats.lastRun = new Date().toISOString();

  try {
    // Initialize Meilisearch indexes only once (not every cycle)
    if (!indexesInitialized) {
      await initializeIndexes();
      indexesInitialized = true;
    }

    // Propagate existing embeddings to rows with matching normalized_hash
    // This ensures "paragraphs needing embeddings" count is accurate
    await content.propagateEmbeddings();

    // Get documents with dirty (unsynced) content
    const docs = await content.getDocsWithDirtyParagraphs();

    if (docs.length === 0) {
      isRunning = false;
      return;
    }

    logger.info({ count: docs.length }, 'Found documents needing sync');

    let totalSynced = 0;
    let totalErrors = 0;

    for (const doc of docs) {
      const result = await syncDocument(doc.id);
      if (result.success) {
        totalSynced += result.synced || 0;
        syncStats.documentsSynced++;
        syncStats.paragraphsSynced += result.synced || 0;
      } else {
        totalErrors++;
        syncStats.errors++;
      }
    }

    if (totalSynced > 0) {
      syncStats.lastSuccess = new Date().toISOString();
      logger.info({ documents: docs.length, paragraphs: totalSynced, errors: totalErrors }, 'Sync cycle complete');
    }

  } catch (err) {
    logger.error({ err: err.message }, 'Sync cycle failed');
    syncStats.errors++;
  } finally {
    isRunning = false;
  }
}

/**
 * Run cleanup cycle to remove stale documents from Meilisearch
 * Documents in Meili but not in libsql are considered stale
 */
async function runCleanupCycle() {
  if (isCleanupRunning) {
    logger.debug('Cleanup cycle already running, skipping');
    return;
  }

  isCleanupRunning = true;

  try {
    const meili = await getMeili();
    if (!meili) {
      logger.warn('Meilisearch not available, skipping cleanup');
      return;
    }

    // Get all document IDs from Meilisearch
    const meiliDocs = await meili.index('documents').getDocuments({
      limit: 10000,
      fields: ['id']
    });

    if (!meiliDocs.results || meiliDocs.results.length === 0) {
      syncStats.lastCleanup = new Date().toISOString();
      return;
    }

    // Get all ACTIVE document IDs from libsql (exclude soft-deleted)
    const dbDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
    const dbIdSet = new Set(dbDocs.map(d => d.id));

    // Find stale documents (in Meili but not in active DB docs)
    const staleIds = meiliDocs.results
      .filter(d => !dbIdSet.has(d.id))
      .map(d => d.id);

    if (staleIds.length > 0) {
      logger.info({ count: staleIds.length }, 'Found stale documents in Meilisearch');

      // Delete from documents index
      await meili.index('documents').deleteDocuments(staleIds);

      // Delete paragraphs for each stale document
      for (const id of staleIds) {
        try {
          await meili.index('paragraphs').deleteDocuments({
            filter: `doc_id = ${id}`  // INTEGER, no quotes
          });
        } catch (err) {
          logger.warn({ id, err: err.message }, 'Failed to delete paragraphs for stale document');
        }
      }

      syncStats.documentsDeleted += staleIds.length;
      logger.info({ count: staleIds.length }, 'Cleaned up stale documents from Meilisearch');
    }

    // Paragraph-level orphan cleanup: find paragraph IDs in Meilisearch
    // that no longer exist in the content table. Sample a batch of documents
    // each cycle to avoid overwhelming Meilisearch with large queries.
    try {
      const sampleDocs = await queryAll(`
        SELECT id FROM docs WHERE deleted_at IS NULL
        ORDER BY RANDOM() LIMIT 20
      `);

      let totalOrphans = 0;
      const paragraphsIndex = meili.index('paragraphs');

      for (const doc of sampleDocs) {
        // Get all content IDs from DB for this doc
        const dbContent = await content.getIdsForDoc(doc.id);
        const dbContentIds = new Set(dbContent.map(r => r.id));

        // Get all paragraph IDs from Meilisearch for this doc
        let offset = 0;
        const meiliParaIds = [];
        while (true) {
          const result = await paragraphsIndex.getDocuments({
            filter: `doc_id = ${doc.id}`,
            fields: ['id'],
            limit: 1000,
            offset
          });
          if (!result.results || result.results.length === 0) break;
          meiliParaIds.push(...result.results.map(r => r.id));
          if (result.results.length < 1000) break;
          offset += 1000;
        }

        const orphanIds = meiliParaIds.filter(id => !dbContentIds.has(id));
        if (orphanIds.length > 0) {
          await paragraphsIndex.deleteDocuments(orphanIds);
          totalOrphans += orphanIds.length;
          logger.info({ docId: doc.id, orphans: orphanIds.length }, 'Cleaned orphaned paragraphs from Meilisearch');
        }

        // Yield to avoid blocking
        if (YIELD_DELAY_MS > 0) await delay(YIELD_DELAY_MS);
      }

      if (totalOrphans > 0) {
        logger.info({ totalOrphans, docsChecked: sampleDocs.length }, 'Paragraph orphan cleanup complete');
      }
    } catch (paraErr) {
      logger.warn({ err: paraErr.message }, 'Paragraph-level orphan cleanup failed');
    }

    syncStats.lastCleanup = new Date().toISOString();

  } catch (err) {
    logger.error({ err: err.message }, 'Cleanup cycle failed');
  } finally {
    isCleanupRunning = false;
  }
}

/**
 * Run hourly full sync check
 * Ensures all documents in DB are properly synced to Meilisearch
 * This catches any documents that might have been missed by the regular sync
 */
async function runFullSyncCheck() {
  if (isFullSyncRunning) {
    logger.debug('Full sync check already running, skipping');
    return;
  }

  isFullSyncRunning = true;

  try {
    const meili = await getMeili();
    if (!meili) {
      logger.warn('Meilisearch not available, skipping full sync check');
      return;
    }

    // Get all ACTIVE document IDs from libsql (exclude soft-deleted)
    const dbDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
    const dbIdSet = new Set(dbDocs.map(d => d.id));

    // Get all document IDs from Meilisearch
    const meiliDocs = await meili.index('documents').getDocuments({
      limit: 10000,
      fields: ['id']
    });
    const meiliIdSet = new Set((meiliDocs.results || []).map(d => d.id));

    // Find documents in DB but not in Meilisearch
    const missingInMeili = [...dbIdSet].filter(id => !meiliIdSet.has(id));

    if (missingInMeili.length > 0) {
      logger.info({ count: missingInMeili.length }, 'Found documents in DB missing from Meilisearch');

      // Mark all their paragraphs as dirty via content API
      for (const docId of missingInMeili) {
        await content.markDocDirty(docId);
      }

      syncStats.fullSyncMarked += missingInMeili.length;
      logger.info({ count: missingInMeili.length }, 'Marked documents for re-sync');
    }

    // Also check for documents with all synced=1 paragraphs but might have stale data
    // This ensures metadata changes are caught even if paragraphs haven't changed
    const potentiallyStale = await queryAll(`
      SELECT DISTINCT doc_id FROM content
      WHERE synced = 1
      AND updated_at < datetime('now', '-1 hour')
      LIMIT 100
    `);

    // For these, compare paragraph counts
    for (const row of potentiallyStale) {
      const dbCountVal = await content.countByDocId(row.doc_id);
      const dbCount = { count: dbCountVal };

      try {
        const meiliResult = await meili.index('paragraphs').search('', {
          filter: `doc_id = ${row.doc_id}`,  // INTEGER, no quotes
          limit: 0
        });

        // If counts don't match, mark for re-sync
        if (dbCount?.count !== meiliResult.estimatedTotalHits) {
          await content.markDocDirty(row.doc_id);
          syncStats.fullSyncMarked++;
          logger.info({ docId: row.doc_id, dbCount: dbCount?.count, meiliCount: meiliResult.estimatedTotalHits },
            'Paragraph count mismatch, marking for re-sync');
        }
      } catch {
        // Document might not exist in Meili, mark for sync
        await content.markDocDirty(row.doc_id);
        syncStats.fullSyncMarked++;
      }
    }

    syncStats.lastFullSync = new Date().toISOString();
    logger.info('Full sync check complete');

  } catch (err) {
    logger.error({ err: err.message }, 'Full sync check failed');
  } finally {
    isFullSyncRunning = false;
  }
}

/**
 * Start the sync worker
 */
export function startSyncWorker() {
  if (syncInterval) {
    logger.warn('Sync worker already running');
    return;
  }

  logger.info({
    syncIntervalMs: SYNC_INTERVAL_MS,
    cleanupIntervalMs: CLEANUP_INTERVAL_MS,
    fullSyncIntervalMs: FULL_SYNC_INTERVAL_MS
  }, 'Starting content sync worker');

  // Run initial sync after short delay
  setTimeout(runSyncCycle, 5000);

  // Run initial cleanup after 30 seconds
  setTimeout(runCleanupCycle, 30000);

  // Run initial full sync check after 2 minutes
  setTimeout(runFullSyncCheck, 2 * 60 * 1000);

  // Schedule periodic syncs (every 10 seconds)
  syncInterval = setInterval(runSyncCycle, SYNC_INTERVAL_MS);

  // Schedule periodic cleanup (every 5 minutes)
  cleanupInterval = setInterval(runCleanupCycle, CLEANUP_INTERVAL_MS);

  // Schedule periodic full sync check (every hour)
  fullSyncInterval = setInterval(runFullSyncCheck, FULL_SYNC_INTERVAL_MS);
}

/**
 * Stop the sync worker
 */
export function stopSyncWorker() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (fullSyncInterval) {
    clearInterval(fullSyncInterval);
    fullSyncInterval = null;
  }
  logger.info('Content sync worker stopped');
}

/**
 * Get sync worker stats
 */
export function getSyncStats() {
  return {
    ...syncStats,
    running: isRunning,
    cleanupRunning: isCleanupRunning,
    fullSyncRunning: isFullSyncRunning,
    intervals: {
      sync: SYNC_INTERVAL_MS,
      cleanup: CLEANUP_INTERVAL_MS,
      fullSync: FULL_SYNC_INTERVAL_MS
    }
  };
}

/**
 * Force a sync cycle now (for manual triggering)
 */
export async function forceSyncNow() {
  logger.info('Manual sync triggered');
  await runSyncCycle();
  return getSyncStats();
}

/**
 * Get count of unsynced content
 */
export async function getUnsyncedCount() {
  return content.getDirtyCount();
}
