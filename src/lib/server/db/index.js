/**
 * Database Module Index
 * 
 * This module consolidates all database-related functionality and exports
 * a unified interface for interacting with the database.
 */

import * as core from './core.js';
import * as crud from './crud.js';
import manticore from './manticore.js';
import drizzleCrud from './drizzle-crud.js';
import { syncSchema } from './sync-schema.js';
import { PUBLIC, SECRETS } from '../../../../config/config.js';

// Track initialization state
let isInitialized = false;

/**
 * Initialize the database system
 * @returns {Promise<boolean>} Success status
 */
export async function initialize() {
  if (isInitialized) {
    return true;
  }
  
  try {
    // Initialize database schema
    await core.initializeSchema();
    
    // Validate schema
    await core.validateSchema();
    
    // Synchronize Drizzle schema
    await syncSchema();
    
    // Start sync process if in production
    if (!PUBLIC.IS_DEV) {
      await core.startSync();
    }
    
    // Initialize Manticore if enabled
    try {
      if (PUBLIC.MANTICORE_ENABLED === 'true') {
        console.log('Initializing Manticore with host:', PUBLIC.MANTICORE_HOST || 'localhost');
        console.log('Manticore HTTP port:', PUBLIC.MANTICORE_HTTP_PORT || '9308');
        
        await manticore.initializeManticoreIndex();
        await manticore.startIndexing();
        console.log('Manticore search initialized successfully');
      } else {
        console.log('Manticore search is disabled in configuration');
      }
    } catch (manticoreError) {
      console.error('Error initializing Manticore (continuing without search):', manticoreError);
      // Don't fail the entire initialization if Manticore fails
    }
    
    isInitialized = true;
    console.log('Database system initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database system:', error);
    return false;
  }
}

/**
 * Shutdown the database system
 * @returns {Promise<boolean>} Success status
 */
export async function shutdown() {
  if (!isInitialized) {
    return true;
  }
  
  try {
    // Stop sync process
    await core.stopSync();
    
    // Stop Manticore indexing if enabled
    if (PUBLIC.MANTICORE_ENABLED === 'true' && PUBLIC.MANTICORE_HOST) {
      manticore.stopIndexing();
    }
    
    isInitialized = false;
    console.log('Database system shut down successfully');
    return true;
  } catch (error) {
    console.error('Error shutting down database system:', error);
    return false;
  }
}

// Export all database functions
export default {
  // Core functions
  initialize,
  shutdown,
  getClient: core.getClient,
  getReadClient: core.getReadClient,
  getWriteClient: core.getWriteClient,
  executeQuery: core.executeQuery,
  
  // Generic CRUD operations
  createRecord: crud.createRecord,
  getRecordById: crud.getRecordById,
  queryRecords: crud.queryRecords,
  updateRecord: crud.updateRecord,
  deleteRecord: crud.deleteRecord,
  
  // User operations (Drizzle)
  createUser: drizzleCrud.createUser,
  getUserById: drizzleCrud.getUserById,
  getUserByClerkId: drizzleCrud.getUserByClerkId,
  getUserByEmail: drizzleCrud.getUserByEmail,
  updateUser: drizzleCrud.updateUser,
  deleteUser: drizzleCrud.deleteUser,
  
  // Document operations (Drizzle)
  createDocument: drizzleCrud.createDocument,
  getDocumentById: drizzleCrud.getDocumentById,
  getDocumentsByCollection: drizzleCrud.getDocumentsByCollection,
  updateDocument: drizzleCrud.updateDocument,
  deleteDocument: drizzleCrud.deleteDocument,
  
  // Content operations
  createContent: crud.createContent,
  getContentById: crud.getContentById,
  getContentByDocument: crud.getContentByDocument,
  getUnindexedContent: crud.getUnindexedContent,
  markContentAsIndexed: crud.markContentAsIndexed,
  markContentAsDuplicate: crud.markContentAsDuplicate,
  updateContent: crud.updateContent,
  deleteContent: crud.deleteContent,
  
  // Collection operations
  createCollection: crud.createCollection,
  getCollectionById: crud.getCollectionById,
  getCollectionsByParent: crud.getCollectionsByParent,
  getRootCollections: crud.getRootCollections,
  updateCollection: crud.updateCollection,
  deleteCollection: crud.deleteCollection,
  
  // Category operations
  createCategory: crud.createCategory,
  getCategoryById: crud.getCategoryById,
  getCategoriesByParent: crud.getCategoriesByParent,
  getRootCategories: crud.getRootCategories,
  updateCategory: crud.updateCategory,
  deleteCategory: crud.deleteCategory,
  
  // Author operations
  createAuthor: crud.createAuthor,
  getAuthorById: crud.getAuthorById,
  updateAuthor: crud.updateAuthor,
  deleteAuthor: crud.deleteAuthor,
  
  // Document relationship operations
  addCategoryToDocument: crud.addCategoryToDocument,
  removeCategoryFromDocument: crud.removeCategoryFromDocument,
  getCategoriesForDocument: crud.getCategoriesForDocument,
  addAuthorToDocument: crud.addAuthorToDocument,
  removeAuthorFromDocument: crud.removeAuthorFromDocument,
  getAuthorsForDocument: crud.getAuthorsForDocument,
  
  // Manticore search operations
  searchContent: manticore.searchContent,
  processUnindexedContent: manticore.processUnindexedContent,
  
  // Events
  dbEvents: core.dbEvents
};
