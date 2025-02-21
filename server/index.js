import Fastify from 'fastify';
const fastify = Fastify({ logger: true });
import path from 'path';
import { clerkClient } from '@clerk/backend';
import { DatabaseManager } from './db.js';
import config from './config.js';

// Initialize databases and configuration
async function initializeDatabases() {
  const dbManager = new DatabaseManager();
  
  try {
    // Initialize configuration first
    await config.initialize();
    fastify.log.info('Configuration initialized successfully');

    // Initialize app database
    await dbManager.getAppDb();
    fastify.log.info('App database initialized successfully');
    
    // Initialize library database using configured library
    await dbManager.getLibraryDb(config.libraryId);
    fastify.log.info(`Library database initialized successfully for ${config.libraryId}`);
    
    return dbManager;
  } catch (error) {
    fastify.log.error('Failed to initialize:', error);
    process.exit(1);
  }
}

// Initialize database manager
let dbManager;
const start = async () => {
  try {
    // Initialize databases
    fastify.log.info('Initializing databases...');
    dbManager = await initializeDatabases();
    fastify.log.info('Databases initialized successfully');

    // Start the server
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
    fastify.log.info('Server started successfully');
  } catch (err) {
    fastify.log.error('Server startup failed:', err);
    process.exit(1);
  }
};
start();

// Register plugins
import cors from '@fastify/cors';
fastify.register(cors);
import rateLimit from '@fastify/rate-limit';
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

// API key validation function
const validateApiKey = async (apiKey) => {
  // TODO: Implement API key validation against database
  return apiKey === process.env.ULTRAVOX_API_KEY;
};

// Authentication middleware
fastify.addHook('preHandler', async (request, reply) => {
  try {
    // Skip auth for public routes and health check
    if (request.url === '/health' || !request.url.startsWith('/api/')) {
      return;
    }

    // Check for API key authentication first
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      const isValidApiKey = await validateApiKey(apiKey);
      if (!isValidApiKey) {
        return reply.code(401).send({ error: 'Invalid API key' });
      }
      // Attach API client info to request
      request.apiClient = true;
      return;
    }

    // If no API key, require Clerk authentication for user routes
    const token = request.headers.authorization?.split(' ')[1];
    if (!token) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    await ClerkExpressRequireAuth()(request, reply);
  } catch (error) {
    reply.code(401).send({ error: 'Invalid authentication' });
  }
});

// Register route handlers
import contentRoutes from './routes/content.js';
fastify.register(contentRoutes);
import userRoutes from './routes/users.js';
fastify.register(userRoutes);
import chatRoutes from './routes/chat.js';
fastify.register(chatRoutes);
import toolRoutes from './routes/tools.js';
fastify.register(toolRoutes);

// Register static file serving for SvelteKit app
import fastifyStatic from '@fastify/static';
fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../site/build'),
  prefix: '/' // Serve at root path
});

// Health check route
fastify.get('/health', async () => {
  return { status: 'ok' };
});