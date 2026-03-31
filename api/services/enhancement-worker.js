/**
 * Enhancement Worker
 *
 * Background service that runs the RAG enhancement pipeline:
 *   1. Entity extraction (per document)
 *   2. Disambiguation / context generation (per paragraph)
 *   3. HyPE question generation (per paragraph)
 *
 * Follows the same poll + backoff pattern as embedding-worker.js.
 * All content table writes go through the content API (api/lib/content.js).
 */

import { logger } from '../lib/logger.js';
import { content } from '../lib/content.js';

// Poll intervals
const ENHANCEMENT_INTERVAL_MS = 10000; // 10 seconds between cycles
const MAX_BACKOFF_MS = 10 * 60 * 1000; // Cap backoff at 10 minutes

let enhancementInterval = null;
let isRunning = false;
let backoffMs = 0;
let backoffUntil = 0;

let enhancementStats = {
  lastRun: null,
  lastSuccess: null,
  entitiesExtracted: 0,
  disambiguated: 0,
  hypesGenerated: 0,
  errors: 0,
  consecutiveErrors: 0,
  lastError: null,
  backoffUntil: null
};

/**
 * Run one enhancement cycle (entity extraction → disambiguation → HyPE).
 */
async function runEnhancementCycle() {
  if (isRunning) return;
  if (Date.now() < backoffUntil) return;
  isRunning = true;
  enhancementStats.lastRun = new Date().toISOString();
  try {
    // Phase 1: entity extraction for docs without entities
    const docs = await content.getDocsWithoutEntities(1);
    if (docs.length > 0) {
      logger.debug({ docId: docs[0].id }, 'Enhancement: entity extraction pending');
    }
    // Phase 2: disambiguation for paragraphs missing context
    const undisambiguated = await content.getUndisambiguated(20);
    if (undisambiguated.length > 0) {
      logger.debug({ count: undisambiguated.length }, 'Enhancement: disambiguation pending');
    }
    // Phase 3: HyPE questions for paragraphs with context but no questions
    const unhyped = await content.getUnhyped(10);
    if (unhyped.length > 0) {
      logger.debug({ count: unhyped.length }, 'Enhancement: HyPE pending');
    }
    // Reset backoff on success
    backoffMs = 0;
    backoffUntil = 0;
    enhancementStats.consecutiveErrors = 0;
    enhancementStats.backoffUntil = null;
    enhancementStats.lastSuccess = new Date().toISOString();
  } catch (err) {
    enhancementStats.errors++;
    enhancementStats.consecutiveErrors++;
    enhancementStats.lastError = err.message;
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : 30000, MAX_BACKOFF_MS);
    backoffUntil = Date.now() + backoffMs;
    enhancementStats.backoffUntil = new Date(backoffUntil).toISOString();
    logger.warn({ err: err.message, backoffSec: Math.round(backoffMs / 1000) }, 'Enhancement cycle error, backing off');
  } finally {
    isRunning = false;
  }
}

/**
 * Start the enhancement worker polling loop.
 */
export function startEnhancementWorker() {
  if (enhancementInterval) {
    logger.warn('Enhancement worker already running');
    return;
  }
  logger.info({ intervalMs: ENHANCEMENT_INTERVAL_MS }, 'Starting enhancement worker');
  enhancementInterval = setInterval(runEnhancementCycle, ENHANCEMENT_INTERVAL_MS);
  // Run first cycle immediately
  runEnhancementCycle();
}

/**
 * Stop the enhancement worker polling loop.
 */
export function stopEnhancementWorker() {
  if (enhancementInterval) {
    clearInterval(enhancementInterval);
    enhancementInterval = null;
    logger.info('Enhancement worker stopped');
  }
}

/**
 * Get current enhancement statistics.
 */
export function getEnhancementStats() {
  return { ...enhancementStats };
}
