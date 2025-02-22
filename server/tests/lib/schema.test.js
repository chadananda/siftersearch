import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { join } from 'path';
import { unlink } from 'fs/promises';
import {
  validateRecord,
  testDatabase,
  createDatabase,
  getDbPath,
  appDbSchema,
  libraryDbSchema,
  contentDbSchema,
  indexDbSchema
} from '../../lib/schema.js';

describe('Schema Module', () => {
  const testDbPath = 'file:test.db';
  let db;

  afterEach(async () => {
    if (db) {
      await db.close();
      db = null;
    }
    try {
      await unlink(testDbPath.replace('file:', ''));
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  describe('Schema Validation', () => {
    it('should validate a valid user record', () => {
      const record = {
        email: 'test@example.com',
        name: 'Test User'
      };
      expect(() => validateRecord(appDbSchema, 'users', record)).to.not.throw();
    });

    it('should reject invalid user record', () => {
      const record = {
        email: 'invalid-email',
        name: ''
      };
      expect(() => validateRecord(appDbSchema, 'users', record)).to.throw();
    });

    it('should validate a valid document record', () => {
      const record = {
        collection_id: '123',
        title: 'Test Doc',
        content: 'Test content'
      };
      expect(() => validateRecord(contentDbSchema, 'documents', record)).to.not.throw();
    });
  });

  describe('Database Operations', () => {
    it('should create a new database with schema', async () => {
      db = await createDatabase(testDbPath, appDbSchema);
      expect(await testDatabase(db, appDbSchema)).to.be.true;
    });

    it('should get correct database paths', () => {
      expect(getDbPath('app')).to.include('app.db');
      expect(getDbPath('library', null, '123')).to.include('123/library.db');
      expect(getDbPath('content', null, '123')).to.include('123/content.db');
      expect(getDbPath('index', 'test', '123')).to.include('123/index_test.db');
    });

    it('should reject invalid database paths', () => {
      expect(() => getDbPath('invalid')).to.throw();
      expect(() => getDbPath('library')).to.throw();
      expect(() => getDbPath('index', null, '123')).to.throw();
      expect(() => getDbPath('index', 'test')).to.throw();
    });
  });
});
