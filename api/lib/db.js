/**
 * better-sqlite3 Database Client
 *
 * Two separate databases:
 * 1. Content DB (local SQLite) - docs, content, library_nodes, jobs, processed_cache
 * 2. User DB (local SQLite) - users, sessions, auth, forum, donations, conversations
 *
 * All operations are synchronous (better-sqlite3 C++ bindings).
 * Exported function signatures are async for backward compatibility.
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';

let contentDb = null;
let userDb = null;

function stripFilePrefix(url) {
  if (!url) return null;
  return url.startsWith('file:') ? url.slice(5) : url;
}

function createContentConnection() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url) || './data/sifter.db';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  logger.info({ path }, 'Content DB connected (local)');
  return db;
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
  db.pragma('busy_timeout = 30000');
  logger.info({ path }, 'User DB connected');
  return db;
}

export async function getDb() {
  if (!contentDb) contentDb = createContentConnection();
  return contentDb;
}

export async function getUserDb() {
  if (userDb === null) userDb = createUserConnection();
  return userDb || await getDb();
}

export const getBatchDb = getDb;

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '15', 10);

function logQueryTiming(sql, params, startTime, dbName) {
  const duration = Date.now() - startTime;
  if (duration >= SLOW_QUERY_THRESHOLD_MS) {
    const shortSql = sql.replace(/\s+/g, ' ').trim().slice(0, 200);
    logger.warn({ duration, sql: shortSql, params: params?.length > 5 ? `[${params.length} params]` : params, db: dbName }, `Slow query (${duration}ms)`);
  }
}

function runQuery(db, sql, params) {
  const stmt = db.prepare(sql);
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
  if (isWrite) {
    const info = stmt.run(...params);
    return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }], lastInsertRowid: info.lastInsertRowid };
  }
  return { rows: stmt.all(...params) };
}

export async function query(sql, params = []) {
  const db = await getDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'content');
  return result;
}

export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

export async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

export async function transaction(statements) {
  const db = await getDb();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  return txn(statements);
}

export async function userQuery(sql, params = []) {
  const db = await getUserDb();
  const start = Date.now();
  const result = runQuery(db, sql, params);
  logQueryTiming(sql, params, start, 'user');
  return result;
}

export async function userQueryOne(sql, params = []) {
  const result = await userQuery(sql, params);
  return result.rows[0] || null;
}

export async function userQueryAll(sql, params = []) {
  const result = await userQuery(sql, params);
  return result.rows;
}

export async function userTransaction(statements) {
  const db = await getUserDb();
  const txn = db.transaction((stmts) => stmts.map(({ sql, args = [] }) => db.prepare(sql).run(...args)));
  return txn(statements);
}

export const batchQuery = query;
export const batchTransaction = transaction;
export const batchQueryOne = queryOne;
export const batchQueryAll = queryAll;

export default {
  getDb, getUserDb, getBatchDb,
  query, queryOne, queryAll,
  batchQuery, batchQueryOne, batchQueryAll,
  transaction, batchTransaction,
  userQuery, userQueryOne, userQueryAll, userTransaction
};
