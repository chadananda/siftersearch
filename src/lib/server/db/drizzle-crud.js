/**
 * Drizzle CRUD Operations Module
 * 
 * Provides high-level CRUD operations using Drizzle ORM.
 * This module provides type-safe database operations for common entities.
 */

import { v4 as uuidv4 } from 'uuid';
import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm';
import { getDrizzleReadClient, getDrizzleWriteClient } from './drizzle-client.js';
import * as schema from '../../../../config/drizzle.js';

// Debug flag
const DEBUG_MODE = process.env.NODE_ENV === 'development';

/**
 * Log a message if debug mode is enabled
 * @param {string} message - Message to log
 */
function log(message) {
  if (DEBUG_MODE) {
    console.log(`[Drizzle] ${message}`);
  }
}

// ========== User Operations ==========

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(userData) {
  try {
    const db = getDrizzleWriteClient();
    
    log(`Creating user: ${JSON.stringify(userData)}`);
    
    // Generate ID if not provided
    const id = userData.id || uuidv4();
    
    // Set default timestamps if not provided
    const now = new Date().toISOString();
    const created_at = userData.created_at || now;
    const updated_at = userData.updated_at || now;
    
    // Create user object
    const user = {
      id,
      clerk_id: userData.clerk_id || `manual-${Date.now()}`, // Generate a placeholder for manually created users
      email: userData.email,
      name: userData.name,
      role: userData.role || 'visitor',
      active: userData.active !== undefined ? userData.active : true,
      created_at,
      updated_at
    };
    
    // Insert user
    await db.insert(schema.users).values(user);
    
    return user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

/**
 * Get a user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object|null>} User or null if not found
 */
export async function getUserById(id) {
  try {
    const db = getDrizzleReadClient();
    
    log(`Getting user by ID: ${id}`);
    
    const results = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error getting user by ID:', error);
    throw error;
  }
}

/**
 * Get a user by Clerk ID
 * @param {string} clerkId - Clerk user ID
 * @returns {Promise<Object|null>} User or null if not found
 */
export async function getUserByClerkId(clerkId) {
  try {
    const db = getDrizzleReadClient();
    
    log(`Getting user by Clerk ID: ${clerkId}`);
    
    const results = await db.select().from(schema.users).where(eq(schema.users.clerk_id, clerkId)).limit(1);
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error getting user by Clerk ID:', error);
    throw error;
  }
}

/**
 * Get a user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User or null if not found
 */
export async function getUserByEmail(email) {
  try {
    const db = getDrizzleReadClient();
    
    log(`Getting user by email: ${email}`);
    
    const results = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
}

/**
 * Update a user
 * @param {string} id - User ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated user
 */
export async function updateUser(id, updates) {
  try {
    const db = getDrizzleWriteClient();
    
    // Add updated_at timestamp
    const updatedData = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    log(`Updating user: ${id}`);
    
    // Update the user
    await db.update(schema.users)
      .set(updatedData)
      .where(eq(schema.users.id, id));
    
    // Get the updated user
    return getUserById(id);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Delete a user
 * @param {string} id - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteUser(id) {
  try {
    const db = getDrizzleWriteClient();
    
    log(`Deleting user: ${id}`);
    
    // Delete the user
    await db.delete(schema.users).where(eq(schema.users.id, id));
    
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}

/**
 * Get users with filtering
 * @param {Object} options - Query options
 * @param {string} options.search - Search term for email or name
 * @param {string} options.role - Filter by role
 * @returns {Promise<Object>} Object containing users array and total count
 */
export async function getUsers(options = {}) {
  try {
    const db = getDrizzleReadClient();
    const { search = '', role = '' } = options;
    
    log(`Getting users with options: ${JSON.stringify(options)}`);
    
    // Get total count of all users (unfiltered)
    const totalCountQuery = db.select({ count: sql`count(*)` }).from(schema.users);
    const totalCountResult = await totalCountQuery;
    const totalCount = parseInt(totalCountResult[0]?.count || '0', 10);
    
    log(`Total user count: ${totalCount}`);
    
    // Build query for filtered users
    let query = db.select().from(schema.users);
    
    // Apply filters
    if (search) {
      query = query.where(
        or(
          like(schema.users.email, `%${search}%`),
          like(schema.users.name, `%${search}%`)
        )
      );
    }
    
    if (role) {
      query = query.where(eq(schema.users.role, role));
    }
    
    // Apply ordering
    query = query.orderBy(desc(schema.users.created_at));
    
    const users = await query;
    log(`Found ${users.length} users matching filters`);
    
    return {
      users,
      totalCount
    };
  } catch (error) {
    console.error('Error getting users:', error);
    throw error;
  }
}

/**
 * Get total count of users with filtering
 * @param {Object} options - Query options
 * @param {string} options.search - Search term for email or name
 * @param {string} options.role - Filter by role
 * @returns {Promise<number>} Total count
 */
export async function getUsersCount(options = {}) {
  try {
    const db = getDrizzleReadClient();
    const { search = '', role = '' } = options;
    
    // Build query
    let query = db.select({ count: sql`count(*)` }).from(schema.users);
    
    // Apply filters
    if (search) {
      query = query.where(
        or(
          like(schema.users.email, `%${search}%`),
          like(schema.users.name, `%${search}%`)
        )
      );
    }
    
    if (role) {
      query = query.where(eq(schema.users.role, role));
    }
    
    const result = await query;
    return result[0].count;
  } catch (error) {
    console.error('Error getting users count:', error);
    throw error;
  }
}

// ========== Document Operations ==========

/**
 * Create a new document
 * @param {Object} documentData - Document data
 * @returns {Promise<Object>} Created document
 */
export async function createDocument(documentData) {
  try {
    const db = getDrizzleWriteClient();
    
    // Ensure ID exists
    const document = {
      ...documentData,
      id: documentData.id || uuidv4(),
      created_at: documentData.created_at || new Date().toISOString(),
      updated_at: documentData.updated_at || new Date().toISOString()
    };
    
    log(`Creating document: ${document.title}`);
    
    // Insert the document
    await db.insert(schema.documents).values(document);
    
    // Return the created document
    return document;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
}

/**
 * Get a document by ID
 * @param {string} id - Document ID
 * @returns {Promise<Object|null>} Document or null if not found
 */
export async function getDocumentById(id) {
  try {
    const db = getDrizzleReadClient();
    
    log(`Getting document by ID: ${id}`);
    
    const results = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1);
    
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error getting document by ID:', error);
    throw error;
  }
}

/**
 * Get documents by collection
 * @param {string} collectionId - Collection ID
 * @param {Object} options - Query options (limit, offset, orderBy)
 * @returns {Promise<Array>} Documents in the collection
 */
export async function getDocumentsByCollection(collectionId, options = {}) {
  try {
    const db = getDrizzleReadClient();
    const { limit = 100, offset = 0, orderBy = 'updated_at', order = 'desc' } = options;
    
    log(`Getting documents by collection: ${collectionId}`);
    
    let query = db.select().from(schema.documents).where(eq(schema.documents.collection_id, collectionId));
    
    // Apply ordering
    if (order === 'desc') {
      query = query.orderBy(desc(schema.documents[orderBy]));
    } else {
      query = query.orderBy(asc(schema.documents[orderBy]));
    }
    
    // Apply pagination
    query = query.limit(limit).offset(offset);
    
    return await query;
  } catch (error) {
    console.error('Error getting documents by collection:', error);
    throw error;
  }
}

/**
 * Update a document
 * @param {string} id - Document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated document
 */
export async function updateDocument(id, updates) {
  try {
    const db = getDrizzleWriteClient();
    
    // Add updated_at timestamp
    const updatedData = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    log(`Updating document: ${id}`);
    
    // Update the document
    await db.update(schema.documents)
      .set(updatedData)
      .where(eq(schema.documents.id, id));
    
    // Get the updated document
    return getDocumentById(id);
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
}

/**
 * Delete a document
 * @param {string} id - Document ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteDocument(id) {
  try {
    const db = getDrizzleWriteClient();
    
    log(`Deleting document: ${id}`);
    
    // Delete the document
    await db.delete(schema.documents).where(eq(schema.documents.id, id));
    
    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

// Export all functions
export default {
  // User operations
  createUser,
  getUserById,
  getUserByClerkId,
  getUserByEmail,
  updateUser,
  deleteUser,
  getUsers,
  getUsersCount,
  
  // Document operations
  createDocument,
  getDocumentById,
  getDocumentsByCollection,
  updateDocument,
  deleteDocument
};
