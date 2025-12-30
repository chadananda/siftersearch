/**
 * Turso/libsql Database Client
 *
 * Uses separate connections for:
 * - Primary: Auth, users, sessions (must be fast, never blocked)
 * - Batch: Content migrations, bulk operations (can be slow)
 */

import { createClient } from '@libsql/client';
import { logger } from './logger.js';

let primaryDb = null;
let batchDb = null;

function createConnection(name) {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is required');
  }

  const client = createClient({
    url,
    ...(authToken && { authToken })
  });

  logger.info({ url: url.replace(/\/\/.*@/, '//***@'), connection: name }, 'Database connected');
  return client;
}

// Primary connection - for auth, users, sessions (never blocked by batch ops)
export function getDb() {
  if (!primaryDb) {
    primaryDb = createConnection('primary');
  }
  return primaryDb;
}

// Batch connection - for migrations, bulk content operations
export function getBatchDb() {
  if (!batchDb) {
    batchDb = createConnection('batch');
  }
  return batchDb;
}

// Execute a query with parameters (uses primary connection)
export async function query(sql, params = []) {
  const client = getDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Execute a batch query (uses separate batch connection to avoid blocking primary)
export async function batchQuery(sql, params = []) {
  const client = getBatchDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Execute multiple statements in a transaction
export async function transaction(statements) {
  const client = getDb();
  const results = await client.batch(statements, 'write');
  return results;
}

// Batch transaction (for migrations - won't block auth)
export async function batchTransaction(statements) {
  const client = getBatchDb();
  const results = await client.batch(statements, 'write');
  return results;
}

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

// Batch versions for content operations
export async function batchQueryOne(sql, params = []) {
  const result = await batchQuery(sql, params);
  return result.rows[0] || null;
}

export async function batchQueryAll(sql, params = []) {
  const result = await batchQuery(sql, params);
  return result.rows;
}

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
