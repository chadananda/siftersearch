// THE API RUNTIME every API service shares (docs/architecture/continuous-deploy.md; Chad 10-19: "we might be updating Anís
// while search API and index API continue to feed through cloudflare"): boot, listen, heartbeat, graceful drain of
// requests and jobs. Each service is a thin entry (api/index.js search · api/anis-index.js · api/ops-index.js) passing its
// route set and ROLE: primary (the search API) also migrates, seeds and runs the sync worker; anis searches (site registry,
// warm indexes); ops does nothing extra. Deps: http-server, the libs index.js used to import.
import { checkEnvironment, getEnvSummary } from './env-check.js';
import { createHttpServer } from './http-server.js';
import { logger } from './logger.js';
import { ensureServicesRunning, cleanupServices } from './services.js';
import { seedAdminUser, seedTestUser } from './auth.js';
import { runMigrations } from './migrations.js';
import { startSyncWorker, stopSyncWorker } from '../services/sync-worker.js';
import { stopEmbeddingWorker } from '../services/embedding-worker.js';
import { stopLibraryWatcher } from '../services/library-watcher.js';
import { config } from './config.js';
import { initAIProcessingState } from './ai-services.js';
import { prewarmCache, POPULAR_QUERIES, warmOlDocIdCache, ensureEngineFeatures } from './search.js';


