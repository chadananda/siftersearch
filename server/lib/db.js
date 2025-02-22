/**
 * db.js - Database Operations Layer
 * 
 * This module is responsible for:
 * - Providing low-level CRUD operations
 * - Wrapping CRUD into high-level document operations
 * - Managing database connections
 * - Using schema.js for validation and connection management
 */

import schemaManager from './schema.js';
import config from './config.js';

// Low-level CRUD operations
export const insertRecord = async (db, table, record) => {
  const columns = Object.keys(record);
  const values = Object.values(record);
  const placeholders = values.map((_, i) => `?${i + 1}`);
  
  const sql = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
  `;
  
  return await db.execute({ sql, args: values });
};

export const updateRecord = async (db, table, id, record) => {
  const updates = Object.entries(record)
    .map(([key, _], i) => `${key} = ?${i + 1}`)
    .join(', ');
  
  const sql = `
    UPDATE ${table}
    SET ${updates}
    WHERE id = ?${Object.keys(record).length + 1}
  `;
  
  return await db.execute({
    sql,
    args: [...Object.values(record), id]
  });
};

export const deleteRecord = async (db, table, id) => {
  const sql = `DELETE FROM ${table} WHERE id = ?1`;
  return await db.execute({ sql, args: [id] });
};

export const getRecord = async (db, table, id) => {
  const sql = `SELECT * FROM ${table} WHERE id = ?1`;
  const result = await db.execute({ sql, args: [id] });
  return result.rows[0];
};

export const queryRecords = async (db, table, where = '', args = []) => {
  const sql = `SELECT * FROM ${table} ${where ? 'WHERE ' + where : ''}`;
  const result = await db.execute({ sql, args });
  return result.rows;
};

// High-level database operations
export class DatabaseManager {
  constructor() {
    this.connections = new Map();
  }

  async getDb(type, collection = null) {
    const key = this._getConnectionKey(type, collection);
    
    if (!this.connections.has(key)) {
      const db = await schemaManager.openDatabase(type, collection);
      this.connections.set(key, db);
    }
    
    return this.connections.get(key);
  }

  // Database-specific getters
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
    if (!collection) throw new Error('Collection is required for index database');
    return this.getDb('index', collection);
  }

  // High-level document operations
  async createDocument(collectionId, { title, content, metadata = {} }) {
    const db = await this.getCoreContentDb();
    const document = {
      id: crypto.randomUUID(),
      collection_id: collectionId,
      title,
      content,
      metadata: JSON.stringify(metadata)
    };

    // Validate document
    schemaManager.validateRecord('content', 'documents', document);
    
    // Insert document
    await insertRecord(db, 'documents', document);
    return document;
  }

  async updateDocument(documentId, updates) {
    const db = await this.getCoreContentDb();
    if (updates.metadata) {
      updates.metadata = JSON.stringify(updates.metadata);
    }
    
    // Validate updates
    const current = await this.getDocument(documentId);
    schemaManager.validateRecord('content', 'documents', { ...current, ...updates });
    
    // Update document
    await updateRecord(db, 'documents', documentId, updates);
  }

  async deleteDocument(documentId) {
    const db = await this.getCoreContentDb();
    await deleteRecord(db, 'documents', documentId);
  }

  async getDocument(documentId) {
    const db = await this.getCoreContentDb();
    const doc = await getRecord(db, 'documents', documentId);
    if (doc?.metadata) {
      doc.metadata = JSON.parse(doc.metadata);
    }
    return doc;
  }

  async searchDocuments({ collection_id, query, limit = 100 }) {
    const db = await this.getCoreContentDb();
    const where = [];
    const args = [];

    if (collection_id) {
      where.push('collection_id = ?');
      args.push(collection_id);
    }

    if (query) {
      where.push('(title LIKE ? OR content LIKE ?)');
      args.push(`%${query}%`, `%${query}%`);
    }

    const whereClause = where.length ? where.join(' AND ') : '';
    const docs = await queryRecords(db, 'documents', whereClause, args);
    return docs.map(doc => ({
      ...doc,
      metadata: doc.metadata ? JSON.parse(doc.metadata) : {}
    }));
  }

  _getConnectionKey(type, collection = null) {
    switch (type) {
      case 'app': return 'app';
      case 'library': return `library_${config.getLibraryId()}`;
      case 'content': return `content_${config.getLibraryId()}`;
      case 'index': return `index_${config.getLibraryId()}_${collection}`;
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

// Export singleton instance
export default new DatabaseManager();
