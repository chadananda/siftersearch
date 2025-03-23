// server/routes/api/index.js
import { clerkPlugin, getAuth } from '@clerk/fastify';

/**
 * Main API routes plugin for Fastify
 */
export default async function apiRoutes(fastify, options) {
  // Register authentication middleware
  fastify.addHook('preHandler', (request, reply, done) => {
    // Get auth data from Clerk
    const { userId, sessionId, getToken } = getAuth(request);
    request.auth = { userId, sessionId, getToken };
    done();
  });

  // Health check endpoint (public)
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Protected routes - require authentication
  fastify.register(async (protectedApi, opts) => {
    // Add authentication check for all routes in this plugin
    protectedApi.addHook('preHandler', async (request, reply) => {
      if (!request.auth.userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });

    // User info endpoint
    protectedApi.get('/user', async (request, reply) => {
      return { userId: request.auth.userId };
    });

    // Register sub-route plugins
    await protectedApi.register(import('./documents.js'), { prefix: '/documents' });
    await protectedApi.register(import('./sites.js'), { prefix: '/sites' });
    await protectedApi.register(import('./analytics.js'), { prefix: '/analytics' });
    await protectedApi.register(import('./config.js'), { prefix: '/config' });
  });
}
