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

import { query, queryOne, queryAll, getSiteDb } from '../lib/db.js';
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
const ENTITY_SYNC_INTERVAL_MS = 120 * 1000;  // 2 min — entity mentions index
const ENTITY_SYNC_BATCH = 200;
const ALIAS_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 min — synonym refresh

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
    // Cross-doc batching + pipelined in-flight tasks.
    //
    // Per-doc serial sync was bottlenecked by ~21 paras/batch averaging 4.5s
    // of Meili HNSW indexing → ~2.7 paras/sec. Two stacked optimizations:
    //
    //  1. Cross-doc buffer: accumulate paragraphs from multiple short docs
    //     into one buffer keyed by destination index. Flush at FLUSH_PARAS.
    //     Amortizes per-task setup cost across more docs.
    //
    //  2. Pipelined enqueue: keep up to PIPELINE_LIMIT addDocuments tasks
    //     in flight. Worker doesn't wait for the current task before
    //     enqueuing the next — Meili processes serially per index, but the
    //     worker can pipeline its enqueue + drain. await happens when we
    //     dequeue (and that's where markSynced flips, preserving the
    //     verified-sync invariant).
    //
    // Memory bound: PIPELINE_LIMIT=5 × FLUSH_PARAS=500 × ~5KB/para ≈ 12.5MB.
    // Increased for faster vector re-sync (was 2×100 = too slow for 4M re-index).
    // Timeout raised to 900s — observed tasks occasionally take 9+ minutes.
    const PIPELINE_LIMIT = 5;
    const FLUSH_PARAS = 500;
    const buffer = new Map();    // indexName -> { paras: [], paraIds: [] }
    const inFlight = [];         // [{task, paraIds, indexName}]

    const drainOldest = async () => {
      if (inFlight.length === 0) return;
      const oldest = inFlight.shift();
      let confirmed = false;
      try {
        await waitForMeiliTask(meili, oldest.task, 900000);
        confirmed = true;
      } catch (err) {
        logger.error({ err: err.message, indexName: oldest.indexName, batchSize: oldest.paraIds.length }, 'Pipelined batch failed');
        failedItems += oldest.paraIds.length;
      }
      if (confirmed) await content.markSynced(oldest.paraIds);
      completedItems += oldest.paraIds.length;
    };

    const flushBuffer = async (indexName, force = false) => {
      const buf = buffer.get(indexName);
      if (!buf || buf.paras.length === 0) return;
      if (!force && buf.paras.length < FLUSH_PARAS) return;
      while (inFlight.length >= PIPELINE_LIMIT) await drainOldest();
      const paras = buf.paras;
      const paraIds = buf.paraIds;
      buffer.set(indexName, { paras: [], paraIds: [] });
      try {
        const task = await meili.index(indexName).addDocuments(paras, { primaryKey: 'id' });
        inFlight.push({ task, paraIds, indexName });
      } catch (err) {
        logger.error({ err: err.message, indexName, batchSize: paras.length }, 'Failed to enqueue addDocuments');
        failedItems += paras.length;
        // Don't mark synced — retry next iteration (Meili dedups by id).
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
      // Fetch enough docs to keep the 5-slot pipeline full. With FLUSH_PARAS=500
      // and ~9 paras/doc, each pipeline slot needs ~56 docs. 500 gives headroom
      // for the inFlightDocIds filter without prematurely breaking the loop.
      const docs = await content.getDocsWithDirtyParagraphs(500);
      const fresh = docs.filter(d => !inFlightDocIds.has(d.id));
      if (fresh.length === 0) {
        // All visible-dirty docs are already in our pipeline. Drain one
        // task to release some IDs back, then re-check. If nothing in
        // flight either, we're truly done.
        if (inFlight.length === 0) break;
        await drainOldest();
        // After drain, paragraphs from the oldest task are now synced=1.
        // Their docs are no longer dirty. Clear the set and re-fetch.
        inFlightDocIds.clear();
        continue;
      }
      const doc = fresh[0];
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
      await delay(DOC_DELAY_MS);
    }

    // End of doc loop. Force-flush any remaining buffered paragraphs and
    // drain in-flight tasks so synced=1 propagates and progress is accurate.
    for (const indexName of [...buffer.keys()]) {
      await flushBuffer(indexName, true);
    }
    while (inFlight.length > 0 && !isShuttingDown) await drainOldest();

    if (isShuttingDown) {
      logger.info({ jobId: job.id, completedItems, failedItems, inFlight: inFlight.length }, 'Shutdown mid-job — requeueing');
      // Drain whatever can still finish quickly before requeue.
      while (inFlight.length > 0) await drainOldest();
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

async function runPeriodicTasks() {
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
