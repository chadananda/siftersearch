#!/usr/bin/env node
// :arch: Single-writer worker — the ONLY process that writes to SQLite
// :why: SQLite is single-writer; 5 competing writers caused D-state hangs on memory-starved server
// :deps: sync-processor logic (Meilisearch sync) | job-processor logic (translation/audio) | library-watcher (periodic scan)
// :rules: ONE instance only. API is read-only. All writes flow through this process.
// :edge: Must run migrations before processing. Graceful shutdown requeues in-flight sync jobs.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { getMeili } from '../lib/search.js';
import { content } from '../lib/content.js';
import { getAuthority } from '../lib/authority.js';
import { runMigrations } from '../lib/migrations.js';
import { getNextPendingJob as getNextPendingTranslationJob, cleanupExpiredJobs, updateJobHeartbeat, recoverStuckJobs, markJobForRetry } from '../services/jobs.js';
import { processTranslationJob } from '../services/translation.js';
import { processAudioJob } from '../services/audio.js';
import { notifyJobComplete, processEmailQueue } from '../services/email.js';
import { JOB_TYPES } from '../services/jobs.js';
import { reportUsageToStripe } from '../lib/billing.js';

// ============================================================
// Configuration
// ============================================================
const PARA_BATCH_SIZE = 200;    // paragraphs per Meilisearch batch (200 × 12KB ≈ 2.4MB)
const YIELD_DELAY_MS = 10;
const DOC_DELAY_MS = 50;
const IDLE_SLEEP_MS = 10000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30000;
const USAGE_REPORT_INTERVAL_MS = 5 * 60 * 1000;

// ============================================================
// State
// ============================================================
let isShuttingDown = false;
let currentSyncJobId = null;
let lastCleanupTime = 0;
let lastFullSyncTime = 0;
let lastJobCleanupTime = 0;
let lastUsageReportTime = 0;
let activeHeartbeatInterval = null;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================
// Sync logic (from sync-processor.js)
// ============================================================

function blobToFloatArray(blob) {
  if (!blob) return null;
  let floatArray;
  if (Array.isArray(blob)) {
    floatArray = blob;
  } else {
    const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    floatArray = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
  }
  if (floatArray.some(v => !Number.isFinite(v))) {
    logger.warn({ invalidCount: floatArray.filter(v => !Number.isFinite(v)).length }, 'Embedding contains NaN/Infinity values, skipping');
    return null;
  }
  return floatArray;
}

async function waitForMeiliTask(meili, enqueuedTask, timeoutMs = 3600000) {
  const taskUid = typeof enqueuedTask === 'number' ? enqueuedTask : enqueuedTask.taskUid;
  const task = await meili.tasks.waitForTask(taskUid, { timeout: timeoutMs });
  if (task.status === 'failed') {
    throw new Error(`Meilisearch task ${taskUid} failed: ${task.error?.message || 'Unknown error'}`);
  }
  return task;
}

async function countUnsyncedParagraphs() {
  try {
    const row = await queryOne(`SELECT row_count as count FROM table_counts WHERE table_name = 'content_unsynced'`);
    if (row) return row.count || 0;
  } catch { /* counter table may not exist */ }
  const row = await queryOne(`SELECT COUNT(*) as count FROM content WHERE synced = 0 AND deleted_at IS NULL`);
  return row?.count || 0;
}

async function createSyncJob(jobType, totalItems) {
  const result = await query(
    `INSERT INTO sync_jobs (job_type, status, total_items) VALUES (?, 'pending', ?)`,
    [jobType, totalItems]
  );
  return result.lastInsertRowid || result.lastID;
}

async function getNextPendingSyncJob() {
  return queryOne(`SELECT * FROM sync_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`);
}

