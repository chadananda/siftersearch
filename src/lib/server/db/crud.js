/**
 * Database CRUD Operations Module
 * 
 * Provides high-level CRUD operations for common entities.
 * This module builds on top of the core database layer and provides
 * convenience methods for working with users, documents, content blocks, etc.
 */

import { getWriteClient } from './core.js';
import { getReadClient } from './core.js';
import { Schemas } from '../../../../config/schema.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generic record creation with schema validation
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @param {Object} schema - Zod schema for validation
 * @returns {Promise<Object>} Created record
 */
export async function createRecord(table, data, schema) {
  try {
    // Create a copy of the data to avoid modifying the original
    const processedData = { ...data };
    
    // Ensure id exists
    if (!processedData.id) {
      processedData.id = uuidv4();
    }
    
    // Ensure timestamps are Date objects, not strings
    if (!processedData.created_at) {
      processedData.created_at = new Date();
    } else if (typeof processedData.created_at === 'string') {
      // Convert ISO string to Date object
      processedData.created_at = new Date(processedData.created_at);
    }
    
    if (!processedData.updated_at) {
      processedData.updated_at = processedData.created_at;
    } else if (typeof processedData.updated_at === 'string') {
      // Convert ISO string to Date object
      processedData.updated_at = new Date(processedData.updated_at);
    }
    
    // Validate data against schema after date conversion
    const validatedData = schema ? schema.parse(processedData) : processedData;
    
    // Convert any objects/arrays to JSON strings for database storage
    const preparedData = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        preparedData[key] = JSON.stringify(value);
      } else if (value instanceof Date) {
        // Store dates as ISO strings in the database
        preparedData[key] = value.toISOString();
      } else {
        preparedData[key] = value;
      }
    }
    
    // Generate placeholders and values
    const columns = Object.keys(preparedData);
    const placeholders = columns.map((_, index) => `?${index + 1}`).join(', ');
    const values = Object.values(preparedData);
    
    // Build and execute SQL query
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    const client = await getWriteClient();
    const result = await client.execute({
      sql,
      args: values
    });
    
    if (result.rowsAffected !== 1) {
      throw new Error(`Failed to create record in ${table}`);
    }
    
    return {
      ...validatedData,
      id: validatedData.id
    };
  } catch (error) {
    console.error(`Error creating record in ${table}:`, error);
    throw error;
  }
}

/**
 * Get a record by ID
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise<Object|null>} Record or null if not found
 */
export async function getRecordById(table, id) {
  try {
    const client = await getReadClient();
    const result = await client.execute({
      sql: `SELECT * FROM ${table} WHERE id = ?1`,
      args: [id]
    });
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Parse any JSON fields
    const record = result.rows[0];
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          record[key] = JSON.parse(value);
        } catch (e) {
          // Not valid JSON, leave as is
        }
      }
    }
    
    return record;
  } catch (error) {
    console.error(`Error getting record from ${table}:`, error);
    throw error;
  }
}

/**
 * Query records with optional filters
 * @param {string} table - Table name
 * @param {Object} filters - Filters to apply
 * @param {Object} options - Query options (limit, offset, orderBy)
 * @returns {Promise<Array>} Matching records
 */
export async function queryRecords(table, filters = {}, options = {}) {
  try {
    const client = await getReadClient();
    
    // Build WHERE clause
    let whereClause = '';
    const args = [];
    
    if (Object.keys(filters).length > 0) {
      const conditions = [];
      let paramIndex = 1;
      
      for (const [key, value] of Object.entries(filters)) {
        conditions.push(`${key} = ?${paramIndex}`);
        args.push(value);
        paramIndex++;
      }
      
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }
    
    // Build ORDER BY clause
    let orderByClause = '';
    if (options.orderBy) {
      orderByClause = `ORDER BY ${options.orderBy}`;
    }
    
    // Build LIMIT/OFFSET clause
    let limitClause = '';
    if (options.limit) {
      limitClause = `LIMIT ${options.limit}`;
      
      if (options.offset) {
        limitClause += ` OFFSET ${options.offset}`;
      }
    }
    
    // Execute query
    const sql = `SELECT * FROM ${table} ${whereClause} ${orderByClause} ${limitClause}`.trim();
    
    const result = await client.execute({
      sql,
      args
    });
    
    // Parse any JSON fields
    return result.rows.map(record => {
      for (const [key, value] of Object.entries(record)) {
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            record[key] = JSON.parse(value);
          } catch (e) {
            // Not valid JSON, leave as is
          }
        }
      }
      return record;
    });
  } catch (error) {
    console.error(`Error querying records from ${table}:`, error);
    throw error;
  }
}

