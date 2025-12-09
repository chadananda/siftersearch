/**
 * SifterSearch API Entry Point
 * Validates environment and starts the Fastify server
 */

import 'dotenv/config';
import { createServer } from './server.js';
import { logger } from './lib/logger.js';

// Required environment variables
const REQUIRED_ENV = [
  'NODE_ENV',
  'PORT',
  'TURSO_DATABASE_URL',
  'MEILI_HOST',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
];

// Validate environment
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  logger.fatal({ missing }, 'Missing required environment variables');
  process.exit(1);
}

// Start server
const start = async () => {
  try {
    const server = await createServer();
    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info({ port, host, env: process.env.NODE_ENV }, 'Server started');
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
