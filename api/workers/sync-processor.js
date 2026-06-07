#!/usr/bin/env node
/**
 * Meilisearch Sync Processor
 *
 * Standalone PM2 process that syncs content to Meilisearch.
 * Runs independently of the API — survives API restarts/deploys.
 *
 * Architecture:
 * 1. Check for pending sync_jobs, or auto-create one if unsynced content exists
 * 2. Process the job to completion (no timeouts, no interruptions)
 * 3. Update progress in sync_jobs table (API reads this for display)
 * 4. When done, check for more work. If idle, sleep briefly and check again.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get project root (two levels up from api/workers/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load environment files with absolute paths — same pattern as api/index.js
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll, getSiteDb, getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getMeili, syncEntityMentionsBatch, INDEXES } from '../lib/search.js';
import { content } from '../lib/content.js';
import { getAuthority } from '../lib/authority.js';
import { runMigrations } from '../lib/migrations.js';
import { setSiteRegistry } from '../lib/search/scope.js';
import { loadAllSiteConfigs } from '../services/sites-ingester.js';

// Registry populated at boot from sites.yaml. Used to resolve source_site →
// meili_index_prefix for sync routing AND to drive the site-only DB sync loop.
// Empty = no external sites configured (sync only main paragraphs index).
let siteRegistryByDomain = {};

// Configuration
const BATCH_SIZE = 500; // Larger batches = fewer Meili round-trips = faster throughput
const COOLDOWN_MS = 0;  // No artificial throttle — Meili handles the load fine
const IDLE_SLEEP_MS = 10000;      // Sleep when nothing to do
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;     // 5 minutes
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour
const WAL_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000; // 15 min — TRUNCATE keeps WAL near-zero
const MEILI_RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — resolve orphaned meili_sync_tasks
const ENTITY_MENTIONS_SYNC_INTERVAL_MS = 30_000;    // 30 seconds — push em_synced=0 rows to Meili

// Destructive DB↔Meili reconcile (mark-missing-dirty + delete-stale-by-filter) is OFF by
// default. It compared the full docs table against only the FIRST 10,000 Meili docs
// (getDocuments({limit:10000}), unpaginated), so at corpus scale (~21K docs) it mislabels
// every doc past the 10K slice as "missing" → markDocDirty → re-sync, and others as
// "stale" → slow per-doc deleteDocuments(filter). When Meili lags (big task queue) this
// becomes a self-amplifying re-sync + deletion storm that grows faster than Meili drains.
// Consistency is established by a clean bulk build instead. Re-enable transiently with
// SYNC_RECONCILE=1 only when the index is known-consistent AND this code is paginated.
const RECONCILE_ENABLED = process.env.SYNC_RECONCILE === '1';
const LOG_PROGRESS_EVERY = 10;    // Log every N documents
// Pre-wipe reset: rows created before April Meili wipe still have synced=1 but aren't in Meili.
// Reset them 5000/cycle inside this process (single-writer) to avoid write contention.
const PRE_WIPE_CUTOFF = '2026-04-04';
const PRE_WIPE_BATCH = 5000;

// Shutdown flag — set on SIGTERM, causes worker to stop after current document
let isShuttingDown = false;
// Track current job id so we can requeue it on shutdown
let currentJobId = null;
// Timestamps for periodic tasks
let lastCleanupTime = 0;
let lastFullSyncTime = 0;
let lastWalCheckpointTime = 0;
let lastMeiliReconcileTime = 0;
let lastEntityMentionsSyncTime = 0;
// Pre-wipe reset state
let preWipeResetDone = false;
let preWipeResetTotal = 0;

// Small delay to yield event loop
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get document metadata from docs table
 */
async function getDocumentMeta(docId) {
  return queryOne(`
    SELECT id, title, author, religion, collection, language, year, description, filename,
           duplicate_of, deleted_at, source_site, source_url
    FROM docs WHERE id = ?
  `, [docId]);
}

/**
 * Convert embedding blob to float array for Meilisearch.
 * Validates that all values are finite numbers (no NaN or Infinity).
 */
function blobToFloatArray(blob) {
  if (!blob) return null;
  let floatArray;
  if (Array.isArray(blob)) {
    floatArray = blob;
  } else {
    const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    floatArray = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
  }
  const hasInvalidValues = floatArray.some(v => !Number.isFinite(v));
  if (hasInvalidValues) {
    logger.warn({ invalidCount: floatArray.filter(v => !Number.isFinite(v)).length }, 'Embedding contains NaN/Infinity values, skipping');
    return null;
  }
  return floatArray;
}

/**
 * Wait for a Meilisearch task to complete.
 * No timeout (or 1 hour) — we never kill a sync mid-flight.
 */
