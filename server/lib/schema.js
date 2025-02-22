/**
 * schema.js - Database Schema and Connection Management
 * 
 * This module is responsible for:
 * - Defining database schemas and validation rules
 * - Handling database creation and testing
 * - Managing database paths and connections
 * - Schema migration (future feature)
 * 
 * It provides the foundation for the database layer, ensuring data integrity
 * through schema validation and proper database initialization. Other modules
 * like db.js build upon this to provide higher-level operations.
 */

import { createClient } from '@libsql/client';
import { readFile } from 'fs/promises';
import config from './config.js';

// Schema definitions
export const appDbSchema = {
  tables: {
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    api_keys: `
      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `
  },
  validators: {
    users: (record) => {
      if (!record.email?.includes('@')) throw new Error('Invalid email format');
      if (!record.name?.trim()) throw new Error('Name is required');
      return true;
    },
    api_keys: (record) => {
      if (!record.user_id) throw new Error('user_id is required');
      if (!record.key?.length >= 32) throw new Error('API key must be at least 32 characters');
      return true;
    }
  }
};

export const libraryDbSchema = {
  tables: {
    library_info: `
      CREATE TABLE IF NOT EXISTS library_info (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    collections: `
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    searchindexes: `
      CREATE TABLE IF NOT EXISTS searchindexes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        path TEXT NOT NULL,
        type TEXT NOT NULL,  -- 'core', 'website', 'custom'
        status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'disabled', 'building'
        language TEXT DEFAULT 'en',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_indexed DATETIME,
        metadata JSON,  -- Additional index-specific metadata
        search_priority INTEGER DEFAULT 1,  -- Higher numbers searched first
        include_in_default_search BOOLEAN DEFAULT true,
        UNIQUE(name)
      )
    `
  },
  validators: {
    library_info: (record) => {
      if (!record.name?.trim()) throw new Error('Library name is required');
      return true;
    },
    collections: (record) => {
      if (!record.name?.trim()) throw new Error('Collection name is required');
      return true;
    },
    searchindexes: (record) => {
      if (!record.name?.trim()) throw new Error('Search index name is required');
      if (!record.path?.trim()) throw new Error('Search index path is required');
      if (!record.type?.trim()) throw new Error('Search index type is required');
      if (!record.status?.trim()) throw new Error('Search index status is required');
      return true;
    }
  }
};

export const contentDbSchema = {
  tables: {
    documents: `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        collection_id TEXT,
        title TEXT,
        content TEXT,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      )
    `,
    embeddings: `
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `
  },
  validators: {
    documents: (record) => {
      if (!record.collection_id) throw new Error('collection_id is required');
      if (!record.title?.trim()) throw new Error('Document title is required');
      if (!record.content?.trim()) throw new Error('Document content is required');
      return true;
    },
    embeddings: (record) => {
      if (!record.document_id) throw new Error('document_id is required');
      if (!record.embedding) throw new Error('embedding is required');
      return true;
    }
  }
};

export const indexDbSchema = {
  tables: {
    chunks: `
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT,
        content TEXT,
        embedding BLOB,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `,
    index: `
      CREATE TABLE IF NOT EXISTS index (
        chunk_id TEXT,
        neighbor_id TEXT,
        distance REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chunk_id, neighbor_id),
        FOREIGN KEY (chunk_id) REFERENCES chunks(id),
        FOREIGN KEY (neighbor_id) REFERENCES chunks(id)
      )
    `
  },
  validators: {
    chunks: (record) => {
      if (!record.document_id) throw new Error('document_id is required');
      if (!record.content?.trim()) throw new Error('Chunk content is required');
      if (!record.embedding) throw new Error('embedding is required');
      return true;
    },
    index: (record) => {
      if (!record.chunk_id) throw new Error('chunk_id is required');
      if (!record.neighbor_id) throw new Error('neighbor_id is required');
      if (typeof record.distance !== 'number') throw new Error('distance must be a number');
      return true;
    }
  }
};

