/**
 * SifterSearch API Entry Point
 *
 * Validates environment and starts the Fastify server.
 * Run with: node api/index.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get project root (one level up from api/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Load environment files: .env-secrets first (overrides), then .env-public (defaults)
// Use absolute paths to ensure it works regardless of working directory
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { checkEnvironment, getEnvSummary } from './lib/env-check.js';
import { createServer } from './server.js';
import { logger } from './lib/logger.js';
import { ensureServicesRunning, cleanupServices } from './lib/services.js';
import { seedAdminUser } from './lib/auth.js';
import { runMigrations } from './lib/migrations.js';
import { startSyncWorker, stopSyncWorker } from './services/sync-worker.js';
import { startEmbeddingWorker, stopEmbeddingWorker } from './services/embedding-worker.js';
import { stopLibraryWatcher } from './services/library-watcher.js';
import { config } from './lib/config.js';
import { initAIProcessingState } from './lib/ai-services.js';
import { prewarmCache, POPULAR_QUERIES } from './lib/search.js';

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

    // Run database migrations AFTER listening so health checks work during migration.
    // Migration 39 seeds counter table with COUNT queries (~15s on 2.5M rows) — one-time cost.
    try {
      const migrationResult = await runMigrations();
      if (migrationResult.applied > 0) {
        logger.info(migrationResult, 'Database migrations applied');
      }
    } catch (err) {
      logger.error({ err }, 'Database migration failed');
      process.exit(1);
    }

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

    // Restore AI processing pause state from database
    try {
      await initAIProcessingState();
    } catch (err) {
      logger.warn({ err }, 'Failed to restore AI processing state');
    }

    // Stats cache no longer needs prewarm — counter table (migration 39) provides instant counts

    // Start background content sync worker (keeps Content Table → Meilisearch in sync)
    // Only if Meilisearch is enabled
    if (config.search.enabled) {
      try {
        startSyncWorker();
        logger.info('Content sync worker started');
      } catch (err) {
        logger.warn({ err }, 'Failed to start sync worker');
      }

      // Embedding worker disabled in API — its getUnembedded() query scans 2.5M rows
      // every 5 seconds, blocking the event loop and causing health check timeouts.
      // TODO: Move to standalone PM2 process like library-watcher
      logger.info('Embedding worker disabled in API (blocks event loop), needs standalone process');

      // Pre-warm search cache with popular queries (background, non-blocking)
      // Delayed by 5s to let Meilisearch finish any pending tasks first
      setTimeout(async () => {
        try {
          const result = await prewarmCache(POPULAR_QUERIES);
          logger.info({ warmed: result.warmed, elapsedMs: result.elapsedMs }, 'Search cache pre-warmed');
        } catch (err) {
          logger.warn({ err }, 'Failed to pre-warm search cache');
        }
      }, 5000);
    } else {
      logger.info('Meilisearch disabled (MEILISEARCH_ENABLED=false), sync worker not started');
    }

    // Library watcher runs as separate PM2 process (siftersearch-library-watcher)
    // Do NOT start it inside the API — it duplicates work and consumes memory
    logger.info('Library watcher is a standalone process, skipping in API');

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
  stopSyncWorker();
  stopEmbeddingWorker();
  await stopLibraryWatcher();
  cleanupServices();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
