#!/usr/bin/env node
/**
 * Embedding worker entry point. Runs until all unembedded paragraphs are processed.
 * Can run standalone (node scripts/run-embedding-worker.mjs) or as a PM2 process.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

import { startEmbeddingWorker, getEmbeddingStats, getUnembeddedCount } from '../api/services/embedding-worker.js';
import { logger } from '../api/lib/logger.js';

const { total } = await getUnembeddedCount() || {};
logger.info({ unembedded: total }, 'Embedding worker starting');

startEmbeddingWorker();

// Log progress every 30s and exit when done
const monitor = setInterval(async () => {
  const stats = getEmbeddingStats();
  const count = await getUnembeddedCount();
  logger.info({ generated: stats.embeddingsGenerated, remaining: count?.total }, 'Embedding progress');
  if (count?.total === 0) {
    logger.info('All embeddings complete. Exiting.');
    clearInterval(monitor);
    setTimeout(() => process.exit(0), 2000);
  }
}, 30000);

process.on('SIGTERM', () => { clearInterval(monitor); process.exit(0); });
process.on('SIGINT', () => { clearInterval(monitor); process.exit(0); });