export async function startApi({ name = 'siftersearch-api', routes = [], role = 'primary' } = {}) {
  const PRIMARY = role === 'primary';
  checkEnvironment({ exitOnError: true });
  // Validate all environment variables on startup
  // This will print a detailed report and exit if required vars are missing


  // Hoisted server reference so the shutdown handler can drain in-flight
  // requests via Fastify's close() before exit. Without this, a SIGINT
  // during a deploy would 503 every active chat stream.
  let runningServer = null;

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

      const server = await createHttpServer({ routes });
      runningServer = server;
      const port = parseInt(process.env.API_PORT || '3000', 10);
      const host = process.env.HOST || '0.0.0.0';

      // Startup work. In pm2 CLUSTER mode (API_PREBOOT=1, ecosystem.config.cjs) a reload keeps the old process serving
      // until this one is ready, so it does ALL of it BEFORE listening — the cluster master routes connections to a worker
      // the moment it listens, and requests landing on a process still migrating / building the ~5 s synchronous
      // encounter index timed out (measured 10-10: 8 failed probes per reload). Fork mode keeps the old order: listen
      // first so health checks answer during a cold boot.
      const preboot = process.env.API_PREBOOT === '1';
      const bootTasks = async () => {
        // Run database migrations AFTER listening so health checks work during migration.
        // In single-writer architecture, the unified worker is the authoritative migration runner.
        // API tolerates SQLITE_BUSY — the worker will complete the migration.
        try {
          const migrationResult = PRIMARY ? await runMigrations() : { applied: 0 };   // the writer migrates; only the primary API helps
          if (migrationResult.applied > 0) {
            logger.info(migrationResult, 'Database migrations applied');
          }
        } catch (err) {
          if (err.code === 'SQLITE_BUSY') {
            logger.warn({ err: err.message }, 'Migration blocked by worker (SQLITE_BUSY) — worker will complete it');
          } else {
            logger.error({ err }, 'Database migration failed');
            process.exit(1);
          }
        }

        // Load sites.yaml into the search-scope registry. Skipping this is
        // non-fatal — the search layer falls back to "primary only" scope, which
        // matches pre-sites behavior. But once the registry is loaded, default
        // Jafar will include supplementals (bahai-library, oceanoflights) and
        // site-only chatbots will route to their own indexes.
        try {
          const { setSiteRegistry } = await import('./search/scope.js');
          const { setAuthoritySiteRegistry } = await import('./authority.js');
          const { loadAllSiteConfigs } = await import('../services/sites-ingester.js');
          const configs = await loadAllSiteConfigs();
          setSiteRegistry(configs);
          setAuthoritySiteRegistry(configs);
          const supplemental = Object.values(configs).filter(c => c.scope === 'supplemental').map(c => c.id);
          const siteOnly = Object.values(configs).filter(c => c.scope === 'site-only').map(c => c.id);
          logger.info({ supplemental, site_only: siteOnly, total: Object.keys(configs).length }, 'Site registry loaded');
        } catch (err) {
          logger.warn({ err: err.message }, 'Site registry not loaded (no sites.yaml found, scope = primary only)');
        }

        // Seed admin user if configured
        try {
          const adminResult = PRIMARY ? await seedAdminUser() : null;
          if (adminResult) {
            logger.info({
              email: adminResult.email,
              action: adminResult.action
            }, 'Admin user seeded');
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to seed admin user');
        }

        // Seed the QA/test admin (TEST_ADMIN_EMAIL/PASS) if configured — self-healing test account
        try {
          const testResult = PRIMARY ? await seedTestUser() : null;
          if (testResult) logger.info({ email: testResult.email, action: testResult.action }, 'Test admin user seeded');
        } catch (err) {
          logger.warn({ err }, 'Failed to seed test admin user');
        }

        // Restore AI processing pause state from database
        try {
          await initAIProcessingState();
        } catch (err) {
          logger.warn({ err }, 'Failed to restore AI processing state');
        }
      };
      const warmIndexes = async () => {
        await import('./encounters.js').then((m) => m.getEncounterIndex()).catch((err) =>
          logger.warn({ err: err.message }, 'encounter index warm-up failed'));
        // people search's claim corpus loads on its own worker thread (claim-search.js) — started here, never awaited
        await import('./claim-search.js').then((m) => m.warmClaimSearch()).catch(() => {});
        await warmOlDocIdCache().catch((err) => logger.warn({ err }, 'Failed to pre-warm OL doc ID cache'));
      };
      // Preboot (pm2 cluster, behind the gateway): EVERYTHING before listening, warm-ups included. The old instance keeps
      // serving until this one sends 'ready', so a slow warm-up costs nothing — while warming AFTER listening froze the event
      // loop for ~24 s (the encounter query) with live conversations on it (10-19: 74 blocking reads in 'anis' in 3 h). The
      // 10-12 "a second or two" rule was for when a restart meant downtime; behind the gateway it no longer does.
      if (preboot) { await bootTasks(); await warmIndexes().catch((err) => logger.warn({ err: err.message }, 'warm-up failed (serving anyway)')); }

      await server.listen({ port, host });

      if (!preboot) {
        // Warm the who-met-whom index once, off the request path (a ~5 s synchronous build; searches never wait on it cold).
        setTimeout(() => import('./encounters.js').then((m) => m.getEncounterIndex()).catch((err) =>
          logger.warn({ err: err.message }, 'encounter index warm-up failed')), 20000).unref();
        await bootTasks();
      }

      // Stats cache no longer needs prewarm — counter table (migration 39) provides instant counts

      // Start background content sync worker (keeps Content Table → Meilisearch in sync)
      // Only if Meilisearch is enabled
      if (PRIMARY && config.search.enabled) {
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

        // Pre-warm caches (background, non-blocking)
        // Delayed by 5s to let Meilisearch finish any pending tasks first
        setTimeout(async () => {
          // Author/collection filters depend on this; initializeIndexes() does not run in the API.
          ensureEngineFeatures().catch(err => logger.warn({ err }, 'ensureEngineFeatures failed'));
          // OL doc ID cache — pre-warm immediately to prevent thundering-herd on first search wave
          if (!preboot) {   // preboot already built both before listening
            warmOlDocIdCache().catch(err => logger.warn({ err }, 'Failed to pre-warm OL doc ID cache'));
            import('./encounters.js').then((m) => m.getEncounterIndex())
              .catch(err => logger.warn({ err }, 'Failed to pre-warm encounter index'));
          }
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
      if (process.env.ANTHROPIC_API_KEY) features.push('anthropic');
      if (process.env.OLLAMA_HOST) features.push('local-ai');
      if (process.env.CLERK_SECRET_KEY) features.push('auth');
      if (process.env.MEILI_MASTER_KEY) features.push('search');
      if (process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== 'console') features.push('email');
      if (process.env.POSTHOG_SITE_KEY) features.push('analytics');

      if (features.length > 0) {
        logger.info({ features }, 'Enabled features');
      }

      // Signal PM2 that we're ready to accept connections.
      // PM2 wait_ready mode holds the old process alive until this fires,
      // enabling zero-downtime reloads.
      if (process.send) {
        process.send('ready');
      }

    } catch (err) {
      logger.fatal(err, 'Failed to start server');
      process.exit(1);
    }
  };

  // Graceful shutdown — drain in-flight requests, then clean up.
  // Critical for chat reliability during deploys: SSE streams in flight
  // must complete (not 503) when the api process is reloaded. Fastify's
  // server.close() refuses NEW connections but lets active ones finish.
  //
  // Idempotent: SIGINT during shutdown won't re-trigger.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down — draining in-flight requests');
    // Stop accepting new connections + wait for in-flight requests to finish.
    // Fastify's close() respects request lifecycle including streaming SSE.
    if (runningServer) {
      try {
        await runningServer.close();
        logger.info('Fastify server closed gracefully');
      } catch (err) {
        logger.warn({ err: err.message }, 'Server close error (continuing shutdown)');
      }
    }
    // …and the JOBS this instance runs (api/lib/jobs/async-jobs.js — Anís research answers, 40–120 s): the next instance
    // already serves the polls; this one finishes the work (pm2 kill_timeout 300 s gives the room)
    try {
      const left = await (await import('./jobs/async-jobs.js')).drain(280000);
      logger.info({ left }, left ? 'Shutdown: jobs still running at the drain budget' : 'Shutdown: jobs drained');
    } catch (err) { logger.warn({ err: err.message }, 'job drain failed (continuing shutdown)'); }
    stopSyncWorker();
    stopEmbeddingWorker();
    await stopLibraryWatcher();
    cleanupServices();
    process.exit(0);
  };

  // heartbeat (api/lib/service-heartbeat.js): this instance's version, state and the Anís answers it is researching
  {
    const [{ startHeartbeat }, jobs] = await Promise.all([import('./service-heartbeat.js'), import('./jobs/async-jobs.js')]);
    // only the pm2 API — the updater's pre-deploy test instance (port 7899) inherits the updater's name and must not report
    if (process.env.name === name) startHeartbeat({ name, state: () => ({ inflight: jobs.inFlight(), draining_requests: shuttingDown }) });
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await start();

}
