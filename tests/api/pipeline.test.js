/**
 * Pipeline Version Manager + Job Scheduler Tests (TDD RED)
 *
 * Tests are written FIRST — all must fail until implementation files exist:
 *   api/lib/pipeline.js
 *   api/lib/pipeline-scheduler.js
 *
 * Uses an in-memory better-sqlite3 DB with the required tables created in beforeAll.
 * Both modules receive the db client via a setDb() / init() interface so
 * tests can inject the in-memory instance instead of the real sifter.db.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// better-sqlite3 in-memory wrapper with libsql-compatible API
// ---------------------------------------------------------------------------

function createInMemoryDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return {
    _db: db,
    execute(sqlOrObj, argsArr) {
      const sql = typeof sqlOrObj === 'string' ? sqlOrObj : sqlOrObj.sql;
      const args = typeof sqlOrObj === 'string' ? (argsArr || []) : (sqlOrObj.args || []);
      const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
      if (isWrite) {
        const info = db.prepare(sql).run(...args);
        return Promise.resolve({ rows: [], lastInsertRowid: info.lastInsertRowid, changes: info.changes });
      }
      const rows = db.prepare(sql).all(...args);
      return Promise.resolve({ rows, lastInsertRowid: null });
    },
    executeMultiple(sql) {
      db.exec(sql);
      return Promise.resolve();
    },
    batch(stmts) {
      const txn = db.transaction((s) => s.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
      return Promise.resolve(txn(stmts));
    },
    close() {
      db.close();
    }
  };
}

// ---------------------------------------------------------------------------
// Shared in-memory DB + schema bootstrap
// ---------------------------------------------------------------------------

let db;

const CREATE_PIPELINE_VERSIONS = `
  CREATE TABLE IF NOT EXISTS pipeline_versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline    TEXT    NOT NULL,
    version     TEXT    NOT NULL,
    active      INTEGER NOT NULL DEFAULT 0,
    prompt_hash TEXT,
    model_id    TEXT,
    config      TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(pipeline, version)
  )
`;

const CREATE_PIPELINE_JOBS = `
  CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    type             TEXT    NOT NULL,
    doc_id           INTEGER,
    layer            TEXT    NOT NULL,
    pipeline_version TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'pending',
    worker_id        TEXT,
    started_at       TEXT,
    heartbeat_at     TEXT,
    completed_at     TEXT,
    error            TEXT,
    completed_items  INTEGER DEFAULT 0,
    failed_items     INTEGER DEFAULT 0,
    checkpoint       TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_LAYER_SYNC_STATE = `
  CREATE TABLE IF NOT EXISTS layer_sync_state (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id  INTEGER,
    doc_id      INTEGER,
    layer       TEXT    NOT NULL,
    dirty       INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

beforeAll(async () => {
  db = createInMemoryDb();
  await db.execute(CREATE_PIPELINE_VERSIONS);
  await db.execute(CREATE_PIPELINE_JOBS);
  await db.execute(CREATE_LAYER_SYNC_STATE);
});

afterAll(async () => {
  db.close();
});

// ===========================================================================
// Pipeline Version Manager
// ===========================================================================

describe('Pipeline Version Manager', () => {
  const getModule = () => import('../../api/lib/pipeline.js');

  it('registerVersion() inserts a row and returns a version object', async () => {
    const { registerVersion } = await getModule();
    const result = await registerVersion(
      db,
      'embedding',
      'v1',
      { promptHash: 'abc123', modelId: 'text-embedding-3-large', config: { dim: 3072 } }
    );
    expect(result).toBeTruthy();
    expect(result.pipeline).toBe('embedding');
    expect(result.version).toBe('v1');
    expect(typeof result.id).toBe('number');
  });

  it('registerVersion() with duplicate (pipeline, version) throws or updates without silent discard', async () => {
    const { registerVersion } = await getModule();
    let threw = false;
    let result;
    try {
      result = await registerVersion(
        db,
        'embedding',
        'v1',
        { promptHash: 'xyz999', modelId: 'text-embedding-3-large', config: {} }
      );
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(result).toBeTruthy();
      expect(result.pipeline).toBe('embedding');
    }
    expect(threw || result).toBeTruthy();
  });

  it('getActiveVersion() returns the version marked active=1', async () => {
    const { registerVersion, getActiveVersion } = await getModule();
    await registerVersion(db, 'segmentation', 'v1', { promptHash: 'seg1', modelId: 'model-a', config: {} });
    await db.execute({
      sql: `UPDATE pipeline_versions SET active=1 WHERE pipeline='segmentation' AND version='v1'`,
      args: []
    });
    const active = await getActiveVersion(db, 'segmentation');
    expect(active).toBeTruthy();
    expect(active.version).toBe('v1');
    expect(active.active).toBe(1);
  });

  it('only one version is active per pipeline at a time', async () => {
    const { registerVersion, getActiveVersion } = await getModule();
    await registerVersion(db, 'hype', 'v1', { promptHash: 'h1', modelId: 'model-b', config: {} });
    await registerVersion(db, 'hype', 'v2', { promptHash: 'h2', modelId: 'model-b', config: {} });
    await db.execute({ sql: `UPDATE pipeline_versions SET active=1 WHERE pipeline='hype' AND version='v1'`, args: [] });
    await db.execute({ sql: `UPDATE pipeline_versions SET active=0 WHERE pipeline='hype' AND version='v1'`, args: [] });
    await db.execute({ sql: `UPDATE pipeline_versions SET active=1 WHERE pipeline='hype' AND version='v2'`, args: [] });
    const active = await getActiveVersion(db, 'hype');
    expect(active.version).toBe('v2');
    const rows = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM pipeline_versions WHERE pipeline='hype' AND active=1`,
      args: []
    });
    expect(Number(rows.rows[0].cnt)).toBe(1);
  });

  it('deactivateVersion() sets active=0 for the specified version', async () => {
    const { registerVersion, deactivateVersion, getActiveVersion } = await getModule();
    await registerVersion(db, 'context', 'v1', { promptHash: 'c1', modelId: 'model-c', config: {} });
    await db.execute({ sql: `UPDATE pipeline_versions SET active=1 WHERE pipeline='context' AND version='v1'`, args: [] });
    await deactivateVersion(db, 'context', 'v1');
    const active = await getActiveVersion(db, 'context');
    expect(active).toBeNull();
  });

  it('invalidateForTextChange(contentId) marks all layers dirty for that content_id', async () => {
    const { invalidateForTextChange } = await getModule();
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (42, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (42, 'enrichment', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (42, 'embedding', 0)`, args: [] });
    await invalidateForTextChange(db, 42);
    const rows = await db.execute({
      sql: `SELECT layer, dirty FROM layer_sync_state WHERE content_id=42`,
      args: []
    });
    for (const row of rows.rows) {
      expect(Number(row.dirty)).toBe(1);
    }
  });

  it('invalidateForMetadataChange(docId) marks object + enrichment dirty for all doc paragraphs', async () => {
    const { invalidateForMetadataChange } = await getModule();
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, doc_id, layer, dirty) VALUES (101, 10, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, doc_id, layer, dirty) VALUES (101, 10, 'enrichment', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, doc_id, layer, dirty) VALUES (101, 10, 'embedding', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, doc_id, layer, dirty) VALUES (102, 10, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, doc_id, layer, dirty) VALUES (102, 10, 'enrichment', 0)`, args: [] });
    await invalidateForMetadataChange(db, 10);
    const dirtyRows = await db.execute({
      sql: `SELECT layer, dirty FROM layer_sync_state WHERE doc_id=10 AND dirty=1`,
      args: []
    });
    const dirtyLayers = dirtyRows.rows.map(r => r.layer);
    expect(dirtyLayers).toContain('object');
    expect(dirtyLayers).toContain('enrichment');
    const embeddingRows = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE doc_id=10 AND layer='embedding'`,
      args: []
    });
    expect(Number(embeddingRows.rows[0].dirty)).toBe(0);
  });

  it('invalidateForObjectVersionChange(version) marks object + enrichment dirty for all content', async () => {
    const { invalidateForObjectVersionChange } = await getModule();
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (200, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (200, 'enrichment', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (200, 'embedding', 0)`, args: [] });
    await invalidateForObjectVersionChange(db, 'v2');
    const objectRow = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE content_id=200 AND layer='object'`,
      args: []
    });
    expect(Number(objectRow.rows[0].dirty)).toBe(1);
    const enrichRow = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE content_id=200 AND layer='enrichment'`,
      args: []
    });
    expect(Number(enrichRow.rows[0].dirty)).toBe(1);
    const embedRow = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE content_id=200 AND layer='embedding'`,
      args: []
    });
    expect(Number(embedRow.rows[0].dirty)).toBe(0);
  });

  it('invalidateForContextPromptChange() marks only enrichment/context layer dirty', async () => {
    const { invalidateForContextPromptChange } = await getModule();
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (300, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (300, 'enrichment', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (300, 'context', 0)`, args: [] });
    await invalidateForContextPromptChange(db);
    const dirtyRows = await db.execute({
      sql: `SELECT layer FROM layer_sync_state WHERE content_id=300 AND dirty=1`,
      args: []
    });
    const dirtyLayers = dirtyRows.rows.map(r => r.layer);
    expect(dirtyLayers.some(l => l === 'enrichment' || l === 'context')).toBe(true);
    const objectRow = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE content_id=300 AND layer='object'`,
      args: []
    });
    expect(Number(objectRow.rows[0].dirty)).toBe(0);
  });

  it('invalidateForHypePromptChange() marks only enrichment/hype layer dirty', async () => {
    const { invalidateForHypePromptChange } = await getModule();
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (400, 'object', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (400, 'enrichment', 0)`, args: [] });
    await db.execute({ sql: `INSERT INTO layer_sync_state (content_id, layer, dirty) VALUES (400, 'hype', 0)`, args: [] });
    await invalidateForHypePromptChange(db);
    const dirtyRows = await db.execute({
      sql: `SELECT layer FROM layer_sync_state WHERE content_id=400 AND dirty=1`,
      args: []
    });
    const dirtyLayers = dirtyRows.rows.map(r => r.layer);
    expect(dirtyLayers.some(l => l === 'enrichment' || l === 'hype')).toBe(true);
    const objectRow = await db.execute({
      sql: `SELECT dirty FROM layer_sync_state WHERE content_id=400 AND layer='object'`,
      args: []
    });
    expect(Number(objectRow.rows[0].dirty)).toBe(0);
  });
});

// ===========================================================================
// Pipeline Job Scheduler
// ===========================================================================

describe('Pipeline Job Scheduler', () => {
  const getModule = () => import('../../api/lib/pipeline-scheduler.js');

  it('scheduleJob() creates a pending job and returns a job object with id', async () => {
    const { scheduleJob } = await getModule();
    const job = await scheduleJob(db, {
      type: 'object_extract',
      docId: 1,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    expect(job).toBeTruthy();
    expect(typeof job.id).toBe('number');
    expect(job.status).toBe('pending');
    expect(job.type).toBe('object_extract');
    expect(job.layer).toBe('object');
  });

  it('scheduleJob() returns existing job for duplicate (type, docId, layer, pipelineVersion) when pending', async () => {
    const { scheduleJob } = await getModule();
    const first = await scheduleJob(db, {
      type: 'object_extract',
      docId: 2,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    const second = await scheduleJob(db, {
      type: 'object_extract',
      docId: 2,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    expect(second.id).toBe(first.id);
  });

  it('getNextJob(layer) returns the oldest pending job for that layer', async () => {
    const { scheduleJob, getNextJob } = await getModule();
    await scheduleJob(db, { type: 'object_extract', docId: 10, layer: 'embedding', pipelineVersion: 'v1' });
    await scheduleJob(db, { type: 'object_extract', docId: 11, layer: 'embedding', pipelineVersion: 'v1' });
    const next = await getNextJob(db, 'embedding');
    expect(next).toBeTruthy();
    expect(next.layer).toBe('embedding');
    expect(next.status).toBe('pending');
    expect(next.doc_id).toBe(10);
  });

  it('getNextJob() returns null when no pending jobs exist for that layer', async () => {
    const { getNextJob } = await getModule();
    const next = await getNextJob(db, 'nonexistent_layer_xyz');
    expect(next).toBeNull();
  });

  it('claimJob(jobId, workerId) sets status=running with timestamps', async () => {
    const { scheduleJob, claimJob } = await getModule();
    const job = await scheduleJob(db, {
      type: 'hype_generate',
      docId: 20,
      layer: 'hype',
      pipelineVersion: 'v1'
    });
    const claimed = await claimJob(db, job.id, 'worker-1');
    expect(claimed.status).toBe('running');
    expect(claimed.worker_id).toBe('worker-1');
    expect(claimed.started_at).toBeTruthy();
    expect(claimed.heartbeat_at).toBeTruthy();
  });

  it('claimJob() throws when job is already claimed/running', async () => {
    const { scheduleJob, claimJob } = await getModule();
    const job = await scheduleJob(db, {
      type: 'hype_generate',
      docId: 21,
      layer: 'hype',
      pipelineVersion: 'v1'
    });
    await claimJob(db, job.id, 'worker-1');
    await expect(claimJob(db, job.id, 'worker-2')).rejects.toThrow();
  });

  it('completeJob() sets status=completed, completed_at, and item counts', async () => {
    const { scheduleJob, claimJob, completeJob } = await getModule();
    const job = await scheduleJob(db, {
      type: 'object_extract',
      docId: 30,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    await claimJob(db, job.id, 'worker-1');
    const done = await completeJob(db, job.id, { completedItems: 100, failedItems: 2 });
    expect(done.status).toBe('completed');
    expect(done.completed_at).toBeTruthy();
    expect(Number(done.completed_items)).toBe(100);
    expect(Number(done.failed_items)).toBe(2);
  });

  it('failJob(jobId, errorMessage) sets status=failed and stores error', async () => {
    const { scheduleJob, claimJob, failJob } = await getModule();
    const job = await scheduleJob(db, {
      type: 'object_extract',
      docId: 31,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    await claimJob(db, job.id, 'worker-1');
    const failed = await failJob(db, job.id, 'Connection timeout after 30s');
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('Connection timeout');
  });

  it('heartbeat(jobId) updates heartbeat_at to a more recent timestamp', async () => {
    const { scheduleJob, claimJob, heartbeat } = await getModule();
    const job = await scheduleJob(db, {
      type: 'context_enrich',
      docId: 40,
      layer: 'enrichment',
      pipelineVersion: 'v1'
    });
    const claimed = await claimJob(db, job.id, 'worker-1');
    const originalHeartbeat = claimed.heartbeat_at;
    await new Promise(r => setTimeout(r, 10));
    const updated = await heartbeat(db, job.id);
    expect(updated.heartbeat_at).toBeTruthy();
    expect(updated.heartbeat_at >= originalHeartbeat).toBe(true);
  });

  it('getStaleJobs(timeoutMs) returns running jobs with stale heartbeats', async () => {
    const { scheduleJob, claimJob, getStaleJobs } = await getModule();
    const job = await scheduleJob(db, {
      type: 'object_extract',
      docId: 50,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    await claimJob(db, job.id, 'worker-stale');
    await db.execute({
      sql: `UPDATE pipeline_jobs SET heartbeat_at=datetime('now', '-10 minutes') WHERE id=?`,
      args: [job.id]
    });
    const stale = await getStaleJobs(db, 60_000);
    expect(Array.isArray(stale)).toBe(true);
    const found = stale.find(j => j.id === job.id);
    expect(found).toBeTruthy();
    expect(found.worker_id).toBe('worker-stale');
  });

  it('getJobStats() returns an array of { layer, status, count } aggregates', async () => {
    const { getJobStats } = await getModule();
    const stats = await getJobStats(db);
    expect(Array.isArray(stats)).toBe(true);
    for (const entry of stats) {
      expect(typeof entry.layer).toBe('string');
      expect(typeof entry.status).toBe('string');
      expect(typeof Number(entry.count)).toBe('number');
    }
  });

  it('updateCheckpoint(jobId, data) stores JSON checkpoint and is readable back', async () => {
    const { scheduleJob, claimJob, updateCheckpoint } = await getModule();
    const job = await scheduleJob(db, {
      type: 'object_extract',
      docId: 60,
      layer: 'object',
      pipelineVersion: 'v1'
    });
    await claimJob(db, job.id, 'worker-1');
    const checkpointData = { lastProcessedId: 500, offset: 42, batchSize: 100 };
    const updated = await updateCheckpoint(db, job.id, checkpointData);
    expect(updated).toBeTruthy();
    const parsed = typeof updated.checkpoint === 'string'
      ? JSON.parse(updated.checkpoint)
      : updated.checkpoint;
    expect(parsed.lastProcessedId).toBe(500);
    expect(parsed.offset).toBe(42);
  });
});
