// server/routes/api/sites.js

/**
 * Site management API routes
 */
export default async function siteRoutes(fastify, options) {
  // Get all sites
  fastify.get('/', async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    
    try {
      const result = await fastify.db.app.execute({
        sql: 'SELECT * FROM sites WHERE user_id = ? LIMIT ? OFFSET ?',
        args: [request.auth.userId, limit, (page - 1) * limit]
      });
      
      return { 
        sites: result.rows,
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

  // Get a single site by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      const result = await fastify.db.app.execute({
        sql: 'SELECT * FROM sites WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Site not found' });
      }
      
      return { site: result.rows[0] };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Create a new site
  fastify.post('/', async (request, reply) => {
    const { name, domain, config } = request.body;
    
    try {
      const result = await fastify.db.app.execute({
        sql: 'INSERT INTO sites (name, domain, config, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now")) RETURNING id',
        args: [name, domain, JSON.stringify(config || {}), request.auth.userId]
      });
      
      return { 
        id: result.rows[0].id,
        message: 'Site created successfully' 
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Update an existing site
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, domain, config } = request.body;
    
    try {
      // First check if site exists and belongs to user
      const checkResult = await fastify.db.app.execute({
        sql: 'SELECT id FROM sites WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Site not found' });
      }
      
      // Update the site
      await fastify.db.app.execute({
        sql: 'UPDATE sites SET name = ?, domain = ?, config = ?, updated_at = datetime("now") WHERE id = ?',
        args: [name, domain, JSON.stringify(config || {}), id]
      });
      
      return { message: 'Site updated successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Delete a site
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      // First check if site exists and belongs to user
      const checkResult = await fastify.db.app.execute({
        sql: 'SELECT id FROM sites WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Site not found' });
      }
      
      // Delete the site
      await fastify.db.app.execute({
        sql: 'DELETE FROM sites WHERE id = ?',
        args: [id]
      });
      
      return { message: 'Site deleted successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
