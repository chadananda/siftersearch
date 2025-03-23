// src/routes/api/public/search/+server.js
import { json, error } from '@sveltejs/kit';
import { getDb, authenticateApiKey, logSearchQuery, verifyJwtToken } from '$lib/api/utils.js';

/**
 * @swagger
 * /api/public/search:
 *   get:
 *     summary: Search documents
 *     description: Search for documents using a text query with optional AI-enhanced vector search
 *     tags: [Public]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: site_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Site ID to search within
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
 *         name: vector
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to use AI-enhanced vector search
 *       - in: query
 *         name: collection
 *         schema:
 *           type: string
 *         description: Optional collection to search within
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResponse'
 *       400:
 *         description: Bad request - missing required parameters
 *       401:
 *         description: Unauthorized - invalid or missing authentication
 *       500:
 *         description: Server error
 */
export async function GET({ url, request, locals }) {
  try {
    // Authentication variables
    let keyData = null;
    let userId = null;
    let userRole = 'anon';
    let isAuthenticated = false;
    
    // Try JWT authentication first (for internal users)
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decodedToken = verifyJwtToken(token);
        
        // Set user information from JWT
        userId = decodedToken.sub;
        userRole = decodedToken.role || 'anon';
        isAuthenticated = true;
        
        console.log(`Authenticated user ${userId} with role ${userRole}`);
      } catch (err) {
        // JWT authentication failed, will try API key next
        console.log('JWT authentication failed, trying API key');
      }
    }
    
    // If JWT auth failed, try API key authentication (for external services)
    if (!isAuthenticated) {
      const apiKey = request.headers.get('x-api-key');
      if (apiKey) {
        try {
          // Authenticate the API key
          keyData = await authenticateApiKey(apiKey);
          isAuthenticated = true;
          
          console.log(`Authenticated with API key ${keyData.id}`);
        } catch (err) {
          // API key authentication failed
          throw error(401, 'Invalid API key');
        }
      } else {
        // No authentication provided
        throw error(401, 'Authentication required. Provide either a JWT token or API key');
      }
    }
    
    // Get query parameters
    const query = url.searchParams.get('q');
    const siteId = url.searchParams.get('site_id');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const useVector = url.searchParams.get('vector') === 'true';
    const collection = url.searchParams.get('collection') || 'default';
    
    // Validate parameters
    if (!query) {
      throw error(400, 'Search query is required');
    }
    
    if (!siteId) {
      throw error(400, 'Site ID is required');
    }
    
    // Get database connections
    const searchDb = await getDb('library');
    
    // Determine search table based on site ID and collection
    const searchTable = `documents_${siteId}_${collection}`.replace(/[^a-zA-Z0-9_]/g, '_');
    
    let results;
    let total = 0;
    
    // Log the search query
    await logSearchQuery({
      query,
      siteId,
      apiKeyId: keyData?.id || null,
      userId: userId || null,
      useVector
    });
    
    if (useVector) {
      // Vector search with OpenAI integration
      try {
        // Check if OpenAI API key is configured
        if (!process.env.OPENAI_API_KEY) {
          console.warn('OpenAI API key not configured, falling back to basic search');
          throw new Error('OpenAI API key not configured');
        }
        
        // First, generate embedding for the query using OpenAI
        const embedding = await generateEmbedding(query);
        
        if (!embedding) {
          throw new Error('Failed to generate embedding');
        }
        
        // Use the embedding for vector search
        const vectorResult = await searchDb.execute({
          sql: `
            SELECT 
              id, 
              title, 
              substr(content, 1, 200) as content_snippet, 
              json_extract(metadata, '$') as metadata,
              vector_search(embedding, ?) as score
            FROM ${searchTable}
            WHERE embedding IS NOT NULL
            ORDER BY score DESC
            LIMIT ? OFFSET ?
          `,
          args: [embedding, limit, offset]
        });
        
        results = vectorResult.rows;
        
        // Get total count
        const countResult = await searchDb.execute({
          sql: `SELECT COUNT(*) as count FROM ${searchTable} WHERE embedding IS NOT NULL`,
          args: []
        });
        
        total = countResult.rows[0].count;
      } catch (err) {
        console.error('Vector search error:', err);
        // Fall back to text search if vector search fails
        useVector = false;
      }
    }
    
    if (!useVector) {
      // Regular text search
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
          LIMIT ? OFFSET ?
        `,
        args: [`%${query}%`, `%${query}%`, limit, offset]
      });
      
      results = searchResult.rows;
      
      // Get total count
      const countResult = await searchDb.execute({
        sql: `
          SELECT COUNT(*) as count 
          FROM ${searchTable} 
          WHERE title LIKE ? OR content LIKE ?
        `,
        args: [`%${query}%`, `%${query}%`]
      });
      
      total = countResult.rows[0].count;
    }
    
    // Format the results
    const formattedResults = results.map(row => {
      let metadata = {};
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (e) {
        console.error('Error parsing metadata:', e);
      }
      
      return {
        id: row.id,
        title: row.title,
        content_snippet: row.content_snippet,
        score: row.score,
        metadata
      };
    });
    
    return json({
      results: formattedResults,
      total,
      query,
      vector: useVector,
      collection,
      auth_type: keyData ? 'api_key' : 'jwt',
      user_role: userRole
    });
  } catch (err) {
    console.error('Search error:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}

/**
 * Generate an embedding vector for a text using OpenAI
 * @param {string} text - Text to generate embedding for
 * @returns {Float32Array|null} Embedding vector or null if failed
 */
async function generateEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return null;
    }
    
    const data = await response.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error('Error generating embedding:', err);
    return null;
  }
}
