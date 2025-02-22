import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { unlink } from 'fs/promises';
import {
  insertRecord,
  updateRecord,
  deleteRecord,
  getRecord,
  queryRecords
} from '../../lib/db.js';
import schemaManager from '../../lib/schema.js';
import config from '../../lib/config.js';

describe('Database Module', () => {
  let db;

  beforeEach(async () => {
    // Set test library ID
    config.setLibraryId('test-lib');
    
    // Use schema manager to create a test database
    db = await schemaManager.openDatabase('content');
  });

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
    try {
      const dbPath = schemaManager.getDbPath('content');
      await unlink(dbPath.replace('file:', ''));
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  describe('CRUD Operations', () => {
    it('should insert and retrieve a record', async () => {
      const doc = {
        id: '123',
        collection_id: 'test-collection',
        title: 'Test Document',
        content: 'Test content',
        metadata: JSON.stringify({ test: true })
      };

      await insertRecord(db, 'documents', doc);
      const retrieved = await getRecord(db, 'documents', doc.id);
      expect(retrieved.id).to.equal(doc.id);
      expect(retrieved.title).to.equal(doc.title);
    });

    it('should update a record', async () => {
      const doc = {
        id: '123',
        collection_id: 'test-collection',
        title: 'Test Document',
        content: 'Test content'
      };

      await insertRecord(db, 'documents', doc);
      await updateRecord(db, 'documents', doc.id, { title: 'Updated Title' });
      
      const updated = await getRecord(db, 'documents', doc.id);
      expect(updated.title).to.equal('Updated Title');
      expect(updated.content).to.equal(doc.content);
    });

    it('should delete a record', async () => {
      const doc = {
        id: '123',
        collection_id: 'test-collection',
        title: 'Test Document',
        content: 'Test content'
      };

      await insertRecord(db, 'documents', doc);
      await deleteRecord(db, 'documents', doc.id);
      
      const deleted = await getRecord(db, 'documents', doc.id);
      expect(deleted).to.be.undefined;
    });

    it('should query records', async () => {
      const docs = [
        { id: '1', collection_id: 'test', title: 'Doc 1', content: 'Content 1' },
        { id: '2', collection_id: 'test', title: 'Doc 2', content: 'Content 2' },
        { id: '3', collection_id: 'other', title: 'Doc 3', content: 'Content 3' }
      ];

      for (const doc of docs) {
        await insertRecord(db, 'documents', doc);
      }

      const testDocs = await queryRecords(db, 'documents', 'collection_id = ?', ['test']);
      expect(testDocs).to.have.length(2);
      expect(testDocs[0].collection_id).to.equal('test');
    });
  });
});
