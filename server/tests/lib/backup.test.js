import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { join } from 'path';
import { mkdir, writeFile, unlink, rmdir } from 'fs/promises';
import {
  getBackupName,
  getTimestamp,
  findLatestBackup
} from '../../lib/backup.js';

describe('Backup Module', () => {
  const testDir = join(process.cwd(), 'test-backups');
  const testLibraryId = 'test-lib';

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (e) {
      // Ignore if directory doesn't exist
    }
  });

  describe('Backup Utilities', () => {
    it('should generate valid backup names', () => {
      const timestamp = '2025-02-21-10-00-00';
      const name = getBackupName('test.db', timestamp);
      expect(name).to.equal('test_2025-02-21-10-00-00.db');
    });

    it('should generate valid timestamps', () => {
      const timestamp = getTimestamp();
      expect(timestamp).to.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/);
    });

    it('should find latest backup', async () => {
      const files = [
        'test_2025-02-21-09-00-00.db',
        'test_2025-02-21-10-00-00.db',
        'test_2025-02-21-08-00-00.db'
      ];

      for (const file of files) {
        await writeFile(join(testDir, file), '');
      }

      const latest = await findLatestBackup(testDir, 'test.db');
      expect(latest).to.include('test_2025-02-21-10-00-00.db');
    });

    it('should return null when no backups exist', async () => {
      const latest = await findLatestBackup(testDir, 'nonexistent.db');
      expect(latest).to.be.null;
    });
  });
});
