// src/routes/api/sites/[id]/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateRequest, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * /sites/{id}:
 *   get:
 *     summary: Get a site by ID
 *     description: Retrieves a specific site by its ID
 *     tags:
 *       - Sites
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Site ID
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Site details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 site:
 *                   $ref: '#/components/schemas/Site'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Site not found
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ params, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    
    const db = getDatabaseClients();
    
    const result = await db.app.execute({
      sql: 'SELECT * FROM sites WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (result.rows.length === 0) {
      return json({ error: 'Site not found' }, { status: 404 });
    }
    
    return json({ site: result.rows[0] });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

/**
 * @swagger
 * /sites/{id}:
 *   put:
 *     summary: Update a site
 *     description: Updates an existing site by its ID
 *     tags:
 *       - Sites
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Site ID
 *     security:
 *       - clerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Site name
 *               domain:
 *                 type: string
 *                 description: Site domain
 *               config:
 *                 type: object
 *                 description: Site configuration
 *     responses:
 *       200:
 *         description: Site updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Site not found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT({ params, request, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    const { name, domain, config } = await request.json();
    
    const db = getDatabaseClients();
    
    // First check if site exists and belongs to user
    const checkResult = await db.app.execute({
      sql: 'SELECT id FROM sites WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (checkResult.rows.length === 0) {
      return json({ error: 'Site not found' }, { status: 404 });
    }
    
    // Update the site
    await db.app.execute({
      sql: 'UPDATE sites SET name = ?, domain = ?, config = ?, updated_at = datetime("now") WHERE id = ?',
      args: [name, domain, JSON.stringify(config || {}), id]
    });
    
    return json({ message: 'Site updated successfully' });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

/**
 * @swagger
 * /sites/{id}:
 *   delete:
 *     summary: Delete a site
 *     description: Deletes a site by its ID
 *     tags:
 *       - Sites
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Site ID
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Site deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Site not found
 *       500:
 *         description: Internal Server Error
 */
export async function DELETE({ params, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { id } = params;
    
    const db = getDatabaseClients();
    
    // First check if site exists and belongs to user
    const checkResult = await db.app.execute({
      sql: 'SELECT id FROM sites WHERE id = ? AND user_id = ?',
      args: [id, userId]
    });
    
    if (checkResult.rows.length === 0) {
      return json({ error: 'Site not found' }, { status: 404 });
    }
    
    // Delete the site
    await db.app.execute({
      sql: 'DELETE FROM sites WHERE id = ?',
      args: [id]
    });
    
    return json({ message: 'Site deleted successfully' });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}
