/**
 * Storage Configuration
 * 
 * This file centralizes all storage-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import path from 'path';
import { PUBLIC, SECRETS } from './config.js';

// Determine which storage backend to use
const storageType = SECRETS.STORAGE_TYPE || (PUBLIC.IS_DEV ? 'local' : 'backblaze');

// Local storage configuration
const localStorageConfig = {
  basePath: path.resolve(process.cwd(), SECRETS.LOCAL_STORAGE_PATH || './data/storage'),
  publicUrl: SECRETS.LOCAL_STORAGE_PUBLIC_URL || `${PUBLIC.API_URL}/storage`,
};

// Backblaze B2 storage configuration
const backblazeConfig = {
  keyId: SECRETS.BACKBLAZE_KEY_ID,
  applicationKey: SECRETS.BACKBLAZE_APP_KEY,
  bucket: PUBLIC.B2_BUCKET,
  endpoint: PUBLIC.B2_ENDPOINT,
  region: PUBLIC.B2_REGION,
};

// Scaleway storage configuration (for archive storage)
const scalewayConfig = {
  accessKey: SECRETS.SCALEWAY_ACCESS_KEY,
  secretKey: SECRETS.SCALEWAY_SECRET_KEY,
  bucket: PUBLIC.SCALEWAY_BUCKET,
  endpoint: PUBLIC.SCALEWAY_ENDPOINT,
  region: PUBLIC.SCALEWAY_REGION,
};

// Get configuration for the current storage type
const getStorageConfig = () => {
  switch (storageType) {
    case 'local':
      return localStorageConfig;
    case 'backblaze':
      return backblazeConfig;
    case 'scaleway':
      return scalewayConfig;
    default:
      throw new Error(`Unknown storage type: ${storageType}`);
  }
};

// Determine if we should use archive storage
const useArchiveStorage = PUBLIC.USE_ARCHIVE_STORAGE;

// Helper methods for storage operations
const storageHelpers = {
  getPublicUrl: (filename) => {
    const config = getStorageConfig();
    
    switch (storageType) {
      case 'local':
        return `${config.publicUrl}/${filename}`;
      case 'backblaze':
        return `https://${config.bucket}.${config.endpoint}/${filename}`;
      case 'scaleway':
        return `https://${config.bucket}.${config.endpoint}/${filename}`;
      default:
        throw new Error(`Unknown storage type: ${storageType}`);
    }
  },
  
  getStoragePath: (filename) => {
    if (storageType === 'local') {
      return path.join(localStorageConfig.basePath, filename);
    }
    return filename;
  },
};

// Export storage configuration
export default {
  type: storageType,
  config: getStorageConfig(),
  useArchiveStorage,
  helpers: storageHelpers,
  
  // Export all configurations for direct access if needed
  local: localStorageConfig,
  backblaze: backblazeConfig,
  scaleway: scalewayConfig,
};
