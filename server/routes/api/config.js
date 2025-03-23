// server/routes/api/config.js

/**
 * Configuration API routes
 */
export default async function configRoutes(fastify, options) {
  // Get user configuration
  fastify.get('/', async (request, reply) => {
    try {
      const result = await fastify.db.app.execute({
        sql: 'SELECT * FROM user_config WHERE user_id = ?',
        args: [request.auth.userId]
      });
      
      if (result.rows.length === 0) {
        // Return default config if none exists
        return { 
          config: {
            theme: 'light',
            notifications: true,
            defaultSiteId: null
          }
        };
      }
      
      return { 
        config: {
          ...result.rows[0],
          settings: JSON.parse(result.rows[0].settings || '{}')
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Update user configuration
  fastify.put('/', async (request, reply) => {
    const { theme, notifications, defaultSiteId, settings } = request.body;
    
    try {
      // Check if config exists for this user
      const checkResult = await fastify.db.app.execute({
        sql: 'SELECT id FROM user_config WHERE user_id = ?',
        args: [request.auth.userId]
      });
      
      if (checkResult.rows.length === 0) {
        // Create new config
        await fastify.db.app.execute({
          sql: 'INSERT INTO user_config (user_id, theme, notifications, default_site_id, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))',
          args: [
            request.auth.userId, 
            theme || 'light', 
            notifications !== undefined ? notifications : true, 
            defaultSiteId || null,
            JSON.stringify(settings || {})
          ]
        });
      } else {
        // Update existing config
        await fastify.db.app.execute({
          sql: 'UPDATE user_config SET theme = ?, notifications = ?, default_site_id = ?, settings = ?, updated_at = datetime("now") WHERE user_id = ?',
          args: [
            theme || 'light', 
            notifications !== undefined ? notifications : true, 
            defaultSiteId || null,
            JSON.stringify(settings || {}),
            request.auth.userId
          ]
        });
      }
      
      return { message: 'Configuration updated successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Get system configuration (admin only)
  fastify.get('/system', async (request, reply) => {
    try {
      // Check if user is an admin
      const userResult = await fastify.db.app.execute({
        sql: 'SELECT role FROM users WHERE id = ?',
        args: [request.auth.userId]
      });
      
      if (userResult.rows.length === 0 || userResult.rows[0].role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden: Admin access required' });
      }
      
      const result = await fastify.db.app.execute({
        sql: 'SELECT * FROM system_config LIMIT 1'
      });
      
      if (result.rows.length === 0) {
        // Return default system config if none exists
        return { 
          config: {
            maintenance_mode: false,
            version: '1.0.0',
            settings: {}
          }
        };
      }
      
      return { 
        config: {
          ...result.rows[0],
          settings: JSON.parse(result.rows[0].settings || '{}')
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Update system configuration (admin only)
  fastify.put('/system', async (request, reply) => {
    const { maintenance_mode, version, settings } = request.body;
    
    try {
      // Check if user is an admin
      const userResult = await fastify.db.app.execute({
        sql: 'SELECT role FROM users WHERE id = ?',
        args: [request.auth.userId]
      });
      
      if (userResult.rows.length === 0 || userResult.rows[0].role !== 'admin') {
        return reply.code(403).send({ error: 'Forbidden: Admin access required' });
      }
      
      // Check if system config exists
      const checkResult = await fastify.db.app.execute({
        sql: 'SELECT id FROM system_config LIMIT 1'
      });
      
      if (checkResult.rows.length === 0) {
        // Create new system config
        await fastify.db.app.execute({
          sql: 'INSERT INTO system_config (maintenance_mode, version, settings, created_at, updated_at) VALUES (?, ?, ?, datetime("now"), datetime("now"))',
          args: [
            maintenance_mode !== undefined ? maintenance_mode : false, 
            version || '1.0.0',
            JSON.stringify(settings || {})
          ]
        });
      } else {
        // Update existing system config
        await fastify.db.app.execute({
          sql: 'UPDATE system_config SET maintenance_mode = ?, version = ?, settings = ?, updated_at = datetime("now")',
          args: [
            maintenance_mode !== undefined ? maintenance_mode : false, 
            version || '1.0.0',
            JSON.stringify(settings || {})
          ]
        });
      }
      
      return { message: 'System configuration updated successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
