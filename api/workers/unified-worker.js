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

import { createServer } from 'node:http';
import { query, queryOne, queryAll, getSiteDb, getDb } from '../lib/db.js';
import { applyWriteBatch } from '../lib/write-server.js';
import { logger } from '../lib/logger.js';
import { getMeili, syncHypeBatch, syncEntityMentionsBatch } from '../lib/search.js';
import { syncAliasesToMeili } from '../lib/graph-meili-sync.js';
import { content } from '../lib/content.js';
import { getAuthority } from '../lib/authority.js';
import { runMigrations } from '../lib/migrations.js';
import { setSiteRegistry } from '../lib/search/scope.js';
import { loadAllSiteConfigs } from '../services/sites-ingester.js';
import { getNextPendingJob as getNextPendingTranslationJob, cleanupExpiredJobs, updateJobHeartbeat, recoverStuckJobs, markJobForRetry } from '../services/jobs.js';
import { processTranslationJob } from '../services/translation.js';
import { processAudioJob } from '../services/audio.js';
import { notifyJobComplete, processEmailQueue } from '../services/email.js';
import { JOB_TYPES } from '../services/jobs.js';
import { reportUsageToStripe } from '../lib/billing.js';
import { runBackup, shouldRunBackup } from '../lib/backup.js';

// Site registry populated at boot from sites.yaml. Used to resolve
// source_site → meili_index_prefix for sync routing AND to drive the
// site-only DB sync loop. Empty = primary-only routing (pre-sites behavior).
let siteRegistryByDomain = {};

// ============================================================
// Configuration
// ============================================================
const PARA_BATCH_SIZE = 1000;   // rows per getDirtyParagraphsForDoc call; must exceed largest doc so inner loop processes all rows in one pass
const YIELD_DELAY_MS = 10;
const DOC_DELAY_MS = 50;
const IDLE_SLEEP_MS = 10000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30000;
const USAGE_REPORT_INTERVAL_MS = 5 * 60 * 1000;
const HYPE_SYNC_INTERVAL_MS = 60 * 1000;  // 60s — keep new HyPE indexed promptly
const HYPE_SYNC_BATCH = 100;              // paragraphs per batch (~500 questions = 1 OpenAI batch call)
const ENTITY_SYNC_INTERVAL_MS = 30 * 1000;   // 30s — drain backlog faster
const ENTITY_SYNC_BATCH = 1000;
const ALIAS_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min — synonym refresh
const WAL_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000; // 15 min — TRUNCATE keeps WAL near-zero
// Pre-wipe reset disabled: it created an infinite loop fighting the sync worker
// (sync marks synced=1, reset marks synced=0, repeat forever on 3.45M rows).
// Paragraphs are re-indexed via normal synced=0 processing when needed.
const PRE_WIPE_CUTOFF = '2020-01-01'; // effectively disabled — no rows match
const PRE_WIPE_BATCH = 500;

// ============================================================
// State
// ============================================================
let isShuttingDown = false;
let currentSyncJobId = null;
let lastCleanupTime = 0;
let lastFullSyncTime = 0;
let lastJobCleanupTime = 0;
let lastUsageReportTime = 0;
let lastHypeSyncTime = 0;
let lastEntitySyncTime = 0;
let lastAliasSyncTime = 0;
let lastWalCheckpointTime = 0;
let activeHeartbeatInterval = null;
let preWipeResetDone = false;
let preWipeResetTotal = 0;

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

