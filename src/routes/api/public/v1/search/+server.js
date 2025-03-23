// src/routes/api/public/v1/search/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateApiKey, logSearch, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * components:
 *   schemas:
 *     SearchResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the document
 *         title:
 *           type: string
 *           description: Document title
 *         content_snippet:
 *           type: string
 *           description: Snippet of content containing the search match
 *         score:
 *           type: number
 *           description: Relevance score
 *         metadata:
 *           type: object
 *           description: Additional metadata about the document
 *         embedding:
 *           type: array
 *           items:
 *             type: number
 *           description: Vector embedding (only returned if requested)
 *     AdvancedSearchRequest:
 *       type: object
 *       properties:
 *         query:
 *           type: string
 *           description: Text query for search
 *         vector:
 *           type: array
 *           items:
 *             type: number
 *           description: Vector embedding for semantic search
 *         filters:
 *           type: object
 *           description: Metadata filters to apply
 *         limit:
 *           type: integer
 *           default: 10
 *           description: Maximum number of results to return
 *         offset:
 *           type: integer
 *           default: 0
 *           description: Number of results to skip
 *         collection:
 *           type: string
 *           description: Specific collection to search within
 *         includeEmbeddings:
 *           type: boolean
 *           default: false
 *           description: Whether to include vector embeddings in results
 */

/**
 * @swagger
 * /public/v1/search:
 *   get:
 *     summary: Simple search for documents
 *     description: Performs a basic search across documents using the provided query
 *     tags:
 *       - Public API
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *       - in: query
 *         name: collection
 *         schema:
 *           type: string
 *         description: Specific collection to search within
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SearchResult'
 *                 total:
 *                   type: integer
 *                   description: Total number of matching results
 *                 query:
 *                   type: string
 *                   description: The original search query
 *                 took_ms:
 *                   type: integer
 *                   description: Time taken to execute the search in milliseconds
 *       400:
 *         description: Bad request - missing query parameter
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *       500:
 *         description: Internal Server Error
 *   post:
 *     summary: Advanced search for documents
 *     description: Performs advanced search with vector similarity and filtering
 *     tags:
 *       - Public API
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdvancedSearchRequest'
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SearchResult'
 *                 total:
 *                   type: integer
 *                   description: Total number of matching results
 *                 took_ms:
 *                   type: integer
 *                   description: Time taken to execute the search in milliseconds
 *       400:
 *         description: Bad request - invalid search parameters
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *       500:
 *         description: Internal Server Error
 */

// GET handler for simple text search
export async function GET({ url, request }) {
  const startTime = Date.now();
  
  try {
    // Get API key from header
    const apiKey = request.headers.get('x-api-key');
    
    // Authenticate API key
    const keyData = await authenticateApiKey(apiKey);
    
    // Get search parameters
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const collection = url.searchParams.get('collection');
    
    if (!query) {
      return json({ error: 'Search query is required' }, { status: 400 });
    }
    
    // Get database connections
    const db = getDatabaseClients();
    
    // Log the search query
    await logSearch(db, {
      query,
      apiKeyId: keyData.id,
      siteId: keyData.site_id,
      userId: keyData.user_id,
      searchType: 'basic'
    });
    
    // Determine which database to search based on collection
    let searchDb = collection ? db.getCollectionDb(collection) : db.library;
    let searchTable = 'documents';
    
    // Perform the search
    // For a RAG system, we would typically use vector search
    // This is a simplified implementation for demonstration
    const searchResult = await searchDb.execute({
      sql: `
        SELECT 
          id, 
          title, 
          substr(content, 1, 200) as content_snippet, 
          json_extract(metadata, '$') as metadata,
          1.0 as score
        FROM ${searchTable}
        WHERE 
          title LIKE ? OR 
          content LIKE ?
        ORDER BY score DESC
        LIMIT ? OFFSET ?
      `,
      args: [`%${query}%`, `%${query}%`, limit, offset]
    });
    
    // Get total count for pagination
    const countResult = await searchDb.execute({
      sql: `
        SELECT COUNT(*) as total
        FROM ${searchTable}
        WHERE 
          title LIKE ? OR 
          content LIKE ?
      `,
      args: [`%${query}%`, `%${query}%`]
    });
    
    const total = countResult.rows[0].total;
    const took_ms = Date.now() - startTime;
    
    // Format the results
    const results = searchResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      content_snippet: row.content_snippet,
      score: row.score,
      metadata: JSON.parse(row.metadata || '{}')
    }));
    
    return json({
      results,
      total,
      query,
      took_ms
    });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

