/**
 * Database Schema Migrations
 *
 * Version-based migrations that run on API startup.
 * Each version number corresponds to schema changes.
 */

import { query, queryOne } from './db.js';
import { logger } from './logger.js';

// Current schema version - increment when adding migrations
const CURRENT_VERSION = 2;

/**
 * Get current database schema version
 */
async function getSchemaVersion() {
  try {
    // Check if version table exists
    const table = await queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='_schema_version'
    `);

    if (!table) {
      return 0;
    }

    const row = await queryOne('SELECT version FROM _schema_version LIMIT 1');
    return row?.version || 0;
  } catch {
    return 0;
  }
}

/**
 * Set schema version
 */
async function setSchemaVersion(version) {
  await query(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY
    )
  `);
  await query('DELETE FROM _schema_version');
  await query('INSERT INTO _schema_version (version) VALUES (?)', [version]);
}

/**
 * Migration definitions - each version adds new changes
 */
const migrations = {
  // Version 1: Add missing columns to users table
  1: async () => {
    const columns = [
      { name: 'name', sql: 'ALTER TABLE users ADD COLUMN name TEXT' },
      { name: 'email_verified', sql: 'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0' },
      { name: 'preferred_language', sql: 'ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT "en"' },
      { name: 'metadata', sql: 'ALTER TABLE users ADD COLUMN metadata TEXT' },
      { name: 'approved_at', sql: 'ALTER TABLE users ADD COLUMN approved_at TEXT' },
      { name: 'referred_by', sql: 'ALTER TABLE users ADD COLUMN referred_by INTEGER' },
      { name: 'search_count', sql: 'ALTER TABLE users ADD COLUMN search_count INTEGER DEFAULT 0' },
      { name: 'auth_provider', sql: 'ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "email"' },
    ];

    for (const col of columns) {
      try {
        await query(col.sql);
        logger.info({ column: col.name }, 'Added column to users table');
      } catch (err) {
        if (!err.message?.includes('duplicate column')) {
          throw err;
        }
      }
    }
  },

  // Version 2: Add verification_codes table
  2: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'email_verification',
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index if not exists
    try {
      await query('CREATE INDEX idx_verification_email ON verification_codes(email)');
    } catch {
      // Index may already exist
    }
  },
};

/**
 * Run all pending migrations
 * @returns {Promise<{from: number, to: number, applied: number}>}
 */
export async function runMigrations() {
  const fromVersion = await getSchemaVersion();

  if (fromVersion >= CURRENT_VERSION) {
    logger.debug({ version: fromVersion }, 'Schema up to date');
    return { from: fromVersion, to: fromVersion, applied: 0 };
  }

  logger.info({ from: fromVersion, to: CURRENT_VERSION }, 'Running schema migrations');

  let applied = 0;
  for (let v = fromVersion + 1; v <= CURRENT_VERSION; v++) {
    if (migrations[v]) {
      logger.info({ version: v }, 'Applying migration');
      await migrations[v]();
      applied++;
    }
  }

  await setSchemaVersion(CURRENT_VERSION);

  logger.info({ from: fromVersion, to: CURRENT_VERSION, applied }, 'Migrations complete');
  return { from: fromVersion, to: CURRENT_VERSION, applied };
}
