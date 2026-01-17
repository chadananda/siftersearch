/**
 * Content Sync Worker
 *
 * Background service that keeps Content Table and Meilisearch in sync.
 * Polls for unsynced content and pushes to Meilisearch in batches.
 *
 * Architecture: Files → Content Table → Meilisearch
 * This worker handles the "Content Table → Meilisearch" part automatically.
 */

import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getMeili, initializeIndexes } from '../lib/search.js';

// Configuration - tuned for throughput while yielding event loop
const SYNC_INTERVAL_MS = 10000;  // Poll every 10 seconds
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // Cleanup stale Meili docs every 5 minutes
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // Full sync check every hour
const BATCH_SIZE = 100;          // Paragraphs per batch (Meili handles this easily)
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

/**
 * Propagate existing embeddings to rows with matching normalized_hash
 * This avoids expensive re-generation for duplicate content across documents
 * (e.g., same quote in 50 documents = 1 embedding, 49 copies)
 *
 * Note: We include soft-deleted content as sources because embeddings are
 * expensive - soft-deleted records are kept specifically to preserve embeddings.
 */
async function propagateExistingEmbeddings() {
  try {
    // Find rows that need embeddings but have a matching normalized_hash with existing embedding
    // Source includes ALL content (even soft-deleted) to maximize embedding reuse
    const result = await query(`
      UPDATE content
      SET embedding = (
        SELECT c2.embedding FROM content c2
        WHERE c2.normalized_hash = content.normalized_hash
          AND c2.embedding IS NOT NULL
        LIMIT 1
      ),
      embedding_model = (
        SELECT c2.embedding_model FROM content c2
        WHERE c2.normalized_hash = content.normalized_hash
          AND c2.embedding IS NOT NULL
        LIMIT 1
      ),
      synced = 0,
      updated_at = datetime('now')
      WHERE embedding IS NULL
        AND deleted_at IS NULL
        AND normalized_hash IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM content c2
          WHERE c2.normalized_hash = content.normalized_hash
            AND c2.embedding IS NOT NULL
        )
    `);

    const propagated = result?.changes || 0;
    if (propagated > 0) {
      syncStats.embeddingsPropagated += propagated;
      logger.info({ propagated }, 'Propagated existing embeddings to matching content');
    }
    return propagated;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to propagate embeddings');
    return 0;
  }
}

/**
 * Get unsynced documents (those with synced=0 paragraphs)
 */
async function getUnsyncedDocuments() {
  const docs = await queryAll(`
    SELECT DISTINCT d.id, d.title, d.author, d.religion, d.collection,
           d.language, d.year, d.description
    FROM docs d
    INNER JOIN content c ON c.doc_id = d.id
    WHERE c.synced = 0
    LIMIT 50
  `);
  return docs;
}

/**
 * Get unsynced paragraphs for a document
 */
async function getUnsyncedParagraphs(docId) {
  // After migration 30, content.id is INTEGER PRIMARY KEY (same as rowid)
  return queryAll(`
    SELECT id, doc_id, paragraph_index, text, heading, blocktype, embedding, embedding_model, content_hash, normalized_hash, translation, translation_segments
    FROM content
    WHERE doc_id = ? AND synced = 0
    ORDER BY paragraph_index
  `, [docId]);
}

/**
 * Find embeddings by normalized_hash for paragraphs missing them
 * Returns a map of id -> { embedding, embedding_model }
 *
 * Note: Includes soft-deleted content as sources - embeddings are expensive
 * and soft-deleted records are kept specifically to preserve embeddings.
 */
async function findEmbeddingsByNormalizedHash(paragraphs) {
  // Filter to paragraphs missing embeddings
  const missing = paragraphs.filter(p => !p.embedding && p.normalized_hash);
  if (missing.length === 0) return new Map();

  const hashes = missing.map(p => p.normalized_hash);
  const placeholders = hashes.map(() => '?').join(',');

  // Search ALL content (including soft-deleted) to maximize embedding reuse
  const matches = await queryAll(`
    SELECT normalized_hash, embedding, embedding_model
    FROM content
    WHERE normalized_hash IN (${placeholders})
      AND embedding IS NOT NULL
    GROUP BY normalized_hash
  `, hashes);

  // Build hash -> embedding map
  const hashMap = new Map();
  for (const m of matches) {
    hashMap.set(m.normalized_hash, { embedding: m.embedding, embedding_model: m.embedding_model });
  }

  // Map paragraph id -> embedding for those that match
  const result = new Map();
  for (const p of missing) {
    const match = hashMap.get(p.normalized_hash);
    if (match) {
      result.set(p.id, match);
    }
  }
  return result;
}

/**
 * Get document metadata from docs table
 */
async function getDocumentMeta(docId) {
  return queryOne(`
    SELECT id, title, author, religion, collection, language, year, description
    FROM docs WHERE id = ?
  `, [docId]);
}

// Authority is now calculated from library meta.yaml files
import { getAuthority } from '../lib/authority.js';

/**
 * Convert embedding blob to float array for Meilisearch
 */
function blobToFloatArray(blob) {
  if (!blob) return null;

  // If already an array, return as-is
  if (Array.isArray(blob)) return blob;

  // Handle Buffer/Uint8Array
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  return Array.from(floatArray);
}

