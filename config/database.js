/**
 * Database Configuration
 * 
 * This file centralizes all database-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import { PUBLIC, SECRETS } from './config.js';

// Database configuration
const dbConfig = {
  // Default database type to use
  defaultType: 'turso',
  
  // Turso configuration
  turso: {
    // Non-sensitive connection URL from PUBLIC
    url: PUBLIC.TURSO_DATABASE_URL,
    // Sensitive auth token from SECRETS
    token: SECRETS.TURSO_TOKEN,
    // Whether to use embedded mode (local file)
    useEmbedded: PUBLIC.LIBSQL_USE_EMBEDDED === 'true',
    // Local path for embedded mode
    localPath: PUBLIC.LIBSQL_LOCAL_PATH || 'data/libsql/local.db',
  },
  
  // Helper function to get the appropriate config based on database type
  getConfig(type) {
    const dbType = type || this.defaultType;
    switch (dbType) {
      case 'turso':
      default:
        return this.turso;
    }
  },
  
  // Helper function to determine if we should use embedded mode
  shouldUseEmbedded() {
    const config = this.getConfig();
    return config.useEmbedded;
  },
  
  // Helper function to get the appropriate database URL
  getDatabaseUrl() {
    const config = this.getConfig();
    
    if (this.shouldUseEmbedded()) {
      return `file:${config.localPath}`;
    }
    
    return config.url;
  },
  
  // Helper function to get the appropriate auth token
  getAuthToken() {
    const config = this.getConfig();
    
    if (this.shouldUseEmbedded()) {
      return null;
    }
    
    return config.token;
  }
};

export default dbConfig;
