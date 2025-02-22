/**
 * library.js - Library Management System
 * 
 * This module is responsible for:
 * - Managing library structure and organization
 * - Providing high-level library operations
 * - Using db.js for database operations
 * - Coordinating between different library components
 * 
 * It acts as the highest-level interface for library operations,
 * using the database layer (db.js) for persistence while managing
 * the overall library structure and organization.
 */

import { mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import config from './config.js';

// Low-level library management functions (for testing)
export const ensureDir = async (dir) => {
  await mkdir(dir, { recursive: true });
};

export const getLibraryFiles = async (libraryPath) => {
  return await readdir(libraryPath)
    .then(files => files.filter(f => !f.includes('.') && f !== 'backups' && f !== 'archive'))
    .catch(() => []);
};

export const createLibraryStructure = async (basePath, libraryId = config.getLibraryId()) => {
  const paths = [
    join(basePath, 'libraries', libraryId),
    join(basePath, 'libraries/backups', libraryId),
    join(basePath, 'libraries/archive', libraryId)
  ];
  await Promise.all(paths.map(ensureDir));
};

// High-level library management (for server use)
export class LibraryManager {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
    this.paths = {
      libraries: join(basePath, 'libraries'),
      backups: join(basePath, 'libraries/backups'),
      archive: join(basePath, 'libraries/archive')
    };
  }

  async initialize() {
    await Promise.all([
      ensureDir(this.paths.libraries),
      ensureDir(this.paths.backups),
      ensureDir(this.paths.archive)
    ]);
  }

  async getLibraries() {
    await this.initialize();
    return await getLibraryFiles(this.paths.libraries);
  }

  async ensureLibraryExists(libraryId = config.getLibraryId()) {
    if (!libraryId) return;
    await createLibraryStructure(this.basePath, libraryId);
  }
}

// Export singleton instance for server use
export default new LibraryManager();
