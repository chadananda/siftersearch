/**
 * Job Processor Worker
 *
 * Background worker that processes translation and audio jobs.
 * Run with: node api/workers/job-processor.js
 */

import { getNextPendingJob, JOB_TYPES, cleanupExpiredJobs, updateJobHeartbeat, recoverStuckJobs, markJobForRetry } from '../services/jobs.js';
import { processTranslationJob } from '../services/translation.js';
import { processAudioJob } from '../services/audio.js';
import { notifyJobComplete, processEmailQueue } from '../services/email.js';
import { logger } from '../lib/logger.js';
import 'dotenv/config';

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.JOB_POLL_INTERVAL || '5000', 10);
const CLEANUP_INTERVAL_MS = parseInt(process.env.JOB_CLEANUP_INTERVAL || '3600000', 10); // 1 hour
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || '2', 10);
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

let isRunning = true;
let activeJobs = 0;
const activeHeartbeats = new Map(); // jobId -> intervalId

/**
 * Start heartbeat for a job
 */
function startHeartbeat(jobId) {
  const intervalId = setInterval(async () => {
    try {
      await updateJobHeartbeat(jobId);
    } catch (err) {
      logger.error({ jobId, error: err.message }, 'Failed to update heartbeat');
    }
  }, HEARTBEAT_INTERVAL_MS);

  activeHeartbeats.set(jobId, intervalId);

  // Also send initial heartbeat
  updateJobHeartbeat(jobId).catch(err => {
    logger.error({ jobId, error: err.message }, 'Failed to send initial heartbeat');
  });
}

/**
 * Stop heartbeat for a job
 */
function stopHeartbeat(jobId) {
  const intervalId = activeHeartbeats.get(jobId);
  if (intervalId) {
    clearInterval(intervalId);
    activeHeartbeats.delete(jobId);
  }
}

/**
 * Process a single job
 */
async function processJob(job) {
  activeJobs++;
  logger.info({ jobId: job.id, type: job.type }, 'Processing job');

  // Start heartbeat to indicate job is alive
  startHeartbeat(job.id);

  try {
    let result;

    switch (job.type) {
      case JOB_TYPES.TRANSLATION:
        result = await processTranslationJob(job);
        break;

      case JOB_TYPES.AUDIO:
        result = await processAudioJob(job);
        break;

      default:
        logger.warn({ jobId: job.id, type: job.type }, 'Unknown job type');
        return;
    }

    // Send notification
    await notifyJobComplete(job.id);

    logger.info({ jobId: job.id, result }, 'Job completed');

  } catch (err) {
    logger.error({ jobId: job.id, error: err.message }, 'Job failed');

    // Try to schedule retry (will mark as failed if max retries exceeded)
    const willRetry = await markJobForRetry(job.id, err.message);

    if (!willRetry) {
      // Max retries exceeded - notify about permanent failure
      try {
        await notifyJobComplete(job.id);
      } catch (notifyErr) {
        logger.error({ jobId: job.id, error: notifyErr.message }, 'Failed to send failure notification');
      }
    }
  } finally {
    // Stop heartbeat when job completes or fails
    stopHeartbeat(job.id);
    activeJobs--;
  }
}

/**
 * Main worker loop
 */
async function workerLoop() {
  logger.info({ pollInterval: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT_JOBS }, 'Job processor starting');

  // Recover any jobs stuck in processing state from previous crash
  try {
    const recovered = await recoverStuckJobs();
    if (recovered.length > 0) {
      logger.info({ count: recovered.length, jobIds: recovered.map(j => j.id) }, 'Recovered stuck jobs on startup');
    }
  } catch (err) {
    logger.error({ error: err.message }, 'Failed to recover stuck jobs');
  }

  while (isRunning) {
    try {
      // Check if we can take more jobs
      if (activeJobs < MAX_CONCURRENT_JOBS) {
        const job = await getNextPendingJob();

        if (job) {
          // Process job in background (don't await)
          processJob(job).catch(err => {
            logger.error({ error: err.message }, 'Unhandled job processing error');
          });
        }
      }

      // Process email queue
      await processEmailQueue(5);

    } catch (err) {
      logger.error({ error: err.message }, 'Worker loop error');
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  logger.info('Job processor stopped');
}

/**
 * Periodic cleanup task
 */
async function cleanupLoop() {
  while (isRunning) {
    try {
      const cleaned = await cleanupExpiredJobs();
      if (cleaned > 0) {
        logger.info({ cleaned }, 'Cleaned up expired jobs');
      }
    } catch (err) {
      logger.error({ error: err.message }, 'Cleanup error');
    }

    await new Promise(resolve => setTimeout(resolve, CLEANUP_INTERVAL_MS));
  }
}

/**
 * Graceful shutdown
 */
function shutdown() {
  logger.info('Shutting down job processor...');
  isRunning = false;

  // Wait for active jobs to complete (with timeout)
  const timeout = setTimeout(() => {
    logger.warn('Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);

  const checkComplete = setInterval(() => {
    if (activeJobs === 0) {
      clearInterval(checkComplete);
      clearTimeout(timeout);
      logger.info('All jobs completed, exiting');
      process.exit(0);
    }
  }, 1000);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start worker
workerLoop();
cleanupLoop();

logger.info('Job processor started');
