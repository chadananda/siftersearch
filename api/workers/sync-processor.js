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

import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getMeili, initializeIndexes } from '../lib/search.js';
import { content } from '../lib/content.js';
import { getAuthority } from '../lib/authority.js';
import { runMigrations } from '../lib/migrations.js';

// Configuration
const BATCH_SIZE = 500; // Large batches — Meilisearch rebuilds indexes per task, so fewer tasks = faster
const MAX_BATCH_BYTES = 90 * 1024 * 1024;  // 90MB limit (Meili has 100MB)
const YIELD_DELAY_MS = 10;        // Delay between batches within a doc
const DOC_DELAY_MS = 50;          // Delay between documents
const IDLE_SLEEP_MS = 10000;      // Sleep when nothing to do
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;     // 5 minutes
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;  // 1 hour
const LOG_PROGRESS_EVERY = 10;    // Log every N documents

// Shutdown flag — set on SIGTERM, causes worker to stop after current document
let isShuttingDown = false;
// Track current job id so we can requeue it on shutdown
let currentJobId = null;
// Timestamps for periodic tasks
let lastCleanupTime = 0;
let lastFullSyncTime = 0;

// Small delay to yield event loop
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get document metadata from docs table
 */
async function getDocumentMeta(docId) {
  return queryOne(`
    SELECT id, title, author, religion, collection, language, year, description, filename
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
    authority,
    chunk_count: paragraphs.length,
    created_at: new Date().toISOString()
  };

  const meiliParagraphs = paragraphs.map(p => {
    let embedding = blobToFloatArray(p.embedding);
    if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
      embedding = null; // Wrong dimensions — FTS-only (logged at doc level below)
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
    // Only include _vectors when embedding exists — Meilisearch rejects
    // documents with null vectors when embedder source is userProvided
    if (embedding) {
      record._vectors = { default: embedding };
    }
    return record;
  });

  const wrongDimCount = meiliParagraphs.filter(p => !p._vectors && paragraphs.find(pp => pp.id === p.id)?.embedding).length;
  if (wrongDimCount > 0) {
    logger.warn({ docId, wrongDimCount, total: paragraphs.length }, 'Paragraphs with wrong-dimension embeddings (FTS-only)');
  }

  try {
    const documentsIndex = meili.index('documents');
    const paragraphsIndex = meili.index('paragraphs');

    // Submit document (don't wait for completion)
    const docTask = await documentsIndex.addDocuments([meiliDoc]);

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
    if (staleIds.length > 0) {
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
        if (orphanIds.length > 0) {
          await paragraphsIndex.deleteDocuments(orphanIds);
          totalOrphans += orphanIds.length;
          logger.info({ docId: doc.id, orphans: orphanIds.length }, 'Cleaned orphaned paragraphs from Meilisearch');
        }
        if (YIELD_DELAY_MS > 0) await delay(YIELD_DELAY_MS);
      }
      if (totalOrphans > 0) logger.info({ totalOrphans, docsChecked: sampleDocs.length }, 'Paragraph orphan cleanup complete');
    } catch (paraErr) {
      logger.warn({ err: paraErr.message }, 'Paragraph-level orphan cleanup failed');
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
  // Use counter table (trigger-maintained) to avoid blocking full table scan on 2.5M rows
  try {
    const row = await queryOne(`SELECT row_count as count FROM table_counts WHERE table_name = 'content_unsynced'`);
    if (row) return row.count || 0;
  } catch {
    // Counter table may not exist yet
  }
  // Fallback to COUNT query
  const row = await queryOne(`SELECT COUNT(*) as count FROM content WHERE synced = 0 AND deleted_at IS NULL`);
  return row?.count || 0;
}

/**
 * Process a sync job: sync all dirty documents until none remain
 */
async function processJob(job) {
  logger.info({ jobId: job.id, totalItems: job.total_items }, 'Processing sync job');
  await markJobRunning(job.id);

  let completedItems = job.completed_items || 0;
  let failedItems = job.failed_items || 0;
  let docsProcessed = 0;

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

    while (!isShuttingDown) {
      // Get docs with dirty paragraphs — large batch for mega-submit
      const docs = await content.getDocsWithDirtyParagraphs(100);
      if (docs.length === 0) break;

      // Collect all documents and paragraphs for this batch
      const allMeiliDocs = [];
      const allMeiliParas = [];
      const allParaIds = [];
      let wrongDimTotal = 0;

      for (const doc of docs) {
        if (isShuttingDown) break;

        const paragraphs = await content.getDirtyParagraphsForDoc(doc.id);
        if (paragraphs.length === 0) continue;

        const authority = getAuthority(doc);
        allMeiliDocs.push({
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
        });

        for (const p of paragraphs) {
          let embedding = blobToFloatArray(p.embedding);
          if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
            embedding = null;
            wrongDimTotal++;
          }
          allMeiliParas.push({
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
            created_at: new Date().toISOString(),
            // Only include _vectors when embedding exists — Meilisearch rejects null vectors
            ...(embedding ? { _vectors: { default: embedding } } : {})
          });
          allParaIds.push(p.id);
        }

        docsProcessed++;
      }

      if (allMeiliParas.length === 0) break;

      if (wrongDimTotal > 0) {
        logger.warn({ wrongDimTotal, totalParas: allMeiliParas.length }, 'Paragraphs with wrong-dimension embeddings (FTS-only)');
      }

      // Submit all documents in one batch
      const taskUids = [];
      try {
        const docTask = await documentsIndex.addDocuments(allMeiliDocs);
        taskUids.push(docTask.taskUid);
      } catch (err) {
        logger.error({ err: err.message, count: allMeiliDocs.length }, 'Failed to submit document batch');
      }

      // Submit paragraphs in large batches (respect Meilisearch payload limits)
      for (let i = 0; i < allMeiliParas.length; i += BATCH_SIZE) {
        const batch = allMeiliParas.slice(i, i + BATCH_SIZE);
        try {
          const task = await paragraphsIndex.addDocuments(batch);
          taskUids.push(task.taskUid);
        } catch (err) {
          logger.error({ err: err.message, batchStart: i, batchSize: batch.length }, 'Failed to submit paragraph batch');
          failedItems += batch.length;
        }
      }

      logger.info({ docs: allMeiliDocs.length, paragraphs: allMeiliParas.length, tasks: taskUids.length }, 'Submitted mega-batch to Meilisearch');

      // Wait for ALL tasks to complete (Meilisearch processes them sequentially anyway)
      let confirmedCount = 0;
      for (const uid of taskUids) {
        try {
          await waitForMeiliTask(meili, uid);
          confirmedCount++;
        } catch (err) {
          logger.error({ taskUid: uid, err: err.message }, 'Meilisearch task failed');
        }
      }

      // Mark all paragraphs as synced
      if (allParaIds.length > 0) {
        // Mark in batches of 500 to avoid SQLite parameter limits
        for (let i = 0; i < allParaIds.length; i += 500) {
          const batch = allParaIds.slice(i, i + 500);
          await content.markSynced(batch);
        }
        completedItems += allParaIds.length;
      }

      logger.info({ docsProcessed, completedItems, failedItems, remaining: job.total_items - completedItems },
        'Sync job progress');

      // Update progress in DB so API can display it
      await updateJobProgress(job.id, completedItems, failedItems);

      // Small yield between mega-batches
      await delay(DOC_DELAY_MS);
    }

    if (isShuttingDown) {
      logger.info({ jobId: job.id, completedItems, failedItems }, 'Shutdown mid-job — requeueing');
      await markJobPending(job.id);
      currentJobId = null;
      return;
    }

    await markJobCompleted(job.id, completedItems, failedItems);
    currentJobId = null;
    logger.info({ jobId: job.id, completedItems, failedItems, docsProcessed }, 'Sync job complete');

  } catch (err) {
    logger.error({ jobId: job.id, err: err.message }, 'Sync job failed');
    await markJobFailed(job.id, err.message);
    currentJobId = null;
  }
}

/**
 * Run periodic tasks if their intervals have elapsed
 */
async function runPeriodicTasksIfDue() {
  const now = Date.now();
  if (now - lastCleanupTime >= CLEANUP_INTERVAL_MS) await runCleanupCycle();
  if (now - lastFullSyncTime >= FULL_SYNC_INTERVAL_MS) await runFullSyncCheck();
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

  // Initialize Meilisearch indexes in background (non-blocking)
  // The meilisearch-js client can hang on updateSettings() when Meilisearch has
  // a large task queue. Run in background so sync worker can start immediately.
  initializeIndexes().then(() => {
    logger.info('Meilisearch indexes initialized (background)');
  }).catch(err => {
    logger.warn({ err: err.message }, 'Failed to initialize Meilisearch indexes (non-fatal)');
  });

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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start
workerLoop().catch(err => {
  logger.error({ err: err.message }, 'Sync processor crashed');
  process.exit(1);
});
