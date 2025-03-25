/**
 * Configuration Index
 * 
 * This file exports the unified configuration system.
 * Import this file to get access to all configuration objects.
 */

import { PUBLIC, SECRETS, isDev, isProd } from './config.js';

// Domain-specific configurations
import siteConfig from './site.js';
import manticoreConfig from './manticore.js';
import storageConfig from './storage.js';
import aiConfig from './ai.js';
import dbConfig from './database.js';
import authConfig from './auth.js';

// Create a unified config object with domain-specific configurations
const config = {
  PUBLIC,
  SECRETS,
  site: siteConfig,
  manticore: manticoreConfig,
  storage: storageConfig,
  ai: aiConfig,
  db: dbConfig,
  auth: authConfig,
  isDev,
  isProd
};

// Export individual configurations for direct imports
export {
  PUBLIC,
  SECRETS,
  siteConfig as site,
  manticoreConfig as manticore,
  storageConfig as storage,
  aiConfig as ai,
  dbConfig as db,
  authConfig as auth,
  isDev,
  isProd
};

// Export the unified config as default
export default config;
