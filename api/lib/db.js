// better-sqlite3 Database Client
// Three separate databases: content (sifter.db), user, graph (graph.db).
// Exported function signatures are async for backward compatibility.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { runSiteMigrations } from './migrations/site.js';

let contentDb = null;
let userDb = null;
let graphDb = null;
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
  // API default: 5s — long enough for brief contention, short enough not to stall requests.
  // Worker processes set SQLITE_BUSY_TIMEOUT_MS=30000 to survive write contention from
  // concurrent graph pipeline workers without crashing.
  const busyTimeout = parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || '5000', 10);
  db.pragma(`busy_timeout = ${busyTimeout}`);
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

export const getBatchDb = getDb;

// 150ms threshold filters out routine INSERT/UPDATE chatter (ai_usage logging,
// small bulk inserts) and surfaces actually-slow queries — the ones that
// matter for tuning. Bumped from 15ms after observing the log was 99% noise.
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '150', 10);

function logQueryTiming(sql, params, startTime, dbName, name = '') {
  const duration = Date.now() - startTime;
  if (duration >= SLOW_QUERY_THRESHOLD_MS) {
    const shortSql = (sql || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    logger.warn({ name, duration, sql: shortSql, params: params?.length > 5 ? `[${params.length} params]` : params, db: dbName }, `Slow query (${duration}ms)${name ? ` [${name}]` : ''}`);
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
        logQueryTiming(sql, args, start, dbName);
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
  const db = await getDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'content', name);
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
  logQueryTiming(sql, params, start, 'user', name);
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
  logQueryTiming(sql, params, start, 'graph', name);
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

export default {
  getDb, getUserDb, getBatchDb, getGraphDb,
  query, queryOne, queryAll,
  batchQuery, batchQueryOne, batchQueryAll,
  transaction, batchTransaction,
  userQuery, userQueryOne, userQueryAll, userTransaction,
  graphQuery, graphQueryOne, graphQueryAll, graphTransaction
};
