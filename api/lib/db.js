/**
 * libsql Database Client
 *
 * Uses local SQLite file with WAL mode for concurrent access.
 * WAL (Write-Ahead Logging) allows multiple readers + one writer simultaneously.
 */

import { createClient } from '@libsql/client';
import { logger } from './logger.js';

let db = null;
let walEnabled = false;

async function createConnection() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is required');
  }

  const client = createClient({
    url,
    ...(authToken && { authToken })
  });

  // Enable WAL mode for local SQLite files (allows concurrent access)
  // Only do this once, and only for local file databases
  if (!walEnabled && url.startsWith('file:')) {
    try {
      await client.execute('PRAGMA journal_mode=WAL');
      await client.execute('PRAGMA busy_timeout=30000'); // 30 second timeout
      walEnabled = true;
      logger.info('SQLite WAL mode enabled');
    } catch (err) {
      logger.warn({ err: err.message }, 'Could not enable WAL mode');
    }
  }

  logger.info({ url: url.replace(/\/\/.*@/, '//***@') }, 'Database connected');
  return client;
}

// Get database connection (creates if needed, enables WAL mode)
export async function getDb() {
  if (!db) {
    db = await createConnection();
  }
  return db;
}

// Alias for backward compatibility
export const getBatchDb = getDb;

// Execute a query with parameters
export async function query(sql, params = []) {
  const client = await getDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Alias for backward compatibility (WAL mode handles concurrency)
export const batchQuery = query;

// Execute multiple statements in a transaction
export async function transaction(statements) {
  const client = await getDb();
  const results = await client.batch(statements, 'write');
  return results;
}

// Alias for backward compatibility
export const batchTransaction = transaction;

// Get a single row
export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

// Get all rows
export async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

// Aliases for backward compatibility
export const batchQueryOne = queryOne;
export const batchQueryAll = queryAll;

export default {
  getDb,
  getBatchDb,
  query,
  batchQuery,
  queryOne,
  queryAll,
  batchQueryOne,
  batchQueryAll,
  transaction,
  batchTransaction
};