async function processSyncJob(job) {
  logger.info({ jobId: job.id, totalItems: job.total_items }, 'Processing sync job');
  await query(`UPDATE sync_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?`, [job.id]);
  let completedItems = job.completed_items || 0;
  let failedItems = job.failed_items || 0;
  let docsProcessed = 0;
  try {
    const meili = await getMeili();
    if (!meili) {
      logger.warn('Meilisearch not available');
      await query(`UPDATE sync_jobs SET status = 'failed', completed_at = datetime('now'), error = 'Meilisearch unavailable' WHERE id = ?`, [job.id]);
      currentSyncJobId = null;
      return;
    }
    const documentsIndex = meili.index('documents');
    const paragraphsIndex = meili.index('paragraphs');
    // Process one doc at a time, paragraph batches of PARA_BATCH_SIZE.
    // Large docs (10K+ paragraphs) would OOM if loaded all at once.
    while (!isShuttingDown) {
      const docs = await content.getDocsWithDirtyParagraphs(1);
      if (docs.length === 0) break;
      const doc = docs[0];
      const authority = getAuthority(doc);
      // Submit the doc metadata (fire-and-forget — Meilisearch is eventually consistent)
      try {
        const totalDirty = await queryOne(`SELECT COUNT(*) as cnt FROM content WHERE doc_id = ? AND synced = 0 AND deleted_at IS NULL`, [doc.id]);
        await documentsIndex.addDocuments([{
          id: doc.id, title: doc.title, author: doc.author, religion: doc.religion,
          collection: doc.collection, language: doc.language,
          year: doc.year ? parseInt(doc.year, 10) : null,
          description: doc.description, filename: doc.filename, authority,
          chunk_count: totalDirty?.cnt || 0, created_at: new Date().toISOString()
        }]);
      } catch (err) {
        logger.error({ err: err.message, docId: doc.id }, 'Failed to submit document');
      }
      // Process paragraphs in small batches (200 paragraphs × 12KB ≈ 2.4MB per batch)
      let docParasProcessed = 0;
      while (!isShuttingDown) {
        const paragraphs = await content.getDirtyParagraphsForDoc(doc.id, PARA_BATCH_SIZE);
        if (paragraphs.length === 0) break;
        const meiliParas = [];
        const paraIds = [];
        let wrongDimBatch = 0;
        for (const p of paragraphs) {
          let embedding = blobToFloatArray(p.embedding);
          if (embedding && embedding.length !== content.EXPECTED_EMBEDDING_DIMS) {
            embedding = null;
            wrongDimBatch++;
          }
          meiliParas.push({
            id: p.id, doc_id: p.doc_id, paragraph_index: p.paragraph_index,
            text: p.text, context: p.context || null,
            translation: p.translation || null, translation_segments: p.translation_segments || null,
            title: doc.title, author: doc.author, filename: doc.filename,
            religion: doc.religion, collection: doc.collection, language: doc.language,
            year: doc.year ? parseInt(doc.year, 10) : null, authority,
            heading: p.heading || '', blocktype: p.blocktype || 'paragraph',
            created_at: new Date().toISOString(),
            _vectors: { default: embedding || null }
          });
          paraIds.push(p.id);
        }
        if (wrongDimBatch > 0) {
          logger.warn({ wrongDimBatch, batchSize: meiliParas.length }, 'Wrong-dimension embeddings in batch (FTS-only)');
        }
        // Submit paragraph batch to Meilisearch (fire-and-forget)
        // Meilisearch is eventually consistent — no need to wait for task completion.
        // Waiting blocks the worker for minutes when the Meilisearch queue is backed up.
        try {
          await paragraphsIndex.addDocuments(meiliParas);
        } catch (err) {
          logger.error({ err: err.message, docId: doc.id, batchSize: meiliParas.length }, 'Paragraph batch failed');
          failedItems += meiliParas.length;
        }
        // Mark synced — data has been submitted to Meilisearch
        await content.markSynced(paraIds);
        completedItems += paraIds.length;
        docParasProcessed += paraIds.length;
        // Free memory before next batch
        meiliParas.length = 0;
        paraIds.length = 0;
        await delay(YIELD_DELAY_MS);
      }
      docsProcessed++;
      logger.info({ docId: doc.id, docTitle: doc.title, docParasProcessed, completedItems, failedItems, remaining: job.total_items - completedItems }, 'Sync job progress');
      await query(`UPDATE sync_jobs SET completed_items = ?, failed_items = ? WHERE id = ?`, [completedItems, failedItems, job.id]);
      await delay(DOC_DELAY_MS);
    }
    if (isShuttingDown) {
      logger.info({ jobId: job.id, completedItems, failedItems }, 'Shutdown mid-job — requeueing');
      await query(`UPDATE sync_jobs SET status = 'pending', started_at = NULL WHERE id = ?`, [job.id]);
      currentSyncJobId = null;
      return;
    }
    await query(`UPDATE sync_jobs SET status = 'completed', completed_at = datetime('now'), completed_items = ?, failed_items = ? WHERE id = ?`,
      [completedItems, failedItems, job.id]);
    currentSyncJobId = null;
    logger.info({ jobId: job.id, completedItems, failedItems, docsProcessed }, 'Sync job complete');
  } catch (err) {
    logger.error({ jobId: job.id, err: err.message }, 'Sync job failed');
    await query(`UPDATE sync_jobs SET status = 'failed', completed_at = datetime('now'), error = ? WHERE id = ?`, [err.message, job.id]);
    currentSyncJobId = null;
  }
}

