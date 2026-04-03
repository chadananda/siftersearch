/**
 * Embedding Worker
 *
 * Background service that generates embeddings for content rows missing them.
 * Polls for unembedded content and generates embeddings in batches using OpenAI.
 *
 * Architecture: Content Table → Embedding Worker → Content Table (with embeddings)
 * Sync Worker then picks up content with synced=0 and pushes to Meilisearch.
 *
 * All content table writes go through the content API (api/lib/content.js).
 */

import { logger } from '../lib/logger.js';
import { createEmbeddings } from '../lib/ai.js';
import { config } from '../lib/config.js';
import { content } from '../lib/content.js';

// Configuration - tuned for throughput while yielding event loop
const EMBEDDING_INTERVAL_MS = 2000;   // Poll every 2 seconds
const BATCH_SIZE = 2000;              // Texts per OpenAI batch (API supports up to 2048)
const MAX_CHARS = 6000;               // Safe limit for any language (Arabic can be 1 char = 4 tokens)
                                      // Content over this MUST be re-segmented, not truncated
const DB_WRITE_DELAY_MS = 0;          // No delay — standalone process, no event loop contention
const PROPAGATE_INTERVAL_MS = 10 * 60 * 1000; // Propagate embeddings to duplicates every 10 min

// Backoff: on quota/rate errors, wait longer instead of hammering OpenAI every 5s
const MAX_BACKOFF_MS = 10 * 60 * 1000; // Cap at 10 minutes
let backoffMs = 0;
let backoffUntil = 0;

let embeddingInterval = null;
let propagateTimeout = null;
let isRunning = false;

// Small delay to yield event loop and prevent blocking health checks
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let embeddingStats = {
  lastRun: null,
  lastSuccess: null,
  embeddingsGenerated: 0,
  batchesProcessed: 0,
  errors: 0,
  consecutiveErrors: 0,
  lastError: null,
  backoffUntil: null
};

/**
 * Store embeddings in content table via content API.
 * Also propagates to all rows with same normalized_hash.
 */
async function storeEmbeddings(rows, embeddings) {
  const model = config.ai.embeddings.model;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = embeddings[i];

    if (!embedding) continue;

    // Convert embedding array to Buffer for SQLite BLOB storage
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    // Use content API — validates dimensions and sets synced=0 automatically
    const result = await content.updateEmbedding(row.id, embeddingBuffer, model);

    if (result.rejected) {
      logger.warn({ id: row.id, reason: result.reason }, 'Embedding rejected by content API');
      continue;
    }

    // Yield event loop to allow health checks to respond
    if (DB_WRITE_DELAY_MS > 0) {
      await delay(DB_WRITE_DELAY_MS);
    }
  }
}

/**
 * Run one embedding generation cycle
 */
/**
 * Check if an error is a rate limit or quota error that warrants backoff.
 */
function isRetryableAPIError(err) {
  const msg = err.message || '';
  return msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')
    || msg.includes('Rate limit') || msg.includes('timed out') || msg.includes('Connection error');
}

