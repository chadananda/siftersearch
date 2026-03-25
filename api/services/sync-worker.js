/**
 * Content Sync Worker — API Facade
 *
 * The actual sync worker is now a standalone PM2 process: api/workers/sync-processor.js
 * This module exists only to provide the API surface that admin.js depends on.
 *
 * getSyncStats()     — reads current progress from sync_jobs table
 * forceSyncNow()     — inserts a pending sync job into sync_jobs table
 * getUnsyncedCount() — delegates to content API (unchanged)
 * startSyncWorker()  — no-op (sync is now a standalone process)
 * stopSyncWorker()   — no-op (sync is now a standalone process)
 */

import { query, queryOne } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { content } from '../lib/content.js';

/**
 * Get sync stats from the sync_jobs table.
 * Returns the most recent job's progress so admin UI can display it.
 */
export async function getSyncStats() {
  try {
    // Get the most recent active (running or recently completed) job
    const activeJob = await queryOne(`
      SELECT * FROM sync_jobs
      WHERE status IN ('running', 'pending')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    // If no active job, get the most recent completed/failed one
    const lastJob = activeJob || await queryOne(`
      SELECT * FROM sync_jobs
      ORDER BY created_at DESC
      LIMIT 1
    `);
    if (!lastJob) {
      return {
        running: false,
        status: 'idle',
        totalItems: 0,
        completedItems: 0,
        failedItems: 0,
        lastRun: null,
        lastSuccess: null,
        note: 'Sync worker is a standalone process (siftersearch-sync)'
      };
    }
    return {
      running: lastJob.status === 'running',
      status: lastJob.status,
      jobType: lastJob.job_type,
      totalItems: lastJob.total_items || 0,
      completedItems: lastJob.completed_items || 0,
      failedItems: lastJob.failed_items || 0,
      lastRun: lastJob.started_at,
      lastSuccess: lastJob.status === 'completed' ? lastJob.completed_at : null,
      createdAt: lastJob.created_at,
      startedAt: lastJob.started_at,
      completedAt: lastJob.completed_at,
      error: lastJob.error || null,
      note: 'Sync worker is a standalone process (siftersearch-sync)'
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to read sync stats from sync_jobs');
    return { running: false, status: 'unknown', error: err.message };
  }
}

/**
 * Force a sync by inserting a pending sync_jobs row.
 * The standalone sync-processor picks it up within its next poll cycle.
 */
export async function forceSyncNow() {
  logger.info('Manual sync triggered — inserting pending sync job');
  try {
    // Count unsynced paragraphs for the job record
    const row = await queryOne(`SELECT COUNT(*) as count FROM content WHERE synced = 0 AND deleted_at IS NULL`);
    const totalItems = row?.count || 0;
    await query(
      `INSERT INTO sync_jobs (job_type, status, total_items) VALUES ('sync', 'pending', ?)`,
      [totalItems]
    );
    logger.info({ totalItems }, 'Sync job created — standalone worker will process it');
    return getSyncStats();
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to create sync job');
    throw err;
  }
}

/**
 * Get count of unsynced content paragraphs
 */
export async function getUnsyncedCount() {
  return content.getDirtyCount();
}

/**
 * No-op — sync worker is now the standalone siftersearch-sync PM2 process
 */
export function startSyncWorker() {
  logger.info('startSyncWorker() called — sync worker is now a standalone process (siftersearch-sync), no action taken');
}

/**
 * No-op — sync worker is now the standalone siftersearch-sync PM2 process
 */
export function stopSyncWorker() {
  logger.info('stopSyncWorker() called — sync worker is now a standalone process (siftersearch-sync), no action taken');
}