// ============================================================
// Cleanup cycles (from sync-processor.js)
// ============================================================

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
        try { await meili.index('paragraphs').deleteDocuments({ filter: `doc_id = ${id}` }); } catch (err) {
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
    const potentiallyStale = await queryAll(`
      SELECT DISTINCT doc_id FROM content WHERE synced = 1 AND updated_at < datetime('now', '-1 hour') LIMIT 100
    `);
    for (const row of potentiallyStale) {
      const dbCount = await content.countByDocId(row.doc_id);
      try {
        const meiliResult = await meili.index('paragraphs').search('', { filter: `doc_id = ${row.doc_id}`, limit: 0 });
        if (dbCount !== meiliResult.estimatedTotalHits) {
          await content.markDocDirty(row.doc_id);
          logger.info({ docId: row.doc_id, dbCount, meiliCount: meiliResult.estimatedTotalHits }, 'Paragraph count mismatch, marking for re-sync');
        }
      } catch { await content.markDocDirty(row.doc_id); }
    }
    lastFullSyncTime = Date.now();
    logger.info('Full sync check complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Full sync check failed');
  }
}

// ============================================================
// Translation/audio job processing (from job-processor.js)
// ============================================================

async function processTranslationAudioJob(job) {
  logger.info({ jobId: job.id, type: job.type }, 'Processing job');
  // Start heartbeat
  activeHeartbeatInterval = setInterval(async () => {
    try { await updateJobHeartbeat(job.id); } catch (err) {
      logger.error({ jobId: job.id, error: err.message }, 'Failed to update heartbeat');
    }
  }, HEARTBEAT_INTERVAL_MS);
  try { await updateJobHeartbeat(job.id); } catch { /* ignore */ }
  try {
    switch (job.type) {
      case JOB_TYPES.TRANSLATION:
        await processTranslationJob(job);
        break;
      case JOB_TYPES.AUDIO:
        await processAudioJob(job);
        break;
      default:
        logger.warn({ jobId: job.id, type: job.type }, 'Unknown job type');
        return;
    }
    await notifyJobComplete(job.id);
    logger.info({ jobId: job.id }, 'Job completed');
  } catch (err) {
    logger.error({ jobId: job.id, error: err.message }, 'Job failed');
    const willRetry = await markJobForRetry(job.id, err.message);
    if (!willRetry) {
      try { await notifyJobComplete(job.id); } catch (notifyErr) {
        logger.error({ jobId: job.id, error: notifyErr.message }, 'Failed to send failure notification');
      }
    }
  } finally {
    if (activeHeartbeatInterval) {
      clearInterval(activeHeartbeatInterval);
      activeHeartbeatInterval = null;
    }
  }
}

// ============================================================
// Periodic tasks
// ============================================================

async function runPeriodicTasks() {
  const now = Date.now();
  if (now - lastCleanupTime >= CLEANUP_INTERVAL_MS) await runCleanupCycle();
  if (now - lastFullSyncTime >= FULL_SYNC_INTERVAL_MS) await runFullSyncCheck();
  if (now - lastJobCleanupTime >= JOB_CLEANUP_INTERVAL_MS) {
    try {
      const cleaned = await cleanupExpiredJobs();
      if (cleaned > 0) logger.info({ cleaned }, 'Cleaned up expired jobs');
    } catch (err) {
      logger.error({ error: err.message }, 'Job cleanup error');
    }
    lastJobCleanupTime = now;
  }
  // Process email queue
  try { await processEmailQueue(5); } catch { /* ignore */ }
  // Report API usage to Stripe every 5 min
  if (now - lastUsageReportTime >= USAGE_REPORT_INTERVAL_MS) {
    try { await reportUsageToStripe(); } catch (err) { logger.error({ error: err.message }, 'Usage report error'); }
    lastUsageReportTime = now;
  }
}