/**
 * Update a record
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @param {Object} updates - Fields to update
 * @param {Object} schema - Zod schema for validation
 * @returns {Promise<Object>} Updated record
 */
export async function updateRecord(table, id, updates, schema) {
  try {
    // Get existing record
    const existingRecord = await getRecordById(table, id);
    
    if (!existingRecord) {
      throw new Error(`Record not found in ${table} with id ${id}`);
    }
    
    // Merge with existing record
    const mergedData = { ...existingRecord, ...updates };
    
    // Validate merged data
    const validatedData = schema ? schema.parse(mergedData) : mergedData;
    
    // Update timestamp
    validatedData.updated_at = new Date().toISOString();
    
    // Only update the fields that were provided
    const updateData = {};
    for (const key of Object.keys(updates)) {
      updateData[key] = validatedData[key];
    }
    
    // Always update updated_at
    updateData.updated_at = validatedData.updated_at;
    
    // Convert any objects/arrays to JSON strings
    const preparedData = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        preparedData[key] = JSON.stringify(value);
      } else {
        preparedData[key] = value;
      }
    }
    
    // Generate SET clause
    const setClause = Object.keys(preparedData)
      .map((key, index) => `${key} = ?${index + 1}`)
      .join(', ');
    
    const values = Object.values(preparedData);
    
    // Build and execute query
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?${values.length + 1}`;
    
    const client = await getWriteClient();
    await client.execute({
      sql,
      args: [...values, id]
    });
    
    // Return the updated record
    return getRecordById(table, id);
  } catch (error) {
    console.error(`Error updating record in ${table}:`, error);
    throw error;
  }
}

/**
 * Delete a record
 * @param {string} table - Table name
 * @param {string} id - Record ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteRecord(table, id) {
  try {
    const client = await getWriteClient();
    
    const result = await client.execute({
      sql: `DELETE FROM ${table} WHERE id = ?1`,
      args: [id]
    });
    
    return result.rowsAffected > 0;
  } catch (error) {
    console.error(`Error deleting record from ${table}:`, error);
    throw error;
  }
}

// ========== User Operations ==========

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(userData) {
  return createRecord('users', userData, Schemas.User);
}

/**
 * Get a user by ID
 * @param {string} id - User ID
 * @returns {Promise<Object|null>} User or null if not found
 */
export async function getUserById(id) {
  return getRecordById('users', id);
}

/**
 * Get a user by Clerk ID
 * @param {string} clerkId - Clerk user ID
 * @returns {Promise<Object|null>} User or null if not found
 */
export async function getUserByClerkId(clerkId) {
  console.log('=== GET USER BY CLERK ID DEBUG ===');
  console.log('Looking up user with clerk_id:', clerkId);
  
  try {
    const client = await getReadClient();
    console.log('Database client acquired successfully');
    
    // Check users table structure to verify column names
    console.log('Checking users table structure...');
    try {
      const tableInfo = await client.execute({
        sql: "PRAGMA table_info(users)"
      });
      console.log('Users table columns:', JSON.stringify(tableInfo.rows.map(r => r.name)));
    } catch (tableError) {
      console.error('Error checking table structure:', tableError);
    }
    
    // Check if user exists with this clerk_id
    console.log('Executing query with clerk_id:', clerkId);
    const result = await client.execute({
      sql: 'SELECT * FROM users WHERE clerk_id = ?1',
      args: [clerkId]
    });
    
    console.log('Query result rows:', result.rows.length);
    console.log('First row:', result.rows.length > 0 ? JSON.stringify(result.rows[0]) : 'No rows returned');
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      console.log('User found:', JSON.stringify(user));
      return user;
    }
    
    console.log('No user found with clerk_id:', clerkId);
    return null;
  } catch (error) {
    console.error('Error in getUserByClerkId:', error);
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
  return updateRecord('users', id, updates, Schemas.User);
}

/**
 * Delete a user
 * @param {string} id - User ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteUser(id) {
  return deleteRecord('users', id);
}

// ========== Document Operations ==========

/**
 * Create a new document
 * @param {Object} documentData - Document data
 * @returns {Promise<Object>} Created document
 */
export async function createDocument(documentData) {
  return createRecord('documents', documentData, Schemas.Document);
}

/**
 * Get a document by ID
 * @param {string} id - Document ID
 * @returns {Promise<Object|null>} Document or null if not found
 */
export async function getDocumentById(id) {
  return getRecordById('documents', id);
}

/**
 * Get documents by collection
 * @param {string} collectionId - Collection ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Documents in the collection
 */
export async function getDocumentsByCollection(collectionId, options = {}) {
  return queryRecords('documents', { collection_id: collectionId }, options);
}

/**
 * Update a document
 * @param {string} id - Document ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated document
 */
export async function updateDocument(id, updates) {
  return updateRecord('documents', id, updates, Schemas.Document);
}

/**
 * Delete a document
 * @param {string} id - Document ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteDocument(id) {
  return deleteRecord('documents', id);
}

// ========== Content Operations ==========

/**
 * Create new content
 * @param {Object} contentData - Content data
 * @returns {Promise<Object>} Created content
 */
export async function createContent(contentData) {
  return createRecord('content', contentData, Schemas.Content);
}

/**
 * Get content by ID
 * @param {string} id - Content ID
 * @returns {Promise<Object|null>} Content or null if not found
 */
export async function getContentById(id) {
  return getRecordById('content', id);
}

/**
 * Get content by document
 * @param {string} documentId - Document ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Content for the document
 */
export async function getContentByDocument(documentId, options = {}) {
  const defaultOptions = {
    orderBy: 'sequence ASC',
    ...options
  };
  
  return queryRecords('content', { document_id: documentId }, defaultOptions);
}

/**
 * Get unindexed content
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} Unindexed content
 */
export async function getUnindexedContent(limit = 100) {
  return queryRecords(
    'content',
    { indexed: 0, is_duplicate: 0 }, // Only get non-duplicate content
    { limit, orderBy: 'created_at ASC' }
  );
}

/**
 * Mark content as indexed
 * @param {string} id - Content ID
 * @returns {Promise<Object>} Updated content
 */
export async function markContentAsIndexed(id) {
  return updateRecord('content', id, { indexed: true }, Schemas.Content);
}

/**
 * Mark content as duplicate
 * @param {string} id - Content ID
 * @returns {Promise<Object>} Updated content
 */
export async function markContentAsDuplicate(id) {
  return updateRecord('content', id, { is_duplicate: true }, Schemas.Content);
}

/**
 * Update content
 * @param {string} id - Content ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated content
 */
export async function updateContent(id, updates) {
  return updateRecord('content', id, updates, Schemas.Content);
}

/**
 * Delete content
 * @param {string} id - Content ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteContent(id) {
  return deleteRecord('content', id);
}

// ========== Collection Operations ==========

/**
 * Create a new collection
 * @param {Object} collectionData - Collection data
 * @returns {Promise<Object>} Created collection
 */
export async function createCollection(collectionData) {
  return createRecord('collections', collectionData, Schemas.Collection);
}

/**
 * Get a collection by ID
 * @param {string} id - Collection ID
 * @returns {Promise<Object|null>} Collection or null if not found
 */
export async function getCollectionById(id) {
  return getRecordById('collections', id);
}

/**
 * Get collections by parent
 * @param {string} parentId - Parent collection ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Child collections
 */
export async function getCollectionsByParent(parentId, options = {}) {
  return queryRecords('collections', { parent_id: parentId }, options);
}

/**
 * Get root collections (no parent)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Root collections
 */
export async function getRootCollections(options = {}) {
  try {
    const client = await getReadClient();
    
    let limitClause = '';
    if (options.limit) {
      limitClause = `LIMIT ${options.limit}`;
      
      if (options.offset) {
        limitClause += ` OFFSET ${options.offset}`;
      }
    }
    
    let orderByClause = '';
    if (options.orderBy) {
      orderByClause = `ORDER BY ${options.orderBy}`;
    }
    
    const sql = `SELECT * FROM collections WHERE parent_id IS NULL ${orderByClause} ${limitClause}`.trim();
    
    const result = await client.execute({ sql });
    
    return result.rows;
  } catch (error) {
    console.error('Error getting root collections:', error);
    throw error;
  }
}

/**
 * Update a collection
 * @param {string} id - Collection ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated collection
 */
export async function updateCollection(id, updates) {
  return updateRecord('collections', id, updates, Schemas.Collection);
}

/**
 * Delete a collection
 * @param {string} id - Collection ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCollection(id) {
  return deleteRecord('collections', id);
}

// ========== Category Operations ==========

/**
 * Create a new category
 * @param {Object} categoryData - Category data
 * @returns {Promise<Object>} Created category
 */
export async function createCategory(categoryData) {
  return createRecord('categories', categoryData, Schemas.Category);
}

/**
 * Get a category by ID
 * @param {string} id - Category ID
 * @returns {Promise<Object|null>} Category or null if not found
 */
export async function getCategoryById(id) {
  return getRecordById('categories', id);
}

/**
 * Get categories by parent
 * @param {string} parentId - Parent category ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Child categories
 */
export async function getCategoriesByParent(parentId, options = {}) {
  return queryRecords('categories', { parent_id: parentId }, options);
}

/**
 * Get root categories (no parent)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Root categories
 */
export async function getRootCategories(options = {}) {
  try {
    const client = await getReadClient();
    
    let limitClause = '';
    if (options.limit) {
      limitClause = `LIMIT ${options.limit}`;
      
      if (options.offset) {
        limitClause += ` OFFSET ${options.offset}`;
      }
    }
    
    let orderByClause = '';
    if (options.orderBy) {
      orderByClause = `ORDER BY ${options.orderBy}`;
    }
    
    const sql = `SELECT * FROM categories WHERE parent_id IS NULL ${orderByClause} ${limitClause}`.trim();
    
    const result = await client.execute({ sql });
    
    return result.rows;
  } catch (error) {
    console.error('Error getting root categories:', error);
    throw error;
  }
}

/**
 * Update a category
 * @param {string} id - Category ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated category
 */
export async function updateCategory(id, updates) {
  return updateRecord('categories', id, updates, Schemas.Category);
}

/**
 * Delete a category
 * @param {string} id - Category ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCategory(id) {
  return deleteRecord('categories', id);
}

// ========== Author Operations ==========

/**
 * Create a new author
 * @param {Object} authorData - Author data
 * @returns {Promise<Object>} Created author
 */
export async function createAuthor(authorData) {
  return createRecord('authors', authorData, Schemas.Author);
}

/**
 * Get an author by ID
 * @param {string} id - Author ID
 * @returns {Promise<Object|null>} Author or null if not found
 */
export async function getAuthorById(id) {
  return getRecordById('authors', id);
}

/**
 * Update an author
 * @param {string} id - Author ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated author
 */
export async function updateAuthor(id, updates) {
  return updateRecord('authors', id, updates, Schemas.Author);
}

/**
 * Delete an author
 * @param {string} id - Author ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteAuthor(id) {
  return deleteRecord('authors', id);
}

// ========== Document Relationship Operations ==========

/**
 * Add a category to a document
 * @param {string} documentId - Document ID
 * @param {string} categoryId - Category ID
 * @returns {Promise<Object>} Created relationship
 */
export async function addCategoryToDocument(documentId, categoryId) {
  try {
    const client = await getWriteClient();
    
    // Check if relationship already exists
    const existingResult = await client.execute({
      sql: 'SELECT * FROM document_categories WHERE document_id = ?1 AND category_id = ?2',
      args: [documentId, categoryId]
    });
    
    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }
    
    // Create relationship
    const now = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO document_categories (document_id, category_id, created_at) VALUES (?1, ?2, ?3)',
      args: [documentId, categoryId, now]
    });
    
    return {
      document_id: documentId,
      category_id: categoryId,
      created_at: now
    };
  } catch (error) {
    console.error('Error adding category to document:', error);
    throw error;
  }
}

/**
 * Remove a category from a document
 * @param {string} documentId - Document ID
 * @param {string} categoryId - Category ID
 * @returns {Promise<boolean>} Success status
 */
export async function removeCategoryFromDocument(documentId, categoryId) {
  try {
    const client = await getWriteClient();
    
    const result = await client.execute({
      sql: 'DELETE FROM document_categories WHERE document_id = ?1 AND category_id = ?2',
      args: [documentId, categoryId]
    });
    
    return result.rowsAffected > 0;
  } catch (error) {
    console.error('Error removing category from document:', error);
    throw error;
  }
}

/**
 * Get categories for a document
 * @param {string} documentId - Document ID
 * @returns {Promise<Array>} Categories
 */
export async function getCategoriesForDocument(documentId) {
  try {
    const client = await getReadClient();
    
    const result = await client.execute({
      sql: `
        SELECT c.* 
        FROM categories c
        JOIN document_categories dc ON c.id = dc.category_id
        WHERE dc.document_id = ?1
        ORDER BY c.name
      `,
      args: [documentId]
    });
    
    return result.rows;
  } catch (error) {
    console.error('Error getting categories for document:', error);
    throw error;
  }
}

/**
 * Add an author to a document
 * @param {string} documentId - Document ID
 * @param {string} authorId - Author ID
 * @returns {Promise<Object>} Created relationship
 */
export async function addAuthorToDocument(documentId, authorId) {
  try {
    const client = await getWriteClient();
    
    // Check if relationship already exists
    const existingResult = await client.execute({
      sql: 'SELECT * FROM document_authors WHERE document_id = ?1 AND author_id = ?2',
      args: [documentId, authorId]
    });
    
    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }
    
    // Create relationship
    const now = new Date().toISOString();
    await client.execute({
      sql: 'INSERT INTO document_authors (document_id, author_id, created_at) VALUES (?1, ?2, ?3)',
      args: [documentId, authorId, now]
    });
    
    return {
      document_id: documentId,
      author_id: authorId,
      created_at: now
    };
  } catch (error) {
    console.error('Error adding author to document:', error);
    throw error;
  }
}

/**
 * Remove an author from a document
 * @param {string} documentId - Document ID
 * @param {string} authorId - Author ID
 * @returns {Promise<boolean>} Success status
 */
export async function removeAuthorFromDocument(documentId, authorId) {
  try {
    const client = await getWriteClient();
    
    const result = await client.execute({
      sql: 'DELETE FROM document_authors WHERE document_id = ?1 AND author_id = ?2',
      args: [documentId, authorId]
    });
    
    return result.rowsAffected > 0;
  } catch (error) {
    console.error('Error removing author from document:', error);
    throw error;
  }
}

/**
 * Get authors for a document
 * @param {string} documentId - Document ID
 * @returns {Promise<Array>} Authors
 */
export async function getAuthorsForDocument(documentId) {
  try {
    const client = await getReadClient();
    
    const result = await client.execute({
      sql: `
        SELECT a.* 
        FROM authors a
        JOIN document_authors da ON a.id = da.author_id
        WHERE da.document_id = ?1
        ORDER BY a.name
      `,
      args: [documentId]
    });
    
    return result.rows;
  } catch (error) {
    console.error('Error getting authors for document:', error);
    throw error;
  }
}
