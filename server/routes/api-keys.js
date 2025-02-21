import { randomBytes } from 'crypto';

export default async function apiKeyRoutes(fastify) {
  // Generate a new API key for a library
  fastify.post('/api/keys', {
    schema: {
      body: {
        type: 'object',
        required: ['libraryId'],
        properties: {
          libraryId: { type: 'string' },
          name: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    handler: async (request, reply) => {
      const { libraryId, name, expiresAt } = request.body;
      const db = await fastify.db.getLibraryDb(libraryId);
      
      // Generate a secure API key
      const apiKey = `sifter_${randomBytes(32).toString('hex')}`;
      
      // Store the API key with metadata
      await db.execute(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          last_used_at DATETIME,
          call_count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT 1
        )
      `);
      
      await db.execute({
        sql: `INSERT INTO api_keys (key, name, expires_at) VALUES (?, ?, ?)`,
        args: [apiKey, name || 'Default Key', expiresAt || null]
      });

      return { apiKey };
    }
  });

  // List API keys for a library
  fastify.get('/api/keys/:libraryId', async (request, reply) => {
    const { libraryId } = request.params;
    const db = await fastify.db.getLibraryDb(libraryId);
    
    const keys = await db.execute('SELECT id, name, created_at, expires_at, last_used_at, call_count, is_active FROM api_keys');
    return { keys: keys.rows };
  });

  // Revoke an API key
  fastify.delete('/api/keys/:libraryId/:keyId', async (request, reply) => {
    const { libraryId, keyId } = request.params;
    const db = await fastify.db.getLibraryDb(libraryId);
    
    await db.execute({
      sql: 'UPDATE api_keys SET is_active = 0 WHERE id = ?',
      args: [keyId]
    });
    
    return { success: true };
  });

  // Middleware to validate API keys and track usage
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || !apiKey.startsWith('sifter_')) return;

    const libraryId = request.params.libraryId || request.body?.libraryId;
    if (!libraryId) return;

    const db = await fastify.db.getLibraryDb(libraryId);
    
    const result = await db.execute({
      sql: `
        UPDATE api_keys 
        SET last_used_at = CURRENT_TIMESTAMP, 
            call_count = call_count + 1
        WHERE key = ? AND is_active = 1
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        RETURNING id
      `,
      args: [apiKey]
    });

    if (!result.rows.length) {
      return reply.code(401).send({ error: 'Invalid or expired API key' });
    }
  });
}