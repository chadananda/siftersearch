/**
 * Fastify Server Configuration
 * Sets up plugins, routes, and error handling
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { loggerConfig } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import sessionRoutes from './routes/session.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import documentsRoutes from './routes/documents.js';
import servicesRoutes from './routes/services.js';
import anonymousRoutes from './routes/anonymous.js';
import { config } from './lib/config.js';

export async function createServer(opts = {}) {
  const server = Fastify({
    logger: loggerConfig,
    trustProxy: true,
    ...opts
  });

  // CORS - allow configured origins
  const allowedOrigins = config.server.corsOrigins.split(',').map(o => o.trim());
  await server.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Also allow any *.pages.dev subdomain (for Cloudflare previews)
      if (origin.endsWith('.pages.dev')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true
  });

  // Cookies (for refresh tokens)
  await server.register(cookie, {
    secret: process.env.JWT_REFRESH_SECRET,
    hook: 'onRequest'
  });

  // Rate limiting
  if (config.rateLimit.enabled) {
    await server.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.windowMs
    });
  }

  // Request logging hook - log all incoming requests
  server.addHook('onRequest', async (request) => {
    const { method, url, headers } = request;
    const origin = headers.origin || 'no-origin';
    const userAgent = headers['user-agent']?.substring(0, 50) || 'unknown';
    request.log.info({
      msg: '→ REQUEST',
      method,
      url,
      origin,
      userAgent
    });
  });

  // Response logging hook - log response status
  server.addHook('onResponse', async (request, reply) => {
    const { method, url } = request;
    const { statusCode } = reply;
    // In Fastify 5, elapsedTime is available on the reply object
    const responseTime = reply.elapsedTime || 0;
    request.log.info({
      msg: '← RESPONSE',
      method,
      url,
      statusCode,
      responseTimeMs: Math.round(responseTime)
    });
  });

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.1'
  }));

  // API routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(searchRoutes, { prefix: '/api/search' });
  await server.register(sessionRoutes, { prefix: '/api/session' });
  await server.register(userRoutes, { prefix: '/api/user' });
  await server.register(adminRoutes, { prefix: '/api/admin' });
  await server.register(documentsRoutes, { prefix: '/api/documents' });
  await server.register(servicesRoutes, { prefix: '/api/services' });
  await server.register(anonymousRoutes, { prefix: '/api/anonymous' });

  // Error handling
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  return server;
}