async function waitForMeiliTask(meili, enqueuedTask, timeoutMs = 3600000) {
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
 * VERIFIED SYNC: Does NOT mark synced=1 until Meilisearch confirms each task.
 */
async function syncDocument(docId) {
  const meili = await getMeili();
  if (!meili) {
    logger.warn('Meilisearch not available, skipping sync');
    return { success: false, reason: 'meilisearch_unavailable' };
  }

  const doc = await getDocumentMeta(docId);
  if (!doc) {
    logger.warn({ docId }, 'Document not found in docs table');
    return { success: false, reason: 'doc_not_found' };
  }

  const paragraphs = await content.getDirtyParagraphsForDoc(docId);
  if (paragraphs.length === 0) return { success: true, synced: 0 };

  // Doc-level removal path. When the doc has been superseded (duplicate_of
  // set) or soft-deleted, the whole thing comes out of Meili: delete every
  // paragraph and the doc record itself, mark all dirty rows synced. Saves
  // index storage and prevents marked-duplicate copies from showing up in
  // search results alongside the canonical version.
  if (doc.duplicate_of != null || doc.deleted_at != null) {
    const meili2 = meili;
    try {
      const documentsIndex = meili2.index('documents');
      const paragraphsIndex = meili2.index('paragraphs');
      const paraIds = paragraphs.map(p => p.id);
      // Delete doc + paragraphs in parallel
      const [docTask, paraTask] = await Promise.all([
        documentsIndex.deleteDocument(doc.id),
        paragraphsIndex.deleteDocuments(paraIds)
      ]);
      await waitForMeiliTask(meili2, docTask);
      await waitForMeiliTask(meili2, paraTask);
      await content.markSynced(paraIds);
      logger.info({ docId, paragraphs: paraIds.length, reason: doc.duplicate_of ? 'duplicate' : 'deleted' }, 'Document removed from Meilisearch');
      return { success: true, synced: paraIds.length, removed: true };
    } catch (err) {
      logger.error({ docId, err: err.message }, 'Failed to remove duplicate/deleted document from Meilisearch');
      return { success: false, reason: err.message };
    }
  }

  // Per-paragraph split: rows with is_duplicate=1 OR deleted_at set get
  // DELETED from Meili; the rest go through the normal upsert path.
  const toDelete = paragraphs.filter(p => p.is_duplicate || p.deleted_at);
  const toUpsert = paragraphs.filter(p => !p.is_duplicate && !p.deleted_at);

  const authority = getAuthority(doc);

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
    slug: doc.slug,
    paragraph_count: doc.paragraph_count,
    encumbered: doc.encumbered ? 1 : 0,
    authority,
    chunk_count: paragraphs.length,
    created_at: new Date().toISOString()
  };

  const meiliParagraphs = toUpsert.map(p => {
    let embedding = blobToFloatArray(p.embedding);
    if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
      embedding = null; // Wrong dimensions — FTS-only (logged at doc level below)
    }
    const record = {
      id: p.id,
      doc_id: p.doc_id,
      paragraph_index: p.paragraph_index,
      text: p.text,
      text_grounded: p.text_grounded || null,
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
      encumbered: doc.encumbered ? 1 : 0,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      source_site: doc.source_site || null,
      source_url: doc.source_url || null,
      created_at: new Date().toISOString()
    };
    // Only include _vectors when embedding exists — Meilisearch rejects
    // documents with null vectors when embedder source is userProvided
    if (embedding) {
      record._vectors = { default: embedding };
    }
    // Include grounded embedding as a named vector when available.
    // Enables hybridSearch(useGroundedText=true) to use the resolved-name vector.
    const groundedEmbedding = p.grounded_synced === 0 && p.embedding_grounded
      ? blobToFloatArray(p.embedding_grounded)
      : null;
    if (groundedEmbedding && groundedEmbedding.length === content.EXPECTED_EMBEDDING_DIMS) {
      if (!record._vectors) record._vectors = {};
      record._vectors.grounded = groundedEmbedding;
    }
    return record;
  });

  const wrongDimCount = meiliParagraphs.filter(p => !p._vectors && toUpsert.find(pp => pp.id === p.id)?.embedding).length;
  if (wrongDimCount > 0) {
    logger.warn({ docId, wrongDimCount, total: toUpsert.length }, 'Paragraphs with wrong-dimension embeddings (FTS-only)');
  }

  try {
    const documentsIndex = meili.index('documents');
    const paragraphsIndex = meili.index('paragraphs');

    // Submit document (don't wait for completion)
    const docTask = await documentsIndex.addDocuments([meiliDoc]);

    // Submit per-paragraph DELETEs for is_duplicate / deleted rows. One
    // batched delete-by-id call covers them all.
    let deleteTask = null;
    if (toDelete.length > 0) {
      deleteTask = await paragraphsIndex.deleteDocuments(toDelete.map(p => p.id));
    }

    // Submit all paragraph batches without waiting — collect task UIDs for verification
    const submittedBatches = []; // { taskUid, ids }
    for (let i = 0; i < meiliParagraphs.length; i += BATCH_SIZE) {
      const batch = meiliParagraphs.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(p => p.id);
      try {
        const task = await paragraphsIndex.addDocuments(batch);
        submittedBatches.push({ taskUid: task.taskUid, ids: batchIds });
      } catch (batchErr) {
        logger.error({ docId, batchStart: i, batchSize: batch.length, err: batchErr.message },
          'Meilisearch rejected paragraph batch — will retry next cycle');
      }
    }

    // Wait for the doc task and all paragraph tasks to complete
    await waitForMeiliTask(meili, docTask);
    const confirmedIds = [];
    if (deleteTask) {
      try {
        await waitForMeiliTask(meili, deleteTask);
        confirmedIds.push(...toDelete.map(p => p.id));
        logger.info({ docId, removed: toDelete.length }, 'Removed duplicate/deleted paragraphs from Meilisearch');
      } catch (err) {
        logger.error({ docId, err: err.message }, 'Meilisearch delete task failed — will retry next cycle');
      }
    }
    for (const batch of submittedBatches) {
      try {
        await waitForMeiliTask(meili, batch.taskUid);
        confirmedIds.push(...batch.ids);
      } catch (err) {
        logger.error({ docId, taskUid: batch.taskUid, err: err.message },
          'Meilisearch paragraph task failed — will retry next cycle');
      }
    }

    if (confirmedIds.length > 0) await content.markSynced(confirmedIds);

    // Orphan cleanup is done periodically in runCleanupCycle(), not per-document

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
 * Run cleanup cycle — remove stale documents from Meilisearch
 */
async function runCleanupCycle() {
  logger.info('Starting cleanup cycle');
  try {
    const meili = await getMeili();
    if (!meili) { logger.warn('Meilisearch not available, skipping cleanup'); return; }

    const meiliDocs = await meili.index('documents').getDocuments({ limit: 10000, fields: ['id'] });
    if (!meiliDocs.results || meiliDocs.results.length === 0) { lastCleanupTime = Date.now(); return; }

    const dbDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
    const dbIdSet = new Set(dbDocs.map(d => d.id));

    const staleIds = meiliDocs.results.filter(d => !dbIdSet.has(d.id)).map(d => d.id);
    if (RECONCILE_ENABLED && staleIds.length > 0) {
      logger.info({ count: staleIds.length }, 'Found stale documents in Meilisearch');
      await meili.index('documents').deleteDocuments(staleIds);
      for (const id of staleIds) {
        try {
          await meili.index('paragraphs').deleteDocuments({ filter: `doc_id = ${id}` });
        } catch (err) {
          logger.warn({ id, err: err.message }, 'Failed to delete paragraphs for stale document');
        }
      }
      logger.info({ count: staleIds.length }, 'Cleaned up stale documents from Meilisearch');
    }

    // Paragraph-level orphan cleanup: sample 20 docs per cycle
    try {
      const sampleDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL ORDER BY RANDOM() LIMIT 20');
      let totalOrphans = 0;
      const paragraphsIndex = meili.index('paragraphs');

      for (const doc of sampleDocs) {
        const dbContent = await content.getIdsForDoc(doc.id);
        const dbContentIds = new Set(dbContent.map(r => r.id));
        let offset = 0;
        const meiliParaIds = [];
        while (true) {
          const result = await paragraphsIndex.getDocuments({ filter: `doc_id = ${doc.id}`, fields: ['id'], limit: 1000, offset });
          if (!result.results || result.results.length === 0) break;
          meiliParaIds.push(...result.results.map(r => r.id));
          if (result.results.length < 1000) break;
          offset += 1000;
        }
        const orphanIds = meiliParaIds.filter(id => !dbContentIds.has(id));
        if (RECONCILE_ENABLED && orphanIds.length > 0) {
          await paragraphsIndex.deleteDocuments(orphanIds);
          totalOrphans += orphanIds.length;
          logger.info({ docId: doc.id, orphans: orphanIds.length }, 'Cleaned orphaned paragraphs from Meilisearch');
        }
        if (COOLDOWN_MS > 0) await delay(COOLDOWN_MS);
      }
      if (totalOrphans > 0) logger.info({ totalOrphans, docsChecked: sampleDocs.length }, 'Paragraph orphan cleanup complete');
    } catch (paraErr) {
      logger.warn({ err: paraErr.message }, 'Paragraph-level orphan cleanup failed');
    }

    // Prune resolved meili_sync_tasks older than 7 days — prevents unbounded table growth
    // and keeps the Meilisearch /tasks list endpoint responsive.
    try {
      const cutoff7d = Math.floor(Date.now() / 1000) - 7 * 86400;
      const pruned = await query(
        `DELETE FROM meili_sync_tasks WHERE status != 'processing' AND submitted_at < ?`,
        [cutoff7d]
      );
      if (pruned.changes > 0) logger.info({ pruned: pruned.changes }, 'Pruned old meili_sync_tasks rows');
    } catch (err) {
      logger.warn({ err: err.message }, 'meili_sync_tasks pruning failed (non-fatal)');
    }

    // Purge Meilisearch historical tasks older than 7 days — the /tasks list endpoint
    // hangs when thousands of completed tasks accumulate. Purge succeeded+failed tasks
    // that are at least 7 days old so diagnostics stay fast.
    try {
      const before7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
      const taskPurge = await meili.deleteTasks({ statuses: ['succeeded', 'failed', 'canceled'], beforeEnqueuedAt: before7d });
      if (taskPurge?.taskUid) logger.info({ purgeTaskUid: taskPurge.taskUid, before: before7d }, 'Meili historical task purge submitted');
    } catch (err) {
      logger.warn({ err: err.message }, 'Meili task purge failed (non-fatal)');
    }

    lastCleanupTime = Date.now();
    logger.info('Cleanup cycle complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Cleanup cycle failed');
  }
}

/**
 * Run hourly full sync check — catches documents missed by regular sync
 */
async function runFullSyncCheck() {
  if (!RECONCILE_ENABLED) { logger.info('Full sync check disabled (SYNC_RECONCILE!=1) — skipping to avoid re-sync storm'); return; }
  logger.info('Starting full sync check');
  try {
    const meili = await getMeili();
    if (!meili) { logger.warn('Meilisearch not available, skipping full sync check'); return; }

    const dbDocs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
    const dbIdSet = new Set(dbDocs.map(d => d.id));

    const meiliDocs = await meili.index('documents').getDocuments({ limit: 10000, fields: ['id'] });
    const meiliIdSet = new Set((meiliDocs.results || []).map(d => d.id));

    const missingInMeili = [...dbIdSet].filter(id => !meiliIdSet.has(id));
    if (missingInMeili.length > 0) {
      logger.info({ count: missingInMeili.length }, 'Found documents in DB missing from Meilisearch');
      for (const docId of missingInMeili) await content.markDocDirty(docId);
      logger.info({ count: missingInMeili.length }, 'Marked documents for re-sync');
    }

    // Check for stale paragraphs via count mismatch
    const potentiallyStale = await queryAll(`
      SELECT DISTINCT doc_id FROM content
      WHERE synced = 1
      AND updated_at < datetime('now', '-1 hour')
      LIMIT 100
    `);

    for (const row of potentiallyStale) {
      const dbCountVal = await content.countByDocId(row.doc_id);
      const dbCount = { count: dbCountVal };
      try {
        const meiliResult = await meili.index('paragraphs').search('', {
          filter: `doc_id = ${row.doc_id}`,
          limit: 0
        });
        if (dbCount?.count !== meiliResult.estimatedTotalHits) {
          await content.markDocDirty(row.doc_id);
          logger.info({ docId: row.doc_id, dbCount: dbCount?.count, meiliCount: meiliResult.estimatedTotalHits }, 'Paragraph count mismatch, marking for re-sync');
        }
      } catch {
        await content.markDocDirty(row.doc_id);
      }
    }

    lastFullSyncTime = Date.now();
    logger.info('Full sync check complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Full sync check failed');
  }
}

/**
 * Create a new pending sync job in the database
 */
async function createSyncJob(jobType, totalItems) {
  const result = await query(
    `INSERT INTO sync_jobs (job_type, status, total_items) VALUES (?, 'pending', ?)`,
    [jobType, totalItems]
  );
  return result.lastInsertRowid || result.lastID;
}

/**
 * Mark a job as running
 */
async function markJobRunning(jobId) {
  await query(
    `UPDATE sync_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?`,
    [jobId]
  );
}

/**
 * Update job progress
 */
async function updateJobProgress(jobId, completedItems, failedItems) {
  await query(
    `UPDATE sync_jobs SET completed_items = ?, failed_items = ? WHERE id = ?`,
    [completedItems, failedItems, jobId]
  );
}

/**
 * Mark a job as completed
 */
async function markJobCompleted(jobId, completedItems, failedItems) {
  await query(
    `UPDATE sync_jobs SET status = 'completed', completed_at = datetime('now'), completed_items = ?, failed_items = ? WHERE id = ?`,
    [completedItems, failedItems, jobId]
  );
}

/**
 * Mark a job as failed with an error message
 */
async function markJobFailed(jobId, errorMessage) {
  await query(
    `UPDATE sync_jobs SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`,
    [errorMessage, jobId]
  );
}

/**
 * Mark a running job back to pending (e.g. on restart mid-job)
 */
async function markJobPending(jobId) {
  await query(
    `UPDATE sync_jobs SET status = 'pending', started_at = NULL WHERE id = ?`,
    [jobId]
  );
}

/**
 * Get the oldest pending sync job
 */
async function getNextPendingJob() {
  return queryOne(`SELECT * FROM sync_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`);
}

/**
 * Count unsynced paragraphs
 */
async function countUnsyncedParagraphs() {
  // Direct COUNT query — partial index (idx_content_unsynced) keeps this fast
  const row = await queryOne(`SELECT COUNT(*) as count FROM content WHERE synced = 0 AND deleted_at IS NULL`);
  return row?.count || 0;
}

/**
 * Process a sync job: read flat batches of dirty paragraphs (doc-agnostic),
 * push to Meilisearch, mark synced. Constant memory, constant query time,
 * works identically for 10-paragraph docs and 50K-paragraph docs.
 */
async function processJob(job) {
  logger.info({ jobId: job.id, totalItems: job.total_items }, 'Processing sync job');
  await markJobRunning(job.id);

  let completedItems = job.completed_items || 0;
  let failedItems = job.failed_items || 0;
  const seenDocIds = new Set();
  let batchCount = 0;

  try {
    const meili = await getMeili();
    if (!meili) {
      logger.warn('Meilisearch not available');
      await markJobFailed(job.id, 'Meilisearch unavailable');
      currentJobId = null;
      return;
    }

    const documentsIndex = meili.index('documents');
    const paragraphsIndex = meili.index('paragraphs');

    // Resolve source_site → Meili paragraph-index name. Primary corpus
    // (source_site IS NULL) → 'paragraphs'. Supplementals → per-site index.
    // The registry is populated at boot from sites.yaml; missing entries
    // fall back to primary so a stray supplemental row doesn't get dropped.
    const indexNameForSourceSite = (sourceSite) => {
      if (!sourceSite) return 'paragraphs';
      const cfg = siteRegistryByDomain[sourceSite];
      if (!cfg) {
        logger.warn({ source_site: sourceSite }, 'Sync routing: no registry entry, using primary index');
        return 'paragraphs';
      }
      // null/empty prefix = "share the primary index" (oceanlibrary.com's
      // existing pattern). Per-site indexes only when explicitly configured.
      if (!cfg.meili_index_prefix) return 'paragraphs';
      return `siftersearch_${cfg.meili_index_prefix}_paragraphs`;
    };

    while (!isShuttingDown) {
      // Read a flat batch of dirty paragraphs with doc metadata joined in
      const batch = await content.getDirtyParagraphsBatch(BATCH_SIZE);
      if (batch.length === 0) break;

      // Update document index for any new docs in this batch
      const newDocIds = [...new Set(batch.map(p => p.doc_id))].filter(id => !seenDocIds.has(id));
      if (newDocIds.length > 0) {
        const meiliDocs = newDocIds.map(docId => {
          const p = batch.find(b => b.doc_id === docId);
          seenDocIds.add(docId);
          return {
            id: docId, title: p.title, author: p.author,
            religion: p.religion, collection: p.collection,
            language: p.language,
            year: p.year ? parseInt(p.year, 10) : null,
            description: p.description, filename: p.filename,
            slug: p.slug, paragraph_count: p.paragraph_count,
            encumbered: p.encumbered ? 1 : 0,
            authority: getAuthority(p),
            created_at: new Date().toISOString()
          };
        });
        // Fire-and-forget: documents index is metadata-only, doesn't need
        // to be confirmed before we submit paragraphs.
        documentsIndex.addDocuments(meiliDocs).catch(err => {
          logger.error({ err: err.message, count: meiliDocs.length }, 'Failed to index documents');
        });
      }

      // Delete duplicate paragraphs from Meili (is_duplicate=1 rows belong to
      // docs superseded by an OceanLibrary.com version — must not appear in search).
      const toDelete = batch.filter(p => p.is_duplicate);
      const toUpsert = batch.filter(p => !p.is_duplicate);

      if (toDelete.length > 0) {
        const deleteIds = toDelete.map(p => p.id);
        // Duplicates can span multiple indexes — delete from all.
        const deleteIndexes = new Set(toDelete.map(p => indexNameForSourceSite(p.source_site)));
        for (const indexName of deleteIndexes) {
          try {
            const task = await meili.index(indexName).deleteDocuments(deleteIds);
            await waitForMeiliTask(meili, task.taskUid);
          } catch (err) {
            logger.error({ err: err.message, indexName, count: deleteIds.length }, 'Failed to delete duplicate paragraphs from Meili');
          }
        }
        logger.info({ count: toDelete.length }, 'Deleted duplicate paragraphs from Meili');
      }

      // Build Meilisearch paragraph objects, grouped by destination index.
      // Primary docs (source_site IS NULL) → 'paragraphs'. Supplementals
      // route to siftersearch_<prefix>_paragraphs based on sites.yaml.
      let wrongDimCount = 0;
      const groups = new Map(); // indexName → meiliDoc[]

      for (const p of toUpsert) {
        let embedding = blobToFloatArray(p.embedding);
        if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
          embedding = null;
          wrongDimCount++;
        }
        const meiliDoc = {
          id: p.id, doc_id: p.doc_id,
          paragraph_index: p.paragraph_index, text: p.text,
          context: p.context || null,
          translation: p.translation || null,
          translation_segments: p.translation_segments || null,
          title: p.title, author: p.author, filename: p.filename,
          religion: p.religion, collection: p.collection,
          language: p.language,
          year: p.year ? parseInt(p.year, 10) : null,
          authority: getAuthority(p),
          encumbered: p.encumbered ? 1 : 0,
          heading: p.heading || '',
          blocktype: p.blocktype || 'paragraph',
          source_site: p.source_site || null,
          source_url: p.source_url || null,
          external_para_id: p.external_para_id || null,
          pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null,
          created_at: new Date().toISOString(),
          ...(embedding ? { _vectors: { default: embedding } } : {})
        };
        const indexName = indexNameForSourceSite(p.source_site);
        if (!groups.has(indexName)) groups.set(indexName, []);
        groups.get(indexName).push(meiliDoc);
      }

      if (wrongDimCount > 0) {
        logger.warn({ wrongDimCount, batchSize: batch.length }, 'Wrong-dimension embeddings (FTS-only)');
      }

      // Submit each group to its destination Meili index. Per-index failure
      // doesn't kill the whole batch — failed groups bump failedItems and
      // we continue with the rest. Synced flag still flips so we don't get
      // stuck retrying the same batch.
      let groupErrors = 0;
      for (const [indexName, docs] of groups) {
        try {
          const task = await meili.index(indexName).addDocuments(docs);
          await waitForMeiliTask(meili, task.taskUid);
        } catch (err) {
          logger.error({ err: err.message, indexName, batchSize: docs.length }, 'Failed to submit paragraph batch to per-site index');
          groupErrors += docs.length;
        }
      }
      if (groupErrors > 0) {
        failedItems += groupErrors;
      }
      if (toUpsert.length > 0 && groupErrors === toUpsert.length) {
        // All upsert groups failed — back off and try again later.
        await delay(1000);
        continue;
      }

      // Mark synced — includes both deleted duplicates and upserted paragraphs
      const paraIds = batch.map(p => p.id);
      await content.markSynced(paraIds);
      completedItems += paraIds.length;

      // Log progress every batch
      logger.info({ completedItems, failedItems, batchSize: batch.length, remaining: job.total_items - completedItems },
        'Sync job progress');
      await updateJobProgress(job.id, completedItems, failedItems);

      // Cooldown — let Meilisearch finish indexing before next batch
      await delay(COOLDOWN_MS);

      // Run entity mentions sync every 10 content batches so it isn't blocked
      // by long-running content jobs (which may take hours to complete).
      batchCount++;
      if (batchCount % 10 === 0) {
        try {
          const emResult = await syncEntityMentionsBatch();
          if (emResult?.indexed > 0) logger.info(emResult, 'Entity mentions synced mid-job');
        } catch (err) {
          logger.warn({ err: err.message }, 'Entity mentions sync error mid-job');
        }
      }
    }

    if (isShuttingDown) {
      logger.info({ jobId: job.id, completedItems, failedItems }, 'Shutdown mid-job — requeueing');
      await markJobPending(job.id);
      currentJobId = null;
      return;
    }

    await markJobCompleted(job.id, completedItems, failedItems);
    currentJobId = null;
    logger.info({ jobId: job.id, completedItems, failedItems, docsIndexed: seenDocIds.size }, 'Sync job complete');

  } catch (err) {
    logger.error({ jobId: job.id, err: err.message }, 'Sync job failed');
    await markJobFailed(job.id, err.message);
    currentJobId = null;
  }
}

