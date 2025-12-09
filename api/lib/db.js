/**
 * Turso/libsql Database Client
 */

import { createClient } from '@libsql/client';
import { logger } from './logger.js';

let db = null;

export function getDb() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL is required');
    }

    db = createClient({
      url,
      ...(authToken && { authToken })
    });

    logger.info({ url: url.replace(/\/\/.*@/, '//***@') }, 'Database connected');
  }
  return db;
}

// Execute a query with parameters
export async function query(sql, params = []) {
  const client = getDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Execute multiple statements in a transaction
export async function transaction(statements) {
  const client = getDb();
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

export default { getDb, query, queryOne, queryAll, transaction };
