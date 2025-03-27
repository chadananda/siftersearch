/**
 * Manticore Search Integration Module
 * 
 * This module handles the integration with Manticore Search for indexing
 * and searching content. It subscribes to database change events
 * and indexes content as they are created or updated.
 */

import * as Manticoresearch from 'manticoresearch';
import { dbEvents } from './core.js';
import { PUBLIC } from '../../../../config/config.js';
import { getUnindexedContent, markContentAsIndexed, getDocumentById } from './crud.js';

// Manticore client instance
let manticoreClient = null;
let indexApi = null;
let searchApi = null;

/**
 * Get the Manticore client
 * @returns {Object} Manticore client and APIs
 */
export function getManticoreClient() {
  try {
    if (!manticoreClient) {
      manticoreClient = new Manticoresearch.ApiClient();
      
      // Use PUBLIC environment variables for Manticore configuration
      const host = PUBLIC.MANTICORE_HOST || 'localhost';
      const port = PUBLIC.MANTICORE_HTTP_PORT || 9308;
      
      manticoreClient.basePath = `http://${host}:${port}`;
      console.log(`Initializing Manticore client with basePath: ${manticoreClient.basePath}`);
      
      // Initialize API instances
      indexApi = new Manticoresearch.IndexApi(manticoreClient);
      searchApi = new Manticoresearch.SearchApi(manticoreClient);
    }
    
    return {
      client: manticoreClient,
      indexApi,
      searchApi
    };
  } catch (error) {
    console.error('Error initializing Manticore client:', error);
    throw new Error('Failed to initialize Manticore client');
  }
}

/**
 * Initialize Manticore index
 * @returns {Promise<boolean>} Success status
 */
