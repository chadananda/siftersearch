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

// Long-running service loop: log progress, back off idle polling to 5min max.
// Never exit — PM2 restart on exit wastes cycles and produces misleading restart counters.
let idleMs = 30000;   // start at 30s; grows to 5min when no work
let monitor;
function scheduleMonitor() {
  monitor = setTimeout(async () => {
    const stats = getEmbeddingStats();
    const count = await getUnembeddedCount();
    const remaining = count?.total ?? 0;
    logger.info({ generated: stats.embeddingsGenerated, remaining }, 'Embedding progress');
    if (remaining === 0) {
      idleMs = Math.min(idleMs * 2, 5 * 60 * 1000); // back off: 30s → 60s → 120s → 300s
    } else {
      idleMs = 30000; // work found — reset to fast polling
    }
    scheduleMonitor();
  }, idleMs);
}
scheduleMonitor();

let stopping = false;
process.on('SIGTERM', () => { if (!stopping) { stopping = true; clearTimeout(monitor); process.exit(0); } });
process.on('SIGINT',  () => { if (!stopping) { stopping = true; clearTimeout(monitor); process.exit(0); } });