/**
 * Reconcile meili_sync_tasks rows still marked 'processing' against Meili's
 * actual task status. Only checks tasks older than 1h — lets active syncs finish.
 * Resolves succeeded/failed/canceled; leaves enqueued/processing untouched.
 */
async function reconcileMeiliSyncTasks() {
  const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1h ago
  const stale = await queryAll(
    `SELECT task_uid, para_ids FROM meili_sync_tasks WHERE status = 'processing' AND submitted_at < ? ORDER BY submitted_at ASC LIMIT 200`,
    [cutoff]
  );
  if (stale.length === 0) return;
  logger.info({ count: stale.length }, 'Reconciling stale meili_sync_tasks');
  const meili = getMeili();
  let resolved = 0;
  for (const row of stale) {
    try {
      const task = await meili.tasks.getTask(row.task_uid);
      const s = task.status;
      if (s === 'succeeded' || s === 'failed' || s === 'canceled') {
        if (s === 'failed' || s === 'canceled') {
          const paraIds = JSON.parse(row.para_ids);
          await content.markUnsynced(paraIds);
          logger.warn({ taskUid: row.task_uid, count: paraIds.length, s }, 'Meili task failed — paragraphs re-queued');
        }
        await query(`UPDATE meili_sync_tasks SET status = ?, resolved_at = unixepoch() WHERE task_uid = ?`, [s, row.task_uid]);
        resolved++;
      }
    } catch (err) {
      logger.warn({ taskUid: row.task_uid, err: err.message }, 'Task reconcile check failed — will retry next hour');
    }
  }
  if (resolved > 0) logger.info({ resolved }, 'meili_sync_tasks reconcile complete');
}

