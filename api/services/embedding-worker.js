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

// Configuration
const EMBEDDING_INTERVAL_MS = 10000;  // Poll every 10 seconds
const BATCH_SIZE = 50;                // Texts per OpenAI batch (rate limit safe)
const MAX_TEXT_LENGTH = 8191;         // Max tokens for text-embedding-3-large

let embeddingInterval = null;
let isRunning = false;
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
 */
async function getContentNeedingEmbeddings(limit = BATCH_SIZE) {
  // Get unique normalized_hash values that need embeddings
  // This avoids generating duplicates when same content exists in multiple docs
  const results = await queryAll(`
    SELECT id, text, normalized_hash
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND text IS NOT NULL
      AND text != ''
    GROUP BY normalized_hash
    LIMIT ?
  `, [limit]);
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

    // Prepare texts for embedding (truncate if needed)
    const texts = rows.map(row => {
      let text = row.text || '';
      // Truncate very long texts to avoid token limit issues
      if (text.length > MAX_TEXT_LENGTH * 4) {  // rough char-to-token estimate
        text = text.substring(0, MAX_TEXT_LENGTH * 4);
      }
      return text;
    });

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
 * Get count of content needing embeddings
 */
export async function getUnembeddedCount() {
  const result = await queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT normalized_hash) as unique_hashes
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
  `);
  return result || { total: 0, unique_hashes: 0 };
}
