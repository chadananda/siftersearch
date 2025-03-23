// server/routes/api/analytics.js

/**
 * Analytics API routes
 */
export default async function analyticsRoutes(fastify, options) {
  // Get analytics summary
  fastify.get('/summary', async (request, reply) => {
    const { timeframe = 'week' } = request.query;
    
    try {
      // Example query to get analytics summary
      // In a real implementation, this would be more complex
      const result = await fastify.db.app.execute({
        sql: `
          SELECT 
            COUNT(*) as total_searches,
            COUNT(DISTINCT user_id) as unique_users
          FROM search_logs 
          WHERE site_id IN (SELECT id FROM sites WHERE user_id = ?)
          AND created_at > datetime('now', ?)
        `,
        args: [
          request.auth.userId, 
          timeframe === 'day' ? '-1 day' : 
          timeframe === 'month' ? '-1 month' : 
          '-7 days'
        ]
      });
      
      // Get top searches
      const topSearches = await fastify.db.app.execute({
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
          request.auth.userId, 
          timeframe === 'day' ? '-1 day' : 
          timeframe === 'month' ? '-1 month' : 
          '-7 days'
        ]
      });
      
      return { 
        summary: result.rows[0],
        topSearches: topSearches.rows,
        timeframe
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Get search logs with pagination
  fastify.get('/logs', async (request, reply) => {
    const { page = 1, limit = 50, siteId } = request.query;
    
    try {
      let sql = `
        SELECT 
          search_logs.*,
          sites.name as site_name
        FROM search_logs 
        JOIN sites ON search_logs.site_id = sites.id
        WHERE sites.user_id = ?
      `;
      
      const args = [request.auth.userId];
      
      if (siteId) {
        sql += ' AND site_id = ?';
        args.push(siteId);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      args.push(limit, (page - 1) * limit);
      
      const result = await fastify.db.app.execute({
        sql,
        args
      });
      
      return { 
        logs: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Get user activity metrics
  fastify.get('/users', async (request, reply) => {
    const { timeframe = 'week' } = request.query;
    
    try {
      // Example query to get user activity metrics
      const result = await fastify.db.app.execute({
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
          request.auth.userId, 
          timeframe === 'day' ? '-1 day' : 
          timeframe === 'month' ? '-1 month' : 
          '-7 days'
        ]
      });
      
      return { 
        userMetrics: result.rows,
        timeframe
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
