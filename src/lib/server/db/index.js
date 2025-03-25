/**
 * Database Module Index
 * 
 * This file exports all database-related functionality from a single entry point.
 * This makes imports cleaner in other parts of the application.
 */

import db, { getDbClient, query } from './client.js';
import { CONTENT_SCHEMA, API_SCHEMA, AUTH_SCHEMA, COMPLETE_SCHEMA } from '../../../../config/db/schema.js';

// Export everything
export {
  // Client functions
  getDbClient,
  query,
  
  // Schema definitions
  CONTENT_SCHEMA,
  API_SCHEMA,
  AUTH_SCHEMA,
  COMPLETE_SCHEMA
};

// Export default database object
export default db;
