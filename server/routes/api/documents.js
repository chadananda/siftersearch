// server/routes/api/documents.js

/**
 * Document management API routes
 */
export default async function documentRoutes(fastify, options) {
  // Get all documents (with pagination)
  fastify.get('/', async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;
    
    try {
      // Example query using the db plugin
      const result = await fastify.db.library.execute({
        sql: 'SELECT * FROM documents WHERE user_id = ? LIMIT ? OFFSET ?',
        args: [request.auth.userId, limit, (page - 1) * limit]
      });
      
      return { 
        documents: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          // In a real implementation, we would also return total count
        }
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Get a single document by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      const result = await fastify.db.library.execute({
        sql: 'SELECT * FROM documents WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      
      return { document: result.rows[0] };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Create a new document
  fastify.post('/', async (request, reply) => {
    const { title, content, metadata } = request.body;
    
    try {
      const result = await fastify.db.library.execute({
        sql: 'INSERT INTO documents (title, content, metadata, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now")) RETURNING id',
        args: [title, content, JSON.stringify(metadata || {}), request.auth.userId]
      });
      
      return { 
        id: result.rows[0].id,
        message: 'Document created successfully' 
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Update an existing document
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, content, metadata } = request.body;
    
    try {
      // First check if document exists and belongs to user
      const checkResult = await fastify.db.library.execute({
        sql: 'SELECT id FROM documents WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      
      // Update the document
      await fastify.db.library.execute({
        sql: 'UPDATE documents SET title = ?, content = ?, metadata = ?, updated_at = datetime("now") WHERE id = ?',
        args: [title, content, JSON.stringify(metadata || {}), id]
      });
      
      return { message: 'Document updated successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Delete a document
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      // First check if document exists and belongs to user
      const checkResult = await fastify.db.library.execute({
        sql: 'SELECT id FROM documents WHERE id = ? AND user_id = ?',
        args: [id, request.auth.userId]
      });
      
      if (checkResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Document not found' });
      }
      
      // Delete the document
      await fastify.db.library.execute({
        sql: 'DELETE FROM documents WHERE id = ?',
        args: [id]
      });
      
      return { message: 'Document deleted successfully' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });
}
