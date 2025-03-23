// src/routes/api/documents/[id]/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateRequest, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document by ID
 *     description: Retrieves a specific document by its ID
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Document details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document:
 *                   $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ params, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    
    const db = getDatabaseClients();
    
    const result = await db.library.execute({
      sql: 'SELECT * FROM documents WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (result.rows.length === 0) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    return json({ document: result.rows[0] });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

/**
 * @swagger
 * /documents/{id}:
 *   put:
 *     summary: Update a document
 *     description: Updates an existing document by its ID
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     security:
 *       - clerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
 *       200:
 *         description: Document updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT({ params, request, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    const { title, content, metadata } = await request.json();
    
    const db = getDatabaseClients();
    
    // First check if document exists and belongs to user
    const checkResult = await db.library.execute({
      sql: 'SELECT id FROM documents WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (checkResult.rows.length === 0) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Update the document
    await db.library.execute({
      sql: 'UPDATE documents SET title = ?, content = ?, metadata = ?, updated_at = datetime("now") WHERE id = ?',
      args: [title, content, JSON.stringify(metadata || {}), id]
    });
    
    return json({ message: 'Document updated successfully' });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     description: Deletes a document by its ID
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
export async function DELETE({ params, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    
    const db = getDatabaseClients();
    
    // First check if document exists and belongs to user
    const checkResult = await db.library.execute({
      sql: 'SELECT id FROM documents WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (checkResult.rows.length === 0) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Delete the document
    await db.library.execute({
      sql: 'DELETE FROM documents WHERE id = ?',
      args: [id]
    });
    
    return json({ message: 'Document deleted successfully' });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}
