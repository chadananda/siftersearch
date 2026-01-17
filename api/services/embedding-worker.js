/**
 * Embedding Worker
 *
 * Background service that generates embeddings for content rows missing them.
 * Polls for unembedded content and generates embeddings in batches using OpenAI.
 *
 * Architecture: Content Table → Embedding Worker → Content Table (with embeddings)
 * Sync Worker then picks up content with synced=0 and pushes to Meilisearch.
 */

import { query, queryAll, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { createEmbeddings } from '../lib/ai.js';
import { config } from '../lib/config.js';

// Configuration - throttled to prevent blocking health checks
const EMBEDDING_INTERVAL_MS = 30000;  // Poll every 30 seconds (was 10)
const BATCH_SIZE = 20;                // Texts per OpenAI batch (was 50, reduced for CPU)
const MAX_CHARS = 6000;               // Safe limit for any language (Arabic can be 1 char = 4 tokens)
                                      // Content over this MUST be re-segmented, not truncated
const DB_WRITE_DELAY_MS = 50;         // Small delay between DB writes to yield event loop

let embeddingInterval = null;
let isRunning = false;

// Small delay to yield event loop and prevent blocking health checks
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let embeddingStats = {
  lastRun: null,
  lastSuccess: null,
  embeddingsGenerated: 0,
  batchesProcessed: 0,
  errors: 0,
  lastError: null
};

/**
 * Get content rows that need embeddings
 * Groups by normalized_hash to avoid generating duplicate embeddings
 * Skips content over MAX_CHARS (must be re-segmented, not truncated)
 */
async function getContentNeedingEmbeddings(limit = BATCH_SIZE) {
  // Get unique normalized_hash values that need embeddings
  // This avoids generating duplicates when same content exists in multiple docs
  // Skip content longer than MAX_CHARS (must be properly segmented first)
  const results = await queryAll(`
    SELECT id, text, normalized_hash
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND text IS NOT NULL
      AND text != ''
      AND LENGTH(text) <= ?
    GROUP BY normalized_hash
    LIMIT ?
  `, [MAX_CHARS, limit]);
  return results;
}

/**
 * Store embeddings in content table
 * Also propagates to all rows with same normalized_hash
 */
async function storeEmbeddings(rows, embeddings) {
  const model = config.ai.embeddings.model;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const embedding = embeddings[i];

    if (!embedding) continue;

    // Convert embedding array to Buffer for SQLite BLOB storage
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    // Update this row and ALL rows with same normalized_hash
    // This propagates the embedding to duplicate content across documents
    await query(`
      UPDATE content
      SET embedding = ?,
          embedding_model = ?,
          synced = 0,
          updated_at = datetime('now')
      WHERE normalized_hash = ?
        AND embedding IS NULL
        AND deleted_at IS NULL
    `, [embeddingBuffer, model, row.normalized_hash]);

    // Yield event loop to allow health checks to respond
    if (DB_WRITE_DELAY_MS > 0) {
      await delay(DB_WRITE_DELAY_MS);
    }
  }
}

/**
 * Run one embedding generation cycle
 */
async function runEmbeddingCycle() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  embeddingStats.lastRun = new Date().toISOString();

  try {
    // Get content needing embeddings
    const rows = await getContentNeedingEmbeddings(BATCH_SIZE);

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

    // Store embeddings (propagates to all matching normalized_hash rows)
    await storeEmbeddings(rows, result.embeddings);

    embeddingStats.embeddingsGenerated += rows.length;
    embeddingStats.batchesProcessed++;
    embeddingStats.lastSuccess = new Date().toISOString();

    logger.info({
      generated: rows.length,
      totalGenerated: embeddingStats.embeddingsGenerated,
      tokens: result.usage?.totalTokens
    }, 'Embedding batch complete');

  } catch (err) {
    logger.error({ err: err.message }, 'Embedding cycle failed');
    embeddingStats.errors++;
    embeddingStats.lastError = err.message;
  } finally {
    isRunning = false;
  }
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
}

/**
 * Stop the embedding worker
 */
export function stopEmbeddingWorker() {
  if (embeddingInterval) {
    clearInterval(embeddingInterval);
    embeddingInterval = null;
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
  const result = await queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT normalized_hash) as unique_hashes
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND LENGTH(text) <= ?
  `, [MAX_CHARS]);
  return result || { total: 0, unique_hashes: 0 };
}

/**
 * Get count of oversized content that's being skipped
 */
export async function getOversizedCount() {
  const result = await queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT normalized_hash) as unique_hashes
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND LENGTH(text) > ?
  `, [MAX_CHARS]);
  return result || { total: 0, unique_hashes: 0 };
}

/**
 * Delete all oversized content rows (must be re-ingested with proper segmentation)
 */
export async function deleteOversizedContent() {
  // First get the count for logging
  const count = await getOversizedCount();

  if (count.total === 0) {
    logger.info('No oversized content to delete');
    return { deleted: 0 };
  }

  logger.warn({ total: count.total, unique: count.unique_hashes }, 'Deleting oversized content that needs re-ingestion');

  // Soft delete by setting deleted_at
  const result = await query(`
    UPDATE content
    SET deleted_at = datetime('now'),
        synced = 0
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND LENGTH(text) > ?
  `, [MAX_CHARS]);

  logger.info({ deleted: result.changes || count.total }, 'Oversized content deleted - documents must be re-ingested');
  return { deleted: result.changes || count.total };
}
