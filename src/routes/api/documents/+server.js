// src/routes/api/documents/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateRequest, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: Get all documents
 *     description: Retrieves a paginated list of documents for the authenticated user
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: List of documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Document'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ url, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    const db = getDatabaseClients();
    
    const result = await db.library.execute({
      sql: 'SELECT * FROM documents WHERE user_id = ? LIMIT ? OFFSET ?',
      args: [userId, limit, (page - 1) * limit]
    });
    
    return json({ 
      documents: result.rows,
      pagination: {
        page,
        limit
      }
    });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Create a new document
 *     description: Creates a new document for the authenticated user
 *     tags:
 *       - Documents
 *     security:
 *       - clerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: Document title
 *               content:
 *                 type: string
 *                 description: Document content
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: ID of the created document
 *                 message:
 *                   type: string
 *                   example: Document created successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
export async function POST({ request, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { title, content, metadata } = await request.json();
    
    if (!title) {
      return json({ error: 'Title is required' }, { status: 400 });
    }
    
    const db = getDatabaseClients();
    
    const result = await db.library.execute({
      sql: 'INSERT INTO documents (title, content, metadata, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now")) RETURNING id',
      args: [title, content || '', JSON.stringify(metadata || {}), userId]
    });
    
    return json({ 
      id: result.rows[0].id,
      message: 'Document created successfully' 
    }, { status: 201 });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}
