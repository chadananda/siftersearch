// src/routes/api/analytics/+server.js
import { json } from '@sveltejs/kit';
import { getDatabaseClients, authenticateRequest, formatErrorResponse } from '$lib/api/utils';

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalyticsSummary:
 *       type: object
 *       properties:
 *         total_searches:
 *           type: integer
 *           description: Total number of searches
 *         unique_users:
 *           type: integer
 *           description: Number of unique users
 *     SearchQuery:
 *       type: object
 *       properties:
 *         query:
 *           type: string
 *           description: Search query text
 *         count:
 *           type: integer
 *           description: Number of times this query was searched
 *     UserMetric:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           description: Date of the metrics
 *         unique_users:
 *           type: integer
 *           description: Number of unique users on this date
 *         total_searches:
 *           type: integer
 *           description: Total number of searches on this date
 */

/**
 * @swagger
 * /analytics/summary:
 *   get:
 *     summary: Get analytics summary
 *     description: Retrieves a summary of analytics data for the authenticated user's sites
 *     tags:
 *       - Analytics
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: week
 *         description: Timeframe for the analytics data
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   $ref: '#/components/schemas/AnalyticsSummary'
 *                 topSearches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SearchQuery'
 *                 timeframe:
 *                   type: string
 *                   enum: [day, week, month]
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ url, locals }) {
  try {
    const { userId } = authenticateRequest(locals);
    const timeframe = url.searchParams.get('timeframe') || 'week';
    const endpoint = url.searchParams.get('endpoint') || 'summary';
    
    const db = getDatabaseClients();
    
    // Route to the appropriate endpoint handler
    switch (endpoint) {
      case 'summary':
        return await getSummary(db, userId, timeframe);
      case 'logs':
        return await getLogs(db, userId, url);
      case 'users':
        return await getUserMetrics(db, userId, timeframe);
      default:
        return json({ error: 'Invalid endpoint' }, { status: 400 });
    }
  } catch (err) {
    return json(formatErrorResponse(err), { status: err.status || 500 });
  }
}

// Helper function to get analytics summary
async function getSummary(db, userId, timeframe) {
  // Example query to get analytics summary
  const result = await db.app.execute({
    sql: `
      SELECT 
        COUNT(*) as total_searches,
        COUNT(DISTINCT user_id) as unique_users
      FROM search_logs 
      WHERE site_id IN (SELECT id FROM sites WHERE user_id = ?)
      AND created_at > datetime('now', ?)
    `,
    args: [
      userId, 
      timeframe === 'day' ? '-1 day' : 
      timeframe === 'month' ? '-1 month' : 
      '-7 days'
    ]
  });
  
  // Get top searches
  const topSearches = await db.app.execute({
    sql: `
      SELECT 
        query, 
        COUNT(*) as count
      FROM search_logs 
      WHERE site_id IN (SELECT id FROM sites WHERE user_id = ?)
      AND created_at > datetime('now', ?)
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10
    `,
    args: [
      userId, 
      timeframe === 'day' ? '-1 day' : 
      timeframe === 'month' ? '-1 month' : 
      '-7 days'
    ]
  });
  
  return json({ 
    summary: result.rows[0],
    topSearches: topSearches.rows,
    timeframe
  });
}

/**
 * @swagger
 * /analytics/logs:
 *   get:
 *     summary: Get search logs
 *     description: Retrieves paginated search logs for the authenticated user's sites
 *     tags:
 *       - Analytics
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
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: siteId
 *         schema:
 *           type: string
 *         description: Filter by site ID
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: Search logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       query:
 *                         type: string
 *                       user_id:
 *                         type: string
 *                       site_id:
 *                         type: string
 *                       site_name:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
async function getLogs(db, userId, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const siteId = url.searchParams.get('siteId');
  
  let sql = `
    SELECT 
      search_logs.*,
      sites.name as site_name
    FROM search_logs 
    JOIN sites ON search_logs.site_id = sites.id
    WHERE sites.user_id = ?
  `;
  
  const args = [userId];
  
  if (siteId) {
    sql += ' AND site_id = ?';
    args.push(siteId);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  args.push(limit, (page - 1) * limit);
  
  const result = await db.app.execute({
    sql,
    args
  });
  
  return json({ 
    logs: result.rows,
    pagination: {
      page,
      limit
    }
  });
}

/**
 * @swagger
 * /analytics/users:
 *   get:
 *     summary: Get user activity metrics
 *     description: Retrieves user activity metrics over time
 *     tags:
 *       - Analytics
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: week
 *         description: Timeframe for the metrics
 *     security:
 *       - clerkAuth: []
 *     responses:
 *       200:
 *         description: User metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userMetrics:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserMetric'
 *                 timeframe:
 *                   type: string
 *                   enum: [day, week, month]
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
async function getUserMetrics(db, userId, timeframe) {
  // Example query to get user activity metrics
  const result = await db.app.execute({
    sql: `
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_searches
      FROM search_logs 
      WHERE site_id IN (SELECT id FROM sites WHERE user_id = ?)
      AND created_at > datetime('now', ?)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    args: [
      userId, 
      timeframe === 'day' ? '-1 day' : 
      timeframe === 'month' ? '-1 month' : 
      '-7 days'
    ]
  });
  
  return json({ 
    userMetrics: result.rows,
    timeframe
  });
}