// ============================================================
// Main worker loop
// ============================================================

async function workerLoop() {
  logger.info('Unified worker starting');
  // Run migrations
  try {
    logger.info('Running migrations...');
    const migStart = Date.now();
    const result = await runMigrations();
    logger.info({ elapsedMs: Date.now() - migStart, applied: result.applied }, 'Migrations complete');
  } catch (err) {
    logger.error({ err: err.message }, 'Migration failed — aborting');
    process.exit(1);
  }
  // Skip initializeIndexes() — settings updates are idempotent but queue
  // Meilisearch tasks on every restart, backing up the queue and blocking sync.
  // The API runs initializeIndexes() on startup; the worker doesn't need to.
  // Recover stuck sync jobs
  const stuckSyncJobs = await queryAll(`SELECT id FROM sync_jobs WHERE status = 'running'`);
  for (const j of stuckSyncJobs) {
    logger.info({ jobId: j.id }, 'Found stuck sync job on startup — requeueing');
    await query(`UPDATE sync_jobs SET status = 'pending', started_at = NULL WHERE id = ?`, [j.id]);
  }
  // Recover stuck translation/audio jobs
  try {
    const recovered = await recoverStuckJobs();
    if (recovered.length > 0) {
      logger.info({ count: recovered.length }, 'Recovered stuck translation/audio jobs on startup');
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to recover stuck jobs');
  }
  // Let periodic tasks run on their normal intervals (cleanup: 5min, full sync: 1hr)
  // Don't force them on startup — they add load and delay the main sync loop
  lastCleanupTime = Date.now();
  lastFullSyncTime = Date.now();
  lastJobCleanupTime = Date.now();
  lastUsageReportTime = Date.now();
  logger.info('Unified worker ready');
  while (!isShuttingDown) {
    try {
      let didWork = false;
      // 1. Check for pending sync jobs → process
      let syncJob = await getNextPendingSyncJob();
      if (!syncJob) {
        const unsyncedCount = await countUnsyncedParagraphs();
        if (unsyncedCount > 0) {
          logger.info({ unsyncedCount }, 'Found unsynced content — creating sync job');
          const jobId = await createSyncJob('sync', unsyncedCount);
          syncJob = await queryOne(`SELECT * FROM sync_jobs WHERE id = ?`, [jobId]);
        }
      }
      if (syncJob) {
        currentSyncJobId = syncJob.id;
        await processSyncJob(syncJob);
        didWork = true;
      }
      // 2. Check for pending translation/audio jobs → process one
      if (!isShuttingDown) {
        const translationJob = await getNextPendingTranslationJob();
        if (translationJob) {
          await processTranslationAudioJob(translationJob);
          didWork = true;
        }
      }
      // 3. Run periodic tasks (cleanup, full sync check, email queue)
      if (!isShuttingDown) {
        await runPeriodicTasks();
      }
      // Sleep if nothing to do
      if (!didWork && !isShuttingDown) {
        await delay(IDLE_SLEEP_MS);
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Worker loop error');
      await delay(5000);
    }
  }
  logger.info('Unified worker stopped');
}

// ============================================================
// Graceful shutdown
// ============================================================

function shutdown() {
  logger.info('Unified worker shutting down (finishing current work)...');
  isShuttingDown = true;
  if (activeHeartbeatInterval) {
    clearInterval(activeHeartbeatInterval);
    activeHeartbeatInterval = null;
  }
  setTimeout(() => {
    logger.warn('Shutdown timeout, forcing exit');
    process.exit(0);
  }, 60000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

workerLoop().catch(err => {
  logger.error({ err: err.message }, 'Unified worker crashed');
  process.exit(1);
});
