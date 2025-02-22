import Fastify from 'fastify';
import { join } from 'path';
import { createClerkClient } from '@clerk/backend';
import config from './lib/config.js';
import library from './lib/library.js';

// Initialize Clerk
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Create fastify instance
const fastify = Fastify({ logger: true });

// Initialize system
async function initialize() {
  try {
    // Initialize configuration first
    await config.initialize();
    fastify.log.info('Configuration initialized successfully');

    // Initialize library structure
    await library.initialize();
    fastify.log.info('Library structure initialized');

    // Initialize database system
    const { default: db } = await import('./lib/db.js');
    
    // Initialize databases
    await db.getAppDb();
    fastify.log.info('App database initialized successfully');
    
    if (config.libraryId) {
      await library.ensureLibraryExists(config.libraryId);
      await db.getLibraryDb({ libraryId: config.libraryId });
      fastify.log.info(`Library database initialized for ${config.libraryId}`);
    }
    
    return { db, library, config };
  } catch (error) {
    fastify.log.error('Failed to initialize:', error);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Start server
const start = async () => {
  try {
    // Initialize system
    fastify.log.info('Initializing system...');
    const { db, library, config } = await initialize();
    fastify.log.info('System initialized successfully');

    // Attach managers to fastify instance
    fastify.decorate('db', db);
    fastify.decorate('library', library);
    fastify.decorate('config', config);

    // Register plugins
    const cors = await import('@fastify/cors');
    const rateLimit = await import('@fastify/rate-limit');
    const staticPlugin = await import('@fastify/static');

    await fastify.register(cors.default);
    await fastify.register(rateLimit.default, {
      max: 100,
      timeWindow: '1 minute'
    });

    // Authentication middleware
    fastify.addHook('preHandler', async (request, reply) => {
      // Skip auth for public routes and health check
      if (request.url.startsWith('/public') || request.url === '/health') {
        return;
      }

      try {
        const sessionId = request.headers.authorization?.replace('Bearer ', '');
        if (!sessionId) {
          return reply.code(401).send({ error: 'Authentication required' });
        }

        try {
          const sessionClaims = await clerkClient.sessions.verifySession(sessionId);
          request.user = sessionClaims.sub;
          request.session = sessionClaims;
        } catch (error) {
          reply.code(401).send({ error: 'Invalid authentication' });
        }
      } catch (error) {
        reply.code(500).send({ error: 'Authentication error' });
      }
    });

    // Register routes
    const contentRoutes = await import('./api/content.js');
    const userRoutes = await import('./api/users.js');
    const chatRoutes = await import('./api/chat.js');
    const toolRoutes = await import('./api/tools.js');

    await fastify.register(contentRoutes.default);
    await fastify.register(userRoutes.default);
    await fastify.register(chatRoutes.default);
    await fastify.register(toolRoutes.default);

    // Register static file serving for SvelteKit app
    await fastify.register(staticPlugin.default, {
      root: join(process.cwd(), 'site/build'),
      prefix: '/' // Serve at root path
    });

    // Health check route
    fastify.get('/health', async () => {
      return { status: 'ok' };
    });

    // Start the server
    await fastify.listen({ 
      port: process.env.API_PORT || 3333, 
      host: '0.0.0.0' 
    });
    fastify.log.info('Server started successfully');
  } catch (err) {
    fastify.log.error('Server startup failed:', err);
    console.error('Full error:', err);
    process.exit(1);
  }
};

// Run the server
start();