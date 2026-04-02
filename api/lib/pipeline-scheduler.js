/**
 * Pipeline Job Scheduler
 * Manages pipeline_jobs table.
 * All functions accept db as first argument (injected by caller).
 */

// Create a pending job; return existing job if same (type, docId, layer, pipelineVersion) is already pending
export async function scheduleJob(db, { type, docId, layer, pipelineVersion }) {
  // Check for existing pending job with same key
  const existing = await db.execute({
    sql: `SELECT * FROM pipeline_jobs
          WHERE type=? AND doc_id=? AND layer=? AND pipeline_version=? AND status='pending'
          LIMIT 1`,
    args: [type, docId ?? null, layer, pipelineVersion]
  });
  if (existing.rows.length) return rowToObj(existing.rows[0]);
  const result = await db.execute({
    sql: `INSERT INTO pipeline_jobs (type, doc_id, layer, pipeline_version, status)
          VALUES (?, ?, ?, ?, 'pending')`,
    args: [type, docId ?? null, layer, pipelineVersion]
  });
  const row = await db.execute({
    sql: `SELECT * FROM pipeline_jobs WHERE id=?`,
    args: [Number(result.lastInsertRowid)]
  });
  return rowToObj(row.rows[0]);
}

// Return the oldest pending job for a given layer, or null
export async function getNextJob(db, layer) {
  const result = await db.execute({
    sql: `SELECT * FROM pipeline_jobs WHERE layer=? AND status='pending' ORDER BY id ASC LIMIT 1`,
    args: [layer]
  });
  return result.rows.length ? rowToObj(result.rows[0]) : null;
}

// Claim a job for a worker — throws if already running/claimed
export async function claimJob(db, jobId, workerId) {
  const check = await db.execute({
    sql: `SELECT status FROM pipeline_jobs WHERE id=?`,
    args: [jobId]
  });
  if (!check.rows.length) throw new Error(`Job ${jobId} not found`);
  if (check.rows[0].status !== 'pending') throw new Error(`Job ${jobId} is already ${check.rows[0].status}`);
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE pipeline_jobs SET status='running', worker_id=?, started_at=?, heartbeat_at=? WHERE id=?`,
    args: [workerId, now, now, jobId]
  });
  const row = await db.execute({ sql: `SELECT * FROM pipeline_jobs WHERE id=?`, args: [jobId] });
  return rowToObj(row.rows[0]);
}

// Mark job as completed with stats
export async function completeJob(db, jobId, { completedItems = 0, failedItems = 0 } = {}) {
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE pipeline_jobs SET status='completed', completed_at=?, completed_items=?, failed_items=? WHERE id=?`,
    args: [now, completedItems, failedItems, jobId]
  });
  const row = await db.execute({ sql: `SELECT * FROM pipeline_jobs WHERE id=?`, args: [jobId] });
  return rowToObj(row.rows[0]);
}

// Mark job as failed with an error message
export async function failJob(db, jobId, errorMessage) {
  await db.execute({
    sql: `UPDATE pipeline_jobs SET status='failed', error=? WHERE id=?`,
    args: [errorMessage, jobId]
  });
  const row = await db.execute({ sql: `SELECT * FROM pipeline_jobs WHERE id=?`, args: [jobId] });
  return rowToObj(row.rows[0]);
}

// Update heartbeat_at to now for a running job
export async function heartbeat(db, jobId) {
  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE pipeline_jobs SET heartbeat_at=? WHERE id=?`,
    args: [now, jobId]
  });
  const row = await db.execute({ sql: `SELECT * FROM pipeline_jobs WHERE id=?`, args: [jobId] });
  return rowToObj(row.rows[0]);
}

// Return running jobs where heartbeat_at is older than timeoutMs
export async function getStaleJobs(db, timeoutMs) {
  const cutoffSec = timeoutMs / 1000;
  const result = await db.execute({
    sql: `SELECT * FROM pipeline_jobs
          WHERE status='running'
            AND heartbeat_at < datetime('now', '-' || ? || ' seconds')`,
    args: [cutoffSec]
  });
  return result.rows.map(rowToObj);
}

// Return aggregated counts by (layer, status)
export async function getJobStats(db) {
  const result = await db.execute({
    sql: `SELECT layer, status, COUNT(*) as count FROM pipeline_jobs GROUP BY layer, status`,
    args: []
  });
  return result.rows.map(rowToObj);
}

// Store JSON checkpoint data on a job
export async function updateCheckpoint(db, jobId, data) {
  const json = JSON.stringify(data);
  await db.execute({
    sql: `UPDATE pipeline_jobs SET checkpoint=? WHERE id=?`,
    args: [json, jobId]
  });
  const row = await db.execute({ sql: `SELECT * FROM pipeline_jobs WHERE id=?`, args: [jobId] });
  return rowToObj(row.rows[0]);
}

// Convert raw row to plain object
function rowToObj(row) {
  if (!row) return null;
  if (typeof row === 'object' && !Array.isArray(row)) return { ...row };
  return row;
}