/**
 * Sync a single document's paragraphs to Meilisearch
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

  // Get unsynced paragraphs
  const paragraphs = await getUnsyncedParagraphs(docId);
  if (paragraphs.length === 0) {
    return { success: true, synced: 0 };
  }

  // Final attempt: find embeddings for any paragraphs still missing them
  // This catches any that weren't found during the batch propagation
  const foundEmbeddings = await findEmbeddingsByNormalizedHash(paragraphs);

  // Persist found embeddings to content table (so they're not looked up again)
  if (foundEmbeddings.size > 0) {
    for (const [contentId, { embedding, embedding_model }] of foundEmbeddings) {
      await query(`
        UPDATE content SET embedding = ?, embedding_model = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [embedding, embedding_model, contentId]);
    }
    logger.debug({ docId, found: foundEmbeddings.size }, 'Found embeddings via normalized_hash during sync');
  }

  const authority = getAuthority(doc);

  // Build Meilisearch document
  const meiliDoc = {
    id: doc.id,
    title: doc.title,
    author: doc.author,
    religion: doc.religion,
    collection: doc.collection,
    language: doc.language,
    year: doc.year ? parseInt(doc.year, 10) : null,
    description: doc.description,
    authority,
    chunk_count: paragraphs.length,
    created_at: new Date().toISOString()
  };

  // Build paragraph records for Meilisearch
  const meiliParagraphs = paragraphs.map(p => {
    // Use found embedding if paragraph was missing one, otherwise use existing
    const found = foundEmbeddings.get(p.id);
    const embeddingBlob = found ? found.embedding : p.embedding;
    const embedding = blobToFloatArray(embeddingBlob);

    return {
      id: p.id,  // INTEGER id (same as rowid after migration 30)
      doc_id: p.doc_id,  // INTEGER from SQLite docs.id
      paragraph_index: p.paragraph_index,
      text: p.text,
      translation: p.translation || null,  // English translation for side-by-side display
      translation_segments: p.translation_segments || null,  // Aligned phrase pairs for highlighting
      title: doc.title,
      author: doc.author,
      religion: doc.religion,
      collection: doc.collection,
      language: doc.language,
      year: doc.year ? parseInt(doc.year, 10) : null,
      authority,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      _vectors: { default: embedding || null },  // Explicit null opts out of embeddings
      created_at: new Date().toISOString()
    };
  });

  try {
    // Index document to documents index
    const documentsIndex = meili.index('documents');
    await documentsIndex.addDocuments([meiliDoc]);

    // Index paragraphs in batches
    const paragraphsIndex = meili.index('paragraphs');

    for (let i = 0; i < meiliParagraphs.length; i += BATCH_SIZE) {
      const batch = meiliParagraphs.slice(i, i + BATCH_SIZE);
      await paragraphsIndex.addDocuments(batch);
      // Yield event loop between batches to allow health checks
      if (YIELD_DELAY_MS > 0) await delay(YIELD_DELAY_MS);
    }

    // Mark paragraphs as synced (batch to avoid SQLite variable limit)
    const ids = paragraphs.map(p => p.id);
    const UPDATE_BATCH_SIZE = 500;  // SQLite safe limit
    for (let i = 0; i < ids.length; i += UPDATE_BATCH_SIZE) {
      const batchIds = ids.slice(i, i + UPDATE_BATCH_SIZE);
      await query(`
        UPDATE content SET synced = 1, updated_at = datetime('now')
        WHERE id IN (${batchIds.map(() => '?').join(',')})
      `, batchIds);
      // Yield event loop between batches
      if (YIELD_DELAY_MS > 0) await delay(YIELD_DELAY_MS);
    }

    logger.info({ docId, paragraphs: paragraphs.length }, 'Document synced to Meilisearch');
    return { success: true, synced: paragraphs.length };

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
    await propagateExistingEmbeddings();

    // Get documents with unsynced content
    const docs = await getUnsyncedDocuments();

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

      // Mark all their paragraphs as needing sync
      for (const docId of missingInMeili) {
        await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [docId]);
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
      const dbCount = await queryOne(
        'SELECT COUNT(*) as count FROM content WHERE doc_id = ?',
        [row.doc_id]
      );

      try {
        const meiliResult = await meili.index('paragraphs').search('', {
          filter: `doc_id = ${row.doc_id}`,  // INTEGER, no quotes
          limit: 0
        });

        // If counts don't match, mark for re-sync
        if (dbCount?.count !== meiliResult.estimatedTotalHits) {
          await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [row.doc_id]);
          syncStats.fullSyncMarked++;
          logger.info({ docId: row.doc_id, dbCount: dbCount?.count, meiliCount: meiliResult.estimatedTotalHits },
            'Paragraph count mismatch, marking for re-sync');
        }
      } catch {
        // Document might not exist in Meili, mark for sync
        await query('UPDATE content SET synced = 0 WHERE doc_id = ?', [row.doc_id]);
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
  const result = await queryOne(`
    SELECT
      COUNT(DISTINCT doc_id) as documents,
      COUNT(*) as paragraphs
    FROM content
    WHERE synced = 0
  `);
  return result || { documents: 0, paragraphs: 0 };
}
