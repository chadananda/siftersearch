/**
 * Database initialization script
 * 
 * This script initializes the database schema and creates necessary tables
 * It uses the schema definitions from config/schema.js
 */

import { generateSQLSchema } from '../../../../config/schema.js';
import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import { DB_URL, DB_AUTH_TOKEN } from '$env/static/private';

// Determine if we're in development or production
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create database client based on environment
export function getDbClient() {
  if (isDevelopment) {
    // Use SQLite for local development
    return createClient({
      url: 'file:./data/siftersearch.db'
    });
  } else {
    // Use Turso for production
    return createClient({
      url: DB_URL,
      authToken: DB_AUTH_TOKEN
    });
  }
}

/**
 * Initialize the database schema
 */
export async function initializeDatabase() {
  const db = getDbClient();
  const sqlSchema = generateSQLSchema();
  
  console.log('Initializing database schema...');
  
  try {
    // Create tables in the correct order to respect foreign key constraints
    await db.execute(sqlSchema.users);
    await db.execute(sqlSchema.collections);
    await db.execute(sqlSchema.documents);
    await db.execute(sqlSchema.activity_logs);
    await db.execute(sqlSchema.websites);
    await db.execute(sqlSchema.search_logs);
    await db.execute(sqlSchema.configs);
    
    console.log('Database schema initialized successfully.');
    
    // Check if we need to create a default admin user
    const adminExists = await checkAdminExists(db);
    
    if (!adminExists) {
      await createDefaultAdmin(db);
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
}

/**
 * Check if an admin user exists in the database
 */
async function checkAdminExists(db) {
  try {
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM users WHERE role = ?',
      args: ['admin']
    });
    
    return result.rows[0].count > 0;
  } catch (error) {
    console.error('Error checking for admin user:', error);
    return false;
  }
}

/**
 * Create a default admin user for development purposes
 */
async function createDefaultAdmin(db) {
  // Only create default admin in development
  if (!isDevelopment) {
    console.log('Skipping default admin creation in production.');
    return;
  }
  
  try {
    const adminId = uuidv4();
    const now = new Date().toISOString();
    
    await db.execute({
      sql: `
        INSERT INTO users (id, clerk_id, email, name, role, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        adminId,
        'dev_admin', // This is a placeholder, will be replaced by real Clerk ID
        'admin@siftersearch.com',
        'Admin User',
        'admin',
        1,
        now
      ]
    });
    
    console.log('Created default admin user for development.');
  } catch (error) {
    console.error('Error creating default admin user:', error);
  }
}

/**
 * Sync a user from Clerk to the local database
 * This is called during authentication to ensure user data is in sync
 */
export async function syncUserWithDatabase(clerkUser) {
  if (!clerkUser) return null;
  
  const db = getDbClient();
  
  try {
    // Check if user exists
    const existingUser = await db.execute({
      sql: 'SELECT * FROM users WHERE clerk_id = ?',
      args: [clerkUser.id]
    });
    
    const now = new Date().toISOString();
    
    if (existingUser.rows.length === 0) {
      // User doesn't exist, create new user
      const userId = uuidv4();
      
      await db.execute({
        sql: `
          INSERT INTO users (id, clerk_id, email, name, role, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          userId,
          clerkUser.id,
          clerkUser.emailAddresses[0]?.emailAddress || '',
          clerkUser.firstName && clerkUser.lastName 
            ? `${clerkUser.firstName} ${clerkUser.lastName}`
            : clerkUser.username || 'New User',
          'user', // Default role for new users
          1,
          now
        ]
      });
      
      // Log user creation
      await logActivity(db, {
        userId,
        action: 'create',
        entityType: 'user',
        entityId: userId,
        details: { source: 'clerk_sync' }
      });
      
      // Get the newly created user
      const newUser = await db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [userId]
      });
      
      return newUser.rows[0];
    } else {
      // User exists, update their information
      const user = existingUser.rows[0];
      
      await db.execute({
        sql: `
          UPDATE users
          SET email = ?, name = ?, updated_at = ?
          WHERE id = ?
        `,
        args: [
          clerkUser.emailAddresses[0]?.emailAddress || user.email,
          clerkUser.firstName && clerkUser.lastName 
            ? `${clerkUser.firstName} ${clerkUser.lastName}`
            : clerkUser.username || user.name,
          now,
          user.id
        ]
      });
      
      // Get the updated user
      const updatedUser = await db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [user.id]
      });
      
      return updatedUser.rows[0];
    }
  } catch (error) {
    console.error('Error syncing user with database:', error);
    return null;
  }
}

/**
 * Log an activity in the activity_logs table
 */
export async function logActivity(db, { userId, action, entityType, entityId, details = {} }) {
  try {
    const id = uuidv4();
    const now = new Date().toISOString();
    
    await db.execute({
      sql: `
        INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        userId,
        action,
        entityType,
        entityId || null,
        JSON.stringify(details),
        now
      ]
    });
    
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
}

/**
 * Get user by Clerk ID
 */
export async function getUserByClerkId(clerkId) {
  if (!clerkId) return null;
  
  const db = getDbClient();
  
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE clerk_id = ?',
      args: [clerkId]
    });
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error getting user by Clerk ID:', error);
    return null;
  }
}

/**
 * Get user role by Clerk ID
 */
export async function getUserRoleByClerkId(clerkId) {
  const user = await getUserByClerkId(clerkId);
  return user ? user.role : 'visitor';
}

// Initialize database on import if in development mode
if (isDevelopment) {
  initializeDatabase()
    .then(() => console.log('Database initialization complete'))
    .catch(err => console.error('Database initialization failed:', err));
}
