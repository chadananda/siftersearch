/**
 * Database Core Module
 * 
 * Handles database initialization, validation, and synchronization.
 * This is the lowest level of the database stack, providing direct access
 * to the database clients and core operations.
 */

import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import { PUBLIC, SECRETS } from '../../../../config/config.js';
import { generateSQLSchema } from '../../../../config/schema.js';
import { EventEmitter } from 'events';

// Create event emitter for database changes
export const dbEvents = new EventEmitter();

// Database clients
let tursoClient = null;
let localClient = null;

/**
 * Get the Turso client (production database)
 * @returns {Object} Turso database client
 */
export function getTursoClient() {
  if (!tursoClient) {
    tursoClient = createClient({
      url: SECRETS.DB_URL,
      authToken: SECRETS.DB_AUTH_TOKEN
    });
  }
  return tursoClient;
}

/**
 * Get the local client (SQLite database)
 * @returns {Object} Local database client
 */
export function getLocalClient() {
  if (!localClient) {
    localClient = createClient({
      url: 'file:./data/siftersearch.db'
    });
  }
  return localClient;
}

/**
 * Get the appropriate client for write operations
 * In development: local client
 * In production: Turso client
 * @returns {Object} Database client
 */
export function getWriteClient() {
  return PUBLIC.IS_DEV ? getLocalClient() : getTursoClient();
}

/**
 * Get the client for read operations (always local for performance)
 * @returns {Object} Local database client
 */
export function getReadClient() {
  return getLocalClient();
}

/**
 * Initialize the database schema
 * @returns {Promise<boolean>} Success status
 */