async function runEmbeddingCycle() {
  if (isRunning) {
    return;
  }

  // Skip cycle if we're in backoff
  if (Date.now() < backoffUntil) {
    return;
  }

  isRunning = true;
  embeddingStats.lastRun = new Date().toISOString();

  try {
    // Get content needing embeddings via content API
    const rows = await content.getUnembedded(BATCH_SIZE, MAX_CHARS);

    if (rows.length === 0) {
      isRunning = false;
      return;
    }

    logger.info({ count: rows.length }, 'Generating embeddings for content batch');

    // Texts are pre-filtered by query to be <= MAX_CHARS, no truncation needed
    const texts = rows.map(row => row.text || '');

    // Generate embeddings via OpenAI
    const result = await createEmbeddings(texts, {
      caller: 'embedding-worker'
    });

    // Store embeddings via content API (validates dimensions, sets synced=0)
    await storeEmbeddings(rows, result.embeddings);

    // NOTE: propagateEmbeddings() runs on a separate 10-minute timer (schedulePropagation)
    // to avoid blocking the event loop every 5 seconds with a full-table correlated UPDATE

    // Success — reset backoff
    backoffMs = 0;
    backoffUntil = 0;
    embeddingStats.consecutiveErrors = 0;
    embeddingStats.backoffUntil = null;

    embeddingStats.embeddingsGenerated += rows.length;
    embeddingStats.batchesProcessed++;
    embeddingStats.lastSuccess = new Date().toISOString();

    logger.info({
      generated: rows.length,
      totalGenerated: embeddingStats.embeddingsGenerated,
      tokens: result.usage?.totalTokens
    }, 'Embedding batch complete');

  } catch (err) {
    embeddingStats.errors++;
    embeddingStats.consecutiveErrors++;
    embeddingStats.lastError = err.message;

    if (isRetryableAPIError(err)) {
      // Exponential backoff: 30s, 60s, 120s, 240s, ... capped at 10min
      backoffMs = Math.min(backoffMs ? backoffMs * 2 : 30000, MAX_BACKOFF_MS);
      backoffUntil = Date.now() + backoffMs;
      embeddingStats.backoffUntil = new Date(backoffUntil).toISOString();

      logger.warn({
        err: err.message,
        backoffSec: Math.round(backoffMs / 1000),
        consecutiveErrors: embeddingStats.consecutiveErrors
      }, 'Embedding API error — backing off');
    } else {
      logger.error({ err: err.message }, 'Embedding cycle failed');
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule periodic embedding propagation (copies embeddings to duplicate content).
 * Runs every 10 minutes to avoid blocking the event loop with a full-table UPDATE.
 */
function schedulePropagation() {
  propagateTimeout = setTimeout(async () => {
    try {
      const result = await content.propagateEmbeddings();
      const affected = result?.rowsAffected || 0;
      if (affected > 0) {
        logger.info({ propagated: affected }, 'Embedding propagation complete');
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Embedding propagation failed (non-fatal)');
    }
    // Reschedule
    if (embeddingInterval) {
      schedulePropagation();
    }
  }, PROPAGATE_INTERVAL_MS);
}

/**
 * Start the embedding worker
 */
export function startEmbeddingWorker() {
  if (embeddingInterval) {
    logger.warn('Embedding worker already running');
    return;
  }

  logger.info({ intervalMs: EMBEDDING_INTERVAL_MS, batchSize: BATCH_SIZE }, 'Starting embedding worker');

  // Run initial cycle after short delay
  setTimeout(runEmbeddingCycle, 3000);

  // Schedule periodic cycles
  embeddingInterval = setInterval(runEmbeddingCycle, EMBEDDING_INTERVAL_MS);

  // Schedule propagation on a much slower cadence (every 10 min)
  schedulePropagation();
}

/**
 * Stop the embedding worker
 */
export function stopEmbeddingWorker() {
  if (embeddingInterval) {
    clearInterval(embeddingInterval);
    embeddingInterval = null;
  }
  if (propagateTimeout) {
    clearTimeout(propagateTimeout);
    propagateTimeout = null;
  }
  logger.info('Embedding worker stopped');
}

/**
 * Get embedding worker stats
 */
export function getEmbeddingStats() {
  return {
    ...embeddingStats,
    running: isRunning,
    backingOff: Date.now() < backoffUntil,
    config: {
      intervalMs: EMBEDDING_INTERVAL_MS,
      batchSize: BATCH_SIZE
    }
  };
}

/**
 * Force an embedding cycle now (for manual triggering)
 */
export async function forceEmbeddingNow() {
  logger.info('Manual embedding generation triggered');
  await runEmbeddingCycle();
  return getEmbeddingStats();
}

/**
 * Get count of content needing embeddings (within size limit)
 */
export async function getUnembeddedCount() {
  return content.getUnembeddedCount(MAX_CHARS);
}

/**
 * Get count of oversized content that's being skipped
 */
export async function getOversizedCount() {
  return content.getOversizedCount(MAX_CHARS);
}

/**
 * Delete all oversized content rows (must be re-ingested with proper segmentation)
 */
export async function deleteOversizedContent() {
  const count = await content.getOversizedCount(MAX_CHARS);

  if (count.total === 0) {
    logger.info('No oversized content to delete');
    return { deleted: 0 };
  }

  logger.warn({ total: count.total, unique: count.unique_hashes }, 'Deleting oversized content that needs re-ingestion');

  const result = await content.softDeleteOversized(MAX_CHARS);

  logger.info({ deleted: result.rowsAffected || count.total }, 'Oversized content deleted - documents must be re-ingested');
  return { deleted: result.rowsAffected || count.total };
}
