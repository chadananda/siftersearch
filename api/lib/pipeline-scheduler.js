/**
 * Pipeline Job Scheduler
 * Manages pipeline_jobs table.
 */

import { query, queryOne, queryAll } from './db.js';

// Create a pending job; return existing job if same (type, docId, layer, pipelineVersion) is already pending
export async function scheduleJob({ type, docId, layer, pipelineVersion }) {
  const existing = await queryOne(
    `SELECT * FROM pipeline_jobs WHERE type=? AND doc_id=? AND layer=? AND pipeline_version=? AND status='pending' LIMIT 1`,
    [type, docId ?? null, layer, pipelineVersion]
  );
  if (existing) return existing;
  const result = await query(
    `INSERT INTO pipeline_jobs (type, doc_id, layer, pipeline_version, status) VALUES (?, ?, ?, ?, 'pending')`,
    [type, docId ?? null, layer, pipelineVersion]
  );
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [Number(result.lastInsertRowid)]);
}

// Return the oldest pending job for a given layer, or null
export async function getNextJob(layer) {
  return queryOne(
    `SELECT * FROM pipeline_jobs WHERE layer=? AND status='pending' ORDER BY id ASC LIMIT 1`,
    [layer]
  );
}

// Claim a job for a worker — throws if already running/claimed
export async function claimJob(jobId, workerId) {
  const check = await queryOne(`SELECT status FROM pipeline_jobs WHERE id=?`, [jobId]);
  if (!check) throw new Error(`Job ${jobId} not found`);
  if (check.status !== 'pending') throw new Error(`Job ${jobId} is already ${check.status}`);
  const now = new Date().toISOString();
  await query(
    `UPDATE pipeline_jobs SET status='running', worker_id=?, started_at=?, heartbeat_at=? WHERE id=?`,
    [workerId, now, now, jobId]
  );
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [jobId]);
}

// Mark job as completed with stats
export async function completeJob(jobId, { completedItems = 0, failedItems = 0 } = {}) {
  const now = new Date().toISOString();
  await query(
    `UPDATE pipeline_jobs SET status='completed', completed_at=?, completed_items=?, failed_items=? WHERE id=?`,
    [now, completedItems, failedItems, jobId]
  );
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [jobId]);
}

// Mark job as failed with an error message
export async function failJob(jobId, errorMessage) {
  await query(`UPDATE pipeline_jobs SET status='failed', error=? WHERE id=?`, [errorMessage, jobId]);
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [jobId]);
}

// Update heartbeat_at to now for a running job
export async function heartbeat(jobId) {
  const now = new Date().toISOString();
  await query(`UPDATE pipeline_jobs SET heartbeat_at=? WHERE id=?`, [now, jobId]);
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [jobId]);
}

// Return running jobs where heartbeat_at is older than timeoutMs
export async function getStaleJobs(timeoutMs) {
  const cutoffSec = timeoutMs / 1000;
  return queryAll(
    `SELECT * FROM pipeline_jobs WHERE status='running' AND heartbeat_at < datetime('now', '-' || ? || ' seconds')`,
    [cutoffSec]
  );
}

// Return aggregated counts by (layer, status)
export async function getJobStats() {
  return queryAll(`SELECT layer, status, COUNT(*) as count FROM pipeline_jobs GROUP BY layer, status`, []);
}

// Store JSON checkpoint data on a job
export async function updateCheckpoint(jobId, data) {
  const json = JSON.stringify(data);
  await query(`UPDATE pipeline_jobs SET checkpoint=? WHERE id=?`, [json, jobId]);
  return queryOne(`SELECT * FROM pipeline_jobs WHERE id=?`, [jobId]);
}