// Reconcile any meili_sync_tasks that are still 'processing' from a previous run.
// Tasks older than minAgeSeconds are checked against Meilisearch; failures
// re-queue their paragraphs (synced=0) so the worker picks them up again.
async function reconcileSyncTasks(meili, minAgeSeconds = 3600) {
  const stale = await queryAll(
    `SELECT * FROM meili_sync_tasks WHERE status = 'processing' AND submitted_at < ? ORDER BY submitted_at ASC LIMIT 200`,
    [Math.floor(Date.now() / 1000) - minAgeSeconds]
  );
  if (stale.length === 0) return;
  logger.info({ count: stale.length }, 'Reconciling stale Meilisearch sync tasks');
  for (const row of stale) {
    try {
      const task = await meili.tasks.getTask(row.task_uid);
      const status = task.status; // succeeded|failed|processing|enqueued|canceled
      if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
        if (status === 'failed' || status === 'canceled') {
          const paraIds = JSON.parse(row.para_ids);
          await content.markUnsynced(paraIds);
          logger.warn({ taskUid: row.task_uid, count: paraIds.length, status }, 'Meili task failed — paragraphs re-queued for retry');
        }
        await query(`UPDATE meili_sync_tasks SET status = ?, resolved_at = unixepoch() WHERE task_uid = ?`, [status, row.task_uid]);
      }
      // Still processing — leave it; will be checked again next reconcile pass.
    } catch (err) {
      logger.warn({ taskUid: row.task_uid, err: err.message }, 'Task reconciliation check failed — will retry');
    }
  }
}

// Prune non-blocking in-flight task queue: pop any tasks that have already
// completed without blocking the main loop. Returns immediately.
async function pruneCompleted(meili, inFlight) {
  while (inFlight.length > 0) {
    const oldest = inFlight[0];
    try {
      const task = await meili.tasks.getTask(oldest.taskUid);
      if (task.status === 'processing' || task.status === 'enqueued') break; // oldest still running
      inFlight.shift();
      const finalStatus = task.status === 'succeeded' ? 'succeeded' : task.status;
      if (task.status === 'failed' || task.status === 'canceled') {
        logger.warn({ taskUid: oldest.taskUid, indexName: oldest.indexName }, 'Meilisearch task failed after optimistic sync — paragraphs already synced; will reconcile on restart if needed');
      }
      await query(`UPDATE meili_sync_tasks SET status = ?, resolved_at = unixepoch() WHERE task_uid = ?`, [finalStatus, oldest.taskUid]);
    } catch (err) {
      // Can't check — leave in flight
      break;
    }
  }
}

