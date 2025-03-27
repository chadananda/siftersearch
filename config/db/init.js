/**
 * Database Initialization Module
 * 
 * Handles database initialization, schema creation, and synchronization
 * between development and production environments.
 */
import { PUBLIC, SECRETS } from '../config.js';
import { createClient } from '@libsql/client';
import { AUTH_SCHEMA, CONTENT_SCHEMA, API_SCHEMA } from './schema.js';
import { isDev } from '../config.js';

// Database configuration
const DB_CONFIG = {
  // Development configuration (local SQLite)
  dev: {
    app: {
      url: 'file:./data/app.db'
    },
    library: {
      url: 'file:./data/library.db'
    }
  },
  // Production configuration (Turso)
  prod: {
    app: {
      url: PUBLIC.TURSO_APP_DB_URL,
      authToken: SECRETS.TURSO_AUTH_TOKEN
    },
    library: {
      url: PUBLIC.TURSO_LIBRARY_DB_URL,
      authToken: SECRETS.TURSO_AUTH_TOKEN
    }
  }
};

/**
 * Initialize database and create schema if needed
 */
export async function initializeDatabase(logger) {
  const config = isDev() ? DB_CONFIG.dev : DB_CONFIG.prod;
  const clients = {};
  
  try {
    // Create database clients
    clients.app = createClient(config.app);
    clients.library = createClient(config.library);
    
    logger?.info(`Connected to ${isDev() ? 'local SQLite' : 'Turso'} databases`);
    
    // Initialize schemas
    await initializeSchemas(clients, logger);
    
    return clients;
  } catch (error) {
    logger?.error(`Database initialization error: ${error.message}`);
    throw error;
  }
}

/**
 * Initialize database schemas
 */
async function initializeSchemas(clients, logger) {
  try {
    // Initialize app database schema
    await clients.app.execute(AUTH_SCHEMA);
    await clients.app.execute(API_SCHEMA);
    logger?.info('App database schema initialized');
    
    // Initialize library database schema
    await clients.library.execute(CONTENT_SCHEMA);
    logger?.info('Library database schema initialized');
  } catch (error) {
    logger?.error(`Schema initialization error: ${error.message}`);
    throw error;
  }
}

/**
 * Synchronize user from Clerk to database
 * @param {Object} user - Clerk user object
 * @param {Object} db - Database client
 * @returns {Object} - Database user record
 */
export async function syncUserToDatabase(user, db, logger) {
  if (!user || !user.id) {
    logger?.warn('Cannot sync user: Invalid user object');
    return null;
  }
  
  try {
    // Check if user exists in database
    const existingUser = await db.app.execute({
      sql: 'SELECT * FROM users WHERE clerk_id = ?',
      args: [user.id]
    });
    
    const now = new Date().toISOString();
    
    if (existingUser.rows.length === 0) {
      // User doesn't exist, create new user
      const result = await db.app.execute({
        sql: `INSERT INTO users (id, clerk_id, email, name, role, active, created_at, updated_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(), // Generate UUID for internal ID
          user.id,             // Clerk ID
          user.emailAddresses[0]?.emailAddress || '',
          user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : (user.username || 'User'),
          'visitor',           // Default role
          1,                   // Active
          now,                 // Created at
          now                  // Updated at
        ]
      });
      
      logger?.info(`Created new user record for Clerk ID: ${user.id}`);
      
      // Fetch the newly created user
      const newUser = await db.app.execute({
        sql: 'SELECT * FROM users WHERE clerk_id = ?',
        args: [user.id]
      });
      
      return newUser.rows[0];
    } else {
      // User exists, update information if needed
      const dbUser = existingUser.rows[0];
      
      // Check if user info needs updating
      const currentEmail = user.emailAddresses[0]?.emailAddress || '';
      const currentName = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : (user.username || 'User');
      
      if (dbUser.email !== currentEmail || dbUser.name !== currentName) {
        await db.app.execute({
          sql: 'UPDATE users SET email = ?, name = ?, updated_at = ? WHERE clerk_id = ?',
          args: [currentEmail, currentName, now, user.id]
        });
        
        logger?.info(`Updated user record for Clerk ID: ${user.id}`);
        
        // Fetch the updated user
        const updatedUser = await db.app.execute({
          sql: 'SELECT * FROM users WHERE clerk_id = ?',
          args: [user.id]
        });
        
        return updatedUser.rows[0];
      }
      
      return dbUser;
    }
  } catch (error) {
    logger?.error(`Error syncing user to database: ${error.message}`);
    throw error;
  }
}

/**
 * Get user role from database
 * @param {string} clerkId - Clerk user ID
 * @param {Object} db - Database client
 * @returns {string} - User role or 'visitor' if not found
 */
export async function getUserRole(clerkId, db, logger) {
  if (!clerkId) {
    return 'visitor';
  }
  
  try {
    const result = await db.app.execute({
      sql: 'SELECT role FROM users WHERE clerk_id = ?',
      args: [clerkId]
    });
    
    if (result.rows.length === 0) {
      return 'visitor';
    }
    
    return result.rows[0].role;
  } catch (error) {
    logger?.error(`Error getting user role: ${error.message}`);
    return 'visitor';
  }
}
