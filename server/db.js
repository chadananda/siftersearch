import { createClient } from '@libsql/client';
import { mkdir } from 'fs/promises';
import path from 'path';
import { appDbSchema, libraryDbSchema, contentDbSchema, indexDbSchema } from './db/schema.js';
import config from './config.js';

// Convert schema object format to single SQL string
function convertSchemaToSql(schema) {
  return Object.values(schema.tables).join('\n');
}

const DB_SCHEMAS = {
  app: {
    tables: convertSchemaToSql(appDbSchema)
  },
  library: {
    tables: convertSchemaToSql(libraryDbSchema)
  },
  content: {
    tables: convertSchemaToSql(contentDbSchema)
  }
};

async function validateDb(db, schema) {
  try {
    await db.execute(schema.tables);
    return true;
  } catch (error) {
    console.error('Database validation failed:', error);
    return false;
  }
}

async function db_open(type, params = {}) {
  const { collection } = params;
  const libraryId = type !== 'app' ? config.libraryId : null;
  let dbPath;
  let schema;

  // Ensure libraries directory exists for library-specific databases
  if (type !== 'app') {
    const librariesDir = path.join(process.cwd(), 'libraries');
    await mkdir(librariesDir, { recursive: true });

    if (libraryId) {
      const libraryPath = path.join(librariesDir, libraryId);
      await mkdir(libraryPath, { recursive: true });
    }
  }

  // Determine database path and schema based on type
  switch (type) {
    case 'app':
      dbPath = process.env.APP_DB_URL || 'file:app.db';
      schema = DB_SCHEMAS.app;
      break;
    case 'library':
      if (!libraryId) throw new Error('libraryId is required for library database');
      dbPath = process.env.LIBRARY_DB_URL || `file:libraries/${libraryId}/library.db`;
      schema = DB_SCHEMAS.library;
      break;
    case 'content':
      if (!libraryId) throw new Error('libraryId is required for content database');
      dbPath = process.env.CONTENT_DB_URL || `file:libraries/${libraryId}/content.db`;
      schema = DB_SCHEMAS.content;
      break;
    case 'index':
      if (!libraryId || !collection) throw new Error('libraryId and collection are required for index database');
      dbPath = process.env.INDEX_DB_URL || `file:libraries/${libraryId}/index_${collection}.db`;
      schema = DB_SCHEMAS.content; // Index DB shares content schema
      break;
    default:
      throw new Error(`Unknown database type: ${type}`);
  }

  // Create and validate database
  const db = createClient({ url: dbPath });
  const isValid = await validateDb(db, schema);

  if (!isValid) {
    throw new Error(`Failed to initialize ${type} database`);
  }

  return db;
}

class DatabaseManager {
  constructor() {
    this.connections = new Map();
  }

  async getDb(type, params = {}) {
    const key = this._getConnectionKey(type, params);
    
    if (!this.connections.has(key)) {
      const db = await db_open(type, params);
      this.connections.set(key, db);
    }
    
    return this.connections.get(key);
  }

  async getAppDb() {
    return this.getDb('app');
  }

  async getLibraryDb() {
    return this.getDb('library');
  }

  async getCoreContentDb() {
    return this.getDb('content');
  }

  async getIndexDb(collection) {
    return this.getDb('index', { collection });
  }

  _getConnectionKey(type, params) {
    const { collection } = params;
    const libraryId = type !== 'app' ? config.libraryId : null;
    switch (type) {
      case 'app': return 'app';
      case 'library': return `library_${libraryId}`;
      case 'content': return `content_${libraryId}`;
      case 'index': return `index_${libraryId}_${collection}`;
      default: throw new Error(`Unknown database type: ${type}`);
    }
  }

  async closeAll() {
    for (const [_, connection] of this.connections) {
      await connection.close();
    }
    this.connections.clear();
  }
}

export { DatabaseManager };
export default new DatabaseManager();