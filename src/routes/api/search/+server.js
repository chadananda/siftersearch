// src/routes/api/search/+server.js
import { json } from '@sveltejs/kit';
import manticore from '$lib/server/db/manticore.js';
import db from '$lib/server/db/index.js';
import { PUBLIC } from '../../../../config/config.js';

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search content
 *     description: Search for content using Manticore Search
 *     tags:
 *       - Search
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: document_id
 *         schema:
 *           type: string
 *         description: Filter by document ID
 *       - in: query
 *         name: collection_id
 *         schema:
 *           type: string
 *         description: Filter by collection ID
 *       - in: query
 *         name: block_type
 *         schema:
 *           type: string
 *         description: Filter by block type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ url, request }) {
  try {
    // Get query parameters
    const query = url.searchParams.get('q');
    const documentId = url.searchParams.get('document_id');
    const collectionId = url.searchParams.get('collection_id');
    const blockType = url.searchParams.get('block_type');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Validate query
    if (!query) {
      return json({ error: 'Search query is required' }, { status: 400 });
    }
    
    // Build filters
    const filters = {};
    if (documentId) {
      filters.document_id = documentId;
    }
    if (collectionId) {
      filters.collection_id = collectionId;
    }
    if (blockType) {
      filters.block_type = blockType;
    }
    
    // Search options
    const options = {
      limit,
      offset
    };
    
    // Log search for analytics
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Create search log entry
    await db.createRecord('search_logs', {
      query,
      filters: JSON.stringify(filters),
      results_count: 0, // Will update after search
      ip_address: clientIp,
      user_agent: userAgent,
      created_at: new Date().toISOString()
    });
    
    let results = [];
    
    // In development mode, we might not have Manticore running
    if (PUBLIC.IS_DEV && !PUBLIC.MANTICORE_ENABLED) {
      // Fallback to simple SQLite search
      results = await fallbackSearch(query, filters, options);
    } else {
      // Use Manticore for search
      results = await manticore.searchContent(query, filters, options);
    }
    
    // Get document details for each result
    const enrichedResults = await enrichSearchResults(results);
    
    // Update search log with result count
    // Note: In a production system, you might want to do this asynchronously
    
    return json({
      query,
      results: enrichedResults,
      total: enrichedResults.length,
      limit,
      offset
    });
  } catch (err) {
    console.error('Error searching content:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * Fallback search using SQLite for development
 * @param {string} query - Search query
 * @param {Object} filters - Filters
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
async function fallbackSearch(query, filters, options) {
  try {
    const client = await db.getClient();
    
    // Build WHERE clause
    let whereConditions = ["block LIKE ?1 OR context LIKE ?1"];
    const args = [`%${query}%`];
    let argIndex = 2;
    
    for (const [key, value] of Object.entries(filters)) {
      whereConditions.push(`${key} = ?${argIndex}`);
      args.push(value);
      argIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Build query
    const sql = `
      SELECT * FROM content
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN block LIKE ?${argIndex} THEN 1
          WHEN context LIKE ?${argIndex} THEN 2
          ELSE 3
        END,
        sequence ASC
      LIMIT ?${argIndex + 1} OFFSET ?${argIndex + 2}
    `;
    
    // Add exact match parameter
    args.push(`%${query}%`);
    args.push(options.limit || 20);
    args.push(options.offset || 0);
    
    // Execute query
    const result = await client.execute({
      sql,
      args
    });
    
    // Format results to match Manticore format
    return result.rows.map(row => ({
      ...row,
      score: 1.0 // Placeholder score
    }));
  } catch (error) {
    console.error('Error in fallback search:', error);
    return [];
  }
}

/**
 * Enrich search results with document details
 * @param {Array} results - Search results
 * @returns {Promise<Array>} Enriched results
 */
async function enrichSearchResults(results) {
  if (!results || results.length === 0) {
    return [];
  }
  
  // Get unique document IDs
  const documentIds = [...new Set(results.map(result => result.document_id))];
  
  // Get document details
  const documents = {};
  for (const docId of documentIds) {
    const doc = await db.getDocumentById(docId);
    if (doc) {
      documents[docId] = doc;
    }
  }
  
  // Enrich results
  return results.map(result => ({
    ...result,
    document: documents[result.document_id] || null
  }));
}

/**
 * @swagger
 * /api/search/index:
 *   post:
 *     summary: Manually trigger content indexing
 *     description: Triggers indexing of unindexed content
 *     tags:
 *       - Search
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit:
 *                 type: integer
 *                 default: 100
 *                 description: Maximum number of items to index
 *     responses:
 *       200:
 *         description: Indexing triggered successfully
 *       500:
 *         description: Internal Server Error
 */
export async function POST({ request }) {
  try {
    const { limit = 100 } = await request.json().catch(() => ({}));
    
    // In development mode, we might not have Manticore running
    if (PUBLIC.IS_DEV && !PUBLIC.MANTICORE_ENABLED) {
      return json({ 
        message: 'Indexing skipped in development mode without Manticore',
        indexed: 0
      });
    }
    
    // Process unindexed content
    const indexed = await manticore.processUnindexedContent(limit);
    
    return json({
      message: `Indexed ${indexed} content blocks`,
      indexed
    });
  } catch (err) {
    console.error('Error triggering indexing:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
