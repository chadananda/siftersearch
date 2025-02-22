import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { join } from 'path';
import { mkdir, rmdir, readdir } from 'fs/promises';
import library from '../../lib/library.js';
import config from '../../lib/config.js';

describe('Library Module', () => {
  const testDir = join(process.cwd(), 'test-libraries');

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    config.setLibraryId('test-lib');
  });

  afterEach(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (e) {
      // Ignore if directory doesn't exist
    }
  });

  describe('Library Structure', () => {
    it('should create library directory structure', async () => {
      await library.ensureLibraryExists();
      
      const exists = await library.libraryExists();
      expect(exists).to.be.true;
      
      const dirs = await readdir(join(testDir, 'test-lib'));
      expect(dirs).to.include('collections');
      expect(dirs).to.include('indexes');
    });

    it('should create collection structure', async () => {
      const collectionId = 'test-collection';
      
      await library.ensureLibraryExists();
      await library.ensureCollectionExists(collectionId);
      
      const exists = await library.collectionExists(collectionId);
      expect(exists).to.be.true;
    });

    it('should support custom library ID', async () => {
      const customId = 'custom-lib';
      await library.ensureLibraryExists(customId);
      
      const exists = await library.libraryExists(customId);
      expect(exists).to.be.true;
    });
  });

  describe('Library Operations', () => {
    beforeEach(async () => {
      await library.ensureLibraryExists();
    });

    it('should create and retrieve library info', async () => {
      const info = {
        name: 'Test Library',
        description: 'Test Description'
      };

      await library.createLibrary(info);
      const retrieved = await library.getLibraryInfo();
      
      expect(retrieved.name).to.equal(info.name);
      expect(retrieved.description).to.equal(info.description);
    });

    it('should create and retrieve collection info', async () => {
      const collectionId = 'test-collection';
      const info = {
        name: 'Test Collection',
        description: 'Test Description'
      };

      await library.createCollection(collectionId, info);
      const retrieved = await library.getCollectionInfo(collectionId);
      
      expect(retrieved.name).to.equal(info.name);
      expect(retrieved.description).to.equal(info.description);
    });

    it('should list collections', async () => {
      const collections = [
        { id: 'col1', name: 'Collection 1' },
        { id: 'col2', name: 'Collection 2' }
      ];

      for (const col of collections) {
        await library.createCollection(col.id, col);
      }

      const list = await library.listCollections();
      expect(list).to.have.length(2);
      expect(list[0].name).to.equal('Collection 1');
    });
  });
});
