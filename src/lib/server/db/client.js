/**
 * Database Client Module
 * 
 * This module provides a centralized database client that:
 * 1. Connects to the appropriate database (Turso or local SQLite)
 * 2. Automatically initializes and verifies the database schema
 * 3. Provides a singleton client instance for the application
 */

import { createClient } from '@libsql/client';
import { COMPLETE_SCHEMA } from '../../../../config/db/schema.js';
import dbConfig from '../../../../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../../');

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'dev';

// Singleton database client instance
let dbClient = null;

/**
 * Initialize the database with the complete schema
 * @param {Object} client - The database client
 */
async function initializeSchema(client) {
  try {
    console.log('Initializing database schema...');
    await client.execute(COMPLETE_SCHEMA);
    console.log('Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Create initial admin user if needed
 * @param {Object} client - The database client
 */
async function createInitialAdminUser(client) {
  try {
    // Check if admin user exists
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    });
    
    const adminCount = result.rows[0].count;
    
    // If no admin users exist and we have environment variables for admin credentials
    if (adminCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      console.log('Creating initial admin user...');
      
      const userId = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      
      await client.execute({
        sql: `
          INSERT INTO users (id, email, password, name, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          userId,
          process.env.ADMIN_EMAIL,
          process.env.ADMIN_PASSWORD, // In a real app, this should be hashed
          'Admin User',
          'admin',
          now,
          now
        ]
      });
      
      console.log('Created admin user:', process.env.ADMIN_EMAIL);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to create initial admin user:', error);
    // Don't throw here, as this is not critical for application startup
    return false;
  }
}

/**
 * Ensure the database directory exists for embedded mode
 * @param {string} dbPath - Path to the database file
 */
function ensureDatabaseDirectory(dbPath) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('Created database directory:', dbDir);
  }
}

/**
 * Get a database client instance
 * @param {boolean} forceNew - Force creation of a new client
 * @returns {Object} The database client
 */
export async function getDbClient(forceNew = false) {
  // Return existing client if available and not forcing new
  if (dbClient && !forceNew) {
    return dbClient;
  }

  try {
    let clientConfig = {};

    if (dbConfig.shouldUseEmbedded()) {
      // Embedded mode (local file)
      const dbPath = path.resolve(rootDir, dbConfig.getConfig().localPath);
      ensureDatabaseDirectory(dbPath);
      
      clientConfig = {
        url: `file:${dbPath}`
      };
      console.log(`Connecting to local SQLite database at ${dbPath}`);
    } else {
      // Remote Turso database
      clientConfig = {
        url: dbConfig.getDatabaseUrl(),
        authToken: dbConfig.getAuthToken()
      };
      console.log(`Connecting to remote Turso database at ${dbConfig.getDatabaseUrl()}`);
    }

    // Create the client
    const client = createClient(clientConfig);
    
    // Initialize schema
    await initializeSchema(client);
    
    // Create initial admin user if needed
    await createInitialAdminUser(client);
    
    // Store the client instance
    dbClient = client;
    return client;
  } catch (error) {
    console.error('Failed to create database client:', error);
    throw error;
  }
}

/**
 * Execute a database query
 * @param {string} sql - The SQL query
 * @param {Array} params - Query parameters
 * @returns {Object} Query result
 */
export async function query(sql, params = []) {
  const client = await getDbClient();
  try {
    return await client.execute({
      sql,
      args: params
    });
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Export a default object with all database functions
export default {
  getClient: getDbClient,
  query,
  
  // Add any additional database utility functions here
  
  // Example: Get a single row by ID
  async getById(table, id) {
    return query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  },
  
  // Example: Insert a row
  async insert(table, data) {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    return query(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
      values
    );
  }
};
