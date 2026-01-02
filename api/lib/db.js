/**
 * libsql Database Client
 *
 * Two separate databases:
 * 1. Content DB (local SQLite) - docs, content, library_nodes, jobs, processed_cache
 * 2. User DB (Turso cloud) - users, sessions, auth, forum, donations, conversations
 *
 * This separation ensures content stays local (fast, no sync overhead)
 * while user data syncs to Turso cloud for cross-device access.
 */

import { createClient } from '@libsql/client';
import { logger } from './logger.js';

let contentDb = null;
let userDb = null;
let contentWalEnabled = false;
let userWalEnabled = false;

/**
 * Create content database connection (local SQLite)
 * Uses TURSO_DATABASE_URL which should be a local file path
 */
async function createContentConnection() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';

  const client = createClient({ url });

  // Enable WAL mode for local SQLite files
  if (!contentWalEnabled && url.startsWith('file:')) {
    try {
      await client.execute('PRAGMA journal_mode=WAL');
      await client.execute('PRAGMA busy_timeout=30000');
      contentWalEnabled = true;
      logger.info('Content DB: WAL mode enabled');
    } catch (err) {
      logger.warn({ err: err.message }, 'Content DB: Could not enable WAL mode');
    }
  }

  logger.info({ url }, 'Content DB connected (local)');
  return client;
}

/**
 * Create user database connection (Turso cloud or local fallback)
 * Uses USER_DATABASE_URL + TURSO_AUTH_TOKEN for cloud sync
 * Falls back to content DB if not configured
 */
async function createUserConnection() {
  const url = process.env.USER_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // If no separate user DB configured, fall back to content DB
  if (!url) {
    logger.info('User DB: No USER_DATABASE_URL configured, using content DB');
    return null; // Will use content DB as fallback
  }

  const client = createClient({
    url,
    ...(authToken && { authToken })
  });

  // Enable WAL mode for local files (Turso cloud doesn't need this)
  if (!userWalEnabled && url.startsWith('file:')) {
    try {
      await client.execute('PRAGMA journal_mode=WAL');
      await client.execute('PRAGMA busy_timeout=30000');
      userWalEnabled = true;
      logger.info('User DB: WAL mode enabled');
    } catch (err) {
      logger.warn({ err: err.message }, 'User DB: Could not enable WAL mode');
    }
  }

  const isCloud = url.includes('turso.io') || url.includes('libsql://');
  logger.info({ url: url.replace(/\/\/.*@/, '//***@'), isCloud }, 'User DB connected');
  return client;
}

// Get content database connection
export async function getDb() {
  if (!contentDb) {
    contentDb = await createContentConnection();
  }
  return contentDb;
}

// Get user database connection (falls back to content DB if not configured)
export async function getUserDb() {
  if (userDb === null) {
    userDb = await createUserConnection();
  }
  // Fall back to content DB if no user DB configured
  return userDb || await getDb();
}

// Alias for backward compatibility
export const getBatchDb = getDb;

// ============================================
// Content Database Operations (local)
// ============================================

// Execute a query on content DB
export async function query(sql, params = []) {
  const client = await getDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Get a single row from content DB
export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

// Get all rows from content DB
export async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

// Execute transaction on content DB
export async function transaction(statements) {
  const client = await getDb();
  const results = await client.batch(statements, 'write');
  return results;
}

// ============================================
// User Database Operations (Turso cloud)
// ============================================

// Execute a query on user DB
export async function userQuery(sql, params = []) {
  const client = await getUserDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Get a single row from user DB
export async function userQueryOne(sql, params = []) {
  const result = await userQuery(sql, params);
  return result.rows[0] || null;
}

// Get all rows from user DB
export async function userQueryAll(sql, params = []) {
  const result = await userQuery(sql, params);
  return result.rows;
}

// Execute transaction on user DB
export async function userTransaction(statements) {
  const client = await getUserDb();
  const results = await client.batch(statements, 'write');
  return results;
}

// ============================================
// Aliases for backward compatibility
// ============================================

export const batchQuery = query;
export const batchTransaction = transaction;
export const batchQueryOne = queryOne;
export const batchQueryAll = queryAll;

export default {
  getDb,
  getUserDb,
  getBatchDb,
  query,
  queryOne,
  queryAll,
  batchQuery,
  batchQueryOne,
  batchQueryAll,
  transaction,
  batchTransaction,
  userQuery,
  userQueryOne,
  userQueryAll,
  userTransaction
};