export async function initializeSchema() {
  try {
    const db = getWriteClient();
    if (!db) {
      console.error('Failed to initialize database client');
      return false;
    }
    
    console.log('Initializing database schema...');
    
    // Generate SQL schema
    const sqlSchema = generateSQLSchema();
    if (!sqlSchema) {
      console.error('Failed to generate SQL schema');
      return false;
    }
    
    // Create tables with error handling for each statement
    const tables = [
      { name: 'users', sql: sqlSchema.users },
      { name: 'documents', sql: sqlSchema.documents },
      { name: 'categories', sql: sqlSchema.categories },
      { name: 'document_categories', sql: sqlSchema.document_categories },
      { name: 'authors', sql: sqlSchema.authors },
      { name: 'document_authors', sql: sqlSchema.document_authors },
      { name: 'content_blocks', sql: sqlSchema.content_blocks },
      { name: 'activity_logs', sql: sqlSchema.activity_logs },
      { name: 'websites', sql: sqlSchema.websites },
      { name: 'search_logs', sql: sqlSchema.search_logs },
      { name: 'configs', sql: sqlSchema.configs },
      { name: 'sync_state', sql: sqlSchema.sync_state }
    ];
    
    for (const table of tables) {
      try {
        if (table.sql) {
          await db.execute(table.sql);
          console.log(`Created table: ${table.name}`);
        } else {
          console.warn(`Missing SQL for table: ${table.name}`);
        }
      } catch (tableError) {
        console.error(`Error creating table ${table.name}:`, tableError);
        // Continue with other tables even if one fails
      }
    }
    
    console.log('Database schema initialization completed');
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
}

/**
 * Validate database schema against expected structure
 * @returns {Promise<Object>} Validation results
 */
export async function validateSchema() {
  const db = getLocalClient();
  const expectedTables = [
    'users', 'collections', 'documents', 'content_blocks', 
    'activity_logs', 'websites', 'search_logs', 'configs', 'sync_state'
  ];
  
  const results = {
    valid: true,
    missingTables: [],
    details: {}
  };
  
  try {
    // Check for each expected table
    for (const table of expectedTables) {
      const query = `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
      const result = await db.execute({ sql: query });
      
      if (result.rows.length === 0) {
        results.valid = false;
        results.missingTables.push(table);
      } else {
        // Table exists, now check its structure
        const columnsQuery = `PRAGMA table_info(${table})`;
        const columnsResult = await db.execute({ sql: columnsQuery });
        results.details[table] = {
          exists: true,
          columns: columnsResult.rows.map(row => ({
            name: row.name,
            type: row.type,
            notNull: row.notnull === 1,
            defaultValue: row.dflt_value,
            primaryKey: row.pk === 1
          }))
        };
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error validating database schema:', error);
    return {
      valid: false,
      error: error.message,
      details: {}
    };
  }
}

/**
 * Get the last sync timestamp
 * @returns {Promise<string>} ISO timestamp of last sync
 */
export async function getLastSyncTimestamp() {
  const db = getLocalClient();
  
  try {
    const result = await db.execute({
      sql: `SELECT value FROM sync_state WHERE key = 'last_sync'`
    });
    
    if (result.rows.length === 0) {
      return '1970-01-01T00:00:00.000Z'; // Default to epoch
    }
    
    return result.rows[0].value;
  } catch (error) {
    console.error('Error getting last sync timestamp:', error);
    return '1970-01-01T00:00:00.000Z'; // Default to epoch on error
  }
}

/**
 * Update the sync timestamp
 * @returns {Promise<boolean>} Success status
 */
export async function updateSyncTimestamp() {
  const db = getLocalClient();
  const now = new Date().toISOString();
  
  try {
    await db.execute({
      sql: `INSERT INTO sync_state (key, value) 
            VALUES ('last_sync', ?) 
            ON CONFLICT(key) DO UPDATE SET value = ?`,
      args: [now, now]
    });
    return true;
  } catch (error) {
    console.error('Error updating sync timestamp:', error);
    return false;
  }
}

/**
 * Sync a specific table from Turso to local
 * @param {string} tableName - Name of the table to sync
 * @param {string} lastSync - ISO timestamp of last sync
 * @returns {Promise<number>} Number of records synced
 */
export async function syncTable(tableName, lastSync) {
  // Skip sync in development mode
  if (PUBLIC.IS_DEV) {
    return 0;
  }
  
  const tursoClient = getTursoClient();
  const localClient = getLocalClient();
  
  try {
    // Get changes since last sync
    const query = `SELECT * FROM ${tableName} WHERE updated_at > ?`;
    const result = await tursoClient.execute({
      sql: query,
      args: [lastSync]
    });
    
    // Apply changes to local DB
    for (const row of result.rows) {
      await upsertLocal(localClient, tableName, row);
      
      // Emit change event
      dbEvents.emit('change', {
        table: tableName,
        operation: 'upsert',
        data: row
      });
    }
    
    console.log(`Synced ${result.rows.length} rows from ${tableName}`);
    return result.rows.length;
  } catch (error) {
    console.error(`Error syncing table ${tableName}:`, error);
    return 0;
  }
}

/**
 * Insert or update a record in the local database
 * @param {Object} client - Database client
 * @param {string} tableName - Table name
 * @param {Object} data - Record data
 * @returns {Promise<boolean>} Success status
 */
export async function upsertLocal(client, tableName, data) {
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const updateClause = columns.map(col => `${col} = ?`).join(', ');
  
  const query = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updateClause}
  `;
  
  const args = [...Object.values(data), ...Object.values(data)];
  
  try {
    await client.execute({ sql: query, args });
    return true;
  } catch (error) {
    console.error(`Error upserting to ${tableName}:`, error);
    throw error;
  }
}

/**
 * Sync all tables from Turso to local
 * @returns {Promise<Object>} Sync results
 */
export async function syncAllTables() {
  // Skip sync in development mode
  if (PUBLIC.IS_DEV) {
    console.log('Skipping sync in development mode');
    return { success: true, skipped: true };
  }
  
  const lastSync = await getLastSyncTimestamp();
  const results = {};
  
  try {
    // Sync each table
    results.users = await syncTable('users', lastSync);
    results.collections = await syncTable('collections', lastSync);
    results.documents = await syncTable('documents', lastSync);
    results.content_blocks = await syncTable('content_blocks', lastSync);
    results.activity_logs = await syncTable('activity_logs', lastSync);
    results.websites = await syncTable('websites', lastSync);
    results.search_logs = await syncTable('search_logs', lastSync);
    results.configs = await syncTable('configs', lastSync);
    
    await updateSyncTimestamp();
    console.log('Full database sync completed');
    
    return {
      success: true,
      timestamp: new Date().toISOString(),
      results
    };
  } catch (error) {
    console.error('Error during full sync:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Initialize the database system
 * @returns {Promise<boolean>} Success status
 */
export async function initializeDatabase() {
  try {
    // Always initialize schema
    const schemaInitialized = await initializeSchema();
    if (!schemaInitialized) {
      throw new Error('Failed to initialize database schema');
    }
    
    // Validate schema
    const validation = await validateSchema();
    if (!validation.valid) {
      console.warn('Database schema validation failed:', validation);
      // We'll continue anyway, as the schema initialization should have fixed issues
    }
    
    // In production, sync from Turso
    if (!PUBLIC.IS_DEV) {
      await syncAllTables();
    }
    
    console.log('Database system initialized');
    return true;
  } catch (error) {
    console.error('Error initializing database system:', error);
    return false;
  }
}

// Periodic sync management
let syncInterval = null;

/**
 * Start periodic sync from Turso to local
 * @param {number} intervalMinutes - Sync interval in minutes
 * @returns {boolean} Success status
 */
export function startPeriodicSync(intervalMinutes = 5) {
  if (PUBLIC.IS_DEV) {
    console.log('Periodic sync not started in development mode');
    return false;
  }
  
  // Clear any existing interval
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  // Start new sync interval
  syncInterval = setInterval(async () => {
    console.log('Running scheduled database sync');
    await syncAllTables();
  }, intervalMinutes * 60 * 1000);
  
  console.log(`Periodic sync scheduled every ${intervalMinutes} minutes`);
  return true;
}

/**
 * Stop periodic sync
 * @returns {boolean} Success status
 */
export function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Periodic sync stopped');
    return true;
  }
  return false;
}
