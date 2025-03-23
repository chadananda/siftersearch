// src/routes/api/health/+server.js
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/api/utils.js';

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Checks the health of the API and its dependencies
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 version:
 *                   type: string
 *                 database:
 *                   type: object
 *                   properties:
 *                     app:
 *                       type: string
 *                       example: connected
 *                     library:
 *                       type: string
 *                       example: connected
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: API is not healthy
 */
export async function GET() {
  const startTime = Date.now();
  const status = { status: 'ok' };
  
  try {
    // Check app database connection
    const appDb = await getDb('app');
    await appDb.execute({ sql: 'SELECT 1' });
    status.database = { app: 'connected' };
    
    // Check library database connection
    try {
      const libraryDb = await getDb('library');
      await libraryDb.execute({ sql: 'SELECT 1' });
      status.database.library = 'connected';
    } catch (err) {
      status.database.library = 'disconnected';
      status.status = 'degraded';
    }
    
    // Add version info
    status.version = process.env.npm_package_version || '1.0.0';
    
    // Add timestamp
    status.timestamp = new Date().toISOString();
    
    // Add response time
    status.took_ms = Date.now() - startTime;
    
    return json(status);
  } catch (err) {
    console.error('Health check failed:', err);
    
    return json({
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
      took_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
