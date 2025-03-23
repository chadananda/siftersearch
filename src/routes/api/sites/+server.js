// src/routes/api/sites/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateRequest, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * components:
 *   schemas:
 *     Site:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the site
 *         name:
 *           type: string
 *           description: Site name
 *         domain:
 *           type: string
 *           description: Site domain
 *         config:
 *           type: object
 *           description: Site configuration
 *         user_id:
 *           type: string
 *           description: ID of the site owner
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *     Pagination:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           description: Current page number
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *         total:
 *           type: integer
 *           description: Total number of items
 */

/**
 * @swagger
 * /sites:
 *   get:
 *     summary: Get all sites
 *     description: Retrieves a paginated list of sites for the authenticated user
 *     tags:
 *       - Sites
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
 *         description: List of sites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sites:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Site'
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
    
    const result = await db.app.execute({
      sql: 'SELECT * FROM sites WHERE user_id = ? LIMIT ? OFFSET ?',
      args: [userId, limit, (page - 1) * limit]
    });
    
    return json({ 
      sites: result.rows,
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
 * /sites:
 *   post:
 *     summary: Create a new site
 *     description: Creates a new site for the authenticated user
 *     tags:
 *       - Sites
 *     security:
 *       - clerkAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - domain
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
 *       201:
 *         description: Site created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   description: ID of the created site
 *                 message:
 *                   type: string
 *                   example: Site created successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
export async function POST({ request, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const { name, domain, config } = await request.json();
    
    if (!name || !domain) {
      return json({ error: 'Name and domain are required' }, { status: 400 });
    }
    
    const db = getDatabaseClients();
    
    const result = await db.app.execute({
      sql: 'INSERT INTO sites (name, domain, config, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now")) RETURNING id',
      args: [name, domain, JSON.stringify(config || {}), userId]
    });
    
    return json({ 
      id: result.rows[0].id,
      message: 'Site created successfully' 
    }, { status: 201 });
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}