// POST handler for advanced search with vector similarity and filtering
export async function POST({ request }) {
  const startTime = Date.now();
  
  try {
    // Get API key from header
    const apiKey = request.headers.get('x-api-key');
    
    // Authenticate API key
    const keyData = await authenticateApiKey(apiKey);
    
    // Parse request body
    const {
      query,
      vector,
      filters,
      limit = 10,
      offset = 0,
      collection,
      includeEmbeddings = false
    } = await request.json();
    
    // Validate request
    if (!query && !vector) {
      return json({ error: 'Either query or vector must be provided' }, { status: 400 });
    }
    
    // Get database connections
    const db = getDatabaseClients();
    
    // Log the search query
    await logSearch(db, {
      query: query || 'vector-search',
      apiKeyId: keyData.id,
      siteId: keyData.site_id,
      userId: keyData.user_id,
      searchType: 'advanced'
    });
    
    // Determine which database to search based on collection
    let searchDb = collection ? db.getCollectionDb(collection) : db.library;
    let searchTable = 'documents';
    
    // Build the search query
    let sql, args;
    
    if (vector && vector.length > 0) {
      // Vector search using libSQL's vector search capabilities
      // This is a placeholder for the actual implementation
      // In a real RAG system, you would use proper vector similarity search
      
      // For Turso/libSQL with vss extension:
      sql = `
        SELECT 
          id, 
          title, 
          substr(content, 1, 200) as content_snippet, 
          json_extract(metadata, '$') as metadata,
          embedding,
          vss_search(embedding, ?) as score
        FROM ${searchTable}
        WHERE vss_search(embedding, ?) > 0.7
      `;
      
      // Convert vector to JSON string for the query
      const vectorJson = JSON.stringify(vector);
      args = [vectorJson, vectorJson];
      
      // Add filters if provided
      if (filters && Object.keys(filters).length > 0) {
        for (const [key, value] of Object.entries(filters)) {
          if (Array.isArray(value)) {
            // Handle array values (IN operator)
            sql += ` AND json_extract(metadata, '$.${key}') IN (${value.map(() => '?').join(',')})`;
            args.push(...value);
          } else {
            // Handle scalar values
            sql += ` AND json_extract(metadata, '$.${key}') = ?`;
            args.push(value);
          }
        }
      }
      
      // Add order by, limit and offset
      sql += ' ORDER BY score DESC LIMIT ? OFFSET ?';
      args.push(limit, offset);
    } else {
      // Text search
      sql = `
        SELECT 
          id, 
          title, 
          substr(content, 1, 200) as content_snippet, 
          json_extract(metadata, '$') as metadata,
          embedding,
          1.0 as score
        FROM ${searchTable}
        WHERE 
          title LIKE ? OR 
          content LIKE ?
      `;
      args = [`%${query}%`, `%${query}%`];
      
      // Add filters if provided
      if (filters && Object.keys(filters).length > 0) {
        for (const [key, value] of Object.entries(filters)) {
          if (Array.isArray(value)) {
            // Handle array values (IN operator)
            sql += ` AND json_extract(metadata, '$.${key}') IN (${value.map(() => '?').join(',')})`;
            args.push(...value);
          } else {
            // Handle scalar values
            sql += ` AND json_extract(metadata, '$.${key}') = ?`;
            args.push(value);
          }
        }
      }
      
      // Add order by, limit and offset
      sql += ' ORDER BY score DESC LIMIT ? OFFSET ?';
      args.push(limit, offset);
    }
    
    // Execute the search query
    const searchResult = await searchDb.execute({ sql, args });
    
    // Format the results
    const results = searchResult.rows.map(row => {
      const result = {
        id: row.id,
        title: row.title,
        content_snippet: row.content_snippet,
        score: row.score,
        metadata: JSON.parse(row.metadata || '{}')
      };
      
      // Include embeddings if requested
      if (includeEmbeddings && row.embedding) {
        try {
          result.embedding = JSON.parse(row.embedding);
        } catch (e) {
          console.error('Error parsing embedding:', e);
        }
      }
      
      return result;
    });
    
    // Get total count for pagination (simplified version)
    // In a real implementation, you would get the actual total count
    const total = results.length;
    const took_ms = Date.now() - startTime;
    
    return json({
      results,
      total,
      took_ms
    });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}
