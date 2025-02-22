import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { join } from 'path';
import { writeFile, unlink } from 'fs/promises';
import config from '../../lib/config.js';

describe('Config Module', () => {
  const configPath = join(process.cwd(), 'config.json');
  const testConfig = {
    defaultLibrary: 'test-ocean',
    isDev: true
  };

  beforeEach(async () => {
    await writeFile(configPath, JSON.stringify(testConfig));
    await config.initialize();
  });

  afterEach(async () => {
    try {
      await unlink(configPath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  });

  describe('Library ID Management', () => {
    it('should use default library ID', () => {
      expect(config.getLibraryId()).to.equal('test-ocean');
    });

    it('should allow setting library ID', () => {
      config.setLibraryId('custom-lib');
      expect(config.getLibraryId()).to.equal('custom-lib');
    });

    it('should throw if library ID not set', () => {
      config.currentLibraryId = null;
      expect(() => config.getLibraryId()).to.throw();
    });
  });

  describe('Request Context', () => {
    it('should get library ID from subdomain in production', () => {
      config.config.isDev = false;
      const req = { hostname: 'mylib.siftersearch.com' };
      expect(config.getLibraryIdFromRequest(req)).to.equal('mylib');
    });

    it('should use default library if no subdomain in production', () => {
      config.config.isDev = false;
      const req = { hostname: 'siftersearch.com' };
      expect(config.getLibraryIdFromRequest(req)).to.equal('test-ocean');
    });

    it('should use query param in dev mode', () => {
      const req = {
        hostname: 'localhost',
        query: { libraryId: 'test-lib' }
      };
      expect(config.getLibraryIdFromRequest(req)).to.equal('test-lib');
    });

    it('should use header in dev mode', () => {
      const req = {
        hostname: 'localhost',
        query: {},
        headers: { 'x-library-id': 'test-lib' }
      };
      expect(config.getLibraryIdFromRequest(req)).to.equal('test-lib');
    });

    it('should fallback to default in dev mode', () => {
      const req = {
        hostname: 'localhost',
        query: {},
        headers: {}
      };
      expect(config.getLibraryIdFromRequest(req)).to.equal('test-ocean');
    });
  });
});