// Low-level schema operations
export const validateRecord = (schema, table, record) => {
  const validator = schema.validators[table];
  if (!validator) throw new Error(`No validator found for table: ${table}`);
  return validator(record);
};

export const testDatabase = async (db, schema) => {
  try {
    // Test basic connectivity
    await db.execute('SELECT 1');
    
    // Test schema validity
    for (const [table, sql] of Object.entries(schema.tables)) {
      await db.execute(sql);
      // Test if we can query the table
      await db.execute(`SELECT * FROM ${table} LIMIT 1`);
    }
    return true;
  } catch (error) {
    console.error('Database validation failed:', error);
    return false;
  }
};

export const createDatabase = async (dbPath, schema) => {
  const db = createClient({ url: dbPath });
  for (const sql of Object.values(schema.tables)) {
    await db.execute(sql);
  }
  return db;
};

// Database path utilities
export const getDbPath = (type, collection = null, libraryId = null) => {
  libraryId = libraryId || config.getLibraryId();
  
  switch (type) {
    case 'app':
      return process.env.APP_DB_URL || 'file:app.db';
    case 'library':
      if (!libraryId) throw new Error('libraryId required for library database');
      return process.env.LIBRARY_DB_URL || `file:libraries/${libraryId}/library.db`;
    case 'content':
      if (!libraryId) throw new Error('libraryId required for content database');
      return process.env.CONTENT_DB_URL || `file:libraries/${libraryId}/content.db`;
    case 'index':
      if (!libraryId) throw new Error('libraryId required for index database');
      if (!collection) throw new Error('collection required for index database');
      return process.env.INDEX_DB_URL || `file:libraries/${libraryId}/index_${collection}.db`;
    default:
      throw new Error(`Unknown database type: ${type}`);
  }
};

// High-level database initialization
export class SchemaManager {
  constructor() {
    this.schemas = {
      app: appDbSchema,
      library: libraryDbSchema,
      content: contentDbSchema,
      index: indexDbSchema
    };
  }

  async openDatabase(type, collection = null, libraryId = null) {
    const schema = this.schemas[type];
    if (!schema) throw new Error(`Unknown database type: ${type}`);

    const dbPath = getDbPath(type, collection, libraryId);
    let db;

    try {
      // 1. Try to open and test existing database
      db = createClient({ url: dbPath });
      if (await testDatabase(db, schema)) {
        console.log(`Existing ${type} database is valid`);
        return db;
      }
      
      // 2. Database is broken or missing, try to restore
      console.log(`${type} database is invalid or missing, attempting restore...`);
      const restoredDb = await this.tryRestore(type, collection, libraryId);
      if (restoredDb) return restoredDb;

      // 3. No valid backup, create new database
      console.log(`Creating new ${type} database...`);
      return await createDatabase(dbPath, schema);
    } catch (error) {
      console.error(`Failed to initialize ${type} database:`, error);
      throw error;
    }
  }

  async tryRestore(type, collection = null, libraryId = null) {
    try {
      // Get libraryId from config if not provided
      libraryId = libraryId || config.getLibraryId();

      // Get database path
      const dbPath = getDbPath(type, collection, libraryId);
      
      // Try to restore from backup system
      const backupManager = (await import('./backup.js')).default;
      const restoredPath = await backupManager.restoreDatabase(type, collection, libraryId);
      
      if (restoredPath) {
        // Test the restored database
        const db = createClient({ url: restoredPath });
        const schema = this.schemas[type];
        
        if (await testDatabase(db, schema)) {
          console.log(`Successfully restored ${type} database from backup`);
          return db;
        } else {
          console.error(`Restored ${type} database failed validation`);
          await unlink(restoredPath);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to restore ${type} database:`, error);
      return null;
    }
  }

  validateRecord(type, table, record) {
    const schema = this.schemas[type];
    if (!schema) throw new Error(`Unknown database type: ${type}`);
    return validateRecord(schema, table, record);
  }
}

// Export singleton instance
export default new SchemaManager();
