/**
 * Job Queue Service
 *
 * Manages background jobs for translation, audio conversion, etc.
 * Jobs are processed asynchronously and users are notified via email.
 */

import { query, queryOne, queryAll } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

// Job types
export const JOB_TYPES = {
  TRANSLATION: 'translation',
  AUDIO: 'audio',
  EMBEDDING: 'embedding'
};

// Job statuses
export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30000; // 30 seconds before retry

/**
 * Create a new job
 * @param priority - Higher number = higher priority (document authority score)
 */
export async function createJob({
  type,
  userId,
  documentId,
  params,
  notifyEmail,
  priority = 0,
  expiresInDays = 7
}) {
  const id = `job_${nanoid(16)}`;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO jobs (id, type, user_id, document_id, params, notify_email, priority, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, type, userId, documentId, JSON.stringify(params), notifyEmail, priority, expiresAt.toISOString()]
  );

  logger.info({ jobId: id, type, documentId, priority }, 'Job created');
  return { id, type, status: JOB_STATUS.PENDING, priority };
}

/**
 * Get job by ID
 */
export async function getJob(jobId) {
  const job = await queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
  if (job) {
    job.params = JSON.parse(job.params || '{}');
  }
  return job;
}

/**
 * Get jobs for a user
 */
export async function getUserJobs(userId, options = {}) {
  const { type, status, limit = 20, offset = 0 } = options;

  let sql = 'SELECT * FROM jobs WHERE user_id = ?';
  const params = [userId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const jobs = await queryAll(sql, params);
  return jobs.map(job => ({
    ...job,
    params: JSON.parse(job.params || '{}')
  }));
}

/**
 * Get next pending job to process
 * Orders by priority DESC (higher authority first), then created_at ASC
 * Respects retry_after for delayed retries
 */
export async function getNextPendingJob(type = null) {
  const now = new Date().toISOString();
  let sql = `
    SELECT * FROM jobs
    WHERE status = 'pending'
    AND (expires_at IS NULL OR expires_at > ?)
    AND (retry_after IS NULL OR retry_after <= ?)
  `;
  const params = [now, now];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  // Higher priority (authority) first, then FIFO within same priority
  sql += ' ORDER BY COALESCE(priority, 0) DESC, created_at ASC LIMIT 1';

  const job = await queryOne(sql, params);
  if (job) {
    job.params = JSON.parse(job.params || '{}');
  }
  return job;
}

/**
 * Mark a job for retry (instead of permanent failure)
 * Returns true if retry scheduled, false if max retries exceeded
 */
export async function markJobForRetry(jobId, errorMessage) {
  const job = await queryOne('SELECT retry_count FROM jobs WHERE id = ?', [jobId]);

  if (!job) {
    logger.warn({ jobId }, 'Job not found for retry');
    return false;
  }

  const retryCount = (job.retry_count || 0) + 1;

  if (retryCount > MAX_RETRIES) {
    // Max retries exceeded - mark as permanently failed
    await query(
      `UPDATE jobs SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [`Max retries (${MAX_RETRIES}) exceeded. Last error: ${errorMessage}`, jobId]
    );
    logger.error({ jobId, retryCount }, 'Job permanently failed after max retries');
    return false;
  }

  // Schedule retry with delay
  const retryAfter = new Date(Date.now() + RETRY_DELAY_MS).toISOString();

  await query(
    `UPDATE jobs
     SET status = 'pending',
         retry_count = ?,
         retry_after = ?,
         error_message = ?,
         heartbeat_at = NULL
     WHERE id = ?`,
    [retryCount, retryAfter, `Retry ${retryCount}/${MAX_RETRIES}: ${errorMessage}`, jobId]
  );

  logger.info({ jobId, retryCount, retryAfter }, 'Job scheduled for retry');
  return true;
}

/**
 * Manually retry a failed job
 * Resets retry count and schedules immediately
 */
export async function retryFailedJob(jobId) {
  const job = await queryOne('SELECT status FROM jobs WHERE id = ?', [jobId]);

  if (!job) {
    throw new Error('Job not found');
  }

  if (job.status !== 'failed') {
    throw new Error(`Job is ${job.status}, not failed`);
  }

  await query(
    `UPDATE jobs
     SET status = 'pending',
         retry_count = 0,
         retry_after = NULL,
         error_message = NULL,
         heartbeat_at = NULL,
         completed_at = NULL
     WHERE id = ?`,
    [jobId]
  );

  logger.info({ jobId }, 'Failed job manually retried');
  return true;
}

/**
 * Get failed jobs for a document (for manual retry)
 */
export async function getFailedJobsForDocument(documentId) {
  const jobs = await queryAll(
    `SELECT id, type, status, error_message, retry_count, created_at, completed_at
     FROM jobs
     WHERE document_id = ? AND status = 'failed'
     ORDER BY created_at DESC`,
    [documentId]
  );
  return jobs;
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId, status, updates = {}) {
  const setClauses = ['status = ?'];
  const params = [status];

  if (status === JOB_STATUS.PROCESSING) {
    setClauses.push('started_at = CURRENT_TIMESTAMP');
  }

  if (status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED) {
    setClauses.push('completed_at = CURRENT_TIMESTAMP');
  }

  if (updates.resultUrl) {
    setClauses.push('result_url = ?');
    params.push(updates.resultUrl);
  }

  if (updates.resultPath) {
    setClauses.push('result_path = ?');
    params.push(updates.resultPath);
  }

  if (updates.errorMessage) {
    setClauses.push('error_message = ?');
    params.push(updates.errorMessage);
  }

  if (updates.progress !== undefined) {
    setClauses.push('progress = ?');
    params.push(updates.progress);
  }

  if (updates.totalItems !== undefined) {
    setClauses.push('total_items = ?');
    params.push(updates.totalItems);
  }

  params.push(jobId);

  await query(
    `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  logger.info({ jobId, status, ...updates }, 'Job status updated');
}

/**
 * Mark job as notified
 */
export async function markJobNotified(jobId) {
  await query(
    'UPDATE jobs SET notified_at = CURRENT_TIMESTAMP WHERE id = ?',
    [jobId]
  );
}

/**
 * Generate content hash for caching
 */
export function generateContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}

/**
 * Check cache for existing processed content
 */
export async function checkCache({
  documentId,
  segmentId = null,
  processType,
  targetLanguage = null,
  voiceId = null,
  contentHash
}) {
  const cached = await queryOne(
    `SELECT * FROM processed_cache
     WHERE document_id = ?
     AND (segment_id = ? OR (segment_id IS NULL AND ? IS NULL))
     AND process_type = ?
     AND (target_language = ? OR (target_language IS NULL AND ? IS NULL))
     AND (voice_id = ? OR (voice_id IS NULL AND ? IS NULL))
     AND content_hash = ?`,
    [documentId, segmentId, segmentId, processType, targetLanguage, targetLanguage, voiceId, voiceId, contentHash]
  );

  if (cached) {
    // Update access stats
    await query(
      `UPDATE processed_cache
       SET last_accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1
       WHERE id = ?`,
      [cached.id]
    );
    logger.info({ documentId, processType, targetLanguage }, 'Cache hit');
  }

  return cached;
}

/**
 * Store processed content in cache
 */
export async function storeInCache({
  documentId,
  segmentId = null,
  processType,
  sourceLanguage = null,
  targetLanguage = null,
  voiceId = null,
  contentHash,
  resultPath,
  resultUrl = null,
  fileSize = null
}) {
  try {
    await query(
      `INSERT INTO processed_cache
       (document_id, segment_id, process_type, source_language, target_language, voice_id, content_hash, result_path, result_url, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentId, segmentId, processType, sourceLanguage, targetLanguage, voiceId, contentHash, resultPath, resultUrl, fileSize]
    );
    logger.info({ documentId, processType, targetLanguage }, 'Cached processed content');
  } catch (err) {
    // Ignore duplicate key errors (race condition)
    if (!err.message?.includes('UNIQUE constraint')) {
      throw err;
    }
  }
}

/**
 * Update job heartbeat to indicate it's still processing
 */
export async function updateJobHeartbeat(jobId) {
  const now = new Date().toISOString();
  await query(
    'UPDATE jobs SET heartbeat_at = ? WHERE id = ?',
    [now, jobId]
  );
}

/**
 * Update job checkpoint for resume capability
 */
export async function updateJobCheckpoint(jobId, checkpoint, progress = null) {
  const setClauses = ['last_checkpoint = ?', 'heartbeat_at = ?'];
  const params = [checkpoint, new Date().toISOString()];

  if (progress !== null) {
    setClauses.push('progress = ?');
    params.push(progress);
  }

  params.push(jobId);
  await query(
    `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );
}

/**
 * Recover stuck jobs (no heartbeat for > 2 minutes while processing)
 * Called on worker startup
 */
export async function recoverStuckJobs() {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Find stuck jobs: status=processing but no recent heartbeat
  const stuckJobs = await queryAll(`
    SELECT id, document_id, last_checkpoint, heartbeat_at
    FROM jobs
    WHERE status = 'processing'
    AND (heartbeat_at IS NULL OR heartbeat_at < ?)
  `, [twoMinutesAgo]);

  if (stuckJobs.length === 0) {
    return [];
  }

  // Reset stuck jobs to pending (they'll resume from last_checkpoint)
  for (const job of stuckJobs) {
    await query(
      `UPDATE jobs SET status = 'pending', heartbeat_at = NULL WHERE id = ?`,
      [job.id]
    );
    logger.warn({
      jobId: job.id,
      documentId: job.document_id,
      lastCheckpoint: job.last_checkpoint,
      lastHeartbeat: job.heartbeat_at
    }, 'Recovered stuck job');
  }

  logger.info({ count: stuckJobs.length }, 'Recovered stuck jobs on startup');
  return stuckJobs;
}

/**
 * Clean up expired jobs
 */
export async function cleanupExpiredJobs() {
  const now = new Date().toISOString();
  const result = await query(
    `DELETE FROM jobs WHERE expires_at < ? AND status IN ('completed', 'failed')`,
    [now]
  );
  if (result.rowsAffected > 0) {
    logger.info({ count: result.rowsAffected }, 'Cleaned up expired jobs');
  }
  return result.rowsAffected;
}

/**
 * Get job statistics
 */
export async function getJobStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const stats = await queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM jobs
    WHERE created_at > ?
  `, [thirtyDaysAgo]);

  const cacheStats = await queryOne(`
    SELECT
      COUNT(*) as total_cached,
      SUM(access_count) as total_accesses,
      SUM(file_size) as total_size_bytes
    FROM processed_cache
  `);

  return { jobs: stats, cache: cacheStats };
}

export const jobs = {
  JOB_TYPES,
  JOB_STATUS,
  createJob,
  getJob,
  getUserJobs,
  getNextPendingJob,
  updateJobStatus,
  markJobNotified,
  generateContentHash,
  checkCache,
  storeInCache,
  cleanupExpiredJobs,
  getJobStats,
  updateJobHeartbeat,
  updateJobCheckpoint,
  recoverStuckJobs,
  markJobForRetry,
  retryFailedJob,
  getFailedJobsForDocument
};

export default jobs;
