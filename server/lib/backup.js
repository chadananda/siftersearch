/**
 * backup.js - Database Backup System
 * 
 * This module is responsible for:
 * - Managing Backblaze B2 backups with versioning
 * - Encrypting sensitive data before backup
 * - Providing restore functionality
 * - Supporting schema.js for database recovery
 */

import { createReadStream, createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import B2 from 'backblaze-b2';
import crypto from 'crypto';
import config from './config.js';
import fs from 'fs/promises';

// Initialize B2 client
const b2 = new B2({
  applicationKeyId: process.env.BACKBLAZE_KEY_ID,
  applicationKey: process.env.BACKBLAZE_APP_KEY,
  endpoint: process.env.BACKBLAZE_ENDPOINT
});

// Encryption utilities
const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const encrypt = (data) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
};

const decrypt = (encrypted, iv, authTag) => {
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
};

// Backup utilities
const getBackupPath = (type, libraryId = null) => {
  libraryId = libraryId || config.getLibraryId();
  
  // 1. App database (superusers)
  if (type === 'app') {
    return 'app.db';
  }
  
  // 2. Library database (library users, configurations, index metadata)
  if (type === 'library') {
    return `libraries/${libraryId}/library.db`;
  }
  
  // 3. Core content database
  if (type === 'content') {
    return `libraries/${libraryId}/core_content.db`;
  }
  
  throw new Error(`Invalid database type: ${type}. Must be one of: app, library, content`);
};

// Get index database paths from library configuration
const getIndexPath = async (libraryId, indexId) => {
  const Library = (await import('./schema.js')).Library;
  const library = new Library(libraryId);
  
  // Query searchindexes table
  const index = await library.db.get(
    'SELECT * FROM searchindexes WHERE id = ?',
    [indexId]
  );
  
  if (!index) {
    throw new Error(`Index ${indexId} not found in library ${libraryId}`);
  }
  return index.path;
};

// Get all active indexes for a library
const getActiveIndexes = async (libraryId) => {
  const Library = (await import('./schema.js')).Library;
  const library = new Library(libraryId);
  
  return await library.db.all(
    'SELECT * FROM searchindexes WHERE status = ? ORDER BY search_priority DESC',
    ['active']
  );
};

const getVersionedPath = (path) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const [name, ext] = path.split('.');
  return `${name}_${timestamp}.${ext}`;
};

const uploadToB2 = async (filePath, fileName, encrypt = false) => {
  await b2.authorize();
  
  let fileData;
  if (encrypt) {
    // Read and encrypt the file
    const data = await fs.readFile(filePath);
    const { encrypted, iv, authTag } = encrypt(data);
    
    // Combine encrypted data with IV and auth tag for storage
    fileData = Buffer.concat([
      iv,
      authTag,
      encrypted
    ]);
  } else {
    fileData = createReadStream(filePath);
  }

  const { uploadUrl, authorizationToken } = await b2.getUploadUrl({
    bucketId: process.env.BACKBLAZE_BUCKET_ID
  });
  
  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken: authorizationToken,
    fileName,
    data: fileData
  });
};

const downloadFromB2 = async (fileName, targetPath, encrypted = false) => {
  await b2.authorize();
  
  const response = await b2.downloadFileByName({
    bucketName: process.env.BACKBLAZE_BUCKET_NAME,
    fileName,
    responseType: 'arraybuffer'
  });

  if (encrypted) {
    const data = Buffer.from(response.data);
    
    // Extract IV, auth tag, and encrypted data
    const iv = data.slice(0, 12);
    const authTag = data.slice(12, 28);
    const encrypted = data.slice(28);
    
    // Decrypt the data
    const decrypted = decrypt(encrypted, iv, authTag);
    await fs.writeFile(targetPath, decrypted);
  } else {
    await fs.writeFile(targetPath, response.data);
  }
};

// High-level backup management
export class BackupManager {
  constructor() {
    // Tables containing sensitive data that need encryption
    this.sensitiveTypes = ['app', 'library']; // Both contain user data
  }

