/**
 * Drizzle Client Module
 * 
 * This module provides a Drizzle ORM client for database operations.
 * It wraps the LibSQL client with Drizzle for type-safe queries.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { PUBLIC, SECRETS } from '../../../../config/config.js';
import * as schema from '../../../../config/drizzle.js';
import { getClient, getReadClient, getWriteClient } from './core.js';

// Debug flag - set to false to disable verbose logging
const DEBUG_MODE = PUBLIC.IS_DEV === 'true';

// Drizzle clients
let drizzleReadClient = null;
let drizzleWriteClient = null;

/**
 * Get the Drizzle client for read operations
 * @returns {Object} Drizzle client for read operations
 */
export function getDrizzleReadClient() {
  if (!drizzleReadClient) {
    const client = getReadClient();
    drizzleReadClient = drizzle(client, { schema });
  }
  return drizzleReadClient;
}

/**
 * Get the Drizzle client for write operations
 * @returns {Object} Drizzle client for write operations
 */
export function getDrizzleWriteClient() {
  if (!drizzleWriteClient) {
    const client = getWriteClient();
    drizzleWriteClient = drizzle(client, { schema });
  }
  return drizzleWriteClient;
}

export default {
  getDrizzleReadClient,
  getDrizzleWriteClient
};
