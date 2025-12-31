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

// Configuration
const SYNC_INTERVAL_MS = 10000;  // Poll every 10 seconds
const BATCH_SIZE = 100;          // Paragraphs per batch
const MAX_BATCH_BYTES = 90 * 1024 * 1024;  // 90MB limit (Meili has 100MB)

let syncInterval = null;
let isRunning = false;
let syncStats = {
  lastRun: null,
  lastSuccess: null,
  documentsSynced: 0,
  paragraphsSynced: 0,
  errors: 0
};

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
  return queryAll(`
    SELECT id, doc_id, paragraph_index, text, heading, blocktype, embedding, content_hash
    FROM content
    WHERE doc_id = ? AND synced = 0
    ORDER BY paragraph_index
  `, [docId]);
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

/**
 * Calculate authority score for a document
 */
function calculateAuthority(doc) {
  // Primary source authors get highest authority (8-10)
  const primaryAuthors = ["baha'u'llah", "bahaullah", "abdu'l-baha", "the bab", "shoghi effendi"];
  const authorLower = (doc.author || '').toLowerCase();

  for (const primary of primaryAuthors) {
    if (authorLower.includes(primary)) {
      return 10;
    }
  }

  // Core texts get high authority
  const coreCollections = ['core texts', 'tablets', 'prayers'];
  const collectionLower = (doc.collection || '').toLowerCase();

  for (const core of coreCollections) {
    if (collectionLower.includes(core)) {
      return 8;
    }
  }

  // Default authority
  return 5;
}

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

  const authority = calculateAuthority(doc);

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
    const embedding = blobToFloatArray(p.embedding);
    return {
      id: p.id,
      document_id: p.doc_id,
      paragraph_index: p.paragraph_index,
      text: p.text,
      title: doc.title,
      author: doc.author,
      religion: doc.religion,
      collection: doc.collection,
      language: doc.language,
      year: doc.year ? parseInt(doc.year, 10) : null,
      authority,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      ...(embedding && { _vectors: { default: embedding } }),
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
    }

    // Mark paragraphs as synced
    const ids = paragraphs.map(p => p.id);
    await query(`
      UPDATE content SET synced = 1, updated_at = datetime('now')
      WHERE id IN (${ids.map(() => '?').join(',')})
    `, ids);

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
    // Initialize Meilisearch indexes if needed
    await initializeIndexes();

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
 * Start the sync worker
 */
export function startSyncWorker() {
  if (syncInterval) {
    logger.warn('Sync worker already running');
    return;
  }

  logger.info({ intervalMs: SYNC_INTERVAL_MS }, 'Starting content sync worker');

  // Run initial sync after short delay
  setTimeout(runSyncCycle, 5000);

  // Schedule periodic syncs
  syncInterval = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
}

/**
 * Stop the sync worker
 */
export function stopSyncWorker() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    logger.info('Content sync worker stopped');
  }
}

/**
 * Get sync worker stats
 */
export function getSyncStats() {
  return {
    ...syncStats,
    running: isRunning,
    intervalMs: SYNC_INTERVAL_MS
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