/**
 * Reset a batch of pre-April-wipe rows that still have synced=1 but aren't in Meili.
 * Runs inside this process to avoid competing for the write lock with other workers.
 */
async function resetPreWipeBatch() {
  if (preWipeResetDone) return;
  try {
    const result = await query(
      `UPDATE content SET synced = 0 WHERE rowid IN (
         SELECT rowid FROM content WHERE synced = 1 AND created_at < ? LIMIT ?
       )`,
      [PRE_WIPE_CUTOFF, PRE_WIPE_BATCH]
    );
    const changed = result?.changes ?? 0;
    preWipeResetTotal += changed;
    if (changed > 0) {
      logger.info({ changed, total: preWipeResetTotal }, 'Pre-wipe sync reset batch');
    } else {
      logger.info({ total: preWipeResetTotal }, 'Pre-wipe sync reset complete');
      preWipeResetDone = true;
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Pre-wipe sync reset batch failed (non-fatal)');
  }
}

/**
 * Run periodic tasks if their intervals have elapsed
 */
// Create entity_mentions_idx if missing. Settings are applied by the API's
// initializeIndexes() on next restart; we just need the index to exist so
// addDocuments calls succeed. No-op if already present.
async function ensureEntityMentionsIndex() {
  const meili = getMeili();
  if (!meili) return;
  try {
    await meili.getIndex(INDEXES.ENTITY_MENTIONS);
  } catch {
    try {
      await meili.createIndex(INDEXES.ENTITY_MENTIONS, { primaryKey: 'id' });
      logger.info({ index: INDEXES.ENTITY_MENTIONS }, 'entity_mentions_idx created');
    } catch (err) {
      logger.warn({ err: err.message }, 'entity_mentions_idx creation failed');
    }
  }
}

async function runPeriodicTasksIfDue() {
  await resetPreWipeBatch();
  const now = Date.now();
  if (now - lastCleanupTime >= CLEANUP_INTERVAL_MS) await runCleanupCycle();
  if (now - lastFullSyncTime >= FULL_SYNC_INTERVAL_MS) await runFullSyncCheck();
  if (now - lastEntityMentionsSyncTime >= ENTITY_MENTIONS_SYNC_INTERVAL_MS) {
    try {
      const result = await syncEntityMentionsBatch();
      if (result.indexed > 0) logger.info(result, 'Entity mentions synced to Meilisearch');
    } catch (err) {
      logger.warn({ err: err.message }, 'Entity mentions sync error');
    }
    lastEntityMentionsSyncTime = now;
  }
  if (now - lastMeiliReconcileTime >= MEILI_RECONCILE_INTERVAL_MS) {
    await reconcileMeiliSyncTasks();
    lastMeiliReconcileTime = now;
  }
  if (now - lastWalCheckpointTime >= WAL_CHECKPOINT_INTERVAL_MS) {
    try {
      const db = await getDb();
      const result = db.pragma('wal_checkpoint(TRUNCATE)');
      const { busy, log, checkpointed } = result[0];
      logger.info({ busy, log, checkpointed }, 'WAL checkpoint (TRUNCATE)');
      // If readers block TRUNCATE and WAL is large (>50K pages ≈ 200MB), restart the
      // API to clear its perpetual read marks, then re-checkpoint. The API is
      // stateless and restarts in <5s — brief unavailability beats a multi-GB WAL.
      if (busy && log > 50000) {
        logger.warn({ log }, 'WAL checkpoint blocked — restarting siftersearch-api to release reader locks');
        try {
          const { execSync } = await import('child_process');
          execSync('pm2 restart siftersearch-api', { timeout: 30000, stdio: 'inherit' });
          await new Promise(r => setTimeout(r, 5000)); // wait for API to come back up
          const result2 = db.pragma('wal_checkpoint(TRUNCATE)');
          logger.info(result2[0], 'WAL checkpoint (TRUNCATE) after API restart');
        } catch (restartErr) {
          logger.warn({ err: restartErr.message }, 'API restart or re-checkpoint failed');
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'WAL checkpoint failed');
    }
    lastWalCheckpointTime = now;
  }
  // Sync each site-only DB on every idle cycle. Site-only DBs are small
  // (bahaiteachings ~30 MB / 60K paragraphs); a full pass is cheap and we
  // can't rely on sync_jobs since those live only in the main DB.
  await syncSiteOnlyDbs();
}

/**
 * Sync site-only DB content to per-site Meili indexes.
 *
 * Each site-only site lives in its own SQLite at data/sites/<prefix>.db.
 * The main sync_jobs table doesn't cover these — they need their own pump.
 * Idempotent: only rows with synced=0 are pushed; flag flips after Meili
 * confirms the task.
 *
 * Per-site failures (missing DB, Meili rejection, etc.) are logged but
 * don't kill the loop — other sites keep syncing. Empty registry = no-op.
 */
async function syncSiteOnlyDbs() {
  const meili = await getMeili();
  if (!meili) return;
  const siteOnlyConfigs = Object.values(siteRegistryByDomain).filter(c => c.scope === 'site-only');
  if (siteOnlyConfigs.length === 0) return;

  for (const cfg of siteOnlyConfigs) {
    if (isShuttingDown) return;
    try {
      const synced = await syncOneSiteOnlyDb(meili, cfg);
      if (synced > 0) {
        logger.info({ site: cfg.id, synced }, 'Site-only DB sync batch complete');
      }
    } catch (err) {
      logger.error({ site: cfg.id, err: err.message }, 'Site-only DB sync failed');
    }
  }
}

async function syncOneSiteOnlyDb(meili, cfg) {
  const siteDb = await getSiteDb(cfg.id, cfg.meili_index_prefix);
  const indexName = `siftersearch_${cfg.meili_index_prefix}_paragraphs`;
  const idx = meili.index(indexName);
  let total = 0;

  // Pump batches until the queue drains or shutdown fires.
  while (!isShuttingDown) {
    const batch = siteDb.prepare(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype,
             c.embedding, c.embedding_model, c.normalized_hash,
             c.external_para_id, c.pdf_page, c.language,
             d.title, d.author, d.filename, d.source_url, d.source_site
      FROM content c
      JOIN docs d ON d.id = c.doc_id
      WHERE c.synced = 0 AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC
      LIMIT ?
    `).all(BATCH_SIZE);

    if (batch.length === 0) break;

    const meiliDocs = batch.map(p => {
      const embedding = blobToFloatArray(p.embedding);
      const validEmbedding = embedding && embedding.length === content.EXPECTED_EMBEDDING_DIMS ? embedding : null;
      return {
        // Composite ID prevents primary-key collisions across the site indexes,
        // even though each site has its own index in v1.
        id: `${cfg.meili_index_prefix}_${p.id}`,
        site_para_id: p.id,
        doc_id: p.doc_id,
        paragraph_index: p.paragraph_index,
        text: p.text,
        title: p.title,
        author: p.author,
        filename: p.filename,
        source_site: p.source_site,
        source_url: p.source_url,
        external_para_id: p.external_para_id,
        pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null,
        heading: p.heading || '',
        blocktype: p.blocktype || 'paragraph',
        language: p.language || 'en',
        ...(validEmbedding ? { _vectors: { default: validEmbedding } } : {})
      };
    });

    const task = await idx.addDocuments(meiliDocs);
    await waitForMeiliTask(meili, task.taskUid);

    // Mark synced — same as main DB sync, only after Meili confirms.
    const ids = batch.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    siteDb.prepare(`UPDATE content SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
    total += batch.length;
    if (batch.length < BATCH_SIZE) break;
  }
  return total;
}

/**
 * Main worker loop — runs forever, checking for work then sleeping
 */
async function workerLoop() {
  logger.info('Sync processor starting');

  // Run migrations so the sync_jobs table exists
  try {
    logger.info('Running migrations...');
    const migStart = Date.now();
    const result = await runMigrations();
    logger.info({ elapsedMs: Date.now() - migStart, applied: result.applied }, 'Migrations complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Migration failed — aborting');
    process.exit(1);
  }

  // Skip initializeIndexes() — it queues settingsUpdate tasks in Meilisearch
  // on every restart, and those tasks block the entire queue while Meili rebuilds
  // indexes on 2M+ documents. The API server handles index initialization.
  await ensureEntityMentionsIndex();

  // Load sites.yaml so source_site → meili_index_prefix routing works during
  // sync. Skipping is non-fatal — without registry entries, supplemental
  // paragraphs route to the primary index with a warning. Site-only DB sync
  // requires this registry to know which DB files to walk.
  try {
    const configs = await loadAllSiteConfigs();
    siteRegistryByDomain = configs;
    setSiteRegistry(configs);
    const supplemental = Object.values(configs).filter(c => c.scope === 'supplemental').length;
    const siteOnly = Object.values(configs).filter(c => c.scope === 'site-only').length;
    logger.info({ supplemental, site_only: siteOnly, total: Object.keys(configs).length }, 'Sync worker: site registry loaded');
  } catch (err) {
    logger.warn({ err: err.message }, 'Sync worker: site registry not loaded (continuing with primary-only routing)');
  }

  // On startup: any job stuck in 'running' was abandoned mid-flight — requeue it
  logger.info('Checking for stuck sync jobs...');
  const stuckJobs = await queryAll(`SELECT id FROM sync_jobs WHERE status = 'running'`);
  for (const j of stuckJobs) {
    logger.info({ jobId: j.id }, 'Found stuck running job on startup — requeueing');
    await markJobPending(j.id);
  }

  // Run immediate cleanup and full sync check on startup
  lastCleanupTime = 0;
  lastFullSyncTime = 0;

  logger.info('Sync processor ready');

  while (!isShuttingDown) {
    try {
      // Check for a pending job
      let job = await getNextPendingJob();

      if (!job) {
        // No pending job — check if there's unsynced content and auto-create one
        const unsyncedCount = await countUnsyncedParagraphs();
        if (unsyncedCount > 0) {
          logger.info({ unsyncedCount }, 'Found unsynced content — creating sync job');
          const jobId = await createSyncJob('sync', unsyncedCount);
          job = await queryOne(`SELECT * FROM sync_jobs WHERE id = ?`, [jobId]);
        }
      }

      if (job) {
        currentJobId = job.id;
        await processJob(job);
        // Run periodic tasks after each job (WAL checkpoint, cleanup, full-sync).
        // Previously only ran in idle — but when there's always work the idle
        // branch never fires, so WAL checkpoint never ran.
        await runPeriodicTasksIfDue();
        // Immediately check for more work — no sleep after a job completes
        continue;
      }

      // Nothing to do — run periodic tasks then sleep
      await runPeriodicTasksIfDue();

      if (!isShuttingDown) await delay(IDLE_SLEEP_MS);

    } catch (err) {
      logger.error({ err: err.message }, 'Worker loop error');
      // Brief sleep before retry to avoid tight error loops
      await delay(5000);
    }
  }

  logger.info('Sync processor stopped');
}

/**
 * Graceful shutdown — finish current document, then stop
 */
function shutdown() {
  logger.info('Sync processor shutting down (finishing current document)...');
  isShuttingDown = true;
  // Give up to 60s for current document to finish, then force exit
  setTimeout(() => {
    logger.warn('Shutdown timeout, forcing exit');
    process.exit(0);
  }, 60000);
}

// Only start the worker loop when this file is run directly (PM2 entry).
// When imported as a module (tests), the consumer wires up its own state.
const isMain = import.meta.url === `file://${process.argv[1]}` ||
               process.argv[1]?.endsWith('sync-processor.js');
if (isMain) {
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  workerLoop().catch(err => {
    logger.error({ err: err.message }, 'Sync processor crashed');
    process.exit(1);
  });
}

// Exported for tests — syncDocument is the central pipeline operation.
// Production callers should still use the worker loop (PM2 entry).
export { syncDocument, getDocumentMeta };
