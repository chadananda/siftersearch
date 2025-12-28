/**
 * Fastify Server Configuration
 * Sets up plugins, routes, and error handling
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { spawn } from 'child_process';
import { join } from 'path';
import { createRequire } from 'module';
import { loggerConfig } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

// Get server version from package.json
const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require('../package.json');
import authRoutes from './routes/auth.js';
import searchRoutes from './routes/search.js';
import sessionRoutes from './routes/session.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import documentsRoutes from './routes/documents.js';
import servicesRoutes from './routes/services.js';
import anonymousRoutes from './routes/anonymous.js';
import librarianRoutes from './routes/librarian.js';
import publicApiRoutes from './routes/public-api.js';
import deployRoutes from './routes/deploy.js';
import forumRoutes from './routes/forum.js';
import donationRoutes from './routes/donations.js';
import libraryRoutes from './routes/library.js';
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

  // Track if update already triggered (to avoid spamming)
  let updateTriggered = false;

  // Version check hook - trigger auto-update if client is newer
  // Only triggers for authenticated requests to prevent DDOS abuse
  server.addHook('onRequest', async (request) => {
    const clientVersion = request.headers['x-client-version'];
    const hasAuth = request.headers.authorization?.startsWith('Bearer ');

    // Only trigger for authenticated requests with version header
    if (!clientVersion || updateTriggered || !hasAuth) return;

    // Compare versions
    const clientParts = clientVersion.split('.').map(Number);
    const serverParts = SERVER_VERSION.split('.').map(Number);
    const clientNewer = clientParts[0] > serverParts[0] ||
      (clientParts[0] === serverParts[0] && clientParts[1] > serverParts[1]) ||
      (clientParts[0] === serverParts[0] && clientParts[1] === serverParts[1] && clientParts[2] > serverParts[2]);

    if (clientNewer) {
      request.log.info({ clientVersion, serverVersion: SERVER_VERSION }, 'Client newer than server, triggering update');
      updateTriggered = true;

      // Run update script in background (don't block request)
      const scriptPath = join(process.cwd(), 'scripts', 'update-server.js');
      const child = spawn('node', [scriptPath], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd()
      });
      child.unref();
    }
  });

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION
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
  await server.register(librarianRoutes, { prefix: '/api/librarian' });
  await server.register(publicApiRoutes, { prefix: '/api/v1' });
  await server.register(deployRoutes, { prefix: '/api/deploy' });
  await server.register(forumRoutes, { prefix: '/api/forum' });
  await server.register(donationRoutes, { prefix: '/api/donations' });
  await server.register(libraryRoutes, { prefix: '/api/library' });

  // Error handling
  server.setErrorHandler(errorHandler);
  server.setNotFoundHandler(notFoundHandler);

  return server;
}