export async function initializeManticoreIndex() {
  try {
    const { client } = getManticoreClient();
    
    // Check if index exists
    const indexExists = await checkIndexExists('content');
    
    if (!indexExists) {
      // Create the index using SQL API since the IndexAPI doesn't have a direct createIndex method
      const utilsApi = new Manticoresearch.UtilsApi(client);
      const createTableQuery = `
        CREATE TABLE content (
          id TEXT,
          document_id TEXT,
          block TEXT,
          block_type TEXT,
          context TEXT,
          pdf_page INTEGER,
          book_page TEXT,
          sequence INTEGER,
          created_at TEXT,
          document_title TEXT,
          collection_id TEXT
        ) min_infix_len='2' rt_mem_limit='256M'
      `;
      
      await utilsApi.sql({ query: createTableQuery });
      console.log('Manticore index created: content');
    } else {
      console.log('Manticore index already exists: content');
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing Manticore index:', error);
    return false;
  }
}

/**
 * Check if an index exists in Manticore
 * @param {string} indexName - Name of the index
 * @returns {Promise<boolean>} Whether the index exists
 */
async function checkIndexExists(indexName) {
  try {
    const { client } = getManticoreClient();
    const utilsApi = new Manticoresearch.UtilsApi(client);
    
    // Use SQL to check if table exists
    const response = await utilsApi.sql({ query: 'SHOW TABLES' });
    
    if (response && response.data) {
      return response.data.some(table => table.Index === indexName);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if index exists:', error);
    return false;
  }
}

/**
 * Index content in Manticore
 * @param {Object} content - Content to index
 * @returns {Promise<boolean>} Success status
 */
export async function indexContent(content) {
  try {
    const { indexApi } = getManticoreClient();
    
    // Get document metadata for additional context
    const document = await getDocumentById(content.document_id);
    
    // Prepare document for indexing
    const indexDoc = {
      index: 'content',
      id: content.id,
      doc: {
        document_id: content.document_id,
        block: content.block,
        block_type: content.block_type,
        context: content.context || '',
        pdf_page: content.pdf_page || 0,
        book_page: content.book_page || '',
        sequence: content.sequence || 0,
        created_at: content.created_at,
        // Add document metadata for better search context
        document_title: document ? document.title : '',
        collection_id: document ? document.collection_id : ''
      }
    };
    
    // Index the document
    await indexApi.replace(indexDoc);
    
    // Mark as indexed in the database
    await markContentAsIndexed(content.id);
    
    console.log(`Indexed content: ${content.id}`);
    return true;
  } catch (error) {
    console.error('Error indexing content:', error);
    return false;
  }
}

/**
 * Process unindexed content
 * @param {number} batchSize - Number of content to process at once
 * @returns {Promise<number>} Number of content indexed
 */
export async function processUnindexedContent(batchSize = 50) {
  try {
    // Get unindexed content
    const blocks = await getUnindexedContent(batchSize);
    
    if (blocks.length === 0) {
      return 0;
    }
    
    // Index each content
    let indexedCount = 0;
    for (const block of blocks) {
      const success = await indexContent(block);
      if (success) {
        indexedCount++;
      }
    }
    
    console.log(`Indexed ${indexedCount} content`);
    return indexedCount;
  } catch (error) {
    console.error('Error processing unindexed content:', error);
    return 0;
  }
}

/**
 * Search content
 * @param {string} query - Search query
 * @param {Object} filters - Search filters
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
export async function searchContent(query, filters = {}, options = {}) {
  try {
    const { searchApi } = getManticoreClient();
    const { limit = 20, offset = 0 } = options;
    
    // Create search request
    const searchRequest = new Manticoresearch.SearchRequest();
    searchRequest.index = 'content';
    
    // Create search query
    const searchQuery = new Manticoresearch.SearchQuery();
    searchQuery.query_string = query;
    searchRequest.query = searchQuery;
    
    // Add limit and offset
    searchRequest.limit = limit;
    searchRequest.offset = offset;
    
    // Add filters if provided
    if (Object.keys(filters).length > 0) {
      const boolFilter = new Manticoresearch.BoolFilter();
      boolFilter.must = [];
      
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null) {
          const filter = new Manticoresearch.QueryFilter();
          filter.equals = {};
          filter.equals[key] = value;
          boolFilter.must.push(filter);
        }
      }
      
      if (boolFilter.must.length > 0) {
        searchRequest.filter = boolFilter;
      }
    }
    
    // Execute search
    const response = await searchApi.search(searchRequest);
    
    return response.hits.hits.map(hit => ({
      ...hit._source,
      score: hit._score
    }));
  } catch (error) {
    console.error('Error searching content:', error);
    return [];
  }
}

// Subscribe to database events for indexing
dbEvents.on('index', async (content) => {
  if (!PUBLIC.IS_DEV) {
    await indexContent(content);
  } else {
    console.log('Development mode: Skipping indexing for content', content.id);
  }
});

// Initialize Manticore and start processing unindexed blocks
let indexingInterval = null;

/**
 * Start the indexing process
 * @param {number} intervalMinutes - Interval in minutes
 * @returns {Promise<boolean>} Success status
 */
export async function startIndexing(intervalMinutes = 5) {
  try {
    // Initialize Manticore index
    await initializeManticoreIndex();
    
    // Process any existing unindexed content
    await processUnindexedContent(100);
    
    // Set up interval for processing unindexed content
    if (indexingInterval) {
      clearInterval(indexingInterval);
    }
    
    indexingInterval = setInterval(async () => {
      await processUnindexedContent(50);
    }, intervalMinutes * 60 * 1000);
    
    console.log(`Manticore indexing started with interval of ${intervalMinutes} minutes`);
    return true;
  } catch (error) {
    console.error('Error starting Manticore indexing:', error);
    return false;
  }
}

/**
 * Stop the indexing process
 * @returns {boolean} Success status
 */
export function stopIndexing() {
  if (indexingInterval) {
    clearInterval(indexingInterval);
    indexingInterval = null;
    console.log('Manticore indexing stopped');
    return true;
  }
  return false;
}

// Export all functions
export default {
  getManticoreClient,
  initializeManticoreIndex,
  indexContent,
  processUnindexedContent,
  searchContent,
  startIndexing,
  stopIndexing
};