  async backupDatabase(type, libraryId = null) {
    const needsEncryption = this.sensitiveTypes.includes(type);
    const dbPath = `libraries/${libraryId}/${type}.db`;
    const backupPath = getBackupPath(type, libraryId);
    
    try {
      // First rename the existing backup if it exists
      try {
        const versionedPath = getVersionedPath(backupPath);
        await b2.getFileInfo({
          fileName: backupPath,
          bucketId: process.env.BACKBLAZE_BUCKET_ID
        });
        
        // If file exists, copy it to versioned name
        await b2.copyFile({
          sourceFileName: backupPath,
          destinationFileName: versionedPath,
          bucketId: process.env.BACKBLAZE_BUCKET_ID
        });
      } catch (error) {
        // File doesn't exist yet, that's fine
      }

      // Upload new backup
      await uploadToB2(dbPath, backupPath, needsEncryption);
      console.log(`Created B2 backup: ${backupPath}`);

      return true;
    } catch (error) {
      console.error(`B2 backup failed for ${type}:`, error);
      throw error;
    }
  }

  // Backup all active indexes for a library
  async backupAllIndexes(libraryId) {
    const indexes = await getActiveIndexes(libraryId);
    
    for (const index of indexes) {
      try {
        await this.backupIndex(libraryId, index.id);
      } catch (error) {
        console.error(`Failed to backup index ${index.id}:`, error);
        // Continue with other indexes even if one fails
      }
    }
  }

  async backupIndex(libraryId, indexId) {
    const indexPath = await getIndexPath(libraryId, indexId);
    const backupPath = `libraries/${libraryId}/index_${indexId}.db`;
    
    try {
      // First rename the existing backup if it exists
      try {
        const versionedPath = getVersionedPath(backupPath);
        await b2.getFileInfo({
          fileName: backupPath,
          bucketId: process.env.BACKBLAZE_BUCKET_ID
        });
        
        // If file exists, copy it to versioned name
        await b2.copyFile({
          sourceFileName: backupPath,
          destinationFileName: versionedPath,
          bucketId: process.env.BACKBLAZE_BUCKET_ID
        });
      } catch (error) {
        // File doesn't exist yet, that's fine
      }

      // Upload new backup
      await uploadToB2(indexPath, backupPath);
      console.log(`Created B2 backup: ${backupPath}`);

      return true;
    } catch (error) {
      console.error(`B2 backup failed for index ${indexId}:`, error);
      throw error;
    }
  }

  async restoreDatabase(type, libraryId = null) {
    const needsEncryption = this.sensitiveTypes.includes(type);
    const backupPath = getBackupPath(type, libraryId);
    const targetPath = `libraries/${libraryId}/${type}.db`;
    
    try {
      // Download directly using known path
      await downloadFromB2(backupPath, targetPath, needsEncryption);
      console.log(`Restored backup: ${backupPath}`);
      return targetPath;
    } catch (error) {
      console.error('B2 restore failed:', error);
      return null;
    }
  }

  async restoreIndex(libraryId, indexId) {
    const backupPath = `libraries/${libraryId}/index_${indexId}.db`;
    const indexPath = await getIndexPath(libraryId, indexId);
    
    try {
      // Download directly using known path
      await downloadFromB2(backupPath, indexPath);
      console.log(`Restored backup: ${backupPath}`);
      return indexPath;
    } catch (error) {
      console.error('B2 restore failed:', error);
      return null;
    }
  }

  async listVersions(type, libraryId = null) {
    const backupPath = getBackupPath(type, libraryId);
    const prefix = backupPath.split('.')[0]; // Get path without extension
    
    try {
      await b2.authorize();
      const { files } = await b2.listFileNames({
        bucketId: process.env.BACKBLAZE_BUCKET_ID,
        prefix,
        maxFileCount: 100
      });
      
      return files.sort((a, b) => b.fileName.localeCompare(a.fileName));
    } catch (error) {
      console.error('Failed to list versions:', error);
      return [];
    }
  }
}

// Export singleton instance
export default new BackupManager();
