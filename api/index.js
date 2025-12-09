/**
 * SifterSearch API Entry Point
 * Validates environment and starts the Fastify server
 */

import dotenv from 'dotenv';

// Load environment files: .env-public (checked in) + .env-secrets (gitignored)
dotenv.config({ path: '.env-public' });
dotenv.config({ path: '.env-secrets' });

import { createServer } from './server.js';
import { logger } from './lib/logger.js';

// Required environment variables (from .env-public)
const REQUIRED_PUBLIC = [
  'API_PORT',
  'TURSO_DATABASE_URL'
];

// Required secrets (from .env-secrets)
const REQUIRED_SECRETS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
];

const REQUIRED_ENV = [...REQUIRED_PUBLIC, ...REQUIRED_SECRETS];

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
    const port = parseInt(process.env.API_PORT || '3000', 10);
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
