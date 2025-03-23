// server/plugins/db.js
import fp from 'fastify-plugin';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database connection plugin for Fastify
 * Supports both local SQLite and Turso/libSQL for production
 */
async function dbPlugin(fastify, options) {
  // Determine if we're using local SQLite or Turso
  const useLocalDb = process.env.NODE_ENV !== 'production' || process.env.USE_LOCAL_DB === 'true';
  
  // Database clients for different databases
  const clients = {
    app: null,
    library: null
  };

  // Create database clients
  if (useLocalDb) {
    // Local SQLite connections
    clients.app = createClient({
      url: 'file:./data/app.db'
    });
    
    clients.library = createClient({
      url: 'file:./data/library.db'
    });
    
    fastify.log.info('Connected to local SQLite databases');
  } else {
    // Turso/libSQL connections for production
    clients.app = createClient({
      url: process.env.TURSO_APP_DB_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    
    clients.library = createClient({
      url: process.env.TURSO_LIBRARY_DB_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    
    fastify.log.info('Connected to Turso databases');
  }

  // Decorate Fastify instance with database clients
  fastify.decorate('db', clients);

  // Close database connections when Fastify closes
  fastify.addHook('onClose', async (instance) => {
    for (const [name, client] of Object.entries(clients)) {
      if (client) {
        try {
          await client.close();
          fastify.log.info(`Closed ${name} database connection`);
        } catch (err) {
          fastify.log.error(`Error closing ${name} database connection: ${err.message}`);
        }
      }
    }
  });
}

export default fp(dbPlugin, {
  name: 'db',
  fastify: '4.x'
});
