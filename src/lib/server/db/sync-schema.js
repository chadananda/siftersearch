/**
 * Database Schema Synchronization Script
 * 
 * This script synchronizes the database schema with the Drizzle ORM definitions.
 * It ensures that all tables and columns exist with the correct types.
 */

import { getDrizzleWriteClient } from './drizzle-client.js';
import * as schema from '../../../../config/drizzle.js';
import { sql } from 'drizzle-orm';

/**
 * Synchronize the database schema
 * @returns {Promise<void>}
 */
export async function syncSchema() {
  try {
    console.log('Starting database schema synchronization...');
    const db = getDrizzleWriteClient();
    
    // Ensure users table has the updated schema
    await db.run(sql`
      PRAGMA foreign_keys = OFF;
      
      -- Create a temporary backup of the users table
      CREATE TABLE IF NOT EXISTS _users_backup (
        id TEXT PRIMARY KEY,
        clerk_id TEXT,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'visitor',
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      
      -- Copy data from users to backup if users table exists
      INSERT OR IGNORE INTO _users_backup 
      SELECT id, clerk_id, email, name, role, active, created_at, updated_at 
      FROM users WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='users');
      
      -- Drop the original users table if it exists
      DROP TABLE IF EXISTS users;
      
      -- Create the users table with the updated schema
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        clerk_id TEXT,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'visitor',
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      
      -- Copy data back from backup
      INSERT INTO users SELECT * FROM _users_backup;
      
      -- Drop the backup table
      DROP TABLE _users_backup;
      
      PRAGMA foreign_keys = ON;
    `);
    
    console.log('Database schema synchronized successfully');
    return true;
  } catch (error) {
    console.error('Error synchronizing database schema:', error);
    throw error;
  }
}

export default {
  syncSchema
};
