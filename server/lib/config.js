/**
 * config.js - Application Configuration Management
 * 
 * This module is responsible for:
 * - Managing application configuration
 * - Handling environment-specific settings
 * - Managing current library context
 * - Providing configuration validation
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

class ConfigManager {
  constructor() {
    this.config = null;
    this.currentLibraryId = null;
  }

  async initialize() {
    // Load config file
    const configPath = join(process.cwd(), 'config.json');
    try {
      const configData = await readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      this.config = {
        defaultLibrary: 'ocean',
        isDev: process.env.NODE_ENV !== 'production'
      };
      await writeFile(configPath, JSON.stringify(this.config, null, 2));
    }

    // Set initial library ID
    this.setLibraryId(process.env.LIBRARY_ID || this.config.defaultLibrary);
  }

  // Library context management
  setLibraryId(libraryId) {
    if (!libraryId) throw new Error('libraryId is required');
    this.currentLibraryId = libraryId;
  }

  getLibraryId() {
    if (!this.currentLibraryId) {
      throw new Error('Library ID not set. Did you initialize the config?');
    }
    return this.currentLibraryId;
  }

  // Request context management
  getLibraryIdFromRequest(req) {
    if (!req) return this.getLibraryId();

    // In production, use subdomain
    if (!this.config.isDev) {
      const subdomain = req.hostname.split('.')[0];
      return subdomain || this.config.defaultLibrary;
    }

    // In dev, use query param or header for testing, fallback to default
    return (
      req.query.libraryId ||
      req.headers['x-library-id'] ||
      this.getLibraryId()
    );
  }

  // Configuration getters
  isDev() {
    return this.config?.isDev ?? false;
  }

  async updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    const configPath = join(process.cwd(), 'config.json');
    await writeFile(configPath, JSON.stringify(this.config, null, 2));
  }
}

// Export singleton instance
export default new ConfigManager();
