/**
 * Fastify Server Configuration
 * Sets up plugins, routes, and error handling
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';

export async function createServer(opts = {}) {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    ...opts
  });

  // CORS
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:4321',
    credentials: true
  });

  // Cookies (for refresh tokens)
  await server.register(cookie, {
    secret: process.env.JWT_REFRESH_SECRET,
    hook: 'onRequest'
  });

  // Rate limiting
  if (process.env.ENABLE_RATE_LIMITING !== 'false') {
    await server.register(rateLimit, {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
    });
  }

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.1'
  }));

  // API routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  // await server.register(searchRoutes, { prefix: '/api/search' });
  // await server.register(userRoutes, { prefix: '/api/user' });
  // await server.register(adminRoutes, { prefix: '/api/admin' });

  // Error handling
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  return server;
}
