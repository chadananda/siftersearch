// src/routes/api/keys/+server.js
import { json, error } from '@sveltejs/kit';
import { getDb, generateApiKey, isAdmin } from '$lib/api/utils.js';

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: List all API keys for the authenticated user
 *     tags: [API Keys]
 *     security:
 *       - ClerkAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   site_id:
 *                     type: string
 *                   active:
 *                     type: boolean
 *                   created_at:
 *                     type: string
 *                   updated_at:
 *                     type: string
 *                   last_used_at:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function GET({ locals }) {
  try {
    // Get user from Clerk
    const { user } = locals.auth || {};
    
    if (!user) {
      throw error(401, 'Unauthorized');
    }
    
    const userId = user.id;
    const db = await getDb('app');
    
    // If admin, can get all keys, otherwise only user's keys
    let sql = 'SELECT * FROM api_keys WHERE user_id = ?';
    let args = [userId];
    
    if (isAdmin(user)) {
      sql = 'SELECT * FROM api_keys';
      args = [];
    }
    
    const result = await db.execute({ sql, args });
    
    // Don't return the actual key values for security reasons
    const keys = result.rows.map(key => ({
      id: key.id,
      name: key.name,
      site_id: key.site_id,
      active: Boolean(key.active),
      created_at: key.created_at,
      updated_at: key.updated_at,
      last_used_at: key.last_used_at
    }));
    
    return json(keys);
  } catch (err) {
    console.error('Error listing API keys:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
 *     security:
 *       - ClerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name/description for the API key
 *               site_id:
 *                 type: string
 *                 description: ID of the site this key is associated with (optional)
 *     responses:
 *       201:
 *         description: API key created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 key:
 *                   type: string
 *                   description: The API key (only returned once upon creation)
 *                 name:
 *                   type: string
 *                 site_id:
 *                   type: string
 *                 active:
 *                   type: boolean
 *                 created_at:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function POST({ request, locals }) {
  try {
    // Get user from Clerk
    const { user } = locals.auth || {};
    
    if (!user) {
      throw error(401, 'Unauthorized');
    }
    
    const userId = user.id;
    const body = await request.json();
    
    if (!body.name) {
      throw error(400, 'Name is required');
    }
    
    // Generate a new API key
    const apiKey = await generateApiKey();
    const db = await getDb('app');
    
    // Current timestamp
    const now = new Date().toISOString();
    
    // Insert the new API key
    const result = await db.execute({
      sql: `
        INSERT INTO api_keys 
        (id, key, name, site_id, user_id, active, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(), // id
        apiKey, // key
        body.name, // name
        body.site_id || null, // site_id
        userId, // user_id
        1, // active
        now, // created_at
        now // updated_at
      ]
    });
    
    // Return the new API key (including the key value, which won't be returned again)
    return json({
      id: result.lastInsertRowid,
      key: apiKey,
      name: body.name,
      site_id: body.site_id || null,
      active: true,
      created_at: now
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating API key:', err);
    throw error(err.status || 500, err.message || 'Internal server error');
  }
}
