// better-sqlite3 Database Client
// Three separate databases: content (sifter.db), user, graph (graph.db).
// Exported function signatures are async for backward compatibility.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { runSiteMigrations } from './migrations/site.js';
import { isWriteSql } from './write-server.js';

// Single-writer routing. When SIFTER_WRITER_URL is set, content-db WRITES are
// POSTed to the writer process (which owns the only write connection) instead
// of opening a local write txn — this is what kills multi-process lock
// contention. Reads always stay direct (WAL allows unlimited concurrent
// readers). The writer process itself sets SIFTER_IS_WRITER=1 so it writes
// directly and never calls itself. Unset = legacy direct-write (zero change).
const WRITER_URL = process.env.SIFTER_WRITER_URL || null;
const IS_WRITER = process.env.SIFTER_IS_WRITER === '1';
const ROUTE_WRITES = !!WRITER_URL && !IS_WRITER;

// A sustained run of write failures means the single writer is DOWN (deadlocked/crashed), not a one-off
// blip. Tracked process-wide so we can distinguish "one flaky write" (tolerated) from "the writer is gone".
let writeFailStreak = 0;
const WRITER_DOWN_STREAK = Number(process.env.SIFTER_WRITER_DOWN_STREAK || 8);

// POST a batch of {sql,args} to the writer; returns per-statement results.
// Fails loud — never silently falls back to a direct write (that would
// reintroduce the contention this whole mechanism exists to prevent).
export async function postWriteBatch(statements, name = '') {
  // Bounded write: a slow/stuck write aborts as a catchable TimeoutError instead of an uncaught undici
  // headers-timeout crashing a long grounding run. Safe — writer transactions are atomic and the pipeline's
  // resume is idempotent per paragraph, so an aborted-but-maybe-committed write never duplicates.
  try {
    const res = await fetch(`${WRITER_URL}/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statements, name }),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`writer ${res.status}: ${detail.slice(0, 200)}`);
    }
    writeFailStreak = 0;
    return (await res.json()).results;
  } catch (e) {
    // The grounding pool()/stages tolerate a LONE write failure (a writer restart on deploy) by dropping that
    // paragraph — resume refills it. But when the writer is fully DOWN, every write fails; without a signal the
    // stage keeps calling the model + dropping each write as "per-item flake" → silent no-op churn that wastes
    // spend and freezes the queue (the 2026-07-18 incident). After a streak of failures, tag the error FATAL so
    // the stage aborts the book fast → the queue's auto-retry requeues it once the writer is back.
    if (++writeFailStreak >= WRITER_DOWN_STREAK) e.fatal = true;
    throw e;
  }
}

let contentDb = null;
let userDb = null;
let graphDb = null;
let telemetryDb = null;
const siteDbCache = new Map();

function stripFilePrefix(url) {
  if (!url) return null;
  return url.startsWith('file:') ? url.slice(5) : url;
}

function createContentConnection() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url) || './data/sifter.db';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  // API default: 200ms — fail fast. A 5s block freezes the event loop under concurrent
  // load (10 searches × 5s = all requests hang). Workers override this via ecosystem.config.cjs
  // SQLITE_BUSY_TIMEOUT_MS=30000 to survive write contention from graph pipeline workers.
  const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || '200', 10);
  db.pragma(`busy_timeout = ${busyTimeout}`);
  // synchronous=NORMAL is the standard, safe choice in WAL mode: it fsyncs only at
  // checkpoint (not on every commit), avoiding ~4x write overhead vs FULL. Durability:
  // a power/OS crash can lose the last transaction(s) since the prior checkpoint, but
  // NOT corrupt the DB and NOT lose committed data on a mere app crash — acceptable for
  // this content DB. Benchmarked ~4x faster writes on this pool. Override w/ SQLITE_SYNCHRONOUS.
  db.pragma(`synchronous = ${process.env.SQLITE_SYNCHRONOUS || 'NORMAL'}`);
  // Bump page cache. Default 2MB is far too small for the content table indexes.
  // SQLITE_CACHE_MB overrides the default — set to a lower value (e.g. 64) for
  // memory-constrained processes like library-watcher (512MB cache + 1GB mmap
  // caused RSS to reach 3G in <5 minutes, triggering OOM restart loops).
  const cacheMb = parseInt(process.env.SQLITE_CACHE_MB || '512', 10);
  db.pragma(`cache_size = ${-cacheMb * 1024}`);  // negative = KiB
  const mmapMb = parseInt(process.env.SQLITE_MMAP_MB || '1024', 10);
  db.pragma(`mmap_size = ${mmapMb * 1024 * 1024}`);
  logger.info({ path }, 'Content DB connected (local)');
  return instrumentDb(db, 'content');
}

function createUserConnection() {
  const url = process.env.USER_DATABASE_URL;
  if (!url) {
    logger.info('User DB: No USER_DATABASE_URL configured, using content DB');
    return null;
  }
  const path = stripFilePrefix(url);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  logger.info({ path }, 'User DB connected');
  return instrumentDb(db, 'user');
}

function createGraphConnection() {
  const dbPath = './data/graph.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  db.pragma('cache_size = -131072');  // 128MB in KiB
  db.pragma('mmap_size = 268435456'); // 256MB
  logger.info({ path: dbPath }, 'Graph DB connected');
  return instrumentDb(db, 'graph');
}

export async function getDb() {
  if (!contentDb) contentDb = createContentConnection();
  return contentDb;
}

export async function getUserDb() {
  if (userDb === null) userDb = createUserConnection();
  return userDb || await getDb();
}

export async function getGraphDb() {
  if (!graphDb) graphDb = createGraphConnection();
  return graphDb;
}

// Site-only DBs: one SQLite file per site at data/sites/<safe-id>.db.
// Walled off from primary — default Jafar never opens these connections, so
// site-only content cannot leak into RAG. Connections are lazy and cached;
// migrations run once on first connect.
//
// `siteId` is the sites.yaml key (e.g., 'bahaiteachings.org'). The filename
// uses `meili_index_prefix` from the site config (e.g., 'bt') if available,
// otherwise the sanitized siteId.
export async function getSiteDb(siteId, indexPrefix) {
  if (!siteId) throw new Error('getSiteDb requires siteId');
  const key = indexPrefix || siteId;
  let db = siteDbCache.get(key);
  if (db) return db;

  const safe = (indexPrefix || siteId).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  const dir = path.resolve('./data/sites');
  mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, `${safe}.db`);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  // Smaller cache than primary — site-only DBs are <500MB each; 64MB cache
  // leaves room for many concurrent sites without consuming primary's headroom.
  db.pragma('cache_size = -65536');
  db.pragma('mmap_size = 268435456');

  instrumentDb(db, `site-${safe}`);
  runSiteMigrations(db, siteId);

  siteDbCache.set(key, db);
  logger.info({ siteId, path: dbPath }, 'Site DB connected');
  return db;
}

// Telemetry DB: separate connection with a 50ms busy timeout.
// Used exclusively for fire-and-forget writes (ai_usage, search_log) that must
// never block the event loop. If contended (e.g., sync worker holding WAL lock),
// the write fails quickly and is silently dropped — telemetry is best-effort.
function getTelemetryDb() {
  if (!telemetryDb) {
    const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
    const dbPath = stripFilePrefix(url) || './data/sifter.db';
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 50');  // 50ms: fail fast if contended — never stall event loop, but tolerate brief WAL lock windows
    db.pragma('cache_size = -4096'); // 4MB — minimal cache, telemetry is write-only
    telemetryDb = db;  // not instrumented — avoids recursive slow-write logging
  }
  return telemetryDb;
}

export const getBatchDb = getDb;

// 150ms threshold surfaces actually-slow queries. Set SLOW_QUERY_THRESHOLD_MS
// to tune. All SELECT reads are also logged at debug level so LOG_LEVEL=debug
// exposes every read with its duration for index analysis.
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '150', 10);
const IS_SELECT = /^\s*SELECT\b/i;
const IS_WRITE = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH)\b/i;

// origPrepare is the unwrapped db.prepare — used for EXPLAIN so we don't recurse.
function logQueryTiming(sql, params, startTime, dbName, name = '', origPrepare = null) {
  const duration = Date.now() - startTime;
  const isSelect = IS_SELECT.test(sql);
  const shortSql = (sql || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const logParams = params?.length > 5 ? `[${params.length} params]` : params;

  // All reads visible at debug level — filter with LOG_LEVEL=debug to see index usage
  if (isSelect) {
    logger.debug({ name, duration, sql: shortSql, db: dbName }, `read ${duration}ms`);
  }

  if (duration >= SLOW_QUERY_THRESHOLD_MS) {
    let queryPlan = null;
    if (isSelect && origPrepare) {
      try {
        const plan = origPrepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(params || []));
        queryPlan = plan.map(r => r.detail).join(' | ');
      } catch { /* non-fatal — EXPLAIN may fail on complex CTEs */ }
    }
    const kind = isSelect ? 'read' : 'write';
    logger.warn({ name, duration, sql: shortSql, params: logParams, db: dbName, queryPlan },
      `Slow ${kind} (${duration}ms)${name ? ` [${name}]` : ''}`);
  }
}

// Instrument a better-sqlite3 Database instance so every prepare/transaction/exec
// is timed against SLOW_QUERY_THRESHOLD_MS. This is the single source of truth
// for slow-query visibility across the codebase: any module that calls getDb()
// (or wraps a sidecar connection via instrumentDb) gets free coverage.
//
// Statements are mutated in place — pluck()/raw()/expand() return `this`, so
// chained calls keep the instrumented methods. Transactions are timed at the
// batch level (individual statements inside a txn are also timed via prepare).
export function instrumentDb(db, dbName) {
  if (db.__instrumented) return db;

  const origPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = origPrepare(sql);
    for (const method of ['get', 'all', 'run']) {
      const orig = stmt[method].bind(stmt);
      stmt[method] = (...args) => {
        const start = Date.now();
        const result = orig(...args);
        logQueryTiming(sql, args, start, dbName, '', origPrepare);
        return result;
      };
    }
    return stmt;
  };

  const origTransaction = db.transaction.bind(db);
  db.transaction = (fn) => {
    const txn = origTransaction(fn);
    const wrap = (mode) => (...args) => {
      const start = Date.now();
      const result = (mode ? txn[mode] : txn)(...args);
      logQueryTiming(`TRANSACTION${mode ? ` (${mode})` : ''}`, null, start, dbName);
      return result;
    };
    const wrapped = wrap();
    wrapped.deferred = wrap('deferred');
    wrapped.immediate = wrap('immediate');
    wrapped.exclusive = wrap('exclusive');
    return wrapped;
  };

  const origExec = db.exec.bind(db);
  db.exec = (sql) => {
    const start = Date.now();
    const result = origExec(sql);
    logQueryTiming(sql, null, start, dbName);
    return result;
  };

  Object.defineProperty(db, '__instrumented', { value: true, enumerable: false });
  Object.defineProperty(db, '__origPrepare', { value: origPrepare, enumerable: false });
  return db;
}

function runQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ANALYZE|VACUUM|REINDEX|ATTACH|DETACH)\b/i.test(sql);
  if (isWrite) {
    const info = stmt.run(...params);
    return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }], lastInsertRowid: info.lastInsertRowid };
  }
  return { rows: stmt.all(...params) };
}

export async function query(sql, params = [], name = '') {
  // Route content writes through the single writer when configured.
  if (ROUTE_WRITES && isWriteSql(sql)) {
    const [r] = await postWriteBatch([{ sql, args: params }], name);
    return { rows: [{ lastInsertRowid: r.lastInsertRowid, changes: r.changes }], lastInsertRowid: r.lastInsertRowid };
  }
  const db = await getDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'content', name, db.__origPrepare);
  return result;
}

export async function queryOne(sql, params = [], name = '') {
  const result = await query(sql, params, name);
  return result.rows[0] || null;
}

export async function queryAll(sql, params = [], name = '') {
  const result = await query(sql, params, name);
  return result.rows;
}

export async function transaction(statements, name = '') {
  // Route the whole batch through the single writer when configured — it
  // applies them as one atomic transaction on the sole write connection.
  if (ROUTE_WRITES) return postWriteBatch(statements, name);
  const db = await getDb();
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'content', name);
  return result;
}

export async function userQuery(sql, params = [], name = '') {
  const db = await getUserDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'user', name, db.__origPrepare);
  return result;
}

export async function userQueryOne(sql, params = [], name = '') {
  const result = await userQuery(sql, params, name);
  return result.rows[0] || null;
}

export async function userQueryAll(sql, params = [], name = '') {
  const result = await userQuery(sql, params, name);
  return result.rows;
}

export async function userTransaction(statements, name = '') {
  const db = await getUserDb();
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'user', name);
  return result;
}

export async function graphQuery(sql, params = [], name = '') {
  const db = await getGraphDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'graph', name, db.__origPrepare);
  return result;
}

export async function graphQueryOne(sql, params = [], name = '') {
  const result = await graphQuery(sql, params, name);
  return result.rows[0] || null;
}

export async function graphQueryAll(sql, params = [], name = '') {
  const result = await graphQuery(sql, params, name);
  return result.rows;
}

export async function graphTransaction(statements, name = '') {
  const db = await getGraphDb();
  const start = Date.now();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  const result = txn(statements);
  logQueryTiming('TRANSACTION', null, start, 'graph', name);
  return result;
}

export const batchQuery = query;
export const batchTransaction = transaction;
export const batchQueryOne = queryOne;
export const batchQueryAll = queryAll;

// Fire-and-forget write for telemetry (ai_usage, search_log).
// Uses a dedicated connection with 200ms busy_timeout — if the WAL is contended
// (sync worker holding write lock), the write fails quickly rather than freezing
// the Node.js event loop for up to SQLITE_BUSY_TIMEOUT_MS (up to 120s).
export function telemetryQuery(sql, params = []) {
  const db = getTelemetryDb();
  db.prepare(sql).run(...params);
}

export default {
  getDb, getUserDb, getBatchDb, getGraphDb,
  query, queryOne, queryAll,
  batchQuery, batchQueryOne, batchQueryAll,
  transaction, batchTransaction,
  userQuery, userQueryOne, userQueryAll, userTransaction,
  graphQuery, graphQueryOne, graphQueryAll, graphTransaction,
  telemetryQuery
};
