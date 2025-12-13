/**
 * SifterSearch API Entry Point
 *
 * Validates environment and starts the Fastify server.
 * Run with: node api/index.js
 */

import dotenv from 'dotenv';

// Load environment files: .env-secrets first (overrides), then .env-public (defaults)
// Secrets are loaded first so they take precedence over public defaults
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { checkEnvironment, getEnvSummary } from './lib/env-check.js';
import { createServer } from './server.js';
import { logger } from './lib/logger.js';
import { ensureServicesRunning, cleanupServices, getServicesStatus } from './lib/services.js';
import { seedAdminUser } from './lib/auth.js';

// Validate all environment variables on startup
// This will print a detailed report and exit if required vars are missing
checkEnvironment({ exitOnError: true });

// Start server
const start = async () => {
  try {
    // Ensure required services (Meilisearch) are running
    logger.info('Starting required services...');
    const serviceResults = await ensureServicesRunning();

    for (const [name, result] of Object.entries(serviceResults)) {
      if (result.error) {
        logger.error({ service: name, error: result.error }, 'Service failed to start');
        process.exit(1);
      }
    }

    const server = await createServer();
    const port = parseInt(process.env.API_PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    // Seed admin user if configured
    try {
      const adminResult = await seedAdminUser();
      if (adminResult) {
        logger.info({
          email: adminResult.email,
          action: adminResult.action
        }, 'Admin user seeded');
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to seed admin user');
    }

    // Log startup summary
    const envSummary = getEnvSummary();
    logger.info({
      port,
      host,
      env: process.env.NODE_ENV || 'development',
      devMode: process.env.DEV_MODE === 'true',
      envVars: {
        configured: envSummary.configured,
        warnings: envSummary.warnings
      }
    }, 'Server started');

    // Log available features based on configuration
    const features = [];
    if (process.env.OPENAI_API_KEY) features.push('embeddings', 'audio-tts');
    if (process.env.ANTHROPIC_API_KEY) features.push('claude-ai');
    if (process.env.OLLAMA_HOST) features.push('local-ai');
    if (process.env.CLERK_SECRET_KEY) features.push('auth');
    if (process.env.MEILI_MASTER_KEY) features.push('search');
    if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'console') features.push('email');
    if (process.env.POSTHOG_SITE_KEY) features.push('analytics');

    if (features.length > 0) {
      logger.info({ features }, 'Enabled features');
    }

  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutting down');
  cleanupServices();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
