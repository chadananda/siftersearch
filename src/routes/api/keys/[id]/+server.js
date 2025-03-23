// src/routes/api/keys/[id]/+server.js
import { json, error } from '@sveltejs/kit';
import { getDb, isAdmin } from '$lib/api/utils.js';

/**
 * @swagger
 * /api/keys/{id}:
 *   get:
 *     summary: Get a specific API key
 *     tags: [API Keys]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 site_id:
 *                   type: string
 *                 active:
 *                   type: boolean
 *                 created_at:
 *                   type: string
 *                 updated_at:
 *                   type: string
 *                 last_used_at:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: API key not found
 *       500:
 *         description: Server error
 */
export async function GET({ params, locals }) {
  try {
    // Get user from Clerk
    const { user } = locals.auth || {};
    
    if (!user) {
      throw error(401, 'Unauthorized');
    }
    
    const userId = user.id;
    const keyId = params.id;
    
    if (!keyId) {
      throw error(400, 'API key ID is required');
    }
    
    const db = await getDb('app');
    
    // If admin, can get any key, otherwise only user's keys
    let sql = 'SELECT * FROM api_keys WHERE id = ? AND user_id = ?';
    let args = [keyId, userId];
    
    if (isAdmin(user)) {
      sql = 'SELECT * FROM api_keys WHERE id = ?';
      args = [keyId];
    }
    
    const result = await db.execute({ sql, args });
    
    if (!result.rows || result.rows.length === 0) {
      throw error(404, 'API key not found');
    }
    
    const key = result.rows[0];
    
    // Don't return the actual key value for security reasons
    return json({
      id: key.id,
      name: key.name,
      site_id: key.site_id,
      active: Boolean(key.active),
      created_at: key.created_at,
      updated_at: key.updated_at,
      last_used_at: key.last_used_at
    });
  } catch (err) {
    console.error('Error getting API key:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}

/**
 * @swagger
 * /api/keys/{id}:
 *   put:
 *     summary: Update an API key
 *     tags: [API Keys]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New name for the API key
 *               active:
 *                 type: boolean
 *                 description: Whether the key should be active
 *     responses:
 *       200:
 *         description: API key updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 active:
 *                   type: boolean
 *                 updated_at:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: API key not found
 *       500:
 *         description: Server error
 */
export async function PUT({ params, request, locals }) {
  try {
    // Get user from Clerk
    const { user } = locals.auth || {};
    
    if (!user) {
      throw error(401, 'Unauthorized');
    }
    
    const userId = user.id;
    const keyId = params.id;
    
    if (!keyId) {
      throw error(400, 'API key ID is required');
    }
    
    const body = await request.json();
    const db = await getDb('app');
    
    // Check if the key exists and belongs to the user
    let sql = 'SELECT * FROM api_keys WHERE id = ? AND user_id = ?';
    let args = [keyId, userId];
    
    if (isAdmin(user)) {
      sql = 'SELECT * FROM api_keys WHERE id = ?';
      args = [keyId];
    }
    
    const result = await db.execute({ sql, args });
    
    if (!result.rows || result.rows.length === 0) {
      throw error(404, 'API key not found');
    }
    
    // Update fields
    const updates = [];
    const updateArgs = [];
    
    if (body.name !== undefined) {
      updates.push('name = ?');
      updateArgs.push(body.name);
    }
    
    if (body.active !== undefined) {
      updates.push('active = ?');
      updateArgs.push(body.active ? 1 : 0);
    }
    
    if (updates.length === 0) {
      throw error(400, 'No fields to update');
    }
    
    // Add updated_at
    updates.push('updated_at = ?');
    const now = new Date().toISOString();
    updateArgs.push(now);
    
    // Add key ID
    updateArgs.push(keyId);
    
    // Update the key
    await db.execute({
      sql: `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`,
      args: updateArgs
    });
    
    // Return the updated key info
    return json({
      id: keyId,
      name: body.name !== undefined ? body.name : result.rows[0].name,
      active: body.active !== undefined ? body.active : Boolean(result.rows[0].active),
      updated_at: now
    });
  } catch (err) {
    console.error('Error updating API key:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}

/**
 * @swagger
 * /api/keys/{id}:
 *   delete:
 *     summary: Delete an API key
 *     tags: [API Keys]
 *     security:
 *       - ClerkAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: API key not found
 *       500:
 *         description: Server error
 */
export async function DELETE({ params, locals }) {
  try {
    // Get user from Clerk
    const { user } = locals.auth || {};
    
    if (!user) {
      throw error(401, 'Unauthorized');
    }
    
    const userId = user.id;
    const keyId = params.id;
    
    if (!keyId) {
      throw error(400, 'API key ID is required');
    }
    
    const db = await getDb('app');
    
    // Check if the key exists and belongs to the user
    let sql = 'SELECT * FROM api_keys WHERE id = ? AND user_id = ?';
    let args = [keyId, userId];
    
    if (isAdmin(user)) {
      sql = 'SELECT * FROM api_keys WHERE id = ?';
      args = [keyId];
    }
    
    const result = await db.execute({ sql, args });
    
    if (!result.rows || result.rows.length === 0) {
      throw error(404, 'API key not found');
    }
    
    // Delete the key
    await db.execute({
      sql: 'DELETE FROM api_keys WHERE id = ?',
      args: [keyId]
    });
    
    return json({
      message: 'API key deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting API key:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}