async function countUnsyncedParagraphs() {
  // Direct COUNT query — partial index (idx_content_unsynced) keeps this fast
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
    // Resolve a doc's source_site → Meili paragraph index name.
    // Primary docs (source_site IS NULL) → 'paragraphs'. Supplementals
    // route to siftersearch_<prefix>_paragraphs based on sites.yaml. Null
    // prefix (OL pattern) keeps docs in the primary index.
    const indexNameForDoc = (doc) => {
      if (!doc?.source_site) return 'paragraphs';
      const cfg = siteRegistryByDomain[doc.source_site];
      if (!cfg) {
        logger.warn({ source_site: doc.source_site, doc_id: doc.id }, 'Sync routing: no registry entry, using primary index');
        return 'paragraphs';
      }
      if (!cfg.meili_index_prefix) return 'paragraphs';
      return `siftersearch_${cfg.meili_index_prefix}_paragraphs`;
    };
    // Optimistic sync: submit batches to Meilisearch and mark paragraphs
    // synced=1 immediately — do NOT block waiting for HNSW indexing.
    //
    // HNSW rebuilds for 4M+ vectors take 15-60 min per batch. Blocking on
    // task confirmation meant the worker could only process ~100 docs/hour.
    // Now the worker submits freely; a startup reconciler handles failures.
    //
    // Backpressure: cap concurrent in-flight tasks at PIPELINE_LIMIT so we
    // don't overwhelm Meilisearch's task queue. When at the limit, prune
    // completed tasks (non-blocking) before submitting more. If still at
    // limit (all tasks still processing), yield briefly and retry.
    //
    // Recovery: on startup, reconcileSyncTasks() checks tasks older than 1h.
    // Failed tasks mark their paragraph IDs back to synced=0 for retry.
    const PIPELINE_LIMIT = 20;  // more headroom since we don't block on completion
    const FLUSH_PARAS = 500;    // larger batches = fewer HNSW rebuilds = faster overall
    const buffer = new Map();   // indexName -> { paras: [], paraIds: [] }
    const inFlight = [];        // [{taskUid, indexName}] — lightweight, no paraIds needed here

    // Reconcile old tasks from previous worker runs before starting new work.
    await reconcileSyncTasks(meili);

    const flushBuffer = async (indexName, force = false) => {
      const buf = buffer.get(indexName);
      if (!buf || buf.paras.length === 0) return;
      if (!force && buf.paras.length < FLUSH_PARAS) return;
      // Backpressure: if queue is full, prune completed tasks first.
      if (inFlight.length >= PIPELINE_LIMIT) {
        await pruneCompleted(meili, inFlight);
        if (inFlight.length >= PIPELINE_LIMIT) {
          // All slots still occupied (tasks still indexing) — yield briefly.
          await delay(2000);
          await pruneCompleted(meili, inFlight);
        }
      }
      const paras = buf.paras;
      const paraIds = buf.paraIds;
      buffer.set(indexName, { paras: [], paraIds: [] });
      try {
        const task = await meili.index(indexName).addDocuments(paras, { primaryKey: 'id' });
        const taskUid = task.taskUid ?? task;
        // Optimistic: mark synced immediately. Reconciler re-queues on failure.
        await content.markSynced(paraIds);
        await query(
          `INSERT OR IGNORE INTO meili_sync_tasks (task_uid, index_uid, para_ids) VALUES (?,?,?)`,
          [taskUid, indexName, JSON.stringify(paraIds)]
        );
        inFlight.push({ taskUid, indexName });
        completedItems += paraIds.length;
      } catch (err) {
        logger.error({ err: err.message, indexName, batchSize: paras.length }, 'Failed to enqueue addDocuments — paragraphs stay synced=0 for retry');
        failedItems += paras.length;
      }
    };

    // Process one doc at a time, paragraph batches of PARA_BATCH_SIZE.
    // Large docs (10K+ paragraphs) would OOM if loaded all at once.
    //
    // inFlightDocIds tracks docs whose paragraphs we've already buffered/
    // queued in this run. Without it, the outer loop spins on the same
    // doc — getDocsWithDirtyParagraphs returns docs by `synced=0` rows,
    // and our buffer/inFlight pipeline doesn't flip synced until drain.
    // So a doc whose paras are queued but not yet drained still looks
    // dirty to the outer fetch. Combined with cross-doc batching, the
    // worker would re-process the same doc dozens of times before drain.
    const inFlightDocIds = new Set();
    while (!isShuttingDown) {
      // One fetch per batch — not per doc. With LIMIT=500 and a 600ms WAL-heavy
      // query, re-fetching on every doc would cost 500×600ms=5min of overhead
      // per batch. Fetch once, iterate all fresh docs, re-fetch only when batch
      // exhausted or pipeline backed up.
      const docs = await content.getDocsWithDirtyParagraphs(500);
      const fresh = docs.filter(d => !inFlightDocIds.has(d.id));
      if (fresh.length === 0) {
        // All visible-dirty docs are already in our pipeline. Drain one
        // task to release some IDs back, then re-check. If nothing in
        // flight either, we're truly done.
        if (inFlight.length === 0) break;
        // Optimistic sync: synced=1 is already set on submission. Yield briefly
        // then prune completed tasks so inFlightDocIds stays bounded. No need
        // to block until Meili confirms — just release IDs and re-fetch.
        await delay(2000);
        await pruneCompleted(meili, inFlight);
        inFlightDocIds.clear();
        continue;
      }
      // Process all fresh docs before re-fetching to avoid paying the slow
      // getDocsWithDirtyParagraphs query cost on every single document.
      for (const doc of fresh) {
        if (isShuttingDown) break;
        inFlightDocIds.add(doc.id);

        try {
          let authority;
          try { authority = getAuthority(doc); } catch { authority = 0; }

          // Submit doc metadata
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
            logger.error({ err: err.message, docId: doc.id }, 'Failed to submit document metadata');
          }

          // Process paragraphs in batches.
          //
          // pendingIds prevents re-buffering the same rows. Without this, the
          // inner loop re-fetches `synced=0` rows on every iteration — which
          // INCLUDES rows we've already buffered or sent in-flight, because
          // markSynced doesn't flip until drainOldest runs (later).
          // Effect of the bug: a 1-paragraph doc would be buffered hundreds
          // of times until the pipeline drained, generating massive Meili
          // duplicate-update tasks and 95% timeout-failure rate (observed).
          const pendingIds = new Set();
          let docParasProcessed = 0;
          while (!isShuttingDown) {
            const fetched = await content.getDirtyParagraphsForDoc(doc.id, PARA_BATCH_SIZE);
            // Skip rows already buffered/in-flight in this doc loop iteration.
            const paragraphs = fetched.filter(p => !pendingIds.has(p.id));
            if (paragraphs.length === 0) break;
            const normalizedHashes = paragraphs.map(p => p.normalized_hash).filter(Boolean);
            const cachedVectors = await content.getEmbeddingsFromCache(normalizedHashes);
            const meiliParas = [];
            const paraIds = [];
            let cacheHits = 0, cacheMisses = 0, dbFallbacks = 0;
            for (const p of paragraphs) {
              pendingIds.add(p.id);
              let embedding = null;
              if (p.normalized_hash && cachedVectors.has(p.normalized_hash)) {
                embedding = cachedVectors.get(p.normalized_hash);
                cacheHits++;
              } else if (p.embedding) {
                // Cache miss but embedding exists in content DB — use it directly.
                // This handles empty/wiped embedding cache without losing vectors.
                // Must convert SQLite Buffer → Float32Array → Array for Meilisearch.
                embedding = blobToFloatArray(p.embedding);
                dbFallbacks++;
              } else {
                cacheMisses++;
              }
              meiliParas.push({
                id: p.id, doc_id: p.doc_id, paragraph_index: p.paragraph_index,
                text: p.text, context: p.context || null,
                text_grounded: p.text_grounded || null,
                translation: p.translation || null, translation_segments: p.translation_segments || null,
                title: doc.title, author: doc.author, filename: doc.filename,
                religion: doc.religion, collection: doc.collection, language: doc.language,
                year: doc.year ? parseInt(doc.year, 10) : null, authority,
                heading: p.heading || '', blocktype: p.blocktype || 'paragraph',
                source_site: doc.source_site || null,
                source_url: doc.source_url || null,
                external_para_id: p.external_para_id || null,
                pdf_page: typeof p.pdf_page === 'number' ? p.pdf_page : null,
                created_at: new Date().toISOString(),
                _vectors: { default: embedding }
              });
              paraIds.push(p.id);
            }
            if (cacheMisses > 0 || dbFallbacks > 0) {
              logger.debug({ cacheHits, cacheMisses, dbFallbacks, batchSize: meiliParas.length }, 'Sync batch: cache stats');
            }
            // Append to per-index buffer; flush asynchronously when full.
            // markSynced + completedItems both happen later in drainOldest()
            // when the corresponding pipelined task confirms — preserves the
            // verified-sync invariant.
            const indexName = indexNameForDoc(doc);
            const buf = buffer.get(indexName) || { paras: [], paraIds: [] };
            buf.paras.push(...meiliParas);
            buf.paraIds.push(...paraIds);
            buffer.set(indexName, buf);
            docParasProcessed += paraIds.length;
            await flushBuffer(indexName);
            await delay(YIELD_DELAY_MS);
          }
          docsProcessed++;
          logger.info({ docId: doc.id, docTitle: doc.title, docParasProcessed, completedItems, failedItems, remaining: job.total_items - completedItems }, 'Sync job progress');
        } catch (docErr) {
          // A bad document should NEVER stop the sync of other documents.
          // Mark all its paragraphs as synced so we don't get stuck retrying it.
          logger.error({ err: docErr.message, docId: doc.id, docTitle: doc.title }, 'Document sync failed — skipping');
          try {
            const paraIds = (await queryAll('SELECT id FROM content WHERE doc_id = ? AND synced = 0 AND deleted_at IS NULL', [doc.id])).map(r => r.id);
            if (paraIds.length > 0) await content.markSynced(paraIds);
            failedItems += paraIds.length;
          } catch { /* best effort */ }
        }

        await query(`UPDATE sync_jobs SET completed_items = ?, failed_items = ? WHERE id = ?`, [completedItems, failedItems, job.id]);
        // Run entity sync every 10 docs so slow DB writes don't block it for hours.
        if (docsProcessed % 10 === 0 && Date.now() - lastEntitySyncTime >= ENTITY_SYNC_INTERVAL_MS) {
          await runEntitySyncCycle();
        }
        await delay(DOC_DELAY_MS);
      } // end for (doc of fresh)
      // Also check after each batch in case the inner loop was skipped (continue path).
      if (Date.now() - lastEntitySyncTime >= ENTITY_SYNC_INTERVAL_MS) {
        await runEntitySyncCycle();
      }
    } // end while (!isShuttingDown)

    // End of doc loop. Force-flush any remaining buffered paragraphs.
    // With optimistic sync there is nothing to drain — synced=1 already flipped.
    for (const indexName of [...buffer.keys()]) {
      await flushBuffer(indexName, true);
    }

    if (isShuttingDown) {
      logger.info({ jobId: job.id, completedItems, failedItems, inFlight: inFlight.length }, 'Shutdown mid-job — requeueing');
      await query(`UPDATE sync_jobs SET status = 'pending', started_at = NULL, completed_items = ?, failed_items = ? WHERE id = ?`, [completedItems, failedItems, job.id]);
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

    // REMOVED: missingInMeili check — caused mass synced=0 resets.
    // getDocuments(limit:10000) only returns 10K of 44K+ docs, making 34K appear
    // "missing" and triggering markDocDirty on their ~3.4M paragraphs every hour.
    // The paragraphs index sync is sufficient; documents index is populated by that sync.

    // Spot-check 10 synced docs to catch count mismatches (paragraphs index only)
    const potentiallyStale = await queryAll(`
      SELECT DISTINCT doc_id FROM content WHERE synced = 1 AND updated_at < datetime('now', '-1 hour') LIMIT 10
    `);
    for (const row of potentiallyStale) {
      const dbCount = await content.countByDocId(row.doc_id);
      try {
        const meiliResult = await meili.index('paragraphs').search('', { filter: `doc_id = ${row.doc_id}`, limit: 0 });
        if (dbCount !== meiliResult.estimatedTotalHits) {
          await content.markDocDirty(row.doc_id);
          logger.info({ docId: row.doc_id, dbCount, meiliCount: meiliResult.estimatedTotalHits }, 'Paragraph count mismatch, marking for re-sync');
        }
      } catch (err) {
        // Meili busy/slow — do NOT mark dirty; just log and skip
        logger.warn({ docId: row.doc_id, err: err.message }, 'Meili search failed during stale check, skipping doc');
      }
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

// Drain enrichment-sidecar work each cycle — paragraphs whose hyp_questions
// have been written/updated get embedded and pushed to the HyPE Meili sidecar
// index. Keeps newly-enriched content searchable within one minute, no manual
// intervention required.
async function runHypeSyncCycle() {
  try {
    const result = await syncHypeBatch({ queryAll, query, getAuthority, limit: HYPE_SYNC_BATCH });
    if (result.indexed > 0) {
      logger.info({ ...result }, 'HyPE sidecar batch synced');
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'HyPE sync cycle failed');
  }
  lastHypeSyncTime = Date.now();
}

// Drain entity_mentions where em_synced=0 into the entity_mentions_idx sidecar.
async function runEntitySyncCycle() {
  try {
    const result = await syncEntityMentionsBatch({ queryAll, query, getAuthority, limit: ENTITY_SYNC_BATCH });
    if (result.indexed > 0) {
      logger.info({ ...result }, 'Entity mentions sidecar batch synced');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Entity sync cycle failed');
  }
  lastEntitySyncTime = Date.now();
}

// Sync entity aliases as Meilisearch synonyms (paragraphs index).
async function runAliasSyncCycle() {
  try {
    const result = await syncAliasesToMeili();
    if (result.synonymCount > 0) {
      logger.info({ synonymCount: result.synonymCount }, 'Entity alias synonyms synced to Meilisearch');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Alias sync cycle failed');
  }
  lastAliasSyncTime = Date.now();
}

// Sync site-only DB content to per-site Meili indexes. Site-only sites live
// in their own SQLite at data/sites/<prefix>.db (separate from main sifter.db);
// the main sync_jobs table doesn't cover them, so we pump them from the
async function waitForMeiliTask(meili, enqueuedTask, timeoutMs = 3600000) {
  const taskUid = typeof enqueuedTask === 'number' ? enqueuedTask : enqueuedTask.taskUid;
  const task = await meili.tasks.waitForTask(taskUid, { timeout: timeoutMs });
  if (task.status === 'failed') throw new Error(`Meilisearch task ${taskUid} failed: ${task.error?.message || 'unknown'}`);
  return task;
}

// periodic-tasks loop. Idempotent: only synced=0 rows pushed; flag flips
// after Meili confirms the task. Per-site failures logged but never kill
// the loop.
async function runSiteOnlySyncCycle() {
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
  // Pipelined enqueue: keep up to PIPELINE_LIMIT addDocuments tasks in flight.
  // Worker pulls + enqueues the next batch while Meili indexes the previous
  // ones. markSynced flips only after Meili confirms — same verified-sync
  // invariant as the main DB path.
  const PIPELINE_LIMIT = 4;
  const inFlight = []; // [{task, ids}]
  const drainOldest = async () => {
    if (inFlight.length === 0) return;
    const { task, ids } = inFlight.shift();
    try {
      await waitForMeiliTask(meili, task, 900000);
      const placeholders = ids.map(() => '?').join(',');
      siteDb.prepare(`UPDATE content SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
      total += ids.length;
    } catch (err) {
      logger.error({ site: cfg.id, err: err.message, batchSize: ids.length }, 'Site-only pipelined batch failed');
      // Don't mark synced — retry next iteration (Meili dedups by id).
    }
  };
  while (!isShuttingDown) {
    const batch = siteDb.prepare(`
      SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype,
             c.embedding, c.embedding_model, c.normalized_hash,
             c.external_para_id, c.pdf_page, c.language,
             d.title, d.author, d.filename, d.source_url, d.source_site
      FROM content c
      JOIN docs d ON d.id = c.doc_id
      WHERE c.synced = 0 AND c.deleted_at IS NULL
      ORDER BY c.id
      LIMIT 200
    `).all();
    if (batch.length === 0) break;

    const meiliDocs = batch.map(p => {
      const embedding = blobToFloatArray(p.embedding);
      return {
        // Composite ID prevents collisions across the site-only indexes,
        // which all share the global Meili namespace.
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
        ...(embedding ? { _vectors: { default: embedding } } : {})
      };
    });
    // Wait if we've hit the pipeline limit before enqueuing the next batch.
    while (inFlight.length >= PIPELINE_LIMIT) await drainOldest();
    try {
      const task = await idx.addDocuments(meiliDocs, { primaryKey: 'id' });
      inFlight.push({ task, ids: batch.map(p => p.id) });
    } catch (err) {
      logger.error({ site: cfg.id, err: err.message, batchSize: batch.length }, 'Failed to enqueue site-only addDocuments');
    }
    if (batch.length < 200) break;
  }
  // Drain remaining in-flight tasks before returning.
  while (inFlight.length > 0) await drainOldest();
  return total;
}

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

async function runPeriodicTasks() {
  await resetPreWipeBatch();
  const now = Date.now();
  if (now - lastCleanupTime >= CLEANUP_INTERVAL_MS) await runCleanupCycle();
  if (now - lastFullSyncTime >= FULL_SYNC_INTERVAL_MS) await runFullSyncCheck();
  if (now - lastHypeSyncTime >= HYPE_SYNC_INTERVAL_MS) await runHypeSyncCycle();
  if (now - lastEntitySyncTime >= ENTITY_SYNC_INTERVAL_MS) await runEntitySyncCycle();
  if (now - lastAliasSyncTime >= ALIAS_SYNC_INTERVAL_MS) await runAliasSyncCycle();
  // Site-only DBs live outside main DB; periodic pump every cycle (cheap
  // when the queue is empty).
  await runSiteOnlySyncCycle();
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
  // Daily backup (checks interval internally via .last-backup timestamp)
  if (shouldRunBackup()) {
    try {
      const result = await runBackup();
      logger.info({ ...result }, 'Daily backup completed');
    } catch (err) {
      logger.error({ err: err.message }, 'Backup failed');
    }
  }
  // WAL checkpoint — TRUNCATE every 15 min to prevent WAL from growing to GB-scale.
  // Restarts the API on block (API holds perpetual read marks; stateless, restarts in <5s).
  if (now - lastWalCheckpointTime >= WAL_CHECKPOINT_INTERVAL_MS) {
    try {
      const db = await getDb();
      const result = db.pragma('wal_checkpoint(TRUNCATE)');
      const { busy, log, checkpointed } = result[0];
      logger.info({ busy, log, checkpointed }, 'WAL checkpoint (TRUNCATE)');
      if (busy && log > 50000) {
        logger.warn({ log }, 'WAL checkpoint blocked — restarting siftersearch-api to release reader locks');
        try {
          const { execSync } = await import('child_process');
          execSync('pm2 restart siftersearch-api', { timeout: 30000, stdio: 'inherit' });
          await new Promise(r => setTimeout(r, 5000));
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
}

// ============================================================
// Main worker loop
// ============================================================

async function workerLoop() {
  logger.info('Unified worker starting');
  // Run migrations — retry on DB lock (library-watcher may hold write lock during startup scan)
  for (let attempt = 1; ; attempt++) {
    try {
      logger.info('Running migrations...');
      const migStart = Date.now();
      const result = await runMigrations();
      logger.info({ elapsedMs: Date.now() - migStart, applied: result.applied }, 'Migrations complete');
      break;
    } catch (err) {
      if (err.message?.includes('database is locked') && attempt < 20) {
        logger.warn({ attempt }, 'DB locked during migration, retrying in 5s');
        await delay(5000);
      } else {
        logger.error({ err: err.message }, 'Migration failed — aborting');
        process.exit(1);
      }
    }
  }
  // Initialize embedding cache (non-fatal if unavailable)
  await content.initEmbeddingCacheIfNeeded();
  // Skip initializeIndexes() — settings updates are idempotent but queue
  // Meilisearch tasks on every restart, backing up the queue and blocking sync.
  // The API runs initializeIndexes() on startup; the worker doesn't need to.
  // Recover stuck sync jobs — retry on lock
  let stuckSyncJobs = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      stuckSyncJobs = await queryAll(`SELECT id FROM sync_jobs WHERE status = 'running'`);
      for (const j of stuckSyncJobs) {
        logger.info({ jobId: j.id }, 'Found stuck sync job on startup — requeueing');
        await query(`UPDATE sync_jobs SET status = 'pending', started_at = NULL WHERE id = ?`, [j.id]);
      }
      break;
    } catch (err) {
      if (err.message?.includes('database is locked') && attempt < 10) {
        logger.warn({ attempt }, 'DB locked during stuck-job recovery, retrying in 5s');
        await delay(5000);
      } else {
        logger.warn({ err: err.message }, 'Could not recover stuck jobs — continuing');
        break;
      }
    }
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

  // Load sites.yaml so source_site → meili_index_prefix routing works during
  // sync. Site-only DB sync depends on this registry too. Failure is non-
  // fatal — without registry entries, supplemental rows route to the primary
  // index with a warning and site-only DBs are simply not pumped.
  try {
    const configs = await loadAllSiteConfigs();
    siteRegistryByDomain = configs;
    setSiteRegistry(configs);
    const { setAuthoritySiteRegistry } = await import('../lib/authority.js');
    setAuthoritySiteRegistry(configs);
    const supplemental = Object.values(configs).filter(c => c.scope === 'supplemental').length;
    const siteOnly = Object.values(configs).filter(c => c.scope === 'site-only').length;
    logger.info({ supplemental, site_only: siteOnly, total: Object.keys(configs).length }, 'Worker: site registry loaded');
  } catch (err) {
    logger.warn({ err: err.message }, 'Worker: site registry not loaded (continuing with primary-only routing)');
  }

  logger.info('Unified worker ready');
  while (!isShuttingDown) {
    try {
      let didWork = false;
      // 1. Check for pending sync jobs → process
      let syncJob = await getNextPendingSyncJob();
      if (!syncJob) {
        try {
          const unsyncedCount = await countUnsyncedParagraphs();
          if (unsyncedCount > 0) {
            logger.info({ unsyncedCount }, 'Found unsynced content — creating sync job');
            const jobId = await createSyncJob('sync', unsyncedCount);
            syncJob = await queryOne(`SELECT * FROM sync_jobs WHERE id = ?`, [jobId]);
          }
        } catch (err) {
          if (err.message?.includes('database is locked')) {
            logger.warn('DB locked creating sync job — skipping to periodic tasks');
          } else {
            logger.error({ err: err.message }, 'Sync job creation failed');
          }
        }
      }
      if (syncJob) {
        currentSyncJobId = syncJob.id;
        try {
          await processSyncJob(syncJob);
        } catch (err) {
          if (err.message?.includes('database is locked')) {
            logger.warn('DB locked processing sync job — continuing');
          } else throw err;
        }
        didWork = true;
      }
      // 2. Check for pending translation/audio jobs → process one
      if (!isShuttingDown) {
        try {
          const translationJob = await getNextPendingTranslationJob();
          if (translationJob) {
            await processTranslationAudioJob(translationJob);
            didWork = true;
          }
        } catch (err) {
          if (!err.message?.includes('database is locked')) throw err;
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

// Single-writer HTTP host. Starts only when SIFTER_WRITER_PORT is set, so the
// mechanism is dark until explicitly enabled. The worker owns the sole write
// connection; other processes POST {statements:[{sql,args}]} to /write and we
// apply them as one atomic transaction. better-sqlite3 is synchronous, so
// these never interleave with the worker loop's own writes.
function startWriteServer() {
  const port = parseInt(process.env.SIFTER_WRITER_PORT || '', 10);
  if (!port) return;
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/write') {
      res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      try {
        const { statements, name } = JSON.parse(body);
        const db = await getDb();
        const start = Date.now();
        const results = applyWriteBatch(db, statements);
        const ms = Date.now() - start;
        if (ms > 1000) logger.warn({ ms, count: statements.length, name }, 'Slow write batch');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ results }));
      } catch (err) {
        logger.error({ err: err.message }, 'Write batch failed');
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });
  // A failed bind must never crash the worker — the write endpoint is auxiliary
  // to the critical sync/job loop. Log loudly and continue writing directly.
  server.on('error', (err) => {
    logger.error({ err: err.message, port }, 'Single-writer HTTP server failed to bind — continuing without write endpoint');
  });
  server.listen(port, '127.0.0.1', () => logger.info({ port }, 'Single-writer HTTP server listening'));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startWriteServer();
workerLoop().catch(err => {
  logger.error({ err: err.message }, 'Unified worker crashed');
  process.exit(1);
});
