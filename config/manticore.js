/**
 * Manticore Search Configuration
 * 
 * This file centralizes all Manticore-related configuration.
 * It imports both PUBLIC and SECRETS from the central config module.
 */

import { PUBLIC, SECRETS } from './config.js';

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'production';
const isDev = NODE_ENV === 'development';

// Basic Manticore configuration
const manticoreConfig = {
  // Connection settings
  host: PUBLIC.MANTICORE_HOST || (isDev ? 'manticore' : 'manticore'),
  port: parseInt(PUBLIC.MANTICORE_PORT || '9308', 10),
  mysqlPort: parseInt(PUBLIC.MANTICORE_SQL_PORT || '9306', 10),
  
  // Public URL (for client access)
  url: PUBLIC.MANTICORE_URL || `http://${isDev ? 'localhost' : 'manticore'}:9308`,
  
  // Index configuration
  indexName: PUBLIC.MANTICORE_INDEX || 'siftersearch',
  vectorSize: parseInt(PUBLIC.MANTICORE_VECTOR_SIZE || '768', 10),
  
  // Search weights
  bm25Weight: parseFloat(PUBLIC.MANTICORE_BM25_WEIGHT || '0.6'),
  vectorWeight: parseFloat(PUBLIC.MANTICORE_VECTOR_WEIGHT || '0.4'),
  
  // Data storage
  dataPath: PUBLIC.MANTICORE_DATA_PATH || './data/manticore',
  
  // Advanced configuration
  enableMysql: PUBLIC.MANTICORE_ENABLE_MYSQL || 'listen = 9306:mysql',
  maxConnections: parseInt(PUBLIC.MANTICORE_MAX_CONNECTIONS || '30', 10),
  maxFilters: parseInt(PUBLIC.MANTICORE_MAX_FILTERS || '128', 10),
  maxFilterValues: parseInt(PUBLIC.MANTICORE_MAX_FILTER_VALUES || '2048', 10),
  readTimeout: parseInt(PUBLIC.MANTICORE_READ_TIMEOUT || '3', 10),
  workers: PUBLIC.MANTICORE_WORKERS || 'thread_pool',
  binlogFlush: parseInt(PUBLIC.MANTICORE_BINLOG_FLUSH || '0', 10),
  
  // Docker container name (for docker-compose)
  containerName: `siftersearch-manticore-${NODE_ENV}`
};

export default manticoreConfig;
