#!/usr/bin/env node
// Sonnet API enrichment worker. Runs continuously under PM2:
//   1. Periodically scans for tier 1-7 paragraphs lacking hyp_thesis and
//      enqueues them in enrichment_pending.
//   2. If pending unassigned paragraphs exist, submits a Messages Batch.
//   3. Polls in-flight batches; when ended, parses results and writes
//      thesis + questions back to content (sets enhanced_synced=0 so
//      Meili re-syncs).
//
// Counterpart to scripts/run-enrichment.js (which handles tier 8-9 via
// local Qwen3). Both can run simultaneously — they don't touch the same
// content rows because tier filtering is enforced.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env-secrets');
  process.exit(1);
}

const { logger } = await import('../api/lib/logger.js');
const {
  enqueueParagraphsForBatch,
  submitNextBatch,
  pollAndProcess,
  getStatus
} = await import('../api/lib/sonnet-enrichment.js');

// How often to scan for new paragraphs to enqueue (cheap)
const ENQUEUE_INTERVAL_MS = 5 * 60 * 1000;       // 5 min
// How often to poll in-flight batches (cheap, no API cost beyond GET)
const POLL_INTERVAL_MS = 60 * 1000;              // 1 min
// How often to consider submitting a new batch (each batch costs $$)
const SUBMIT_INTERVAL_MS = 30 * 1000;            // 30 sec — runs in batches anyway

let lastEnqueue = 0;
let lastSubmit = 0;
let stopping = false;

async function tick() {
  const now = Date.now();
  try {
    if (now - lastEnqueue > ENQUEUE_INTERVAL_MS) {
      const queued = await enqueueParagraphsForBatch({ limit: 50000 });
      if (queued > 0) logger.info({ queued }, 'enrichment-api: enqueued new paragraphs');
      lastEnqueue = now;
    }

    if (now - lastSubmit > SUBMIT_INTERVAL_MS) {
      const batchId = await submitNextBatch();
      if (batchId) logger.info({ batchId }, 'enrichment-api: batch submitted');
      lastSubmit = now;
    }

    const result = await pollAndProcess();
    if (result.completed > 0) {
      logger.info(result, 'enrichment-api: batches completed');
    }

    if (process.env.LOG_STATUS === '1') {
      const status = await getStatus();
      logger.info(status, 'enrichment-api: status');
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'enrichment-api tick failed');
  }
}

async function main() {
  logger.info('Sonnet API enrichment worker starting');
  // Initial tick immediately
  await tick();
  // Then loop
  while (!stopping) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    if (stopping) break;
    await tick();
  }
  logger.info('Sonnet API enrichment worker stopped');
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

main().catch(err => {
  logger.error({ err: err.message, stack: err.stack }, 'enrichment-api fatal error');
  process.exit(1);
});
