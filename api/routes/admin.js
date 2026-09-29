/**
 * Admin Routes
 *
 * All routes require admin tier authentication.
 *
 * User Management:
 * GET /api/admin/stats - Dashboard statistics
 * GET /api/admin/users - List users
 * PUT /api/admin/users/:id - Update user (tier, ban, etc.)
 * GET /api/admin/pending - Users awaiting approval
 * POST /api/admin/approve/:id - Approve a user
 *
 * Document Indexing:
 * POST /api/admin/index - Index a document
 * POST /api/admin/index/batch - Batch index documents
 * DELETE /api/admin/index/:id - Remove document from index
 * GET /api/admin/index/status - Get indexing queue status
 *
 * Server Management (requires admin JWT or X-Internal-Key header):
 * GET /api/admin/server/status - Overview: database + Meilisearch stats + task counts
 * GET /api/admin/server/tables - List database tables with row counts
 * GET /api/admin/server/indexes - Meilisearch index details and field distribution
 * POST /api/admin/server/migrate - Run database migrations
 * POST /api/admin/server/validate - Validate script parameters without running
 * POST /api/admin/server/reindex - Re-index library (filters: religion, collection, path, documentId)
 * POST /api/admin/server/fix-languages - Fix RTL language detection (filters: limit, religion, dryRun)
 * POST /api/admin/server/populate-translations - Generate translations (filters: limit, language, documentId)
 * DELETE /api/admin/server/translations - Clear all translations (optional: documentId query param)
 * POST /api/admin/server/translate-document - Translate specific document with aligned segments
 * POST /api/admin/server/test-translation - Test translation API (text or paragraphId, dry-run by default)
 * POST /api/admin/server/resegment-document - Re-ingest document from source file with AI segmentation
 * POST /api/admin/server/ingest-file - Ingest document from file path (creates new or updates existing)
 * POST /api/admin/server/fix-file-hashes - Fix NULL file_hash values for docs with file_paths
 * DELETE /api/admin/server/document/:documentId - Delete document completely (DB + Meilisearch)
 * GET /api/admin/server/document/:documentId - Get document info with segmentation stats
 * GET /api/admin/server/documents-needing-resegment - List documents needing resegmentation
 * GET /api/admin/server/tasks - List all background tasks with status
 * GET /api/admin/server/tasks/:taskId - Get detailed task output
 * POST /api/admin/server/tasks/:taskId/cancel - Cancel a running task
 * DELETE /api/admin/server/tasks - Clear completed tasks from memory
 *
 * Job Queue Monitoring:
 * GET /api/admin/server/job-queue - Comprehensive job queue status (counts, processor health, recent jobs)
 * POST /api/admin/server/job-queue/process/:jobId - Force process a pending job immediately
 * POST /api/admin/server/job-queue/reset/:jobId - Reset a failed/stuck job to pending
 * DELETE /api/admin/server/job-queue/cleanup - Clear old completed/failed jobs
 */

import { join } from 'path';
import { query, queryOne, queryAll, userQuery, userQueryOne, userQueryAll } from '../lib/db.js';
import { config } from '../lib/config.js';
import { readFileSync } from 'fs';
import { ApiError } from '../lib/errors.js';
import { requireTier, requireInternal } from '../lib/auth.js';
// Traces store JSON in columns so the table stays queryable; expand for human/agent reading.
const expandTrace = (r) => {
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return { ...r, filters: parse(r.filters_json), layers: parse(r.layers_json), timings: parse(r.timings_json), relaxed: parse(r.relaxed_json) };
};

import { getStats as getSearchStats, getMeili, probeSearchEngine } from '../lib/search.js';
import { EMB_TOTAL_SQL, EMB_MISSING_SQL } from '../lib/pipeline/snapshot-queries.js';
import { indexDocumentFromText, batchIndexDocuments, indexFromJSON, removeDocument, getIndexingStatus, migrateEmbeddingsFromMeilisearch, getEmbeddingCacheStats } from '../services/indexer.js';
import { getSyncStats, forceSyncNow, getUnsyncedCount } from '../services/sync-worker.js';
import { getWatcherStats, isWatcherRunning } from '../services/library-watcher.js';
import { spawn } from 'child_process';
import { logger } from '../lib/logger.js';
import { isAIProcessingPaused, resumeAIProcessing, getAllDailySpending } from '../lib/ai-services.js';
import { content } from '../lib/content.js';
import { createApiKey, listApiKeys, revokeApiKey, getAllApiKeys } from '../lib/api-keys.js';

// Track background tasks
const backgroundTasks = new Map();

// Pipeline status snapshot. Generated out-of-process by scripts/pipeline-snapshot.js
// (PM2 cron every 5 min) so its heavy synchronous queries never block this API.
// GET /api/admin/server/pipeline just reads this file.
const PIPELINE_SNAPSHOT_PATH = join(process.cwd(), 'data', 'pipeline-status.json');
const PIPELINE_STALE_S = 600; // flag snapshots older than 10 min

// Test accounts (users.is_test=1, e.g. the QA test-admin) never appear in admin views or analytics.
const NOT_TEST_USER = 'COALESCE(is_test, 0) = 0';
const NOT_TEST_EVENT = '(user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE is_test = 1))';

// Heavy admin rollups (library overview/bottlenecks, ai-usage summary) are precomputed
// out-of-process by scripts/pipeline-snapshot.js — better-sqlite3 is synchronous, so a
// full content/ai_usage scan in-request blocks the ENTIRE API for its duration. Read the
// snapshot here; fall back to live queries only when the section has never been computed
// (dev, where the cron doesn't run and tables are small).
function readAdminSnapshot() {
  try { return JSON.parse(readFileSync(PIPELINE_SNAPSHOT_PATH, 'utf8')); } catch { return null; }
}

export default async function adminRoutes(fastify) {
  // Note: Server management routes (/server/*) use requireInternal which accepts
  // either X-Internal-Key header or admin JWT. Other routes use requireTier('admin').
  // We don't use a global hook here to allow route-specific auth handlers.

  // Dashboard statistics
  fastify.get('/stats', { preHandler: requireTier('admin') }, async () => {
    const [userStats, searchStats, analyticsStats] = await Promise.all([
      userQueryOne(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN tier = 'verified' THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN tier = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN tier = 'patron' THEN 1 ELSE 0 END) as patron,
          SUM(CASE WHEN tier = 'admin' THEN 1 ELSE 0 END) as admin,
          SUM(CASE WHEN tier = 'banned' THEN 1 ELSE 0 END) as banned,
          SUM(CASE WHEN approved_at IS NULL AND tier = 'verified' THEN 1 ELSE 0 END) as pending
        FROM users
        WHERE ${NOT_TEST_USER}
      `),
      getSearchStats().catch(() => ({ documents: { numberOfDocuments: 0 }, paragraphs: { numberOfDocuments: 0 } })),
      userQueryOne(`
        SELECT
          COUNT(*) as total_events,
          SUM(cost_usd) as total_cost,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics
        WHERE created_at > datetime('now', '-30 days')
          AND ${NOT_TEST_EVENT}
      `)
    ]);

    return {
      users: userStats,
      search: searchStats,
      analytics: {
        last30Days: analyticsStats
      }
    };
  });

  // Low-token pipeline + Meili health snapshot. Reads the JSON written
  // out-of-process by scripts/pipeline-snapshot.js (PM2 cron, ~5 min) so this
  // endpoint never runs heavy queries on the live API. Instant file read.
  fastify.get('/server/pipeline', { preHandler: requireInternal }, async () => {
    let snap;
    try {
      snap = JSON.parse(readFileSync(PIPELINE_SNAPSHOT_PATH, 'utf8'));
    } catch {
      return { status: 'unavailable', message: 'Snapshot not generated yet — pipeline-snapshot cron may not have run.' };
    }
    const ageS = snap.generated_at ? Math.round((Date.now() - Date.parse(snap.generated_at)) / 1000) : null;
    return { ...snap, age_s: ageS, stale: ageS != null && ageS > PIPELINE_STALE_S };
  });

  // Dashboard summary — health + top-line analytics (visits, searches, chat, spend).
  // Composed entirely from the precomputed admin snapshot (no heavy in-request scans);
  // only a single light users COUNT runs live. The Analytics page (/analytics/deep)
  // carries the deeper breakdowns.
  fastify.get('/dashboard', { preHandler: requireTier('admin') }, async () => {
    const snap = readAdminSnapshot() || {};
    const users = await userQueryOne(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN approved_at IS NULL AND tier = 'verified' THEN 1 ELSE 0 END) AS pending
      FROM users WHERE ${NOT_TEST_USER}`).catch(() => null);

    // ── Health: derive a red/amber/green per subsystem the monitor already tracks.
    const ageS = snap.generated_at ? Math.round((Date.now() - Date.parse(snap.generated_at)) / 1000) : null;
    const stale = ageS != null && ageS > PIPELINE_STALE_S;
    const workers = snap.workers && !snap.workers.error ? snap.workers : {};
    // Only the always-on processes are health-critical; the retired enrichment
    // pollers are intentionally pm2-stopped (see CLAUDE.md) and must not alarm.
    const CRITICAL = ['api', 'worker'];
    const criticalDown = CRITICAL.filter((w) => workers[w] && workers[w].status !== 'online');
    const checks = [
      { key: 'snapshot', ok: !stale, detail: ageS == null ? 'never generated' : `${ageS}s old` },
      { key: 'workers', ok: criticalDown.length === 0, detail: criticalDown.length ? `down: ${criticalDown.join(', ')}` : 'core online' },
      { key: 'meilisearch', ok: !snap.meili?.error, detail: snap.meili?.error || `${snap.meili?.paragraphs_docs ?? '?'} paras` },
      { key: 'content', ok: !snap.integrity?.alert, detail: snap.integrity?.alert || `${snap.integrity?.live_paras ?? '?'} live paras` },
    ];
    const failed = checks.filter((c) => !c.ok);
    const status = failed.some((c) => ['workers', 'meilisearch', 'content'].includes(c.key)) ? 'down'
      : failed.length ? 'warn' : 'ok';

    // ── Visits (Cloudflare). Sum the daily buckets for 1d/7d; null if the token
    // lacks Analytics:Read (cloudflare.error) — the UI shows "unavailable" then.
    const cf = snap.cloudflare;
    let visits = null;
    if (cf && !cf.error && Array.isArray(cf.daily) && cf.daily.length) {
      const last = cf.daily[cf.daily.length - 1] || {};
      const last7 = cf.daily.slice(-7);
      visits = {
        d1_pageViews: last.pageViews ?? 0,
        d1_uniques: last.uniques ?? 0,
        d7_pageViews: last7.reduce((s, d) => s + (d.pageViews ?? 0), 0),
        d7_uniques: last7.reduce((s, d) => s + (d.uniques ?? 0), 0),
        d7_requests: last7.reduce((s, d) => s + (d.requests ?? 0), 0),
      };
    }

    const a = snap.activity?.totals || {};
    const ai = snap.aiUsage?.combined || {};
    return {
      generated_at: snap.generated_at || null,
      age_s: ageS,
      health: { status, checks },
      current_activity: snap.current_activity || null,
      corpus: snap.corpus && !snap.corpus.error ? snap.corpus : null,
      users: { total: users?.total ?? 0, pending: users?.pending ?? 0 },
      visits,
      visits_available: !!visits,
      searches: { d1: a.searches_d1 ?? 0, d7: a.searches_d7 ?? 0, zero_result_d7: a.zero_result_d7 ?? 0, avg_ms_d7: a.avg_ms_d7 ? Math.round(a.avg_ms_d7) : null },
      chat: {
        d1: a.chat_d1 ?? 0, d7: a.chat_d7 ?? 0,
        users_d7: a.chat_users_d7 ?? 0, users_all: a.chat_users_all ?? 0,
        saved: a.saved_conversations ?? 0,
      },
      spend: {
        today: ai.today_cost ?? 0,
        week: ai.week_cost ?? 0,
        month: ai.month_cost ?? 0,
        failed_week: ai.failed_week ?? 0,
        byCallerToday: (snap.aiUsage?.byCallerToday || []).slice(0, 6),
      },
    };
  });

  // Deep analytics — full series + breakdowns for the /admin/analytics page.
  // Cloudflare traffic + sources (from the snapshot) and our own search/indexing/
  // spend internals. Still snapshot-backed; no live heavy scans.
  fastify.get('/analytics/deep', { preHandler: requireTier('admin') }, async () => {
    const snap = readAdminSnapshot() || {};
    return {
      generated_at: snap.generated_at || null,
      cloudflare: snap.cloudflare || null,
      activity: snap.activity || null,
      spend: {
        combined: snap.aiUsage?.combined || null,
        byProvider: snap.aiUsage?.byProvider || [],
        byModel: snap.aiUsage?.byModel || [],
        byCaller: snap.aiUsage?.byCaller || [],
      },
      indexing: {
        extraction_remaining: snap.entity_pipeline?.extraction_remaining ?? null,
        content_sync_backlog: snap.content_sync_backlog ?? null,
        embeddings: snap.embeddings || null,
        meili: snap.meili || null,
        priority_books: snap.priority_books || [],
      },
    };
  });

  // List users with pagination and filtering
  fastify.get('/users', {
    preHandler: requireTier('admin'),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          tier: { type: 'string' },
          search: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 20, offset = 0, tier, search } = request.query;

    let sql = `
      SELECT id, email, name, tier, preferred_language, created_at, approved_at
      FROM users
      WHERE ${NOT_TEST_USER}
    `;
    const params = [];

    if (tier) {
      sql += ' AND tier = ?';
      params.push(tier);
    }

    if (search) {
      sql += ' AND (email LIKE ? OR name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = await userQueryAll(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as count FROM users WHERE ${NOT_TEST_USER}`;
    const countParams = [];
    if (tier) {
      countSql += ' AND tier = ?';
      countParams.push(tier);
    }
    if (search) {
      countSql += ' AND (email LIKE ? OR name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await userQueryOne(countSql, countParams);

    return {
      users,
      total: countResult.count,
      limit,
      offset
    };
  });

  // Get users pending approval
  fastify.get('/pending', { preHandler: requireTier('admin') }, async () => {
    const users = await userQueryAll(`
      SELECT id, email, name, created_at, referred_by
      FROM users
      WHERE tier = 'verified' AND approved_at IS NULL AND ${NOT_TEST_USER}
      ORDER BY created_at ASC
    `);

    return { users };
  });

  // Update user
  fastify.put('/users/:id', {
    preHandler: requireTier('admin'),
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer' }
        }
      },
      body: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['verified', 'approved', 'patron', 'institutional', 'admin', 'banned'] },
          name: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { tier, name } = request.body;

    // Check user exists
    const user = await userQueryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const updates = [];
    const values = [];

    if (tier !== undefined) {
      updates.push('tier = ?');
      values.push(tier);

      // Set approved_at if upgrading to approved or higher
      if (['approved', 'patron', 'institutional', 'admin'].includes(tier)) {
        updates.push('approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)');
      }
    }

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (updates.length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    values.push(id);
    await userQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedUser = await userQueryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Approve a user (shortcut for setting tier to 'approved')
  fastify.post('/approve/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await userQueryOne('SELECT id, tier FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (user.tier !== 'verified') {
      throw ApiError.badRequest('User is not in verified tier');
    }

    await userQuery(
      `UPDATE users SET tier = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    const updatedUser = await userQueryOne(
      'SELECT id, email, name, tier, created_at, approved_at FROM users WHERE id = ?',
      [id]
    );

    return { user: updatedUser };
  });

  // Ban a user
  fastify.post('/ban/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    const user = await userQueryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Prevent self-ban
    if (user.id === request.user.sub) {
      throw ApiError.badRequest('Cannot ban yourself');
    }

    await userQuery(`UPDATE users SET tier = 'banned' WHERE id = ?`, [id]);

    return { success: true };
  });

  // Recent analytics events
  fastify.get('/analytics', {
    preHandler: requireTier('admin'),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          eventType: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { limit = 50, eventType } = request.query;

    let sql = `
      SELECT a.*, u.email as user_email
      FROM analytics a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE COALESCE(u.is_test, 0) = 0
    `;
    const params = [];

    if (eventType) {
      sql += ' AND a.event_type = ?';
      params.push(eventType);
    }

    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(limit);

    const events = await userQueryAll(sql, params);

    return { events };
  });

  // ===== Document Indexing Routes =====

  // Index a single document from text
  fastify.post('/index', {
    preHandler: requireTier('admin'),
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 100 },
          metadata: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              author: { type: 'string' },
              religion: { type: 'string' },
              collection: { type: 'string' },
              language: { type: 'string' },
              year: { type: 'integer' },
              description: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (request) => {
    const { text, metadata = {} } = request.body;

    try {
      const result = await indexDocumentFromText(text, metadata);
      return result;
    } catch (err) {
      throw ApiError.internal(`Indexing failed: ${err.message}`);
    }
  });

  // Batch index documents from JSON
  fastify.post('/index/batch', {
    preHandler: requireTier('admin'),
    schema: {
      body: {
        type: 'object',
        properties: {
          documents: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string' },
                metadata: { type: 'object' }
              }
            }
          },
          // Alternative: structured book format
          title: { type: 'string' },
          author: { type: 'string' },
          chapters: { type: 'array' }
        }
      }
    }
  }, async (request) => {
    try {
      const results = await indexFromJSON(request.body);
      return {
        indexed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (err) {
      throw ApiError.internal(`Batch indexing failed: ${err.message}`);
    }
  });

  // Remove a document from the index
  fastify.delete('/index/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;

    try {
      const result = await removeDocument(id);
      return result;
    } catch (err) {
      throw ApiError.internal(`Failed to remove document: ${err.message}`);
    }
  });

  // Remove all documents by author from the index
  fastify.delete('/index/by-author/:author', {
    preHandler: requireInternal,
    schema: {
      params: {
        type: 'object',
        required: ['author'],
        properties: {
          author: { type: 'string', description: 'Author name (partial match)' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false, description: 'Preview without deleting' }
        }
      }
    }
  }, async (request) => {
    const { author } = request.params;
    const { dryRun = false } = request.query;
    const { getMeili, INDEXES } = await import('../lib/search.js');

    try {
      const meili = getMeili();

      // Search for all documents by this author
      const results = await meili.index(INDEXES.DOCUMENTS).search('', {
        filter: `author = "${author}"`,
        limit: 1000
      });

      // If no exact match, try contains
      let docs = results.hits;
      if (docs.length === 0) {
        const allDocs = await meili.index(INDEXES.DOCUMENTS).search(author, {
          attributesToSearchOn: ['author'],
          limit: 1000
        });
        docs = allDocs.hits.filter(d =>
          d.author && d.author.toLowerCase().includes(author.toLowerCase())
        );
      }

      if (docs.length === 0) {
        return { success: true, message: `No documents found for author: ${author}`, deleted: 0 };
      }

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          message: `Would delete ${docs.length} documents`,
          documents: docs.map(d => ({ id: d.id, title: d.title, author: d.author }))
        };
      }

      // Delete all found documents
      let deleted = 0;
      const errors = [];

      for (const doc of docs) {
        try {
          await removeDocument(doc.id);
          deleted++;
        } catch (err) {
          errors.push({ id: doc.id, error: err.message });
        }
      }

      logger.info({ author, deleted, errors: errors.length }, 'Deleted documents by author');

      return {
        success: true,
        message: `Deleted ${deleted} documents by author: ${author}`,
        deleted,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (err) {
      throw ApiError.internal(`Failed to delete documents by author: ${err.message}`);
    }
  });

  // Get indexing queue status
  fastify.get('/index/status', { preHandler: requireTier('admin') }, async () => {
    try {
      return await getIndexingStatus();
    } catch (err) {
      throw ApiError.internal(`Failed to get indexing status: ${err.message}`);
    }
  });

  // ===== Server Management Routes =====
  // These routes use requireInternal which accepts either:
  // 1. X-Internal-Key header with INTERNAL_API_KEY value (for server-to-server)
  // 2. Standard admin JWT authentication

  /**
   * Get server status - database stats, Meilisearch stats, etc.
   */
  // PM2 process roster — is the thing that is supposed to be running actually running? Every other way to
  // answer that needs an ssh session, which the control-plane rule rules out (and a cron one-shot newly added
  // to ecosystem.config.cjs is exactly the case where "did it register?" is unanswerable otherwise). Read-only:
  // shells `pm2 jlist` and returns the essentials. Cheap — no DB work, unlike /server/status.
  fastify.get('/server/processes', { preHandler: requireInternal }, async () => {
    const { execFile } = await import('node:child_process');
    const jlist = await new Promise((resolve) => {
      execFile('pm2', ['jlist'], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      });
    });
    if (!jlist) return { available: false, note: 'pm2 jlist unavailable from the API process' };
    const procs = jlist.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status ?? null,
      pid: p.pid || null,
      restarts: p.pm2_env?.restart_time ?? null,
      cron: p.pm2_env?.cron_restart ?? null,
      // A cron one-shot spends most of its life 'stopped'; created_at moving is how you see it firing.
      last_start: p.pm2_env?.created_at ? new Date(p.pm2_env.created_at).toISOString() : null,
      uptime_s: p.pm2_env?.pm_uptime && p.pm2_env?.status === 'online'
        ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) : null,
      memory_mb: p.monit?.memory ? Math.round(p.monit.memory / 1048576) : null,
    })).sort((a, b) => a.name.localeCompare(b.name));
    return { available: true, count: procs.length, processes: procs };
  });

  // DECLARED vs ACTUAL, in one call. Every deployment surprise here has been a gap between what the repo
  // says should run and what does — cron apps declared but unknown to pm2, an updater running stale code, a
  // migration written but never applied. Each cost an investigation; each is one comparison.
  fastify.get('/server/reconcile', { preHandler: requireInternal }, async () => {
    const { reconcile } = await import('../lib/reconcile.js');
    const { execFile } = await import('node:child_process');
    const { CURRENT_VERSION, USER_DB_CURRENT_VERSION } = await import('../lib/migrations/runner.js');

    const processes = await new Promise((resolve) => {
      execFile('pm2', ['jlist'], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve(null);
        try {
          resolve(JSON.parse(stdout).map((p) => ({
            name: p.name, status: p.pm2_env?.status ?? null, restarts: p.pm2_env?.restart_time ?? null,
            last_start: p.pm2_env?.created_at ? new Date(p.pm2_env.created_at).toISOString() : null,
          })));
        } catch { resolve(null); }
      });
    });

    // Applied schema versions, read the same way the runner reads them.
    const applied = { content: null, user: null };
    try { applied.content = (await queryOne('PRAGMA user_version'))?.user_version ?? null; } catch { /* unreadable */ }
    try { applied.user = (await userQueryOne('PRAGMA user_version'))?.user_version ?? null; } catch { /* unreadable */ }

    const result = reconcile({
      processes,
      schemaVersion: applied,
      expectedSchema: { content: CURRENT_VERSION, user: USER_DB_CURRENT_VERSION },
      // Version skew is deliberately NOT checked here: this process can only report its own version, so
      // comparing it to itself always passes. The updater owns that comparison (it knows the git HEAD).
    });
    // Swallowed-error counters belong in the same place you already look for drift: a path failing silently
    // 400 times is drift between what the code believes and what the database allows.
    const { swallowedCounts, swallowedTotal } = await import('../lib/swallow.js');
    return {
      ...result,
      applied_schema: applied,
      expected_schema: { content: CURRENT_VERSION, user: USER_DB_CURRENT_VERSION },
      swallowed: { total: swallowedTotal(), worst: swallowedCounts({ limit: 10 }) },
    };
  });

  fastify.get('/server/status', { preHandler: requireInternal }, async () => {
    const [dbStats, embeddingStats, embeddingDimCheck, searchStats] = await Promise.all([
      // Database stats (content + user databases)
      Promise.all([
        queryOne('SELECT COUNT(*) as count FROM docs'),
        queryOne('SELECT COUNT(*) as count FROM content'),
        userQueryOne(`SELECT COUNT(*) as count FROM users WHERE ${NOT_TEST_USER}`),
        queryOne('SELECT COUNT(*) as count FROM library_nodes')
      ]).then(([docs, content, users, nodes]) => ({
        docs: docs?.count || 0,
        content: content?.count || 0,
        users: users?.count || 0,
        libraryNodes: nodes?.count || 0
      })).catch(() => ({ docs: 0, content: 0, users: 0, libraryNodes: 0 })),
      // Embedding stats
      // `embedding IS NOT NULL` read a 512-float blob per row: a 47s freeze of the whole API (slow_query_log,
      // 2026-09-24). Same derivation as pipeline/snapshot-queries.js: with = total − missing (partial index).
      Promise.all([EMB_TOTAL_SQL, EMB_MISSING_SQL].map((sql) => queryOne(sql)))
        .then(([total, missing]) => [{ count: Math.max(0, (total?.n || 0) - (missing?.n || 0)) }, { count: missing?.n || 0 }])
        .then(([withEmbed, withoutEmbed]) => ({
        withEmbeddings: withEmbed?.count || 0,
        withoutEmbeddings: withoutEmbed?.count || 0,
        coverage: withEmbed?.count && (withEmbed.count + (withoutEmbed?.count || 0)) > 0
          ? Math.round(withEmbed.count / (withEmbed.count + (withoutEmbed?.count || 0)) * 100)
          : 0
      })).catch(() => ({ withEmbeddings: 0, withoutEmbeddings: 0, coverage: 0 })),
      // Check embedding dimensions (sample 5 to check size)
      queryAll(`
        SELECT id, LENGTH(embedding) as bytes, embedding_model
        FROM content
        WHERE embedding IS NOT NULL
        LIMIT 5
      `).then(rows => {
        if (rows.length === 0) return { samples: 0 };
        // Each float is 4 bytes, so dimensions = bytes / 4
        const dims = rows.map(r => ({ id: r.id, dimensions: r.bytes / 4, model: r.embedding_model }));
        return { samples: rows.length, dimensions: dims[0].dimensions, model: dims[0].model };
      }).catch(() => ({ samples: 0 })),
      // Meilisearch stats
      getSearchStats().catch(() => ({ totalDocuments: 0, totalPassages: 0 }))
    ]);

    return {
      database: dbStats,
      embeddings: { ...embeddingStats, ...embeddingDimCheck },
      meilisearch: {
        documents: searchStats.totalDocuments || 0,
        paragraphs: searchStats.totalPassages || 0
      },
      backgroundTasks: {
        running: [...backgroundTasks.values()].filter(t => t.status === 'running').length,
        completed: [...backgroundTasks.values()].filter(t => t.status === 'completed').length,
        failed: [...backgroundTasks.values()].filter(t => t.status === 'failed').length
      }
    };
  });

  /**
   * Run database migrations
   */
  fastify.post('/server/migrate', { preHandler: requireInternal }, async () => {
    const { runMigrations } = await import('../lib/migrations.js');

    try {
      const result = await runMigrations();
      logger.info(result, 'Migrations run via API');
      return {
        success: true,
        ...result
      };
    } catch (err) {
      logger.error({ error: err.message }, 'Migration failed via API');
      throw ApiError.internal(`Migration failed: ${err.message}`);
    }
  });

  /**
   * Backfill normalized_hash for existing content
   * This is a long-running operation (400k+ rows) - runs in background
   * POST /api/admin/server/backfill-normalized-hash
   */
  fastify.post('/server/backfill-normalized-hash', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          batchSize: { type: 'number', default: 1000 }
        }
      }
    }
  }, async (request) => {
    const { batchSize = 1000 } = request.body || {};
    const crypto = await import('crypto');

    // Check how many need processing
    const countResult = await queryOne('SELECT COUNT(*) as count FROM content WHERE normalized_hash IS NULL AND text IS NOT NULL');
    const totalRows = countResult?.count || 0;

    if (totalRows === 0) {
      return { success: true, message: 'All content already has normalized_hash', totalRows: 0, updated: 0 };
    }

    // Normalization function (same as in indexer.js)
    function normalizeForEmbedding(text) {
      return text
        .replace(/<[^>]+>/g, '')           // Remove HTML tags
        .replace(/\s+/g, ' ')              // Collapse whitespace
        .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation
        .toLowerCase()
        .trim();
    }

    function computeNormalizedHash(text) {
      const normalized = normalizeForEmbedding(text);
      return crypto.createHash('md5').update(normalized).digest('hex');
    }

    // Process in batches
    let totalUpdated = 0;
    const startTime = Date.now();

    while (true) {
      const rows = await queryAll(
        `SELECT id, text FROM content
         WHERE normalized_hash IS NULL AND text IS NOT NULL
         LIMIT ?`,
        [batchSize]
      );

      if (rows.length === 0) break;

      for (const row of rows) {
        const hash = computeNormalizedHash(row.text);
        await content.updateNormalizedHash(row.id, hash);
      }

      totalUpdated += rows.length;

      // Log progress every 10 batches
      if ((totalUpdated / batchSize) % 10 === 0) {
        const pct = Math.round((totalUpdated / totalRows) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info({ totalUpdated, totalRows, pct: `${pct}%`, elapsed: `${elapsed}s` }, 'Backfill progress');
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info({ totalUpdated, elapsed: `${elapsed}s` }, 'Backfill complete');

    return {
      success: true,
      message: `Backfilled normalized_hash for ${totalUpdated} rows`,
      totalRows,
      updated: totalUpdated,
      elapsedSeconds: parseFloat(elapsed)
    };
  });

  /**
   * Helper to run a script as a background task
   */
  function runBackgroundTask(taskId, scriptPath, args = []) {
    const task = {
      id: taskId,
      script: scriptPath,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: [],
      errors: [],
      exitCode: null,
      childProcess: null
    };

    backgroundTasks.set(taskId, task);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    // Store reference for cancellation
    task.childProcess = child;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      task.output.push(...lines);
      // Keep only last 100 lines
      if (task.output.length > 100) {
        task.output = task.output.slice(-100);
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      task.errors.push(...lines);
    });

    child.on('close', (code) => {
      // Don't override cancelled status
      if (task.status === 'running') {
        task.status = code === 0 ? 'completed' : 'failed';
      }
      task.exitCode = code;
      task.completedAt = task.completedAt || new Date().toISOString();
      task.childProcess = null; // Clean up reference
      logger.info({ taskId, exitCode: code, status: task.status }, 'Background task completed');
    });

    child.on('error', (err) => {
      task.status = 'failed';
      task.errors.push(err.message);
      task.childProcess = null;
      logger.error({ taskId, error: err.message }, 'Background task error');
    });

    return task;
  }

  /**
   * Start library re-indexing (background task)
   * Supports granular filtering by religion, collection, or path pattern
   */
  fastify.post('/server/reindex', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          force: { type: 'boolean', default: false },
          limit: { type: 'integer', minimum: 1 },
          religion: { type: 'string', description: 'Filter by religion name (e.g., "Bahai", "Islam")' },
          collection: { type: 'string', description: 'Filter by collection name' },
          author: { type: 'string', description: 'Filter by author name (partial match, e.g., "Bab")' },
          path: { type: 'string', description: 'Filter by path pattern (glob)' },
          documentId: { type: 'string', description: 'Re-index a single document by ID' },
          dir: { type: 'string', description: "Library-relative directory to index (e.g. \"Baha'i/Core Tablets\")" },
          dryRun: { type: 'boolean', default: false },
          localOnly: { type: 'boolean', default: false, description: 'Local models only: never fall back to paid cloud' }
        }
      }
    }
  }, async (request) => {
    const { force = false, limit, religion, collection, author, path, documentId, dir, dryRun = false, localOnly = false } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('reindex');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-indexing is already in progress');
    }

    const args = [];
    // `dir` is the script's positional path — `--path` below was never read by index-library.js, so the job
    // always scanned the whole library.
    if (dir) {
      const { resolve, relative } = await import('path');
      const abs = resolve(config.library.basePath, dir);
      if (relative(config.library.basePath, abs).startsWith('..')) throw ApiError.badRequest('dir must be inside the library');
      args.push(abs);
    }
    if (dryRun) args.push('--dry-run');
    if (localOnly) args.push('--local-only');
    if (force) args.push('--force');
    if (limit) args.push(`--limit=${limit}`);
    if (religion) args.push(`--religion=${religion}`);
    if (collection) args.push(`--collection=${collection}`);
    if (author) args.push(`--author=${author}`);
    if (path) args.push(`--path=${path}`);
    if (documentId) args.push(`--document=${documentId}`);

    const task = runBackgroundTask('reindex', 'scripts/index-library.js', args);

    logger.info({ args }, 'Library re-indexing started via API');

    return {
      success: true,
      taskId: 'reindex',
      message: 'Library re-indexing started in background',
      filters: { force, limit, religion, collection, author, path, documentId, dir, dryRun, localOnly },
      status: task.status
    };
  });

  /**
   * Re-ingest a single document from its source file (background task)
   * Uses the new AI-based segmentation for concept-based paragraph breaks
   */
  fastify.post('/server/reingest-document', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to re-ingest' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.body;

    // Check if already running
    const existing = backgroundTasks.get('reingest');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-ingestion is already in progress');
    }

    const task = runBackgroundTask('reingest', 'scripts/reingest-document.js', [documentId]);

    logger.info({ documentId }, 'Document re-ingestion started via API');

    return {
      success: true,
      taskId: 'reingest',
      message: `Re-ingestion started for document: ${documentId}`,
      documentId,
      status: task.status
    };
  });

  /**
   * Re-ingest a document from its source file with AI-based segmentation
   * Reads from the original markdown file, not from database paragraphs
   * POST /api/admin/server/resegment-document
   */
  fastify.post('/server/resegment-document', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to re-ingest from source file' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.body;

    // Check document has a file_path
    const doc = await queryOne('SELECT id, file_path FROM docs WHERE id = ?', [documentId]);
    if (!doc) {
      throw ApiError.notFound(`Document not found: ${documentId}`);
    }
    if (!doc.file_path) {
      throw ApiError.badRequest(`Document has no source file path: ${documentId}`);
    }

    // Check if already running
    const existing = backgroundTasks.get('resegment');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Re-segmentation is already in progress');
    }

    // Use reingest-document.js which reads from source file
    const task = runBackgroundTask('resegment', 'scripts/reingest-document.js', [documentId]);

    logger.info({ documentId }, 'Document re-ingestion from source started via API');

    return {
      success: true,
      taskId: 'resegment',
      message: `Re-ingestion from source file started for document: ${documentId}`,
      documentId,
      filePath: doc.file_path,
      status: task.status
    };
  });

  /**
   * Ingest a document from a file path (creates new or updates existing)
   * POST /api/admin/server/ingest-file
   */
  fastify.post('/server/ingest-file', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['filePath'],
        properties: {
          filePath: { type: 'string', description: 'Absolute path to the markdown file' },
          forceReindex: { type: 'boolean', default: false, description: 'Force re-ingestion even if unchanged' },
          localOnly: { type: 'boolean', default: false, description: 'Local models only: never fall back to a paid cloud model' }
        }
      }
    }
  }, async (request) => {
    const { filePath, forceReindex = false, localOnly = false } = request.body;
    const { readFile, stat } = await import('fs/promises');
    const { ingestDocument, getDocumentByPath } = await import('../services/ingester.js');

    // Check file exists
    try {
      await stat(filePath);
    } catch {
      throw ApiError.notFound(`File not found: ${filePath}`);
    }

    // Read file content. (Named fileText: it was `content`, shadowing the content module, so forceReindex's
    // content.deleteParagraphsByDoc threw AFTER clearing file_hash.)
    const fileText = await readFile(filePath, 'utf-8');

    // Documents are keyed by their path RELATIVE to the library base ("Baha'i/Core Tablets/…") — religion and
    // collection come from its first two segments. An absolute path made every ingest fail with
    // "religion=null, collection=home" (2026-09-28).
    const { relative, isAbsolute } = await import('path');
    const libPath = isAbsolute(filePath) ? relative(config.library.basePath, filePath) : filePath;
    if (libPath.startsWith('..')) throw ApiError.badRequest(`File is outside the library base (${config.library.basePath})`);

    // Check if document already exists by file_path
    const existing = await getDocumentByPath(libPath);

    // If forceReindex and document exists, clear content to force re-ingestion
    if (forceReindex && existing) {
      await content.deleteParagraphsByDoc(existing.id);
      // ALL three hashes: with body_hash intact the ingester takes its "metadata changed only" path and never
      // recreates the paragraphs just deleted — a force re-index would leave the document empty.
      await query('UPDATE docs SET file_hash = NULL, body_hash = NULL, body_hash_normalized = NULL WHERE id = ?', [existing.id]);
      // Also clear old paragraphs from Meilisearch to prevent orphans
      try {
        const meili = getMeili();
        if (meili) {
          await meili.index('paragraphs').deleteDocuments({
            filter: `doc_id = ${existing.id}`
          });
        }
      } catch (err) {
        logger.warn({ docId: existing.id, err: err.message }, 'Failed to clear old paragraphs from Meilisearch during force re-index');
      }
      logger.info({ filePath, docId: existing.id }, 'Force re-index: cleared existing content');
    }

    // Ingest the document (ingester handles ID generation/lookup internally)
    logger.info({ filePath, existing: !!existing }, 'Ingesting document from file');

    const { withAIContext } = await import('../lib/ai-context.js');
    const result = await withAIContext({ caller: 'ingest-file', localOnly },
      () => ingestDocument(fileText, {}, libPath));

    return {
      success: true,
      documentId: result.documentId,
      status: result.status,
      paragraphCount: result.paragraphCount,
      sentences: result.sentenceCount ?? null,
      language: result.language ?? null,
      error: result.error ?? null,
      // forceReindex deletes the paragraphs BEFORE ingesting; if the ingest then skips or fails, the document is
      // left empty (two tablets were, 2026-09-28). Say so — never let that read as success.
      ...(forceReindex && existing && !['updated', 'ingested'].includes(result.status)
        ? { warning: `paragraphs deleted but re-ingest ended '${result.status}' — document ${existing.id} is EMPTY` } : {}),
      isNew: !existing
    };
  });

  /**
   * Fix NULL file_hash values for documents with file_paths
   * POST /api/admin/server/fix-file-hashes
   */
  fastify.post('/server/fix-file-hashes', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false, description: 'Preview without updating' },
          limit: { type: 'integer', minimum: 1, description: 'Limit number of documents to process' }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false, limit } = request.body || {};
    const { createHash } = await import('crypto');
    const { readFile, stat } = await import('fs/promises');

    // Find documents with file_path but no file_hash
    let sql = `
      SELECT id, title, file_path
      FROM docs
      WHERE file_path IS NOT NULL AND (file_hash IS NULL OR file_hash = '')
    `;
    const params = [];
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const docs = await queryAll(sql, params);

    if (docs.length === 0) {
      return {
        success: true,
        message: 'All documents with file_path already have file_hash',
        fixed: 0
      };
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        message: `Would fix ${docs.length} documents`,
        documents: docs.map(d => ({ id: d.id, title: d.title, path: d.file_path }))
      };
    }

    // Fix each document
    let fixed = 0;
    const errors = [];

    for (const doc of docs) {
      try {
        // Check if file exists
        await stat(doc.file_path);

        // Read file and compute hash
        const content = await readFile(doc.file_path, 'utf-8');
        const hash = createHash('md5').update(content).digest('hex');

        // Update database
        await query('UPDATE docs SET file_hash = ? WHERE id = ?', [hash, doc.id]);
        fixed++;

        logger.info({ docId: doc.id, hash: hash.substring(0, 8) }, 'Fixed file_hash');
      } catch (err) {
        errors.push({ id: doc.id, error: err.message });
      }
    }

    logger.info({ fixed, errors: errors.length }, 'File hash fix completed');

    return {
      success: true,
      message: `Fixed file_hash for ${fixed} documents`,
      fixed,
      total: docs.length,
      errors: errors.length > 0 ? errors : undefined
    };
  });

  /**
   * Delete a document completely (docs table + content table + Meilisearch)
   * DELETE /api/admin/server/document/:documentId
   */
  fastify.delete('/server/document/:documentId', {
    preHandler: requireInternal,
    schema: {
      params: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to delete' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          keepMeili: { type: 'boolean', default: false, description: 'Keep Meilisearch entries' },
          force: { type: 'boolean', default: false, description: 'Purge even a canonical doc holding live content (IRREVERSIBLE)' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.params;
    const { keepMeili = false, force = false } = request.query || {};

    // Check document exists
    const doc = await queryOne('SELECT id, title FROM docs WHERE id = ?', [documentId]);
    if (!doc) {
      throw ApiError.notFound(`Document not found: ${documentId}`);
    }

    // GUARD THE IRREVERSIBLE CASE (2026-08-26). This endpoint HARD-deletes: the row and its paragraphs are
    // gone, not soft-deleted. Soft deletion is the only reason the June restore was possible at all —
    // 14,588 paragraphs of 20 canonicals came back because the rows were still there. A hard purge of a
    // canonical forecloses that permanently, and this path had no check of any kind.
    //
    // The capability is kept; the dangerous case now has to be stated. force=true purges anyway.
    if (!force) {
      const { purgeSafety } = await import('../lib/docs-repo.js');
      const s = await purgeSafety(documentId);
      if (s.exists && s.canonical && s.live > 0) {
        throw ApiError.badRequest(
          `REFUSED: doc ${documentId} ("${doc.title}") is a CANONICAL document holding ${s.live} live ` +
          `paragraphs, and this endpoint deletes PERMANENTLY. Soft-delete via POST /api/admin/docs/delete ` +
          `(reversible, guarded), or pass force=true if you truly mean to purge it.`);
      }
      if (s.exists && s.dependants > 0) {
        throw ApiError.badRequest(
          `REFUSED: ${s.dependants} live document(s) point at doc ${documentId} as their canonical; ` +
          `purging it orphans them. Re-point them first, or pass force=true.`);
      }
    }

    // Delete from content table
    const contentResult = await content.deleteParagraphsByDoc(documentId);
    logger.info({ documentId, contentDeleted: contentResult.changes }, 'Deleted content rows');

    // Delete from docs table
    const docResult = await query('DELETE FROM docs WHERE id = ?', [documentId]);
    logger.info({ documentId, docDeleted: docResult.changes }, 'Deleted doc row');

    // Delete from Meilisearch (unless keepMeili)
    let meiliDeleted = false;
    if (!keepMeili) {
      try {
        const meili = getMeili();

        // Delete document from documents index
        await meili.index('documents').deleteDocument(documentId);

        // Delete paragraphs from paragraphs index
        await meili.index('paragraphs').deleteDocuments({
          filter: `doc_id = ${documentId}`
        });

        meiliDeleted = true;
        logger.info({ documentId }, 'Deleted from Meilisearch');
      } catch (err) {
        logger.warn({ documentId, error: err.message }, 'Failed to delete from Meilisearch');
      }
    }

    return {
      success: true,
      documentId,
      title: doc.title,
      deleted: {
        contentRows: contentResult.changes,
        docRow: docResult.changes,
        meilisearch: meiliDeleted
      }
    };
  });

  /**
   * Get document info including content paragraph counts and segmentation stats
   * GET /api/admin/server/document/:documentId
   */
  fastify.get('/server/document/:documentId', {
    preHandler: requireInternal,
    schema: {
      params: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to inspect' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.params;

    // Get document metadata
    const doc = await queryOne('SELECT * FROM docs WHERE id = ?', [documentId]);
    if (!doc) {
      throw ApiError.notFound(`Document not found: ${documentId}`);
    }

    // Get content stats
    const contentStats = await queryOne(`
      SELECT
        COUNT(*) as paragraph_count,
        SUM(CASE WHEN translation IS NOT NULL THEN 1 ELSE 0 END) as translated_count,
        SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded_count,
        SUM(LENGTH(text)) as total_chars,
        AVG(LENGTH(text)) as avg_paragraph_chars,
        MAX(LENGTH(text)) as max_paragraph_chars,
        SUM(CASE WHEN LENGTH(text) > 1500 THEN 1 ELSE 0 END) as oversized_count,
        SUM(CASE WHEN LENGTH(text) >= 1480 AND LENGTH(text) <= 1520 THEN 1 ELSE 0 END) as hard_cut_count
      FROM content
      WHERE doc_id = ?
    `, [documentId]);

    // Get sample paragraphs
    const sampleParagraphs = await queryAll(`
      SELECT paragraph_index, LENGTH(text) as chars,
             SUBSTR(text, 1, 100) as preview,
             CASE WHEN translation IS NOT NULL THEN 1 ELSE 0 END as has_translation
      FROM content
      WHERE doc_id = ?
      ORDER BY paragraph_index
      LIMIT 10
    `, [documentId]);

    return {
      document: doc,
      content: {
        paragraphCount: contentStats.paragraph_count || 0,
        translatedCount: contentStats.translated_count || 0,
        embeddedCount: contentStats.embedded_count || 0,
        totalChars: contentStats.total_chars || 0,
        avgParagraphChars: Math.round(contentStats.avg_paragraph_chars || 0),
        maxParagraphChars: contentStats.max_paragraph_chars || 0,
        oversizedCount: contentStats.oversized_count || 0,
        hardCutCount: contentStats.hard_cut_count || 0
      },
      segmentationHealth: {
        hasHardCuts: (contentStats.hard_cut_count || 0) > 0,
        hasOversized: (contentStats.oversized_count || 0) > 0,
        needsResegment: (contentStats.hard_cut_count || 0) > 0 || (contentStats.oversized_count || 0) > 0
      },
      sampleParagraphs
    };
  });

  /**
   * List documents that need resegmentation (have hard cuts or oversized paragraphs)
   * GET /api/admin/server/documents-needing-resegment
   */
  fastify.get('/server/documents-needing-resegment', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
          language: { type: 'string', description: 'Filter by language' }
        }
      }
    }
  }, async (request) => {
    const { limit = 50, language } = request.query || {};

    let sql = `
      SELECT
        d.id, d.title, d.language, d.author,
        COUNT(c.id) as paragraph_count,
        SUM(CASE WHEN LENGTH(c.text) >= 1480 AND LENGTH(c.text) <= 1520 THEN 1 ELSE 0 END) as hard_cut_count,
        SUM(CASE WHEN LENGTH(c.text) > 1500 THEN 1 ELSE 0 END) as oversized_count
      FROM docs d
      INNER JOIN content c ON c.doc_id = d.id
    `;

    const params = [];
    if (language) {
      sql += ' WHERE d.language = ?';
      params.push(language);
    }

    sql += `
      GROUP BY d.id
      HAVING hard_cut_count > 0 OR oversized_count > 0
      ORDER BY hard_cut_count DESC, oversized_count DESC
      LIMIT ?
    `;
    params.push(limit);

    const docs = await queryAll(sql, params);

    return {
      documents: docs,
      count: docs.length,
      totalHardCuts: docs.reduce((sum, d) => sum + d.hard_cut_count, 0),
      totalOversized: docs.reduce((sum, d) => sum + d.oversized_count, 0)
    };
  });

  /**
   * Fix RTL language detection (background task)
   * Scans documents and corrects language field based on content analysis
   */
  fastify.post('/server/fix-languages', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, description: 'Limit number of documents to process' },
          religion: { type: 'string', description: 'Filter by religion name' },
          dryRun: { type: 'boolean', default: false, description: 'Preview changes without applying' }
        }
      }
    }
  }, async (request) => {
    const { limit, religion, dryRun } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('fix-languages');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Language fix is already in progress');
    }

    const args = [];
    if (limit) args.push(`--limit=${limit}`);
    if (religion) args.push(`--religion=${religion}`);
    if (dryRun) args.push('--dry-run');

    const task = runBackgroundTask('fix-languages', 'scripts/fix-rtl-languages.js', args);

    logger.info({ args }, 'RTL language fix started via API');

    return {
      success: true,
      taskId: 'fix-languages',
      message: 'RTL language fix started in background',
      filters: { limit, religion, dryRun },
      status: task.status
    };
  });

  /**
   * Start translation population (background task)
   */
  fastify.post('/server/populate-translations', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1 },
          language: { type: 'string', enum: ['ar', 'fa', 'he', 'ur'] },
          documentId: { type: 'string' },
          force: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const { limit, language, documentId, force } = request.body || {};

    // Check if already running
    const existing = backgroundTasks.get('translations');
    if (existing && existing.status === 'running') {
      throw ApiError.conflict('Translation population is already in progress');
    }

    const args = [];
    if (limit) args.push(`--limit=${limit}`);
    if (language) args.push(`--language=${language}`);
    if (documentId) args.push(`--document=${documentId}`);
    if (force) args.push('--force');

    const task = runBackgroundTask('translations', 'scripts/populate-translations.js', args);

    logger.info({ args }, 'Translation population started via API');

    return {
      success: true,
      taskId: 'translations',
      message: 'Translation population started in background',
      status: task.status
    };
  });

  /**
   * Clear translations from content table
   * DELETE /api/admin/server/translations
   *
   * Query params:
   * - documentId: Clear translations for a specific document
   * - pattern: Clear translations for all documents matching pattern (SQL LIKE)
   *   Example: pattern=the_b_b clears all Báb documents
   * - If neither provided, clears ALL translations (dangerous!)
   */
  fastify.delete('/server/translations', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Clear only this document (optional)' },
          pattern: { type: 'string', description: 'Clear documents with doc_id LIKE %pattern% (optional)' }
        }
      }
    }
  }, async (request) => {
    const { documentId, pattern } = request.query || {};

    let result;
    if (documentId) {
      result = await content.clearTranslationsForDoc(documentId);
      logger.info({ documentId, rowsAffected: result.rowsAffected }, 'Cleared translations for document');
    } else if (pattern) {
      // Clear translations for documents matching pattern
      const likePattern = `%${pattern}%`;
      // TODO: migrate to content API when pattern-match clear is added
      result = await query(
        'UPDATE content SET translation = NULL, translation_segments = NULL, synced = 0 WHERE doc_id LIKE ? AND translation IS NOT NULL',
        [likePattern]
      );
      logger.info({ pattern, rowsAffected: result.rowsAffected }, 'Cleared translations matching pattern');
    } else {
      result = await content.clearAllTranslations();
      logger.info({ rowsAffected: result.rowsAffected }, 'Cleared all translations');
    }

    return {
      success: true,
      message: documentId
        ? `Cleared translations for document: ${documentId}`
        : pattern
          ? `Cleared translations matching pattern: ${pattern}`
          : 'Cleared all translations',
      rowsAffected: result.rowsAffected
    };
  });

  /**
   * Translate a specific document with aligned segments
   * POST /api/admin/server/translate-document
   *
   * Uses optimized combined translation (reading + study in single API call)
   */
  fastify.post('/server/translate-document', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string' },
          sourceLang: { type: 'string', default: 'ar' },
          targetLang: { type: 'string', default: 'en' }
        }
      }
    }
  }, async (request) => {
    const { documentId, sourceLang = 'ar', targetLang = 'en' } = request.body;

    // Import optimized combined translation function
    const { translateCombined } = await import('../services/translation.js');

    // Get document info for context
    const doc = await queryOne('SELECT title, author, collection, religion FROM docs WHERE id = ?', [documentId]);

    // Get paragraphs for this document
    const paragraphs = await queryAll(
      'SELECT id, doc_id, paragraph_index, text FROM content WHERE doc_id = ? ORDER BY paragraph_index',
      [documentId]
    );

    if (paragraphs.length === 0) {
      throw ApiError.notFound(`No content found for document: ${documentId}`);
    }

    // Build document context
    const documentContext = doc ? `
## Document Context
Title: ${doc.title || 'Unknown'}
Author: ${doc.author || 'Unknown'}
Collection: ${doc.collection || 'Unknown'}
` : '';

    logger.info({ documentId, paragraphCount: paragraphs.length }, 'Starting optimized document translation');

    const results = [];
    let prevPara = null;

    for (const para of paragraphs) {
      try {
        // Use combined translation (reading + study in one call)
        const result = await translateCombined({
          text: para.text,
          sourceLang,
          targetLang,
          contentType: 'scripture',
          documentContext,
          previousParagraph: prevPara,
          hasMarkers: false
        });

        // Store as JSON with both reading and study translations (segments embedded in JSON)
        const translationJson = JSON.stringify({
          reading: result.reading,
          study: result.study,
          segments: result.segments || [],
          notes: result.notes || []
        });

        await content.updateTranslation(para.id, translationJson);

        // Update context for next paragraph
        prevPara = {
          original: para.text,
          translation: result.reading
        };

        results.push({
          paragraphIndex: para.paragraph_index,
          segmentCount: result.segments?.length || 0,
          hasStudy: !!result.study,
          success: true
        });
      } catch (err) {
        logger.error({ err, paragraphId: para.id }, 'Translation failed for paragraph');
        results.push({
          paragraphIndex: para.paragraph_index,
          error: err.message,
          success: false
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info({ documentId, successCount, total: paragraphs.length }, 'Document translation complete');

    return {
      success: successCount === paragraphs.length,
      documentId,
      translated: successCount,
      total: paragraphs.length,
      results,
      viewUrls: {
        study: `/print/study?doc=${documentId}`,
        reading: `/print/reading?doc=${documentId}`
      }
    };
  });

  /**
   * Test translation API - translate text directly without job queue
   * POST /api/admin/server/test-translation
   *
   * Useful for testing translation prompts and segment generation.
   * Does NOT save to database by default (dry-run mode).
   *
   * Body:
   * - text: The text to translate (required if no paragraphId)
   * - paragraphId: ID of existing paragraph to translate (optional)
   * - sourceLang: Source language code (default: 'ar')
   * - targetLang: Target language code (default: 'en')
   * - contentType: Type of content (default: 'scripture')
   * - save: Whether to save result to database (default: false)
   */
  fastify.post('/server/test-translation', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          paragraphId: { type: 'string', description: 'Paragraph ID to translate from database' },
          sourceLang: { type: 'string', default: 'ar' },
          targetLang: { type: 'string', default: 'en' },
          contentType: { type: 'string', default: 'scripture' },
          save: { type: 'boolean', default: false }
        }
      }
    }
  }, async (request) => {
    const { text, paragraphId, sourceLang = 'ar', targetLang = 'en', contentType = 'scripture', save = false } = request.body;

    // Import translation function
    const { translateCombined } = await import('../services/translation.js');

    let inputText = text;
    let docContext = '';
    let paragraph = null;

    // If paragraphId provided, fetch from database
    if (paragraphId) {
      paragraph = await queryOne(
        'SELECT c.id, c.doc_id, c.paragraph_index, c.text, d.title, d.author, d.collection FROM content c LEFT JOIN docs d ON c.doc_id = d.id WHERE c.id = ?',
        [paragraphId]
      );
      if (!paragraph) {
        throw ApiError.notFound(`Paragraph not found: ${paragraphId}`);
      }
      inputText = paragraph.text;
      docContext = paragraph.title ? `
## Document Context
Title: ${paragraph.title || 'Unknown'}
Author: ${paragraph.author || 'Unknown'}
Collection: ${paragraph.collection || 'Unknown'}
` : '';
    }

    if (!inputText) {
      throw ApiError.badRequest('Either text or paragraphId is required');
    }

    logger.info({
      inputLength: inputText.length,
      sourceLang,
      targetLang,
      hasContext: !!docContext,
      paragraphId: paragraphId || null
    }, 'Test translation request');

    const startTime = Date.now();

    try {
      // Call translation service directly
      const result = await translateCombined({
        text: inputText,
        sourceLang,
        targetLang,
        contentType,
        documentContext: docContext,
        previousParagraph: null,
        hasMarkers: false
      });

      const duration = Date.now() - startTime;

      // Validate segments
      const segmentsValid = result.segments && Array.isArray(result.segments) && result.segments.length > 0;
      let segmentIntegrity = false;

      if (segmentsValid) {
        const normalizeText = (t) => t.replace(/\s+/g, ' ').trim();
        const originalNormalized = normalizeText(inputText);
        const segmentsJoined = normalizeText(result.segments.map(s => s.original).join(' '));
        segmentIntegrity = originalNormalized === segmentsJoined;
      }

      // Save to database if requested (segments embedded in translation JSON)
      if (save && paragraph) {
        const translationJson = JSON.stringify({
          reading: result.reading,
          study: result.study,
          segments: result.segments || [],
          notes: result.notes || []
        });

        await content.updateTranslation(paragraph.id, translationJson);
        logger.info({ paragraphId }, 'Test translation saved to database');
      }

      return {
        success: true,
        duration: `${duration}ms`,
        input: {
          text: inputText,
          length: inputText.length,
          sourceLang,
          targetLang
        },
        translation: {
          reading: result.reading,
          study: result.study,
          notes: result.notes || null
        },
        segments: {
          count: result.segments?.length || 0,
          valid: segmentsValid,
          integrityCheck: segmentIntegrity,
          data: result.segments || []
        },
        saved: save && !!paragraph
      };
    } catch (err) {
      logger.error({ err, inputLength: inputText.length }, 'Test translation failed');
      return {
        success: false,
        duration: `${Date.now() - startTime}ms`,
        error: err.message,
        input: {
          text: inputText.substring(0, 100) + (inputText.length > 100 ? '...' : ''),
          length: inputText.length,
          sourceLang,
          targetLang
        }
      };
    }
  });

  /**
   * List documents with content available for translation
   * GET /api/admin/server/translatable-docs
   */
  fastify.get('/server/translatable-docs', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'Filter by language (e.g., ar)' },
          limit: { type: 'integer', default: 20 }
        }
      }
    }
  }, async (request) => {
    const { language, limit = 20 } = request.query || {};

    // Get documents with content, grouped by doc_id
    let sql = `
      SELECT
        c.doc_id,
        d.title,
        d.language,
        COUNT(*) as paragraph_count,
        SUM(CASE WHEN c.translation IS NOT NULL THEN 1 ELSE 0 END) as translated_count
      FROM content c
      LEFT JOIN docs d ON c.doc_id = d.id
      GROUP BY c.doc_id
    `;

    const params = [];
    if (language) {
      sql += ` HAVING d.language = ?`;
      params.push(language);
    }

    sql += ` ORDER BY paragraph_count ASC LIMIT ?`;
    params.push(limit);

    const docs = await queryAll(sql, params);

    return {
      documents: docs,
      count: docs.length
    };
  });

  /**
   * Trigger server update (shortcut for /server/pull-update)
   * Pulls latest from git and reloads PM2
   */
  fastify.post('/update', { preHandler: requireInternal }, async () => {
    // Check if update already running
    const existing = backgroundTasks.get('pull-update');
    if (existing && existing.status === 'running') {
      return {
        success: false,
        message: 'Update already in progress',
        status: existing.status
      };
    }

    logger.info('Server update triggered via /update endpoint');
    const task = runBackgroundTask('pull-update', 'scripts/update-server.js', []);

    return {
      success: true,
      taskId: 'pull-update',
      message: 'Server update started in background',
      status: task.status
    };
  });

  /**
   * Pull and restart server (for version updates)
   * Called by client when it detects client version > server version
   */
  fastify.post('/server/pull-update', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          clientVersion: { type: 'string' }
        }
      }
    }
  }, async (request) => {
    const { clientVersion } = request.body || {};

    // Check if update already running
    const existing = backgroundTasks.get('pull-update');
    if (existing && existing.status === 'running') {
      return {
        success: false,
        message: 'Update already in progress',
        status: existing.status
      };
    }

    logger.info({ clientVersion }, 'Server update triggered by admin');

    const task = runBackgroundTask('pull-update', 'scripts/update-server.js', []);

    return {
      success: true,
      taskId: 'pull-update',
      message: 'Server update started in background',
      clientVersion,
      status: task.status
    };
  });

  /**
   * Get status of background tasks
   */
  fastify.get('/server/tasks', { preHandler: requireInternal }, async () => {
    const tasks = {};
    for (const [id, task] of backgroundTasks) {
      tasks[id] = {
        id: task.id,
        script: task.script,
        status: task.status,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        exitCode: task.exitCode,
        outputLines: task.output.length,
        errorLines: task.errors.length,
        lastOutput: task.output.slice(-10),
        lastErrors: task.errors.slice(-5)
      };
    }
    return { tasks };
  });

  /**
   * Get detailed output for a specific task
   */
  fastify.get('/server/tasks/:taskId', { preHandler: requireInternal }, async (request) => {
    const { taskId } = request.params;
    const task = backgroundTasks.get(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    return {
      id: task.id,
      script: task.script,
      status: task.status,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      exitCode: task.exitCode,
      output: task.output,
      errors: task.errors
    };
  });

  /**
   * Clear completed tasks from memory
   */
  fastify.delete('/server/tasks', { preHandler: requireInternal }, async () => {
    let cleared = 0;
    for (const [id, task] of backgroundTasks) {
      if (task.status !== 'running') {
        backgroundTasks.delete(id);
        cleared++;
      }
    }
    return { cleared, remaining: backgroundTasks.size };
  });

  /**
   * Cancel a running task (kills the child process)
   */
  fastify.post('/server/tasks/:taskId/cancel', { preHandler: requireInternal }, async (request) => {
    const { taskId } = request.params;
    const task = backgroundTasks.get(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    if (task.status !== 'running') {
      throw ApiError.badRequest(`Task is not running (status: ${task.status})`);
    }

    // Kill the child process if it exists
    if (task.childProcess && !task.childProcess.killed) {
      task.childProcess.kill('SIGTERM');
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      logger.info({ taskId }, 'Task cancelled via API');
    }

    return {
      success: true,
      taskId,
      status: task.status
    };
  });

  /**
   * Debug endpoint to query a job by ID
   * Returns raw database row for debugging
   */
  fastify.get('/server/jobs/:jobId', { preHandler: requireInternal }, async (request) => {
    const { jobId } = request.params;
    const job = await queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw ApiError.notFound('Job not found');
    }
    // Return all columns as-is for debugging
    return {
      raw: job,
      columns: Object.keys(job),
      hasDocumentId: 'document_id' in job,
      documentIdValue: job.document_id,
      documentIdType: typeof job.document_id
    };
  });

  /**
   * Get database table info for debugging
   */
  fastify.get('/server/tables', { preHandler: requireInternal }, async () => {
    const tables = await queryAll(`
      SELECT name, type FROM sqlite_master
      WHERE type IN ('table', 'index')
      ORDER BY type, name
    `);

    // Get row counts for each table
    const tableCounts = {};
    for (const t of tables.filter(t => t.type === 'table' && !t.name.startsWith('sqlite_'))) {
      try {
        const result = await queryOne(`SELECT COUNT(*) as count FROM "${t.name}"`);
        tableCounts[t.name] = result?.count || 0;
      } catch {
        tableCounts[t.name] = 'error';
      }
    }

    return {
      tables: tables.filter(t => t.type === 'table').map(t => t.name),
      indexes: tables.filter(t => t.type === 'index').map(t => t.name),
      counts: tableCounts
    };
  });

  /**
   * Get table schema for debugging
   */
  fastify.get('/server/schema/:table', { preHandler: requireInternal }, async (request) => {
    const { table } = request.params;
    // Sanitize table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      throw ApiError.badRequest('Invalid table name');
    }
    try {
      const columns = await queryAll(`PRAGMA table_info("${table}")`);
      return { table, columns };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Get Meilisearch index info for debugging
   */
  fastify.get('/server/indexes', { preHandler: requireInternal }, async () => {
    try {
      const stats = await getSearchStats();
      return {
        documents: {
          count: stats.totalDocuments || 0,
          isIndexing: stats.indexing || false,
          religions: stats.religions || 0,
          collections: stats.collections || 0
        },
        paragraphs: {
          count: stats.totalPassages || 0,
          isIndexing: stats.indexing || false,
          collectionCounts: stats.collectionCounts || {}
        }
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Get Meilisearch task queue status
   */
  /**
   * GET /server/meili-doc — read the STORED Meilisearch document for a paragraph.
   *
   * Exists because a field can verify at every code layer (DB column populated, worker
   * SELECT includes it, push payload includes it, Meili task 'succeeded', API mapping
   * deployed) and STILL come back null — at which point the only remaining unknown is
   * what Meili actually holds. Black-box searching cannot distinguish "field absent"
   * from "field present but empty". Read-only; no mutation. (2026-08-18, chapter-heading bug)
   */
  fastify.get('/server/meili-doc/:paraId', { preHandler: requireInternal }, async (request) => {
    const { paraId } = request.params;
    const { index = 'paragraphs', fields } = request.query || {};
    try {
      const meili = getMeili();
      const opts = {};
      if (fields) opts.fields = String(fields).split(',').map((f) => f.trim()).filter(Boolean);
      const doc = await meili.index(index).getDocument(paraId, opts);
      // _vectors is huge (512 floats) — report its shape, never its contents.
      const { _vectors, ...rest } = doc || {};
      return {
        index,
        paraId,
        found: true,
        fieldNames: Object.keys(rest).sort(),
        hasHeading: Object.prototype.hasOwnProperty.call(rest, 'heading'),
        heading: rest.heading ?? null,
        vectorDims: _vectors?.default?.length ?? (Array.isArray(_vectors?.default?.embeddings) ? _vectors.default.embeddings.length : null),
        doc: rest
      };
    } catch (err) {
      return { index, paraId, found: false, error: err.message };
    }
  });

  fastify.get('/server/meili-tasks', { preHandler: requireInternal }, async (request) => {
    try {
      const meili = getMeili();
      const { status, limit = 20 } = request.query || {};
      const query = { limit: Math.min(Number(limit), 100) };
      if (status) query.statuses = [status];

      const tasks = await meili.tasks.getTasks(query);
      return {
        total: tasks.total,
        query,
        results: tasks.results.map(t => ({
          uid: t.uid,
          status: t.status,
          type: t.type,
          indexUid: t.indexUid,
          enqueuedAt: t.enqueuedAt,
          startedAt: t.startedAt,
          finishedAt: t.finishedAt,
          error: t.error?.message
        }))
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Cancel pending Meilisearch tasks
   * POST /server/meili-cancel?beforeDate=2025-12-29T00:00:00Z
   */
  fastify.post('/server/meili-cancel', { preHandler: requireInternal }, async (request) => {
    try {
      const meili = getMeili();
      const { beforeDate } = request.query || {};

      if (!beforeDate) {
        throw ApiError.badRequest('beforeDate query parameter required (ISO date string)');
      }

      // Cancel all enqueued tasks before the specified date
      const result = await meili.tasks.cancelTasks({
        statuses: ['enqueued'],
        beforeEnqueuedAt: new Date(beforeDate)
      });

      logger.info({ beforeDate, taskUid: result.taskUid }, 'Meilisearch task cancellation requested');

      return {
        success: true,
        message: `Cancellation task created for enqueued tasks before ${beforeDate}`,
        taskUid: result.taskUid
      };
    } catch (err) {
      return { error: err.message };
    }
  });

  /**
   * Delete all paragraphs for a document from Meilisearch
   * Useful when re-ingesting a document that has different paragraph structure
   */
  fastify.post('/server/meili-delete-paragraphs', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to delete paragraphs for' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.body;

    try {
      const meili = getMeili();

      // Delete paragraphs using filter
      const result = await meili.index('paragraphs').deleteDocuments({
        filter: `doc_id = ${documentId}`
      });

      logger.info({ documentId, taskUid: result.taskUid }, 'Meilisearch paragraph deletion requested');

      return {
        success: true,
        message: `Paragraph deletion task created for document ${documentId}`,
        taskUid: result.taskUid,
        documentId
      };
    } catch (err) {
      logger.error({ documentId, err: err.message }, 'Failed to delete paragraphs from Meilisearch');
      return { error: err.message };
    }
  });

  /**
   * Mark all paragraphs for a document as needing resync
   * Useful after deleting paragraphs from Meilisearch to trigger re-push
   */
  fastify.post('/server/mark-for-sync', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['documentId'],
        properties: {
          documentId: { type: 'string', description: 'Document ID to mark for sync' }
        }
      }
    }
  }, async (request) => {
    const { documentId } = request.body;

    try {
      const result = await content.markDocDirty(documentId);

      logger.info({ documentId, changes: result.changes }, 'Marked paragraphs for resync');

      return {
        success: true,
        message: `Marked ${result.changes} paragraphs for resync`,
        documentId,
        paragraphsMarked: result.changes
      };
    } catch (err) {
      logger.error({ documentId, err: err.message }, 'Failed to mark paragraphs for sync');
      return { error: err.message };
    }
  });

  /**
   * POST /server/sites-ingest { site, dryRun=true, onlyMissing=true }
   * The sites ingester without the library watcher (stopped since 2026-07-10 with the entity pollers). dryRun returns
   * per-file outcomes inline and writes nothing. A real run executes scripts/sites-ingest.mjs as background task
   * 'sites-ingest' (GET /server/tasks/sites-ingest). onlyMissing = new files + hollow docs only: a doc with live text is
   * never touched, so paragraphs carrying entity claims stay put. Neither mode reconciles deletions.
   */
  fastify.post('/server/sites-ingest', {
    preHandler: requireInternal,
    schema: { body: { type: 'object', properties: {
      site: { type: 'string', default: 'oceanlibrary.com' }, dryRun: { type: 'boolean', default: true }, onlyMissing: { type: 'boolean', default: true },
    } } },
  }, async (request) => {
    const { site = 'oceanlibrary.com', dryRun = true, onlyMissing = true } = request.body || {};
    if (dryRun) {
      const { ingestSite } = await import('../services/sites-ingester.js');
      return ingestSite(site, { dryRun: true, onlyMissing, force: true });
    }
    const existing = backgroundTasks.get('sites-ingest');
    if (existing && existing.status === 'running') throw ApiError.conflict('A sites-ingest run is already in progress');
    const args = ['--site', site, '--force', ...(onlyMissing ? ['--only-missing'] : [])];
    const task = runBackgroundTask('sites-ingest', 'scripts/sites-ingest.mjs', args);
    logger.info({ site, onlyMissing }, 'sites-ingest started via API');
    return { success: true, taskId: 'sites-ingest', site, onlyMissing, status: task.status };
  });

  /**
   * GET /server/claim-target-coverage — per relation: supported claims, and how many carry a resolved target entity id.
   * Read-only. Tells how complete the INDEXED who-met-whom path (target_entity_id) is vs text-only claims (0042).
   */
  fastify.get('/server/claim-target-coverage', { preHandler: requireInternal }, async () => {
    const rows = await queryAll(`SELECT relation, COUNT(*) n, SUM(CASE WHEN target_entity_id IS NOT NULL THEN 1 ELSE 0 END) resolved
      FROM entity_claims WHERE status IS NULL OR status = 'supported' GROUP BY relation ORDER BY n DESC LIMIT 80`, [], 'admin:claim-target-coverage');
    const total = rows.reduce((a, r) => a + r.n, 0), resolved = rows.reduce((a, r) => a + (r.resolved || 0), 0);
    return { total, resolved, pct: total ? Math.round((resolved / total) * 1000) / 10 : 0,
      relations: rows.map((r) => ({ relation: r.relation, n: r.n, resolved: r.resolved || 0, pct: r.n ? Math.round(((r.resolved || 0) / r.n) * 1000) / 10 : 0 })) };
  });

  /**
   * GET /server/claim-target-audit — read-only: of the TYPED encounter claims, how many point at a target the
   * statement does not name, classified by the binding failure (place object, substring, names another person…)
   * per import batch, with samples. Measures which binder creates wrong targets so it is fixed at source.
   */
  fastify.get('/server/claim-target-audit', { preHandler: requireInternal }, async (request) => {
    const { auditClaimTargets } = await import('../lib/claim-target-audit.js');
    return auditClaimTargets({ sample: Math.min(Number(request.query.sample) || 8, 30) });
  });

  /**
   * POST /server/entity-relink { write=false, doc?, limit? } — re-bind claims to entities with the current binder
   * (rag/entities/link.js) as background task 'entity-relink' (GET /server/tasks/entity-relink). Dry by default:
   * scores old→new bindings with the claim-target-audit classifier before anything is written; write mode saves a
   * rollback file first. GET /server/entity-relink/report returns the latest report JSON.
   */
  fastify.post('/server/entity-relink', { preHandler: requireInternal }, async (request) => {
    const { write = false, doc = null, limit = null } = request.body || {};
    const existing = backgroundTasks.get('entity-relink');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-relink run is already in progress');
    const argv = [...(write ? ['--write'] : []), ...(doc ? [`--doc=${Number(doc)}`] : []), ...(limit ? [`--limit=${Number(limit)}`] : [])];
    const task = runBackgroundTask('entity-relink', 'scripts/entity-relink.mjs', argv);
    return { success: true, taskId: 'entity-relink', write: !!write, status: task.status };
  });

  // GET /server/entity-duplicate-origins — read-only: which decision created each duplicate of a prominent person,
  // and whether the real person was among its candidates (recall vs judgement failure) or no decision made it.
  fastify.get('/server/entity-duplicate-origins', { preHandler: requireInternal }, async (request) => {
    const { duplicateOrigins } = await import('../lib/entity-duplicate-origins.js');
    return duplicateOrigins({ maxGroups: Math.min(Number(request.query.groups) || 40, 200) });
  });

  // GET /server/entity-recall?name= — read-only: the candidates reconcile's recall (findCandidateEntities) returns
  // for a cluster name, with the recall keys. Explains a "create" whose real person was never a candidate.
  fastify.get('/server/entity-recall', { preHandler: requireInternal }, async (request) => {
    const name = String(request.query.name || '');
    const { makeStore } = await import('../lib/rag-adapter/store.js');
    const { nameKeys } = await import('../lib/translit-key.js');
    const cands = await makeStore().findCandidateEntities(name, { type: 'person', limit: Number(request.query.limit) || 6 });
    return { name, keys: [...nameKeys(name)], candidates: cands.map((c) => ({ id: c.id, name: c.canonical, importance: c.importance, shared: c.shared })) };
  });

  // POST /server/entity-merge { minImportance?, limit?, maxSize? } — the evidence-based merge stage as background task
  // 'entity-merge', DRY (plans only). { apply: '<dry report>', exclude: [keys] } applies exactly those reviewed plans. GET /server/entity-merge/report → latest plan JSON.
  fastify.post('/server/entity-merge', { preHandler: requireInternal }, async (request) => {
    // apply = a reviewed DRY report file (logs/entity-merge-dry-….json); exclude = group keys to leave unmerged.
    const { apply = null, exclude = [], minImportance = null, limit = null, maxSize = null } = request.body || {};
    const existing = backgroundTasks.get('entity-merge');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-merge run is already in progress');
    if (apply && !/^(logs\/)?entity-merge-dry-[\w-]+\.json$/.test(String(apply))) throw ApiError.badRequest('apply must name a dry-run report file');
    const argv = apply
      ? [`--apply=${apply}`, ...(exclude.length ? [`--exclude=${exclude.map(String).join(',')}`] : [])]
      : [...(minImportance != null ? [`--minImportance=${Number(minImportance)}`] : []),
        ...(limit ? [`--limit=${Number(limit)}`] : []), ...(maxSize ? [`--maxSize=${Number(maxSize)}`] : [])];
    const task = runBackgroundTask('entity-merge', 'scripts/entity-merge.mjs', argv);
    return { success: true, taskId: 'entity-merge', apply: apply || null, exclude, status: task.status };
  });

  fastify.get('/server/entity-merge/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-merge-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} merge report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // GET /server/encounter-evidence?a=<entityId>&b=<entityId> — read-only: every encounter-type claim between two
  // entities (either direction, typed or naming the other), WITH its verbatim proof and source book. For checking
  // whether "met" claims are borne out by their proof ("Ṭáhirih met the Báb" — she never did).
  fastify.get('/server/encounter-evidence', { preHandler: requireInternal }, async (request) => {
    const a = Number(request.query.a), b = Number(request.query.b);
    const { ENCOUNTER_RELATIONS } = await import('../lib/encounters.js');
    const rels = [...ENCOUNTER_RELATIONS, 'disciple-of', 'believer'];
    const rows = await queryAll(`SELECT ec.id, ec.entity_id, ec.target_entity_id, ec.relation, ec.statement, ec.proof_verbatim proof,
        ec.time_value, ec.para_id, ec.import_batch, d.title
      FROM entity_claims ec LEFT JOIN docs d ON d.id = ec.doc_id
      WHERE ec.entity_id IN (?, ?) AND ec.relation IN (${rels.map(() => '?').join(',')})
        AND (ec.status IS NULL OR ec.status = 'supported')`, [a, b, ...rels], 'admin:encounter-evidence');
    const other = (r) => (r.entity_id === a ? b : a);
    return { a, b, claims: rows.filter((r) => r.target_entity_id === other(r)).map((r) => ({ ...r, proof: String(r.proof || '').slice(0, 400) })) };
  });

  // GET /server/entity-fate?id= — read-only: an entity's row (live, tombstoned or gone) and every merge decision
  // that names it — where did a person go? (Two Letters of the Living vanished from their group this way.)
  fastify.get('/server/entity-fate', { preHandler: requireInternal }, async (request) => {
    const id = Number(request.query.id);
    const row = await queryOne(`SELECT id, canonical_name, entity_type, importance, last_assessed_version FROM graph_entities WHERE id = ?`, [id], 'admin:entity-fate');
    const merges = await queryAll(`SELECT id, kind, target_ids, payload, rationale, status, actor, decided_at FROM entity_decisions
      WHERE kind = 'merge' AND (target_ids LIKE ? OR payload LIKE ?) ORDER BY id`, [`%${id}%`, `%${id}%`], 'admin:entity-fate');
    const into = /^merged-into-(\d+)$/.exec(row?.last_assessed_version || '')?.[1];
    const survivor = into ? await queryOne(`SELECT id, canonical_name, last_assessed_version FROM graph_entities WHERE id = ?`, [Number(into)]) : null;
    return { id, row: row || null, survivor, merges };
  });

  // POST /server/entity-repair-tombstones { write=false } — repoint relations/claims/mentions left on merged-away
  // entities to their live survivor (background task 'entity-repair'). GET …/report?mode= returns the latest report.
  fastify.post('/server/entity-repair-tombstones', { preHandler: requireInternal }, async (request) => {
    const { write = false, restore = null } = request.body || {};
    const existing = backgroundTasks.get('entity-repair');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-repair run is already in progress');
    if (restore && !/^(logs\/)?entity-repair-rollback-[\w-]+\.json$/.test(String(restore))) throw ApiError.badRequest('restore must name a repair rollback file');
    const task = runBackgroundTask('entity-repair', 'scripts/entity-repair-tombstones.mjs', restore ? [`--restore=${restore}`] : write ? ['--write'] : []);
    return { success: true, taskId: 'entity-repair', write: !!write, status: task.status };
  });

  fastify.get('/server/entity-repair-tombstones/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-repair-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} repair report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/entity-group-facts { write=false } — config/group-facts.json → one cited claim per group member
  // (proof verified verbatim), exceptions as denying claims. Background task 'entity-group-facts'.
  fastify.post('/server/entity-group-facts', { preHandler: requireInternal }, async (request) => {
    const { write = false } = request.body || {};
    const task = runBackgroundTask('entity-group-facts', 'scripts/entity-group-facts.mjs', write ? ['--write'] : []);
    return { success: true, taskId: 'entity-group-facts', write: !!write, status: task.status };
  });

  // POST /server/encounters/refresh — rebuild the in-memory who-met-whom index now (after any entity write).
  fastify.post('/server/encounters/refresh', { preHandler: requireInternal }, async () => {
    const { refreshEncounterIndex } = await import('../lib/encounters.js');
    return refreshEncounterIndex();
  });

  // POST /server/verify-encounters { limit=1000, typed=false, concurrency=8 } — model-verify meeting claims against
  // their full paragraph (DeepSeek; verdicts in claim_verifications). GET …/report → the latest run's report.
  fastify.post('/server/verify-encounters', { preHandler: requireInternal }, async (request) => {
    const { limit = 1000, typed = false, concurrency = 8 } = request.body || {};
    const existing = backgroundTasks.get('verify-encounters');
    if (existing && existing.status === 'running') throw ApiError.conflict('A verify-encounters run is already in progress');
    const argv = [`--limit=${Math.min(Number(limit) || 1000, 200000)}`, `--concurrency=${Math.min(Number(concurrency) || 8, 16)}`, ...(typed ? ['--typed'] : [])];
    const task = runBackgroundTask('verify-encounters', 'scripts/verify-encounters.mjs', argv);
    return { success: true, taskId: 'verify-encounters', status: task.status, argv };
  });

  fastify.get('/server/verify-encounters/report', { preHandler: requireInternal }, async () => {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('logs').filter((f) => f.startsWith('verify-encounters-')).sort();
    if (!files.length) throw ApiError.notFound('no verify-encounters report yet');
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // GET /server/paragraph-claims?id=<content id> — read-only: every claim extracted from one paragraph (with proof,
  // binding and verdict), its mentions, and the book's claim coverage. Answers "why is there no claim for this?"
  fastify.get('/server/paragraph-claims', { preHandler: requireInternal }, async (request) => {
    const id = Number(request.query.id);
    const para = await queryOne(`SELECT id, doc_id, external_para_id, paragraph_index FROM content WHERE id = ?`, [id], 'admin:paragraph-claims');
    if (!para) throw ApiError.notFound('no such paragraph');
    const pids = [para.external_para_id, `p${para.id}`].filter(Boolean);
    const ph = pids.map(() => '?').join(',');
    const claims = await queryAll(`SELECT ec.id, ec.relation, ec.statement, ec.proof_verbatim proof, ec.entity_id, s.canonical_name subject,
        ec.target_entity_id, t.canonical_name target, ec.extractor_version, ec.import_batch, cv.verdict
      FROM entity_claims ec LEFT JOIN graph_entities s ON s.id = ec.entity_id LEFT JOIN graph_entities t ON t.id = ec.target_entity_id
      LEFT JOIN claim_verifications cv ON cv.claim_id = ec.id
      WHERE ec.doc_id = ? AND ec.para_id IN (${ph})`, [para.doc_id, ...pids], 'admin:paragraph-claims');
    const mentions = await queryAll(`SELECT surface, resolved_as, entity_id FROM entity_mentions_v2 WHERE doc_id = ? AND para_id IN (${ph})`, [para.doc_id, ...pids]);
    const book = await queryOne(`SELECT COUNT(*) claims, COUNT(DISTINCT para_id) paragraphs, MIN(extractor_version) minv, MAX(extractor_version) maxv
      FROM entity_claims WHERE doc_id = ?`, [para.doc_id]);
    const bookMentions = await queryOne(`SELECT COUNT(*) n, COUNT(DISTINCT para_id) paragraphs FROM entity_mentions_v2 WHERE doc_id = ?`, [para.doc_id]);
    let pipeline = null;
    try { pipeline = await queryOne(`SELECT * FROM doc_pipeline WHERE doc_id = ?`, [para.doc_id]); } catch { /* table optional */ }
    return { para, claims, mentions, book: { ...book, mentions: bookMentions }, pipeline };
  });

  // POST /server/mention-backfill { write=false, doc? } — known people named in paragraph TEXT that have no mention
  // (the mention stage only records names the disambiguation note glossed). Audit by default. GET …/report → latest.
  fastify.post('/server/mention-backfill', { preHandler: requireInternal }, async (request) => {
    const { write = false, doc = null } = request.body || {};
    const existing = backgroundTasks.get('mention-backfill');
    if (existing && existing.status === 'running') throw ApiError.conflict('A mention-backfill run is already in progress');
    const task = runBackgroundTask('mention-backfill', 'scripts/mention-backfill.mjs', [...(write ? ['--write'] : []), ...(doc ? [`--doc=${Number(doc)}`] : [])]);
    return { success: true, taskId: 'mention-backfill', write: !!write, status: task.status };
  });

  fastify.get('/server/mention-backfill/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'audit';
    const files = readdirSync('logs').filter((f) => f.startsWith(`mention-backfill-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} mention-backfill report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/entity-catalog-review { limit?, concurrency? } — classify every live "person" record (DeepSeek);
  // verdicts in entity_catalog_review, nothing applied. GET …/report → latest run report.
  fastify.post('/server/entity-catalog-review', { preHandler: requireInternal }, async (request) => {
    const { limit = 100000, concurrency = 8 } = request.body || {};
    const existing = backgroundTasks.get('entity-catalog-review');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-catalog-review run is already in progress');
    const task = runBackgroundTask('entity-catalog-review', 'scripts/entity-catalog-review.mjs', [`--limit=${Number(limit) || 100000}`, `--concurrency=${Math.min(Number(concurrency) || 8, 16)}`]);
    return { success: true, taskId: 'entity-catalog-review', status: task.status };
  });

  fastify.get('/server/entity-catalog-review/report', { preHandler: requireInternal }, async () => {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('logs').filter((f) => f.startsWith('entity-catalog-review-')).sort();
    if (!files.length) throw ApiError.notFound('no catalog review report yet');
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/extract-scenes { docs:[ids], write=false, limit?, concurrency? } — scene extraction (DeepSeek), proof
  // verified, participants bound within paragraph/book. GET …/report?mode= → latest.
  fastify.post('/server/extract-scenes', { preHandler: requireInternal }, async (request) => {
    const { docs = [3887], write = false, limit = null, concurrency = 8 } = request.body || {};
    const existing = backgroundTasks.get('extract-scenes');
    if (existing && existing.status === 'running') throw ApiError.conflict('An extract-scenes run is already in progress');
    const argv = [`--doc=${docs.map(Number).filter(Boolean).join(',')}`, ...(write ? ['--write'] : []), ...(limit ? [`--limit=${Number(limit)}`] : []),
      `--concurrency=${Math.min(Number(concurrency) || 8, 16)}`];
    const task = runBackgroundTask('extract-scenes', 'scripts/extract-scenes.mjs', argv);
    return { success: true, taskId: 'extract-scenes', argv, status: task.status };
  });

  fastify.get('/server/extract-scenes/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`extract-scenes-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} scene report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/entity-catalog-apply { write=false, min=0.9 } — apply catalog review verdicts (retype non-people,
  // merge confident titles into their figure, hold the rest). GET …/report?mode= → latest plan/result.
  fastify.post('/server/entity-catalog-apply', { preHandler: requireInternal }, async (request) => {
    const { write = false, min = 0.9, retypeOnly = true } = request.body || {};
    const existing = backgroundTasks.get('entity-catalog-apply');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-catalog-apply run is already in progress');
    const task = runBackgroundTask('entity-catalog-apply', 'scripts/entity-catalog-apply.mjs',
      [...(write ? ['--write'] : []), `--min=${Number(min) || 0.9}`, ...(retypeOnly !== false ? ['--retype-only'] : [])]);
    return { success: true, taskId: 'entity-catalog-apply', write: !!write, status: task.status };
  });

  fastify.get('/server/entity-catalog-apply/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-catalog-apply-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} catalog-apply report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/entity-title-merge { write=false } — title → figure merges with strict name resolution + a second
  // model check; dry by default. GET …/report?mode= → latest plan/result.
  fastify.post('/server/entity-title-merge', { preHandler: requireInternal }, async (request) => {
    const { write = false } = request.body || {};
    const existing = backgroundTasks.get('entity-title-merge');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-title-merge run is already in progress');
    const task = runBackgroundTask('entity-title-merge', 'scripts/entity-title-merge.mjs', write ? ['--write'] : []);
    return { success: true, taskId: 'entity-title-merge', write: !!write, status: task.status };
  });

  fastify.get('/server/entity-title-merge/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-title-merge-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} title-merge report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // GET /server/namesake-context?groups=25&pairs=a-b,c-d — read-only research: do same-name person records separate
  // by shared documents / claim years / companions? + an audit of every merge decision so far.
  fastify.get('/server/namesake-context', { preHandler: requireInternal }, async (request) => {
    const { namesakeContext, mergeAudit } = await import('../lib/namesake-context.js');
    const pairs = request.query.pairs ? String(request.query.pairs).split(',').map((p) => p.split('-').map(Number)).filter((p) => p.length === 2 && p.every(Boolean)) : null;
    if (request.query.audit) return mergeAudit();
    return namesakeContext({ pairs, groups: Math.min(Number(request.query.groups) || 25, 200), minMentions: Number(request.query.min) || 3 });
  });

  // GET /server/identity-replay — read-only: rebuild every mention's entity from the decision log and classify each
  // divergence from the stored ids (match · cross-doc · no-decision · unbound · mismatch). planning/work-plan-identity.md.
  fastify.get('/server/identity-replay', { preHandler: requireInternal }, async (request) => {
    const { identityReplay } = await import('../lib/identity-replay.js');
    return identityReplay({ sampleSize: Math.min(Number(request.query.samples) || 12, 100) });
  });

  // POST /server/identity-materialize { write=false, doc? } — write the decision log's replay onto mentions
  // (rag/entities/materialize.js) as background task 'identity-materialize'. DRY by default: corrections by category,
  // recorded decisions, reassessment pairs. write saves a rollback file first. GET …/report?mode=dry|write → latest.
  fastify.post('/server/identity-materialize', { preHandler: requireInternal }, async (request) => {
    const { write = false, doc = null } = request.body || {};
    const existing = backgroundTasks.get('identity-materialize');
    if (existing && existing.status === 'running') throw ApiError.conflict('An identity-materialize run is already in progress');
    const argv = [...(write ? ['--write'] : []), ...(doc ? [`--doc=${Number(doc)}`] : [])];
    const task = runBackgroundTask('identity-materialize', 'scripts/identity-materialize.mjs', argv);
    return { success: true, taskId: 'identity-materialize', write: !!write, status: task.status };
  });
  fastify.get('/server/identity-materialize/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`identity-materialize-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/identity-pair-judge { write=false, limit?, pairs?: [[a,b]] } — judge held identity pairs
  // (rag/entities/pair-judge.js) as background task 'identity-pair-judge'. DRY by default. write: merges both judges
  // agree on (with evidence), vetoed pairs recorded distinct, the rest proposed for a human. GET …/report?mode=dry|write.
  fastify.post('/server/identity-pair-judge', { preHandler: requireInternal }, async (request) => {
    const { write = false, limit = null, pairs = null } = request.body || {};
    const existing = backgroundTasks.get('identity-pair-judge');
    if (existing && existing.status === 'running') throw ApiError.conflict('An identity-pair-judge run is already in progress');
    const list = Array.isArray(pairs) ? pairs.filter((p) => Array.isArray(p) && p.length === 2).map((p) => p.map(Number).join('-')).join(',') : '';
    const argv = [...(write ? ['--write'] : []), ...(limit ? [`--limit=${Number(limit)}`] : []), ...(list ? [`--pairs=${list}`] : [])];
    const task = runBackgroundTask('identity-pair-judge', 'scripts/identity-pair-judge.mjs', argv);
    return { success: true, taskId: 'identity-pair-judge', write: !!write, status: task.status };
  });
  fastify.get('/server/identity-pair-judge/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`identity-pair-judge-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/identity-reviewed { items: [{verdict:'same'|'different'|'rename', a, b?, into?, name?, reason, reviewer}], write=false }
  // — record verdicts a reader made from the review passages (rag/entities/reviewed.js). reviewer 'human:…' = tier 3.
  // Background task 'identity-reviewed'; DRY by default. GET …/report?mode=dry|write.
  fastify.post('/server/identity-reviewed', { preHandler: requireInternal }, async (request) => {
    const { items, write = false } = request.body || {};
    if (!Array.isArray(items) || !items.length) throw ApiError.badRequest('items[] required');
    const { decisionsFor } = await import('../lib/rag/entities/reviewed.js');
    try { decisionsFor(items); } catch (e) { throw ApiError.badRequest(e.message); }
    const existing = backgroundTasks.get('identity-reviewed');
    if (existing && existing.status === 'running') throw ApiError.conflict('An identity-reviewed run is already in progress');
    const { writeFileSync, mkdirSync } = await import('fs');
    mkdirSync('logs', { recursive: true });
    const file = `logs/identity-reviewed-items-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(items));
    const task = runBackgroundTask('identity-reviewed', 'scripts/identity-reviewed.mjs', [`--items=${file}`, ...(write ? ['--write'] : [])]);
    return { success: true, taskId: 'identity-reviewed', write: !!write, items: items.length, status: task.status };
  });
  fastify.get('/server/identity-reviewed/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`identity-reviewed-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // GET /server/entity-provenance?ids=1,2 — read-only: where a record came from and what still points at it. Answers
  // "how can a record exist with no passage?": its insert time + change history, the decisions naming it, and a count
  // per table that references it (a record whose only anchor is an alias or lookup key was never read from a text).
  fastify.get('/server/entity-provenance', { preHandler: requireInternal }, async (request) => {
    const ids = String(request.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 1000);
    if (!ids.length) throw ApiError.badRequest('ids required');
    const ph = ids.map(() => '?').join(',');
    const ents = await queryAll(`SELECT id, name, canonical_name, entity_type, created_at, last_assessed_version lav, mention_count, doc_count,
        importance, summary IS NOT NULL has_summary, description IS NOT NULL has_desc, research_notes IS NOT NULL has_notes FROM graph_entities WHERE id IN (${ph})`, ids);
    const changes = await queryAll(`SELECT entity_id id, op, canonical_name, merged_into, rowid r FROM graph_entity_changes WHERE entity_id IN (${ph}) ORDER BY rowid`, ids);
    const refs = {}, missing = [];
    for (const [t, col] of [['entity_mentions', 'entity_id'], ['entity_mentions_v2', 'entity_id'], ['entity_claims', 'entity_id'], ['entity_claims', 'target_entity_id'],
      ['graph_relations', 'source_entity_id'], ['graph_relations', 'target_entity_id'], ['entity_aliases', 'entity_id'], ['entity_aliases_v2', 'entity_id'],
      ['entity_lookup_keys', 'entity_id'], ['scene_participants', 'entity_id'], ['entity_catalog_review', 'entity_id'], ['set_members', 'entity_id'], ['alias_priors', 'entity_id']]) {
      try { for (const r of await queryAll(`SELECT ${col} id, COUNT(*) n FROM ${t} WHERE ${col} IN (${ph}) GROUP BY 1`, ids)) (refs[r.id] ||= {})[`${t}.${col}`] = r.n; } catch (e) { missing.push(`${t}: ${String(e.message).slice(0, 80)}`); }
    }
    const decs = await queryAll(`SELECT id, kind, target_kind, actor, method_version, status, rationale, payload, target_ids FROM entity_decisions
       WHERE json_extract(payload,'$.applied_entity_id') IN (${ph}) OR json_extract(payload,'$.entityId') IN (${ph}) OR json_extract(payload,'$.canonical') IN (${ph})
          OR EXISTS (SELECT 1 FROM json_each(entity_decisions.target_ids) j WHERE j.value IN (${ph})) ORDER BY id`, [...ids, ...ids, ...ids, ...ids]);
    const decOf = {};
    for (const d of decs) {
      let p = {}; try { p = JSON.parse(d.payload || '{}'); } catch { /* */ }
      let t = []; try { t = JSON.parse(d.target_ids || '[]'); } catch { /* */ }
      for (const id of new Set([p.applied_entity_id, p.entityId, p.canonical, ...(Array.isArray(t) ? t : [])].map(Number).filter((x) => ids.includes(x))))
        (decOf[id] ||= []).push({ id: d.id, kind: d.kind, target: d.target_kind, actor: d.actor, method: d.method_version, status: d.status, doc: p.docId ?? null, as: p.resolvedAs ?? null, why: String(d.rationale || '').slice(0, 120) });
    }
    const legacy = await queryOne(`SELECT COUNT(*) n, MAX(rowid) max_rowid FROM entity_mentions`).catch((e) => ({ error: String(e.message).slice(0, 80) }));
    // The OLD extractor's mentions live in graph.db (the sifter.db table was only its mirror) — the passages these
    // records were read from, if they survive anywhere.
    const { graphQueryAll, graphQueryOne } = await import('../lib/db.js');
    const graph = { total: await graphQueryOne(`SELECT COUNT(*) n FROM entity_mentions`).catch((e) => ({ error: String(e.message).slice(0, 80) })) };
    try {
      for (const r of await graphQueryAll(`SELECT entity_id id, COUNT(*) n, GROUP_CONCAT(content_id) cids FROM entity_mentions WHERE entity_id IN (${ph}) GROUP BY 1`, ids))
        (refs[r.id] ||= {})['graph.entity_mentions'] = { n: r.n, content_ids: String(r.cids || '').split(',').slice(0, 5) };
      for (const r of await graphQueryAll(`SELECT entity_id id, source, COUNT(*) n FROM entity_aliases WHERE entity_id IN (${ph}) GROUP BY 1, 2`, ids)) ((refs[r.id] ||= {})['graph.entity_aliases'] ||= {})[r.source ?? 'null'] = r.n;
    } catch (e) { missing.push(`graph.db: ${String(e.message).slice(0, 80)}`); }
    return { missing, legacy_entity_mentions: legacy, graph_db: graph, entities: ents.map((e) => ({ ...e, changes: changes.filter((c) => c.id === e.id).map(({ id, ...c }) => c), refs: refs[e.id] || {}, decisions: decOf[e.id] || [] })) };
  });

  // GET /server/record-passages?ids=1,2 — read-only: the passages a passage-less record was read from, rescued from
  // where they survive — the retired extractor's mentions in graph.db, and scenes naming the record — and, for each
  // paragraph, what the CURRENT pipeline bound there (v2 mentions). Evidence for rescue, not a decision.
  fastify.get('/server/record-passages', { preHandler: requireInternal }, async (request) => {
    const ids = String(request.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 500);
    if (!ids.length) throw ApiError.badRequest('ids required');
    const ph = ids.map(() => '?').join(',');
    const { graphQueryAll } = await import('../lib/db.js');
    const old = await graphQueryAll(`SELECT entity_id id, CAST(CAST(content_id AS REAL) AS INTEGER) cid, role FROM entity_mentions WHERE entity_id IN (${ph})`, ids);
    const aliases = await graphQueryAll(`SELECT entity_id id, surface FROM entity_aliases WHERE entity_id IN (${ph})`, ids);
    const scenes = await queryAll(`SELECT sp.entity_id id, sp.name surface, s.doc_id, s.para_id, s.proof FROM scene_participants sp JOIN entity_scenes s ON s.id = sp.scene_id WHERE sp.entity_id IN (${ph})`, ids);
    const cids = [...new Set(old.map((r) => r.cid))];
    const paras = cids.length ? await queryAll(`SELECT id cid, doc_id, COALESCE(external_para_id, 'p' || id) para_id, deleted_at IS NOT NULL deleted, substr(text, 1, 1500) text
        FROM content WHERE id IN (${cids.map(() => '?').join(',')})`, cids) : [];
    const keys = [...new Set([...paras.map((p) => `${p.doc_id}|${p.para_id}`), ...scenes.map((s) => `${s.doc_id}|${s.para_id}`)])];
    const v2 = [];
    for (let i = 0; i < keys.length; i += 200) {
      const chunk = keys.slice(i, i + 200);
      v2.push(...await queryAll(`SELECT m.doc_id, m.para_id, m.surface, m.resolved_as, m.entity_id, ge.canonical_name name FROM entity_mentions_v2 m LEFT JOIN graph_entities ge ON ge.id = m.entity_id
          WHERE ${chunk.map(() => '(m.doc_id = ? AND m.para_id = ?)').join(' OR ')}`, chunk.flatMap((k) => { const [d, p] = k.split('|'); return [Number(d), p]; })));
    }
    const at = (d, p) => v2.filter((m) => m.doc_id === d && m.para_id === p).map(({ doc_id, para_id, ...m }) => m);
    const byCid = new Map(paras.map((p) => [p.cid, p]));
    return { records: ids.map((id) => ({ id, surfaces: aliases.filter((a) => a.id === id).map((a) => a.surface),
      passages: [
        ...old.filter((r) => r.id === id).map((r) => { const p = byCid.get(r.cid); return p ? { from: 'graph.db', cid: r.cid, doc_id: p.doc_id, para_id: p.para_id, deleted: !!p.deleted, text: p.text, current: at(p.doc_id, p.para_id) } : { from: 'graph.db', cid: r.cid, missing: true }; }),
        ...scenes.filter((s) => s.id === id).map((s) => ({ from: 'scene', surface: s.surface, doc_id: s.doc_id, para_id: s.para_id, text: s.proof, current: at(s.doc_id, s.para_id) })),
      ] })) };
  });

  // GET /server/cluster-passages?entity=&doc=&handle=&limit= — read-only: the paragraphs one book's cluster (its label for a
  // person) binds to an entity, with the record's claims in those paragraphs and who else the paragraph names. The
  // evidence for splitting a record that holds two people: judge the cluster from its passages, never its label.
  fastify.get('/server/cluster-passages', { preHandler: requireInternal }, async (request) => {
    const entity = Number(request.query.entity), doc = Number(request.query.doc), handle = String(request.query.handle || '');
    if (!entity || !doc || !handle) throw ApiError.badRequest('entity, doc and handle required');
    const lim = Math.min(Number(request.query.limit) || 4, 20);
    const ms = await queryAll(`SELECT id, anchor, para_id, surface, occurrence FROM entity_mentions_v2 WHERE entity_id = ? AND doc_id = ? AND resolved_as = ? ORDER BY id`, [entity, doc, handle]);
    const paras = [...new Set(ms.map((m) => m.para_id))];
    const out = [];
    for (const pid of paras.slice(0, lim)) {
      const c = await queryOne(`SELECT substr(text, 1, 4000) text, context FROM content WHERE doc_id = ? AND (external_para_id = ? OR ('p' || id) = ?) AND deleted_at IS NULL`, [doc, pid, pid]);
      const claims = await queryAll(`SELECT relation, statement FROM entity_claims WHERE entity_id = ? AND doc_id = ? AND para_id = ? LIMIT 5`, [entity, doc, pid]);
      const others = await queryAll(`SELECT DISTINCT m.resolved_as, m.entity_id FROM entity_mentions_v2 m WHERE m.doc_id = ? AND m.para_id = ? AND (m.entity_id IS NULL OR m.entity_id <> ?) LIMIT 12`, [doc, pid, entity]);
      out.push({ para_id: pid, surfaces: ms.filter((m) => m.para_id === pid).map((m) => m.surface),
        mentions: ms.filter((m) => m.para_id === pid).map(({ anchor, surface, occurrence }) => ({ anchor, surface, occurrence })), text: c?.text ?? null, note: String(c?.context || '').slice(0, 400), claims, others });
    }
    const claimTotal = paras.length ? (await queryOne(`SELECT COUNT(*) n FROM entity_claims WHERE entity_id = ? AND doc_id = ? AND para_id IN (${paras.map(() => '?').join(',')})`, [entity, doc, ...paras]))?.n : 0;
    return { entity, doc, handle, mentions: ms.length, paragraphs: paras.length, claimsInThoseParagraphs: claimTotal, passages: out };
  });

  // POST /server/lookup-backfill { write=false } — index every LIVE record that has NO lookup keys (name + researched
  // aliases, the rebuild's own keys). The index was rebuilt only by the retired per-book shell flow, so records the
  // grounding pipeline minted since were unreachable by name. Idempotent: a record with any key is left alone.
  // mode:'missing' — instead, add to EVERY live record the fallback keys the 2026-09-28 rule creates (a word > 4 letters
  // whose skeleton vanished, e.g. "~yahya"); records indexed before the rule lack them, so their own names miss.
  fastify.post('/server/lookup-backfill', { preHandler: requireInternal }, async (request) => {
    const write = !!request.body?.write;
    if (request.body?.mode === 'missing') {
      const { LIVE_SQL } = await import('../lib/entity-live.js');
      const { skeletonKeys } = await import('../lib/translit-key.js');
      const { transaction } = await import('../lib/db.js');
      const ents = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type et, ge.importance imp, er.aliases
          FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type WHERE ${LIVE_SQL('ge.')}`);
      const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['‘’`ʻ".]/g, '').replace(/\s+/g, ' ').toLowerCase().trim();
      const stmts = [], sample = [];
      for (const e of ents) {
        let aliases = []; try { const a = JSON.parse(e.aliases || '[]'); if (Array.isArray(a)) aliases = a.filter(Boolean).map(String); } catch { /* none */ }
        for (const [surf, canon] of [[e.cn, 1], ...aliases.filter((a) => a !== e.cn).map((a) => [a, 0])]) {
          for (const k of skeletonKeys(surf)) {
            if (!k.startsWith('~') || k.length <= 5) continue;   // only the new long-word fallback keys
            stmts.push({ sql: `INSERT INTO entity_lookup_keys (skeleton_key, entity_id, surface, surface_norm, is_canonical, entity_type, importance)
                SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM entity_lookup_keys WHERE entity_id = ? AND skeleton_key = ?)`,
              args: [k, e.id, surf, norm(surf), canon, e.et, e.imp ?? null, e.id, k] });
            if (sample.length < 12) sample.push(`${e.cn} ← ${k}`);
          }
        }
      }
      if (write) for (let i = 0; i < stmts.length; i += 500) await transaction(stmts.slice(i, i + 500));
      return { write, mode: 'missing', records: ents.length, candidateKeys: stmts.length, sample };
    }
    const { LIVE_SQL } = await import('../lib/entity-live.js');
    const { lookupKeyRows } = await import('../lib/rag-adapter/store.js');
    const { transaction } = await import('../lib/db.js');
    const rows = await queryAll(`SELECT ge.id, ge.canonical_name cn, ge.entity_type et, ge.importance imp, er.aliases,
        (SELECT COUNT(*) FROM entity_mentions_v2 m WHERE m.entity_id = ge.id) mentions
        FROM graph_entities ge LEFT JOIN entity_research er ON er.canonical_name = ge.canonical_name AND er.entity_type = ge.entity_type
       WHERE ${LIVE_SQL('ge.')} AND NOT EXISTS (SELECT 1 FROM entity_lookup_keys k WHERE k.entity_id = ge.id)`);
    let keys = 0;
    for (const e of rows) {
      let aliases = []; try { const a = JSON.parse(e.aliases || '[]'); if (Array.isArray(a)) aliases = a.filter(Boolean).map(String); } catch { /* none */ }
      const stmts = [...lookupKeyRows(e.id, e.cn, e.et, e.imp, 1), ...[...new Set(aliases)].filter((a) => a !== e.cn).flatMap((a) => lookupKeyRows(e.id, a, e.et, e.imp, 0))];
      keys += stmts.length;
      if (write && stmts.length) await transaction(stmts);
    }
    const withMentions = rows.filter((e) => e.mentions > 0);
    return { write, unindexed: rows.length, withMentions: withMentions.length, mentionsUnreachable: withMentions.reduce((n, e) => n + e.mentions, 0), keys,
      examples: withMentions.sort((a, b) => b.mentions - a.mentions).slice(0, 15).map((e) => ({ id: e.id, name: e.cn, type: e.et, mentions: e.mentions })) };
  });

  // POST /server/identity-cluster-audit { ids:[…] } — Jev flags clusters whose passage may not be the person
  // (api/lib/identity-audit.js). READ-ONLY: flags go to a reader. Background task; GET …/report → latest.
  fastify.post('/server/identity-cluster-audit', { preHandler: requireInternal }, async (request) => {
    const ids = (request.body?.ids || []).map(Number).filter(Boolean).slice(0, 100);
    if (!ids.length) throw ApiError.badRequest('ids[] required');
    const existing = backgroundTasks.get('identity-cluster-audit');
    if (existing && existing.status === 'running') throw ApiError.conflict('An identity-cluster-audit run is already in progress');
    const task = runBackgroundTask('identity-cluster-audit', 'scripts/identity-cluster-audit.mjs', [`--ids=${ids.join(',')}`]);
    return { success: true, taskId: 'identity-cluster-audit', ids: ids.length, status: task.status };
  });
  fastify.get('/server/identity-cluster-audit/report', { preHandler: requireInternal }, async () => {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('logs').filter((f) => f.startsWith('identity-cluster-audit-')).sort();
    if (!files.length) throw ApiError.notFound('no audit report yet');
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // POST /server/entity-cards { ids?:[…], minMentions?, write=false } — build profile cards (api/lib/profile-card.js), a
  // rebuildable projection. Background task; GET …/report?mode=dry|write. GET /server/entity-cards/:id → one card.
  fastify.post('/server/entity-cards', { preHandler: requireInternal }, async (request) => {
    const { ids = [], minMentions = null, write = false } = request.body || {};
    const existing = backgroundTasks.get('entity-cards');
    if (existing && existing.status === 'running') throw ApiError.conflict('An entity-cards run is already in progress');
    const list = ids.map(Number).filter(Boolean);
    const argv = [...(list.length ? [`--ids=${list.join(',')}`] : [`--min-mentions=${Number(minMentions) || 1}`]), ...(write ? ['--write'] : [])];
    const task = runBackgroundTask('entity-cards', 'scripts/entity-cards.mjs', argv);
    return { success: true, taskId: 'entity-cards', write: !!write, status: task.status };
  });
  fastify.get('/server/entity-cards/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-cards-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });
  fastify.get('/server/entity-cards/:id', { preHandler: requireInternal }, async (request) => {
    const row = await queryOne(`SELECT entity_id id, card, facts, version, built_at FROM entity_cards WHERE entity_id = ?`, [Number(request.params.id)]);
    if (!row) throw ApiError.notFound('no card');
    return { ...row, facts: JSON.parse(row.facts || '{}') };
  });

  // POST /server/identity-shadow-link { docId, paras? } — Jev links every name occurrence in a book beside the pipeline's
  // binding (api/lib/identity-audit.js). READ-ONLY. Background task; GET …/report?doc= → latest for that book.
  fastify.post('/server/identity-shadow-link', { preHandler: requireInternal }, async (request) => {
    const docId = Number(request.body?.docId);
    if (!docId) throw ApiError.badRequest('docId required');
    const key = `identity-shadow-link-${docId}`;
    const existing = backgroundTasks.get(key);
    if (existing && existing.status === 'running') throw ApiError.conflict('already running for this doc');
    const paras = Number(request.body?.paras) || null;
    const task = runBackgroundTask(key, 'scripts/identity-shadow-link.mjs', [`--doc=${docId}`, ...(paras ? [`--paras=${paras}`] : [])]);
    return { success: true, taskId: key, status: task.status };
  });
  fastify.get('/server/identity-shadow-link/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('logs').filter((f) => f.startsWith(`identity-shadow-link-${Number(request.query.doc)}-`)).sort();
    if (!files.length) throw ApiError.notFound('no report for this doc');
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  // GET /server/entity-mention-breakdown?id= — read-only: where an entity's mentions come from — per book, how the book
  // named it (resolved handles), and the place/era of those passages (from the disambiguation note). Shows a famous
  // record that absorbed other people's mentions ("Mullá Ḥusayn" in a Nayríz history bound to Bushrú'í).
  fastify.get('/server/entity-mention-breakdown', { preHandler: requireInternal }, async (request) => {
    const id = Number(request.query.id);
    const rows = await queryAll(`SELECT m.doc_id, d.title, d.year, m.resolved_as, COUNT(*) n, MIN(c.context) note
        FROM entity_mentions_v2 m JOIN docs d ON d.id = m.doc_id
        LEFT JOIN content c ON c.doc_id = m.doc_id AND (c.external_para_id = m.para_id OR ('p' || c.id) = m.para_id)
       WHERE m.entity_id = ? GROUP BY m.doc_id, m.resolved_as ORDER BY n DESC`, [id]);
    const byDoc = new Map();
    for (const r of rows) {
      const d = byDoc.get(r.doc_id) || { doc_id: r.doc_id, title: r.title, year: r.year, mentions: 0, handles: [], note: null };
      d.mentions += r.n; d.handles.push(`${r.resolved_as} ×${r.n}`); d.note = d.note || String(r.note || '').split('—')[0].trim().slice(0, 80);
      byDoc.set(r.doc_id, d);
    }
    // What did each BOOK'S OWN identity decision say for these handles? A mention bound to this record while its own
    // book decided something else was bound by another book's decision (the string-wide bind, fixed 2026-09-27).
    const handles = [...new Set(rows.map((r) => r.resolved_as))];
    const own = handles.length ? await queryAll(`SELECT id, kind, json_extract(payload,'$.docId') doc, json_extract(payload,'$.resolvedAs') ra,
        json_extract(payload,'$.applied_entity_id') ent FROM entity_decisions
       WHERE target_kind = 'mention-cluster' AND status = 'applied' AND json_extract(payload,'$.resolvedAs') IN (${handles.map(() => '?').join(',')})
       ORDER BY id`, handles) : [];
    const ownOf = new Map(); for (const o of own) ownOf.set(`${o.doc}|${o.ra}`, { kind: o.kind, entity: o.ent, decision: o.id });
    for (const r of rows) {
      const d = byDoc.get(r.doc_id); const o = ownOf.get(`${r.doc_id}|${r.resolved_as}`);
      (d.own ||= []).push({ handle: r.resolved_as, n: r.n, own_decision: o ? `${o.kind} → #${o.entity}` : 'none in this book', agrees: o ? Number(o.entity) === id : null });
    }
    const docs = [...byDoc.values()].sort((a, b) => b.mentions - a.mentions);
    const bound = (f) => docs.flatMap((d) => d.own).filter(f).reduce((a, x) => a + x.n, 0);
    return { id, total: docs.reduce((a, d) => a + d.mentions, 0), books: docs.length,
      own_decision_agrees: bound((x) => x.agrees === true), own_decision_differs: bound((x) => x.agrees === false), no_own_decision: bound((x) => x.agrees === null), docs };
  });

  // GET /server/entity-top?limit=100 — read-only: the most-mentioned people, with mention count, books and distinct
  // handles — the sizing of a full per-reference review of the most important characters.
  fastify.get('/server/entity-top', { preHandler: requireInternal }, async (request) => {
    const { LIVE_SQL } = await import('../lib/entity-live.js');
    const lim = Math.min(Number(request.query.limit) || 100, 500);
    const rows = await queryAll(`SELECT m.entity_id id, ge.canonical_name name, ge.importance, COUNT(*) mentions, COUNT(DISTINCT m.doc_id) books,
        COUNT(DISTINCT m.resolved_as) handles, COUNT(DISTINCT m.doc_id || '|' || m.resolved_as) clusters
      FROM entity_mentions_v2 m JOIN graph_entities ge ON ge.id = m.entity_id
      WHERE ge.entity_type = 'person' AND ${LIVE_SQL('ge.')} GROUP BY m.entity_id ORDER BY mentions DESC LIMIT ?`, [lim]);
    return { people: rows, mentions: rows.reduce((a, r) => a + r.mentions, 0), clusters: rows.reduce((a, r) => a + r.clusters, 0) };
  });

  // POST /server/entity-alias { id, alias, source } — record another NAME for an entity (e.g. Edirne for Adrianople): the
  // alias joins entity_research.aliases (search targets and recall read it), its transliteration keys join the lookup
  // index (so a misspelling still lands), and an append-only decision records who added it and on what source.
  fastify.post('/server/entity-alias', { preHandler: requireInternal }, async (request) => {
    const { id, alias, source } = request.body || {};
    const name = String(alias || '').trim();
    if (!Number(id) || !name || !String(source || '').trim()) throw ApiError.badRequest('id, alias and source are required');
    const ge = await queryOne(`SELECT id, canonical_name cn, entity_type et, importance FROM graph_entities WHERE id = ?`, [Number(id)]);
    if (!ge) throw ApiError.notFound('entity not found');
    const row = await queryOne(`SELECT aliases FROM entity_research WHERE canonical_name = ? AND entity_type = ?`, [ge.cn, ge.et]);
    let aliases = []; try { const a = JSON.parse(row?.aliases || '[]'); if (Array.isArray(a)) aliases = a; } catch { /* none */ }
    if (!aliases.includes(name)) aliases.push(name);
    if (row) await query(`UPDATE entity_research SET aliases = ? WHERE canonical_name = ? AND entity_type = ?`, [JSON.stringify(aliases), ge.cn, ge.et]);
    else await query(`INSERT INTO entity_research (canonical_name, entity_type, aliases) VALUES (?, ?, ?)`, [ge.cn, ge.et, JSON.stringify(aliases)]);
    const { skeletonKeys } = await import('../lib/translit-key.js');
    const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const k of skeletonKeys(name)) {
      await query(`INSERT INTO entity_lookup_keys (skeleton_key, entity_id, surface, surface_norm, is_canonical, entity_type, importance) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [k, ge.id, name, norm, ge.et, ge.importance ?? null]);
    }
    await query(`INSERT INTO entity_decisions (kind, target_kind, target_ids, payload, evidence, rationale, actor, actor_tier, status) VALUES ('set','entity',?,?,?,?,?,?, 'applied')`,
      [JSON.stringify([ge.id]), JSON.stringify({ alias: name }), JSON.stringify({ source }), `alias "${name}" for ${ge.cn}`, 'internal-api', 3]);
    return { id: ge.id, name: ge.cn, aliases };
  });

  // GET /server/docs-by-title?q=a|b|c — read-only: every copy of each titled work with paragraph / claim / mention
  // counts, so a pass targets the copy the entity pipeline actually used.
  fastify.get('/server/docs-by-title', { preHandler: requireInternal }, async (request) => {
    const qs = String(request.query.q || '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const out = [];
    for (const q of qs) {
      const docs = await queryAll(`SELECT id, title, author FROM docs WHERE title LIKE ? AND deleted_at IS NULL LIMIT 20`, [`%${q}%`], 'admin:docs-by-title');
      for (const d of docs) {
        const c = await queryOne(`SELECT COUNT(*) n FROM content WHERE doc_id = ? AND deleted_at IS NULL`, [d.id]);
        const cl = await queryOne(`SELECT COUNT(*) n FROM entity_claims WHERE doc_id = ?`, [d.id]);
        const m = await queryOne(`SELECT COUNT(*) n FROM entity_mentions_v2 WHERE doc_id = ?`, [d.id]);
        out.push({ q, id: d.id, title: d.title, author: d.author, paragraphs: c.n, claims: cl.n, mentions: m.n });
      }
    }
    return { docs: out };
  });

  // POST /server/merge-review-export — every candidate identity merge with its textual evidence (for Chad's decision);
  // GET /server/merge-review-export/latest streams the latest JSON. Nothing is merged.
  fastify.post('/server/merge-review-export', { preHandler: requireInternal }, async () => {
    const existing = backgroundTasks.get('merge-review-export');
    if (existing && existing.status === 'running') throw ApiError.conflict('A merge-review-export run is already in progress');
    const task = runBackgroundTask('merge-review-export', 'scripts/merge-review-export.mjs', []);
    return { success: true, taskId: 'merge-review-export', status: task.status };
  });

  fastify.get('/server/merge-review-export/latest', { preHandler: requireInternal }, async (request, reply) => {
    const { readdirSync, readFileSync } = await import('fs');
    const files = readdirSync('logs').filter((f) => f.startsWith('merge-review-')).sort();
    if (!files.length) throw ApiError.notFound('no merge review export yet');
    reply.type('application/json');
    return readFileSync(`logs/${files.at(-1)}`, 'utf8');
  });

  fastify.get('/server/entity-relink/report', { preHandler: requireInternal }, async (request) => {
    const { readdirSync, readFileSync } = await import('fs');
    const mode = request.query.mode === 'write' ? 'write' : 'dry';
    const files = readdirSync('logs').filter((f) => f.startsWith(`entity-relink-${mode}-`)).sort();
    if (!files.length) throw ApiError.notFound(`no ${mode} report yet`);
    return { file: files.at(-1), ...JSON.parse(readFileSync(`logs/${files.at(-1)}`, 'utf8')) };
  });

  /**
   * Control PM2 processes (stop/start/restart library watcher)
   */
  fastify.post('/server/pm2/:action/:process', { preHandler: requireInternal }, async (request) => {
    const { action, process: processName } = request.params;

    // Only allow specific processes and actions for security
    const allowedProcesses = ['siftersearch-library-watcher', 'siftersearch-jobs'];
    const allowedActions = ['stop', 'start', 'restart'];

    if (!allowedProcesses.includes(processName)) {
      throw ApiError.badRequest(`Process not allowed: ${processName}`);
    }
    if (!allowedActions.includes(action)) {
      throw ApiError.badRequest(`Action not allowed: ${action}`);
    }

    return new Promise((resolve, reject) => {
      const pm2Process = spawn('pm2', [action, processName], {
        cwd: join(import.meta.dirname, '../..'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pm2Process.stdout.on('data', (data) => { stdout += data.toString(); });
      pm2Process.stderr.on('data', (data) => { stderr += data.toString(); });

      pm2Process.on('close', (code) => {
        if (code === 0) {
          logger.info({ action, processName }, 'PM2 command executed');
          resolve({ success: true, action, process: processName, output: stdout.trim() });
        } else {
          reject(ApiError.internal(`PM2 command failed: ${stderr || stdout}`));
        }
      });

      pm2Process.on('error', (err) => {
        reject(ApiError.internal(`Failed to execute PM2: ${err.message}`));
      });
    });
  });

  /**
   * Get PM2 logs for debugging
   */
  // ── SEARCH FORENSICS (2026-09-24) ─────────────────────────────────────────────────────────────────────
  // requireInternal, NOT requireTier('admin'): the analytics routes need a browser JWT, so a dev agent could
  // not read them at all and had to query sqlite directly. These are the numbers search quality is judged by,
  // so they must be reachable with the internal key.
  //
  // GET /search-trace                → many: recent, slowest, zero-result, by question
  // GET /search-trace/:traceId       → ONE search, fully deconstructed
  // GET /search-stats?days=7         → the aggregate: p50/p95, zero-result rate, which layer leads, cache rate
  fastify.get('/search-trace', { preHandler: requireInternal }, async (request) => {
    const q = request.query || {};
    const limit = Math.min(parseInt(q.limit, 10) || 50, 500);
    const where = ['1=1'];
    const params = [];
    if (q.days) { where.push("created_at >= unixepoch('now', ?)"); params.push(`-${parseInt(q.days, 10) || 7} days`); }
    if (q.endpoint) { where.push('endpoint = ?'); params.push(q.endpoint); }
    if (q.query) { where.push('query LIKE ?'); params.push(`%${q.query}%`); }
    if (q.zeroOnly === '1' || q.zeroOnly === 'true') where.push('result_count = 0');
    if (q.slowerThan) { where.push('total_ms >= ?'); params.push(parseInt(q.slowerThan, 10) || 0); }
    if (q.layer) { where.push('top1_layer = ?'); params.push(q.layer); }
    const order = q.sort === 'slow' ? 'total_ms DESC' : 'created_at DESC';
    const rows = await queryAll(
      `SELECT * FROM search_trace WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
      [...params, limit], 'admin:search-trace-list');
    const { summarizeTraces } = await import('../lib/search-trace.js');
    return { count: rows.length, summary: summarizeTraces(rows), traces: rows.map(expandTrace) };
  });

  fastify.get('/search-trace/:traceId', { preHandler: requireInternal }, async (request, reply) => {
    const row = await queryOne(`SELECT * FROM search_trace WHERE trace_id = ?`, [request.params.traceId], 'admin:search-trace-one');
    if (!row) { reply.code(404); return { error: 'trace not found' }; }
    // Same question asked before/after a change — the comparison that attributes a quality shift.
    const siblings = await queryAll(
      `SELECT trace_id, created_at, search_version, total_ms, result_count, top1_layer, top1_title, cache_status
         FROM search_trace WHERE query_hash = ? AND trace_id != ? ORDER BY created_at DESC LIMIT 20`,
      [row.query_hash, row.trace_id], 'admin:search-trace-siblings');
    return { trace: expandTrace(row), same_question: siblings };
  });

  // GET /search-engine → Meili version, experimental features, and whether each filter KIND really filters.
  // Exists because a rejected CONTAINS filter was swallowed as "zero hits" and nothing reachable could say why.
  fastify.get('/search-engine', { preHandler: requireInternal }, async () => probeSearchEngine());

  fastify.get('/search-stats', { preHandler: requireInternal }, async (request) => {
    const days = parseInt(request.query?.days, 10) || 7;
    const rows = await queryAll(
      `SELECT * FROM search_trace WHERE created_at >= unixepoch('now', ?)`,
      [`-${days} days`], 'admin:search-stats');
    const { summarizeTraces } = await import('../lib/search-trace.js');
    const byEndpoint = {}, byVersion = {};
    for (const r of rows) {
      (byEndpoint[r.endpoint || 'unknown'] ||= []).push(r);
      (byVersion[r.search_version || 'unknown'] ||= []).push(r);
    }
    const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, summarizeTraces(v)]));
    return {
      days, overall: summarizeTraces(rows),
      by_endpoint: map(byEndpoint),
      // Per-version, so "did that change help?" is answerable from data rather than memory.
      by_search_version: map(byVersion),
      worst_zero_result_questions: rows.filter((r) => !r.result_count)
        .reduce((acc, r) => { acc[r.query] = (acc[r.query] || 0) + 1; return acc; }, {}),
    };
  });

  fastify.get('/server/logs', { preHandler: requireInternal }, async (request) => {
    const { lines = 50, process: processName = 'siftersearch-api' } = request.query || {};
    const allowedProcesses = ['siftersearch-api', 'siftersearch-library-watcher', 'siftersearch-watchdog', 'siftersearch-jobs'];

    if (!allowedProcesses.includes(processName)) {
      throw ApiError.badRequest(`Process not allowed: ${processName}`);
    }

    return new Promise((resolve, reject) => {
      const pm2Process = spawn('pm2', ['logs', processName, '--lines', String(lines), '--nostream'], {
        cwd: join(import.meta.dirname, '../..'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pm2Process.stdout.on('data', (data) => { stdout += data.toString(); });
      pm2Process.stderr.on('data', (data) => { stderr += data.toString(); });

      pm2Process.on('close', (code) => {
        if (code === 0) {
          resolve({ process: processName, lines: Number(lines), logs: stdout.trim() });
        } else {
          reject(ApiError.internal(`PM2 logs failed: ${stderr || stdout}`));
        }
      });

      pm2Process.on('error', (err) => {
        reject(ApiError.internal(`Failed to get PM2 logs: ${err.message}`));
      });
    });
  });

  /**
   * Validate script parameters without running (dry validation)
   */
  fastify.post('/server/validate', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        required: ['script'],
        properties: {
          script: { type: 'string', enum: ['reindex', 'fix-languages', 'populate-translations'] },
          params: { type: 'object' }
        }
      }
    }
  }, async (request) => {
    const { script, params = {} } = request.body;

    const validation = { valid: true, warnings: [], errors: [] };

    // Validate based on script type
    switch (script) {
      case 'reindex':
        if (params.religion && params.collection) {
          validation.warnings.push('Both religion and collection specified - will filter by both');
        }
        if (params.documentId && (params.religion || params.collection || params.path)) {
          validation.warnings.push('documentId specified - other filters will be ignored');
        }
        break;

      case 'fix-languages':
        if (params.dryRun) {
          validation.warnings.push('Dry run mode - no changes will be made');
        }
        break;

      case 'populate-translations':
        if (!params.limit && !params.documentId) {
          validation.warnings.push('No limit or documentId - will process all documents');
        }
        if (params.force) {
          validation.warnings.push('Force mode - will regenerate existing translations');
        }
        break;
    }

    return validation;
  });

  // ========================================
  // Embedding Cache Management
  // ========================================

  /**
   * Get embedding cache statistics
   * Shows how many embeddings are cached in libsql
   */
  fastify.get('/server/embedding-cache', { preHandler: requireInternal }, async () => {
    const stats = await getEmbeddingCacheStats();
    return stats;
  });

  /**
   * Migrate existing embeddings from Meilisearch to libsql (background task)
   * This preserves paid-for OpenAI embeddings so we don't have to regenerate them
   */
  fastify.post('/server/migrate-embeddings', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false },
          batchSize: { type: 'number', default: 100 }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false, batchSize = 100 } = request.body || {};

    // Check if already running
    const existingTask = [...backgroundTasks.values()].find(
      t => t.script.includes('migrate-embeddings') && t.status === 'running'
    );
    if (existingTask) {
      return {
        success: false,
        message: 'Embedding migration already running',
        taskId: existingTask.id
      };
    }

    const taskId = `migrate-embeddings-${Date.now()}`;
    const scriptPath = join(process.cwd(), 'scripts', 'migrate-embeddings.js');
    const args = [];
    if (dryRun) args.push('--dry-run');
    args.push(`--batch-size=${batchSize}`);

    logger.info({ taskId, dryRun, batchSize }, 'Starting embedding migration as background task');

    const task = runBackgroundTask(taskId, scriptPath, args);

    return {
      success: true,
      taskId: task.id,
      message: `Embedding migration started${dryRun ? ' (dry run)' : ''}. Check /server/tasks/${task.id} for progress.`,
      dryRun,
      batchSize
    };
  });

  /**
   * Generate embeddings for paragraphs that don't have them (background task)
   * Useful after re-ingesting documents when their paragraphs need embeddings
   */
  fastify.post('/server/generate-embeddings', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false },
          batchSize: { type: 'number', default: 50 },
          limit: { type: 'number', description: 'Max paragraphs to process' },
          language: { type: 'string', description: 'Only process specific language (e.g., ar, fa)' }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false, batchSize = 50, limit, language } = request.body || {};

    // Check if already running
    const existingTask = [...backgroundTasks.values()].find(
      t => t.script.includes('regenerate-embeddings') && t.status === 'running'
    );
    if (existingTask) {
      return {
        success: false,
        message: 'Embedding generation already running',
        taskId: existingTask.id
      };
    }

    const taskId = `generate-embeddings-${Date.now()}`;
    const scriptPath = join(process.cwd(), 'scripts', 'regenerate-embeddings.js');
    const args = ['--include-missing'];  // Always include missing embeddings
    if (dryRun) args.push('--dry-run');
    args.push(`--batch-size=${batchSize}`);
    if (limit) args.push(`--limit=${limit}`);
    if (language) args.push(`--language=${language}`);

    logger.info({ taskId, dryRun, batchSize, limit, language }, 'Starting embedding generation as background task');

    const task = runBackgroundTask(taskId, scriptPath, args);

    return {
      success: true,
      taskId: task.id,
      message: `Embedding generation started${dryRun ? ' (dry run)' : ''}. Check /server/tasks/${task.id} for progress.`,
      dryRun,
      batchSize,
      limit,
      language
    };
  });

  // ========================================================================
  // Content Sync Management (Content Table → Meilisearch)
  // ========================================================================

  /**
   * GET /server/sync/status - Get sync worker status and pending counts
   */
  fastify.get('/server/sync/status', { preHandler: requireInternal }, async () => {
    const [stats, unsynced] = await Promise.all([
      getSyncStats(),
      getUnsyncedCount()
    ]);

    return {
      worker: stats,
      pending: unsynced
    };
  });

  /**
   * POST /server/sync/now - Force immediate sync cycle
   */
  fastify.post('/server/sync/now', { preHandler: requireInternal }, async () => {
    logger.info('Manual sync triggered via admin API');
    const result = await forceSyncNow();
    return {
      success: true,
      message: 'Sync cycle completed',
      stats: result
    };
  });

  /**
   * POST /server/sync/cleanup-paragraphs - Remove orphaned paragraph IDs from Meilisearch
   * Checks ALL documents and deletes Meilisearch paragraph IDs not in content table.
   */
  fastify.post('/server/sync/cleanup-paragraphs', { preHandler: requireInternal }, async () => {
    const meili = getMeili();
    if (!meili) throw ApiError.serviceUnavailable('Meilisearch not available');

    const docs = await queryAll('SELECT id FROM docs WHERE deleted_at IS NULL');
    const paragraphsIndex = meili.index('paragraphs');
    let totalOrphans = 0;
    let docsWithOrphans = 0;

    for (const doc of docs) {
      const dbContent = await queryAll('SELECT id FROM content WHERE doc_id = ?', [doc.id]);
      const dbIdSet = new Set(dbContent.map(r => r.id));

      let offset = 0;
      const meiliIds = [];
      while (true) {
        const result = await paragraphsIndex.getDocuments({
          filter: `doc_id = ${doc.id}`,
          fields: ['id'],
          limit: 1000,
          offset
        });
        if (!result.results || result.results.length === 0) break;
        meiliIds.push(...result.results.map(r => r.id));
        if (result.results.length < 1000) break;
        offset += 1000;
      }

      const orphanIds = meiliIds.filter(id => !dbIdSet.has(id));
      if (orphanIds.length > 0) {
        docsWithOrphans++;
        totalOrphans += orphanIds.length;
        for (let i = 0; i < orphanIds.length; i += 1000) {
          await paragraphsIndex.deleteDocuments(orphanIds.slice(i, i + 1000));
        }
        logger.info({ docId: doc.id, orphans: orphanIds.length, meili: meiliIds.length, db: dbContent.length }, 'Cleaned orphaned paragraphs');
      }
    }

    return {
      success: true,
      documentsChecked: docs.length,
      documentsWithOrphans: docsWithOrphans,
      orphanedParagraphsDeleted: totalOrphans
    };
  });

  /**
   * GET /server/sync/orphaned - Find documents without content table entries
   */
  fastify.get('/server/sync/orphaned', { preHandler: requireInternal }, async () => {
    // Find documents in docs table that have no content entries
    const orphaned = await queryAll(`
      SELECT d.id, d.title, d.file_path, d.language, d.paragraph_count
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      WHERE c.id IS NULL
      LIMIT 100
    `);

    // Also find documents with partial content (fewer paragraphs than expected)
    const partial = await queryAll(`
      SELECT d.id, d.title, d.file_path, d.paragraph_count as expected,
             COUNT(c.id) as actual
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      GROUP BY d.id
      HAVING actual < expected AND actual > 0
      LIMIT 100
    `);

    return {
      orphaned: orphaned.length,
      partial: partial.length,
      orphanedDocs: orphaned,
      partialDocs: partial
    };
  });

  // ========================================================================
  // Library Watcher Management (File System → Content Table)
  // ========================================================================

  /**
   * GET /server/watcher/status - Get library watcher status
   */
  fastify.get('/server/watcher/status', { preHandler: requireInternal }, async () => {
    return {
      running: isWatcherRunning(),
      stats: getWatcherStats()
    };
  });

  /**
   * POST /server/populate-content - Populate missing content from Meilisearch
   * Finds documents with paragraph_count > 0 but no content rows and fetches from Meili
   */
  fastify.post('/server/populate-content', { preHandler: requireInternal }, async (request) => {
    const { limit = 100 } = request.query;

    // Find documents with no content
    const orphanedDocs = await queryAll(`
      SELECT d.id, d.title, d.paragraph_count, d.language
      FROM docs d
      LEFT JOIN content c ON c.doc_id = d.id
      WHERE d.paragraph_count > 0
      GROUP BY d.id
      HAVING COUNT(c.id) = 0
      LIMIT ?
    `, [limit]);

    if (orphanedDocs.length === 0) {
      return { success: true, message: 'All documents have content', fixed: 0 };
    }

    const meili = getMeili();
    let fixed = 0;
    let errors = [];

    for (const doc of orphanedDocs) {
      try {
        const parasResult = await meili.index('paragraphs').search('', {
          filter: `doc_id = ${doc.id}`,
          limit: 10000,
          sort: ['paragraph_index:asc'],
          attributesToRetrieve: ['id', 'text', 'paragraph_index', 'heading', 'blocktype', '_vectors']
        });

        if (parasResult.hits.length === 0) {
          errors.push({ id: doc.id, error: 'No paragraphs in Meilisearch' });
          continue;
        }

        const now = new Date().toISOString();

        for (const para of parasResult.hits) {
          const contentId = para.id || `${doc.id}_p${para.paragraph_index}_${Date.now()}`;
          const embedding = para._vectors?.default;
          const embeddingBlob = embedding ? Buffer.from(new Float32Array(embedding).buffer) : null;

          // Direct SQL: recovery operation - restoring content from Meilisearch backup
          await query(`
            INSERT OR REPLACE INTO content
            (id, doc_id, paragraph_index, text, heading, blocktype, embedding, synced, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `, [
            contentId,
            doc.id,
            para.paragraph_index || 0,
            para.text || '',
            para.heading || '',
            para.blocktype || 'paragraph',
            embeddingBlob,
            now,
            now
          ]);
        }

        fixed++;
        logger.info({ docId: doc.id, paragraphs: parasResult.hits.length }, 'Populated content from Meilisearch');

      } catch (err) {
        errors.push({ id: doc.id, error: err.message });
      }
    }

    return {
      success: true,
      message: `Populated content for ${fixed} documents`,
      fixed,
      total: orphanedDocs.length,
      errors: errors.length > 0 ? errors : undefined
    };
  });

  // ========================================================================
  // Source File Linking (Link database records to source markdown files)
  // ========================================================================

  /**
   * POST /server/link-source-files - Link database documents to source files
   * Detects platform (Linux vs macOS) and uses correct Dropbox path
   *
   * @param {boolean} dryRun - Preview matches without updating database
   * @returns {object} Summary of matches and updates
   */
  fastify.post('/server/link-source-files', {
    preHandler: requireInternal,
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false, description: 'Preview without updating' }
        }
      }
    }
  }, async (request) => {
    const { dryRun = false } = request.body || {};
    const os = await import('os');
    const { readdir, readFile, stat } = await import('fs/promises');
    const { join, basename } = await import('path');
    const matter = (await import('gray-matter')).default;

    // Platform-specific Dropbox path
    const platform = os.platform();
    const homeDir = os.homedir();
    const LIBRARY_ROOT = join(
      homeDir,
      'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library'
    );

    logger.info({ platform, homeDir, LIBRARY_ROOT, dryRun }, 'Starting source file linking');

    // Recursively find all markdown files
    async function findMarkdownFiles(dir) {
      const files = [];
      async function scan(currentDir) {
        try {
          const entries = await readdir(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(currentDir, entry.name);
            if (entry.isDirectory()) {
              await scan(fullPath);
            } else if (entry.name.endsWith('.md')) {
              files.push(fullPath);
            }
          }
        } catch (err) {
          logger.warn({ dir: currentDir, error: err.message }, 'Cannot scan directory');
        }
      }
      await scan(dir);
      return files;
    }

    // Convert filename to database ID format
    function filenameToId(filename) {
      return basename(filename, '.md')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    // Parse source file frontmatter
    async function parseSourceFile(filePath) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const parsed = matter(content);
        return {
          path: filePath,
          filename: basename(filePath),
          filenameId: filenameToId(basename(filePath)),
          title: parsed.data.title || null,
          author: parsed.data.author || null,
          language: parsed.data.language || 'en'
        };
      } catch (err) {
        return null;
      }
    }

    // Find matching database record
    function findMatch(sourceFile, allDocs) {
      // Strategy 1: Exact ID match
      const exactMatch = allDocs.find(d => d.id === sourceFile.filenameId);
      if (exactMatch) return { doc: exactMatch, matchType: 'exact_id' };

      // Strategy 2: ID contains filename ID
      const containsMatch = allDocs.find(d =>
        d.id.includes(sourceFile.filenameId) ||
        sourceFile.filenameId.includes(d.id)
      );
      if (containsMatch) return { doc: containsMatch, matchType: 'partial_id' };

      // Strategy 3: Title match
      const normalizeTitle = (t) => t?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      const sourceTitle = normalizeTitle(sourceFile.title);
      if (sourceTitle) {
        const titleMatch = allDocs.find(d => normalizeTitle(d.title) === sourceTitle);
        if (titleMatch) return { doc: titleMatch, matchType: 'title' };
      }

      return null;
    }

    // Check library exists
    try {
      await stat(LIBRARY_ROOT);
    } catch (err) {
      throw ApiError.badRequest(`Library not found at: ${LIBRARY_ROOT}`);
    }

    // Find source files
    const sourceFiles = await findMarkdownFiles(LIBRARY_ROOT);
    logger.info({ count: sourceFiles.length }, 'Found source files');

    // Get all database documents
    const allDocs = await queryAll('SELECT id, title, author, language, file_path FROM docs');
    logger.info({ count: allDocs.length }, 'Found database documents');

    // Match files to documents
    const matches = [];
    const unmatched = [];

    for (const filePath of sourceFiles) {
      const sourceFile = await parseSourceFile(filePath);
      if (!sourceFile) continue;

      const match = findMatch(sourceFile, allDocs);
      if (match) {
        matches.push({
          docId: match.doc.id,
          docTitle: match.doc.title,
          filePath: sourceFile.path,
          matchType: match.matchType
        });
      } else {
        unmatched.push({ path: filePath, title: sourceFile.title });
      }
    }

    // Apply updates if not dry run
    let updated = 0;
    if (!dryRun && matches.length > 0) {
      for (const match of matches) {
        await query('UPDATE docs SET file_path = ? WHERE id = ?', [match.filePath, match.docId]);
        updated++;
      }
      logger.info({ updated }, 'Updated document file paths');
    }

    return {
      success: true,
      dryRun,
      platform,
      libraryRoot: LIBRARY_ROOT,
      sourceFilesFound: sourceFiles.length,
      databaseDocuments: allDocs.length,
      matched: matches.length,
      unmatched: unmatched.length,
      updated: dryRun ? 0 : updated,
      sampleMatches: matches.slice(0, 10).map(m => ({
        docId: m.docId,
        matchType: m.matchType,
        path: m.filePath.replace(LIBRARY_ROOT, '.')
      })),
      sampleUnmatched: unmatched.slice(0, 5).map(u => ({
        path: u.path.replace(LIBRARY_ROOT, '.'),
        title: u.title
      }))
    };
  });

  /**
   * GET /server/file-path-stats - Get statistics on documents with/without file paths
   */
  fastify.get('/server/file-path-stats', { preHandler: requireInternal }, async () => {
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN file_path IS NOT NULL THEN 1 ELSE 0 END) as with_path,
        SUM(CASE WHEN file_path IS NULL THEN 1 ELSE 0 END) as without_path
      FROM docs
    `);

    const sampleWithPath = await queryAll(`
      SELECT id, title, file_path FROM docs WHERE file_path IS NOT NULL LIMIT 5
    `);

    const sampleWithoutPath = await queryAll(`
      SELECT id, title, author FROM docs WHERE file_path IS NULL LIMIT 10
    `);

    return {
      total: stats.total,
      withFilePath: stats.with_path,
      withoutFilePath: stats.without_path,
      coverage: stats.total > 0 ? Math.round(stats.with_path / stats.total * 100) : 0,
      sampleWithPath,
      sampleWithoutPath
    };
  });

  /**
   * GET /server/query-documents - Query documents by metadata fields
   * Flexible endpoint for finding documents by any combination of filters
   *
   * Query params:
   *   author - Filter by author (exact or partial match with *)
   *   collection - Filter by collection
   *   religion - Filter by religion
   *   language - Filter by language code (ar, fa, en, etc.)
   *   hasFilePath - true/false to filter by file_path presence
   *   hasContent - true/false to filter by content table entries
   *   fields - Comma-separated list of fields to return (default: id,title,author)
   *   limit - Max results (default: 100, max: 1000)
   *   offset - Pagination offset
   *
   * Examples:
   *   /server/query-documents?author=The Báb&language=ar
   *   /server/query-documents?hasFilePath=false&limit=50
   *   /server/query-documents?collection=Core Tablets&fields=id,title,file_path
   */
  fastify.get('/server/query-documents', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          author: { type: 'string', description: 'Filter by author (use * for wildcard)' },
          collection: { type: 'string', description: 'Filter by collection' },
          religion: { type: 'string', description: 'Filter by religion' },
          language: { type: 'string', description: 'Filter by language code' },
          hasFilePath: { type: 'string', enum: ['true', 'false'], description: 'Filter by file_path presence' },
          hasContent: { type: 'string', enum: ['true', 'false'], description: 'Filter by content entries' },
          sourceSite: { type: 'string', description: "Filter by source_site; 'canonical' = oceanlibrary.com or main library (NULL)" },
          includeDeleted: { type: 'string', enum: ['true', 'false'], description: 'Include soft-deleted docs (default false)' },
          fields: { type: 'string', description: 'Comma-separated fields to return' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request) => {
    const {
      author,
      collection,
      religion,
      language,
      hasFilePath,
      hasContent,
      sourceSite,
      includeDeleted,
      fields = 'id,title,author',
      limit = 100,
      offset = 0
    } = request.query;

    // Allowed fields to prevent SQL injection
    const allowedFields = ['id', 'title', 'author', 'religion', 'collection', 'language', 'year', 'description', 'file_path', 'file_hash', 'paragraph_count', 'created_at', 'updated_at', 'source_site', 'duplicate_of', 'deleted_at'];
    const requestedFields = fields.split(',').map(f => f.trim()).filter(f => allowedFields.includes(f));
    if (requestedFields.length === 0) {
      requestedFields.push('id', 'title', 'author');
    }

    // Build query
    const conditions = [];
    const params = [];

    // EXCLUDE SOFT-DELETED BY DEFAULT. This endpoint used to return tombstones alongside live docs, so a
    // title lookup showed two "Prayers and Meditations" — 8301 (deleted 2026-05-29, duplicate_of 20805) and
    // the live canonical 20805 — and read as a dedupe failure when the dedupe had in fact worked. A listing
    // that mixes the dead with the living invites exactly that misreading (2026-08-25).
    if (includeDeleted !== 'true') conditions.push('deleted_at IS NULL');

    // CANONICAL = oceanlibrary.com or the main library (NULL). The corpus holds ~147,000 scraped documents
    // against oceanlibrary's ~565, so an unfiltered title search surfaces a scrape first roughly 128:1.
    if (sourceSite === 'canonical') conditions.push("(source_site = 'oceanlibrary.com' OR source_site IS NULL)");
    else if (sourceSite) { conditions.push('source_site = ?'); params.push(sourceSite); }

    if (author) {
      if (author.includes('*')) {
        conditions.push('author LIKE ?');
        params.push(author.replace(/\*/g, '%'));
      } else {
        conditions.push('author = ?');
        params.push(author);
      }
    }

    if (collection) {
      if (collection.includes('*')) {
        conditions.push('collection LIKE ?');
        params.push(collection.replace(/\*/g, '%'));
      } else {
        conditions.push('collection = ?');
        params.push(collection);
      }
    }

    if (religion) {
      conditions.push('religion = ?');
      params.push(religion);
    }

    if (language) {
      conditions.push('language = ?');
      params.push(language);
    }

    if (hasFilePath === 'true') {
      conditions.push('file_path IS NOT NULL');
    } else if (hasFilePath === 'false') {
      conditions.push('file_path IS NULL');
    }

    // Build SQL
    let sql = `SELECT ${requestedFields.join(', ')} FROM docs`;

    if (hasContent !== undefined) {
      // Need to join with content table
      if (hasContent === 'true') {
        sql = `SELECT DISTINCT ${requestedFields.map(f => 'd.' + f).join(', ')} FROM docs d INNER JOIN content c ON c.doc_id = d.id`;
      } else {
        sql = `SELECT ${requestedFields.map(f => 'd.' + f).join(', ')} FROM docs d LEFT JOIN content c ON c.doc_id = d.id WHERE c.id IS NULL`;
        if (conditions.length > 0) {
          sql += ' AND ' + conditions.map(c => c.replace(/^(\w+)/, 'd.$1')).join(' AND ');
        }
        sql += ` LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const documents = await queryAll(sql, params);
        const countSql = `SELECT COUNT(DISTINCT d.id) as count FROM docs d LEFT JOIN content c ON c.doc_id = d.id WHERE c.id IS NULL` +
          (conditions.length > 0 ? ' AND ' + conditions.map(c => c.replace(/^(\w+)/, 'd.$1')).join(' AND ') : '');
        const countResult = await queryOne(countSql, params.slice(0, -2));

        return {
          documents,
          total: countResult?.count || documents.length,
          limit,
          offset,
          filters: { author, collection, religion, language, hasFilePath, hasContent }
        };
      }
    }

    if (conditions.length > 0) {
      const prefix = hasContent === 'true' ? 'd.' : '';
      sql += ' WHERE ' + conditions.map(c => c.replace(/^(\w+)/, prefix + '$1')).join(' AND ');
    }

    sql += ` ORDER BY ${hasContent === 'true' ? 'd.' : ''}id LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const documents = await queryAll(sql, params);

    // Get total count
    let countSql = `SELECT COUNT(*) as count FROM docs`;
    if (hasContent === 'true') {
      countSql = `SELECT COUNT(DISTINCT d.id) as count FROM docs d INNER JOIN content c ON c.doc_id = d.id`;
    }
    if (conditions.length > 0) {
      const prefix = hasContent === 'true' ? 'd.' : '';
      countSql += ' WHERE ' + conditions.map(c => c.replace(/^(\w+)/, prefix + '$1')).join(' AND ');
    }
    const countResult = await queryOne(countSql, params.slice(0, -2));

    return {
      documents,
      total: countResult?.count || documents.length,
      limit,
      offset,
      filters: { author, collection, religion, language, hasFilePath, hasContent }
    };
  });

  /**
   * Update a document's file_path
   * Used to fix incorrect paths or clear paths for documents without source files
   *
   * PATCH /server/documents/:id/file-path
   * Body: { filePath: "new/path.md" } or { filePath: null }
   */
  fastify.patch('/server/documents/:id/file-path', {
    preHandler: requireInternal,
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          filePath: { type: ['string', 'null'] }
        },
        required: ['filePath']
      }
    }
  }, async (request) => {
    const { id } = request.params;
    const { filePath } = request.body;

    // Verify document exists
    const doc = await queryOne('SELECT id, file_path FROM docs WHERE id = ?', [id]);
    if (!doc) {
      throw ApiError.notFound('Document not found');
    }

    const oldPath = doc.file_path;

    // Update file_path
    await query('UPDATE docs SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filePath, id]);

    logger.info({ documentId: id, oldPath, newPath: filePath }, 'Document file_path updated');

    return {
      success: true,
      documentId: id,
      oldFilePath: oldPath,
      newFilePath: filePath,
      message: filePath ? 'File path updated' : 'File path cleared'
    };
  });

  // ========================================
  // Job Queue Monitoring
  // ========================================

  /**
   * Get comprehensive job queue status
   * Shows pending/processing/completed/failed counts, recent activity, and processor health
   */
  fastify.get('/server/job-queue', { preHandler: requireInternal }, async () => {
    // Get job counts by status
    const [statusCounts, recentJobs, processorHealth] = await Promise.all([
      // Job counts by status
      queryAll(`
        SELECT status, COUNT(*) as count
        FROM jobs
        GROUP BY status
      `).then(rows => {
        const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
        rows.forEach(r => { counts[r.status] = r.count; });
        return counts;
      }),

      // Recent jobs (last 20)
      queryAll(`
        SELECT id, type, status, document_id, progress, total_items,
               created_at, started_at, completed_at, error_message
        FROM jobs
        ORDER BY created_at DESC
        LIMIT 20
      `),

      // Job processor health indicators
      queryAll(`
        SELECT
          MAX(CASE WHEN status = 'processing' THEN started_at END) as last_processing_start,
          MAX(CASE WHEN status = 'completed' THEN completed_at END) as last_completion,
          MAX(CASE WHEN status = 'failed' THEN completed_at END) as last_failure,
          COUNT(CASE WHEN status = 'processing' AND started_at < datetime('now', '-10 minutes') THEN 1 END) as stuck_jobs
        FROM jobs
      `).then(rows => rows[0] || {})
    ]);

    // Determine processor status
    let processorStatus = 'unknown';
    if (statusCounts.processing > 0) {
      processorStatus = 'active';
    } else if (processorHealth.last_completion) {
      const lastComplete = new Date(processorHealth.last_completion);
      const minutesAgo = (Date.now() - lastComplete.getTime()) / 60000;
      if (minutesAgo < 5) {
        processorStatus = 'idle'; // Recently active
      } else if (statusCounts.pending > 0) {
        processorStatus = 'stalled'; // Has pending but not processing
      } else {
        processorStatus = 'idle';
      }
    } else if (statusCounts.pending > 0) {
      processorStatus = 'not_started'; // Jobs waiting but never processed
    }

    return {
      counts: statusCounts,
      processor: {
        status: processorStatus,
        lastProcessingStart: processorHealth.last_processing_start,
        lastCompletion: processorHealth.last_completion,
        lastFailure: processorHealth.last_failure,
        stuckJobs: processorHealth.stuck_jobs || 0
      },
      recentJobs: recentJobs.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        documentId: j.document_id,
        progress: j.progress,
        total: j.total_items,
        createdAt: j.created_at,
        startedAt: j.started_at,
        completedAt: j.completed_at,
        error: j.error_message
      }))
    };
  });

  /**
   * Force process a specific pending job immediately
   * Useful for testing without waiting for the job processor
   */
  fastify.post('/server/job-queue/process/:jobId', { preHandler: requireInternal }, async (request) => {
    const { jobId } = request.params;

    const job = await queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw ApiError.notFound('Job not found');
    }

    if (job.status !== 'pending') {
      throw ApiError.badRequest(`Job is ${job.status}, not pending`);
    }

    // Parse params
    job.params = JSON.parse(job.params || '{}');

    // Import and process based on job type
    const { JOB_TYPES } = await import('../services/jobs.js');

    if (job.type === JOB_TYPES.TRANSLATION) {
      const { processTranslationJob } = await import('../services/translation.js');

      // Process synchronously (this endpoint is for admin testing)
      try {
        const result = await processTranslationJob(job);
        return { success: true, jobId, result };
      } catch (err) {
        return { success: false, jobId, error: err.message };
      }
    }

    if (job.type === JOB_TYPES.AUDIO) {
      const { processAudioJob } = await import('../services/audio.js');
      try {
        const result = await processAudioJob(job);
        return { success: true, jobId, result };
      } catch (err) {
        return { success: false, jobId, error: err.message };
      }
    }

    throw ApiError.badRequest(`Unknown job type: ${job.type}`);
  });

  /**
   * Clear old completed/failed jobs from the database
   * Keeps only jobs from the last N days
   */
  fastify.delete('/server/job-queue/cleanup', {
    preHandler: requireInternal,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          daysToKeep: { type: 'integer', default: 7 }
        }
      }
    }
  }, async (request) => {
    const { daysToKeep = 7 } = request.query || {};

    const result = await query(`
      DELETE FROM jobs
      WHERE status IN ('completed', 'failed')
      AND completed_at < datetime('now', '-' || ? || ' days')
    `, [daysToKeep]);

    logger.info({ deleted: result.changes, daysToKeep }, 'Job queue cleanup');

    return {
      success: true,
      deleted: result.changes,
      daysToKeep
    };
  });

  /**
   * Reset a failed/stuck job back to pending
   */
  fastify.post('/server/job-queue/reset/:jobId', { preHandler: requireInternal }, async (request) => {
    const { jobId } = request.params;

    const job = await queryOne('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw ApiError.notFound('Job not found');
    }

    if (job.status === 'pending') {
      return { success: false, message: 'Job is already pending' };
    }

    await query(`
      UPDATE jobs
      SET status = 'pending', started_at = NULL, completed_at = NULL,
          error_message = NULL, progress = 0
      WHERE id = ?
    `, [jobId]);

    logger.info({ jobId, previousStatus: job.status }, 'Job reset to pending');

    return {
      success: true,
      jobId,
      previousStatus: job.status,
      newStatus: 'pending'
    };
  });

  // ==========================================================================
  // AI Usage Tracking
  // ==========================================================================

  // Cache for AI usage summary (expensive queries, refresh every 5 min)
  let _aiUsageCache = null;
  let _aiUsageCacheTime = 0;
  const AI_USAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Get AI usage summary (today, week, month, by model, by caller)
  fastify.get('/ai-usage/summary', { preHandler: requireTier('admin') }, async () => {
    // Precomputed out-of-process (every ~5 min) — the live aggregation below scans a
    // multi-million-row ai_usage window and blocks the API for seconds while it runs.
    const snapAi = readAdminSnapshot()?.aiUsage;
    if (snapAi?.combined) {
      const c = snapAi.combined;
      return {
        today: { calls: c.today_calls || 0, tokens: c.today_tokens || 0, cost: c.today_cost || 0 },
        week: { calls: c.week_calls || 0, tokens: c.week_tokens || 0, cost: c.week_cost || 0 },
        month: { calls: c.month_calls || 0, tokens: c.month_tokens || 0, cost: c.month_cost || 0 },
        failedCalls: c.failed_week || 0,
        byModel: snapAi.byModel || [],
        byProvider: snapAi.byProvider || [],
        byCaller: snapAi.byCaller || [],
        byCallerToday: snapAi.byCallerToday || [],
        snapshot_generated_at: snapAi.generated_at
      };
    }

    const now = Date.now();
    if (_aiUsageCache && (now - _aiUsageCacheTime) < AI_USAGE_CACHE_TTL) {
      return _aiUsageCache;
    }
    // Format date for SQLite comparison (DB stores 'YYYY-MM-DD HH:MM:SS' format)
    const formatDate = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date();
    monthStart.setDate(monthStart.getDate() - 30);

    // Single-pass aggregation: compute today/week/month stats in one query
    const combined = await queryOne(`
      SELECT
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as today_calls,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN total_tokens ELSE 0 END), 0) as today_tokens,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN estimated_cost_usd ELSE 0 END), 0) as today_cost,
        SUM(CASE WHEN timestamp >= ? THEN 1 ELSE 0 END) as week_calls,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN total_tokens ELSE 0 END), 0) as week_tokens,
        COALESCE(SUM(CASE WHEN timestamp >= ? THEN estimated_cost_usd ELSE 0 END), 0) as week_cost,
        COUNT(*) as month_calls,
        COALESCE(SUM(total_tokens), 0) as month_tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as month_cost,
        SUM(CASE WHEN success = 0 AND timestamp >= ? THEN 1 ELSE 0 END) as failed_week
      FROM ai_usage
      WHERE timestamp >= ?
    `, [
      formatDate(todayStart), formatDate(todayStart), formatDate(todayStart),
      formatDate(weekStart), formatDate(weekStart), formatDate(weekStart),
      formatDate(weekStart),
      formatDate(monthStart)
    ]);

    const [byModel, byProvider, byCaller, byCallerToday] = await Promise.all([
      queryAll(`
        SELECT model, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost_usd), 0) as cost
        FROM ai_usage WHERE timestamp >= ? GROUP BY model ORDER BY cost DESC
      `, [formatDate(monthStart)]),
      queryAll(`
        SELECT provider, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost_usd), 0) as cost
        FROM ai_usage WHERE timestamp >= ? GROUP BY provider ORDER BY cost DESC
      `, [formatDate(monthStart)]),
      queryAll(`
        SELECT COALESCE(caller, 'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost_usd), 0) as cost
        FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC
      `, [formatDate(monthStart)]),
      queryAll(`
        SELECT COALESCE(caller, 'unknown') as caller, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(estimated_cost_usd), 0) as cost
        FROM ai_usage WHERE timestamp >= ? GROUP BY caller ORDER BY cost DESC
      `, [formatDate(todayStart)])
    ]);

    const today = { calls: combined?.today_calls || 0, tokens: combined?.today_tokens || 0, cost: combined?.today_cost || 0 };
    const week = { calls: combined?.week_calls || 0, tokens: combined?.week_tokens || 0, cost: combined?.week_cost || 0 };
    const month = { calls: combined?.month_calls || 0, tokens: combined?.month_tokens || 0, cost: combined?.month_cost || 0 };
    const failures = { count: combined?.failed_week || 0 };

    const result = {
      today: { calls: today?.calls || 0, tokens: today?.tokens || 0, cost: today?.cost || 0 },
      week: { calls: week?.calls || 0, tokens: week?.tokens || 0, cost: week?.cost || 0 },
      month: { calls: month?.calls || 0, tokens: month?.tokens || 0, cost: month?.cost || 0 },
      failedCalls: failures?.count || 0,
      byModel: byModel || [],
      byProvider: byProvider || [],
      byCaller: byCaller || [],
      byCallerToday: byCallerToday || []
    };

    _aiUsageCache = result;
    _aiUsageCacheTime = Date.now();
    return result;
  });

  // Get recent AI usage calls
  fastify.get('/ai-usage/recent', { preHandler: requireTier('admin') }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit) || 100, 500);
    const offset = parseInt(request.query.offset) || 0;
    const model = request.query.model || null;
    const caller = request.query.caller || null;
    const success = request.query.success !== undefined ? parseInt(request.query.success) : null;

    let sql = `
      SELECT
        id, timestamp, provider, model, service_type,
        prompt_tokens, completion_tokens, total_tokens,
        estimated_cost_usd, caller, success, error_message,
        user_id, job_id, document_id
      FROM ai_usage
      WHERE 1=1
    `;
    const params = [];

    if (model) {
      sql += ' AND model = ?';
      params.push(model);
    }
    if (caller) {
      sql += ' AND caller = ?';
      params.push(caller);
    }
    if (success !== null) {
      sql += ' AND success = ?';
      params.push(success);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await queryAll(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM ai_usage WHERE 1=1';
    const countParams = [];
    if (model) {
      countSql += ' AND model = ?';
      countParams.push(model);
    }
    if (caller) {
      countSql += ' AND caller = ?';
      countParams.push(caller);
    }
    if (success !== null) {
      countSql += ' AND success = ?';
      countParams.push(success);
    }
    const countResult = await queryOne(countSql, countParams);

    return {
      calls: rows,
      total: countResult?.total || 0,
      limit,
      offset
    };
  });

  // Get AI usage time series (for charts)
  fastify.get('/ai-usage/stats', { preHandler: requireTier('admin') }, async (request) => {
    const days = Math.min(parseInt(request.query.days) || 30, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rows = await queryAll(`
      SELECT
        date(timestamp) as date,
        COUNT(*) as calls,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as cost,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
      FROM ai_usage
      WHERE timestamp >= ?
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `, [startDate.toISOString()]);

    return {
      days,
      data: rows || []
    };
  });

  // Get distinct models and callers for filter dropdowns
  fastify.get('/ai-usage/filters', { preHandler: requireTier('admin') }, async () => {
    const snapFilters = readAdminSnapshot()?.aiUsage?.filters;
    if (snapFilters) return snapFilters;

    const [models, callers] = await Promise.all([
      queryAll('SELECT DISTINCT model FROM ai_usage ORDER BY model'),
      queryAll('SELECT DISTINCT caller FROM ai_usage WHERE caller IS NOT NULL ORDER BY caller')
    ]);

    return {
      models: models?.map(r => r.model) || [],
      callers: callers?.map(r => r.caller) || []
    };
  });

  // ==========================================================================
  // AI Processing Control (spending limits)
  // ==========================================================================

  // Get AI processing status (paused state, daily spending by service)
  let _aiStatusCache = null;
  let _aiStatusCacheTime = 0;
  const AI_STATUS_CACHE_TTL = 60 * 1000; // 1 minute

  fastify.get('/ai-usage/status', { preHandler: requireTier('admin') }, async () => {
    const now = Date.now();
    if (_aiStatusCache && (now - _aiStatusCacheTime) < AI_STATUS_CACHE_TTL) {
      return _aiStatusCache;
    }

    const [pauseState, spending] = await Promise.all([
      Promise.resolve(isAIProcessingPaused()),
      getAllDailySpending()
    ]);

    _aiStatusCache = {
      ...pauseState,
      dailySpending: spending,
      dailyLimit: 100  // USD per service
    };
    _aiStatusCacheTime = now;
    return _aiStatusCache;
  });

  // Resume AI processing (admin action after budget review)
  fastify.post('/ai-usage/resume', { preHandler: requireTier('admin') }, async () => {
    const result = await resumeAIProcessing();
    logger.info('Admin resumed AI processing');
    return result;
  });

  // =============================================
  // Library Management — pipeline visibility
  // =============================================

  // Library overview: document counts by language, pipeline stages
  // Missing-books triage — snapshot-only (the stub scan LIKEs across content for ~6s; it must
  // NEVER run in-request). Serves whatever the cron last computed; `pending` until the first pass.
  fastify.get('/library/missing-books', { preHandler: requireTier('admin') }, async () => {
    const mb = readAdminSnapshot()?.missingBooks;
    // haveSource is the current shape; a snapshot written by an older build has no two-list split,
    // so report pending rather than rendering empty queues until the next cron pass.
    if (!mb?.haveSource) return { pending: true, message: 'Snapshot not generated yet — the pipeline-snapshot cron computes this section within ~5 minutes.' };
    return mb;
  });

  fastify.get('/library/overview', { preHandler: requireTier('admin') }, async () => {
    const snap = readAdminSnapshot();
    // File exists but section not yet computed (deploy raced the cron): serve the cheap
    // parts with empty aggregates for one cycle rather than falling into the full scan.
    const snapLibrary = snap?.library || (snap ? { byLanguage: [], embeddingStats: {}, generated_at: null } : null);

    // Cheap live queries (small tables / selective partial indexes) — always fresh.
    const [dirtyCount, failureCount, totalDocs, recentDocs, syncStats] = await Promise.all([
      content.getDirtyCount(),
      queryOne('SELECT COUNT(*) as count FROM document_failures WHERE resolved = 0'),
      queryOne('SELECT COUNT(*) as count FROM docs WHERE deleted_at IS NULL'),
      queryAll(`
        SELECT d.id, d.title, d.author, d.language, d.religion, d.collection, d.updated_at,
          (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) as paragraph_count,
          (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL AND c.embedding IS NULL) as pending_embedding
        FROM docs d
        WHERE d.deleted_at IS NULL
        ORDER BY d.updated_at DESC
        LIMIT 20
      `),
      getSyncStats().catch(() => null)
    ]);

    // Full-corpus aggregates come from the snapshot; live fallback only when the
    // section has never been computed (dev — small DB, cron absent).
    const [byLanguage, embeddingStats] = snapLibrary
      ? [snapLibrary.byLanguage, snapLibrary.embeddingStats]
      : await Promise.all([
          queryAll(`
            SELECT
              d.language,
              COUNT(DISTINCT d.id) as doc_count,
              COUNT(c.id) as paragraph_count,
              SUM(CASE WHEN c.embedding IS NULL THEN 1 ELSE 0 END) as pending_embedding,
              SUM(CASE WHEN c.synced = 0 AND c.embedding IS NOT NULL THEN 1 ELSE 0 END) as pending_sync,
              SUM(CASE WHEN c.synced = 1 THEN 1 ELSE 0 END) as synced
            FROM docs d
            LEFT JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL
            WHERE d.deleted_at IS NULL
            GROUP BY d.language
            ORDER BY paragraph_count DESC
          `),
          content.getEmbeddingStats()
        ]);

    return {
      totalDocuments: totalDocs?.count || 0,
      unresolvedFailures: failureCount?.count || 0,
      embedding: embeddingStats || {},
      dirty: dirtyCount || { documents: 0, paragraphs: 0 },
      sync: syncStats || null,
      byLanguage: byLanguage || [],
      recentDocuments: recentDocs || [],
      snapshot_generated_at: snapLibrary?.generated_at || null
    };
  });

  // Pipeline bottleneck detail — documents stuck at each stage
  fastify.get('/library/bottlenecks', { preHandler: requireTier('admin') }, async (request) => {
    const language = request.query.language || null;
    const snap = readAdminSnapshot();
    const snapBottlenecks = snap?.bottlenecks || (snap ? { pendingEmbedding: [], pendingSync: [], generated_at: null } : null);

    // Failures live in a small table — always live.
    const failures = await queryAll(`
      SELECT file_path, file_name, error_type, error_message, created_at
      FROM document_failures
      WHERE resolved = 0
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Backlog lists from the snapshot (language filter applied in JS); live
    // fallback only when the section has never been computed (dev).
    let pendingEmbedding, pendingSync;
    if (snapBottlenecks) {
      const byLang = (rows) => language ? (rows || []).filter((r) => r.language === language) : (rows || []);
      pendingEmbedding = byLang(snapBottlenecks.pendingEmbedding);
      pendingSync = byLang(snapBottlenecks.pendingSync);
    } else {
      let langFilter = '';
      const params = [];
      if (language) {
        langFilter = ' AND d.language = ?';
        params.push(language);
      }
      [pendingEmbedding, pendingSync] = await Promise.all([
        queryAll(`
          SELECT d.id, d.title, d.author, d.language, d.file_path,
            COUNT(c.id) as pending_paragraphs
          FROM docs d
          JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL AND c.embedding IS NULL
          WHERE d.deleted_at IS NULL ${langFilter}
          GROUP BY d.id
          ORDER BY pending_paragraphs DESC
          LIMIT 50
        `, params),
        queryAll(`
          SELECT d.id, d.title, d.author, d.language,
            COUNT(c.id) as unsynced_paragraphs
          FROM docs d
          JOIN content c ON c.doc_id = d.id AND c.deleted_at IS NULL AND c.synced = 0 AND c.embedding IS NOT NULL
          WHERE d.deleted_at IS NULL ${langFilter}
          GROUP BY d.id
          ORDER BY unsynced_paragraphs DESC
          LIMIT 50
        `, params)
      ]);
    }

    return {
      pendingEmbedding: pendingEmbedding || [],
      pendingSync: pendingSync || [],
      failures: failures || [],
      snapshot_generated_at: snapBottlenecks?.generated_at || null
    };
  });

  // =============================================
  // Library Changelog — ingestion run tracking
  // =============================================

  // Get recent document changes (uses docs updated_at + created_at)
  fastify.get('/library/changelog', { preHandler: requireTier('admin') }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit) || 50, 200);
    const offset = parseInt(request.query.offset) || 0;
    const days = parseInt(request.query.days) || 30;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const [changes, total] = await Promise.all([
      queryAll(`
        SELECT d.id, d.file_path, d.title, d.author, d.language, d.religion, d.collection,
          d.created_at, d.updated_at, d.deleted_at,
          (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) as paragraph_count,
          CASE
            WHEN d.deleted_at IS NOT NULL THEN 'deleted'
            WHEN d.created_at >= ? THEN 'created'
            WHEN d.updated_at > d.created_at THEN 'updated'
            ELSE 'unchanged'
          END as change_type
        FROM docs d
        WHERE d.updated_at >= ? OR d.created_at >= ? OR d.deleted_at >= ?
        ORDER BY COALESCE(d.deleted_at, d.updated_at) DESC
        LIMIT ? OFFSET ?
      `, [sinceStr, sinceStr, sinceStr, sinceStr, limit, offset]),
      queryOne(`
        SELECT COUNT(*) as count FROM docs d
        WHERE d.updated_at >= ? OR d.created_at >= ? OR d.deleted_at >= ?
      `, [sinceStr, sinceStr, sinceStr])
    ]);

    // Group by date for timeline view
    const byDate = {};
    for (const change of (changes || [])) {
      // BUCKET BY THE DATE THE CHANGE ACTUALLY HAPPENED, not by last touch. This keyed every row on
      // deleted_at||updated_at||created_at while change_type says 'created' for anything created inside the
      // window — so ANY later edit to a recently-created doc dragged it into today's bucket and it still
      // counted as "created". Relabelling 38 docs' language on 2026-08-14 moved 38 books from the 08-14
      // bucket to 08-15 and made the newest row read created=38 on a day when nothing was ingested. The
      // overnight watch reads exactly that number as "books are landing", so it was reporting arrivals that
      // never happened. Each change_type now buckets on its own timestamp (2026-08-15).
      const stamp = change.change_type === 'deleted' ? change.deleted_at
        : change.change_type === 'created' ? change.created_at
          : (change.updated_at || change.created_at);
      const date = String(stamp || '').slice(0, 10);
      if (!byDate[date]) byDate[date] = { date, created: 0, updated: 0, deleted: 0, items: [] };
      byDate[date][change.change_type]++;
      byDate[date].items.push(change);
    }

    return {
      changes: changes || [],
      byDate: Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)),
      total: total?.count || 0,
      limit,
      offset,
      days
    };
  });

  // Changelog summary stats
  fastify.get('/library/changelog/summary', { preHandler: requireTier('admin') }, async () => {
    const [today, week, month, byReligion] = await Promise.all([
      queryOne(`
        SELECT
          SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END) as created,
          SUM(CASE WHEN updated_at >= date('now') AND updated_at > created_at THEN 1 ELSE 0 END) as updated,
          SUM(CASE WHEN deleted_at >= date('now') THEN 1 ELSE 0 END) as deleted
        FROM docs
      `),
      queryOne(`
        SELECT
          SUM(CASE WHEN created_at >= date('now', '-7 days') THEN 1 ELSE 0 END) as created,
          SUM(CASE WHEN updated_at >= date('now', '-7 days') AND updated_at > created_at THEN 1 ELSE 0 END) as updated,
          SUM(CASE WHEN deleted_at >= date('now', '-7 days') THEN 1 ELSE 0 END) as deleted
        FROM docs
      `),
      queryOne(`
        SELECT
          SUM(CASE WHEN created_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as created,
          SUM(CASE WHEN updated_at >= date('now', '-30 days') AND updated_at > created_at THEN 1 ELSE 0 END) as updated,
          SUM(CASE WHEN deleted_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as deleted
        FROM docs
      `),
      queryAll(`
        SELECT religion,
          SUM(CASE WHEN created_at >= date('now', '-30 days') THEN 1 ELSE 0 END) as created,
          SUM(CASE WHEN updated_at >= date('now', '-30 days') AND updated_at > created_at THEN 1 ELSE 0 END) as updated
        FROM docs
        WHERE deleted_at IS NULL
        GROUP BY religion
        ORDER BY created DESC
      `)
    ]);

    return {
      today: today || { created: 0, updated: 0, deleted: 0 },
      week: week || { created: 0, updated: 0, deleted: 0 },
      month: month || { created: 0, updated: 0, deleted: 0 },
      byReligion: byReligion || []
    };
  });

  // =============================================
  // User Activity — search logs & engagement
  // =============================================

  // Search activity overview
  fastify.get('/activity/searches', { preHandler: requireTier('admin') }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit) || 50, 200);
    const offset = parseInt(request.query.offset) || 0;
    const days = parseInt(request.query.days) || 7;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const [searches, total, summary, topQueries, byDay] = await Promise.all([
      userQueryAll(`
        SELECT id, event_type, user_id, details, created_at
        FROM analytics
        WHERE event_type IN ('anonymous_search', 'search')
          AND created_at >= ?
          AND ${NOT_TEST_EVENT}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [sinceStr, limit, offset]),
      userQueryOne(`
        SELECT COUNT(*) as count FROM analytics
        WHERE event_type IN ('anonymous_search', 'search')
          AND created_at >= ?
          AND ${NOT_TEST_EVENT}
      `, [sinceStr]),
      userQueryOne(`
        SELECT
          COUNT(*) as total_searches,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics
        WHERE event_type IN ('anonymous_search', 'search')
          AND created_at >= ?
          AND ${NOT_TEST_EVENT}
      `, [sinceStr]),
      userQueryAll(`
        SELECT details, COUNT(*) as count
        FROM analytics
        WHERE event_type IN ('anonymous_search', 'search')
          AND created_at >= ?
          AND ${NOT_TEST_EVENT}
        GROUP BY details
        ORDER BY count DESC
        LIMIT 20
      `, [sinceStr]),
      userQueryAll(`
        SELECT DATE(created_at) as day, COUNT(*) as searches
        FROM analytics
        WHERE event_type IN ('anonymous_search', 'search')
          AND created_at >= ?
          AND ${NOT_TEST_EVENT}
        GROUP BY DATE(created_at)
        ORDER BY day DESC
      `, [sinceStr])
    ]);

    return {
      searches: searches || [],
      total: total?.count || 0,
      summary: summary || { total_searches: 0, unique_users: 0 },
      topQueries: topQueries || [],
      byDay: byDay || [],
      limit,
      offset,
      days
    };
  });

  // User engagement summary
  fastify.get('/activity/engagement', { preHandler: requireTier('admin') }, async () => {
    const [
      anonymousStats,
      registeredStats,
      conversionCount,
      recentAnonymous,
      activeSearchers
    ] = await Promise.all([
      userQueryOne(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN search_count > 0 THEN 1 ELSE 0 END) as searched,
          SUM(search_count) as total_searches,
          AVG(search_count) as avg_searches
        FROM anonymous_users
      `),
      userQueryOne(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN search_count > 0 THEN 1 ELSE 0 END) as searched,
          SUM(search_count) as total_searches,
          AVG(search_count) as avg_searches
        FROM users
        WHERE ${NOT_TEST_USER}
      `),
      userQueryOne(`
        SELECT COUNT(*) as count FROM anonymous_users WHERE converted_to_user_id IS NOT NULL
      `),
      userQueryAll(`
        SELECT id, search_count, last_search_query, first_seen_at, last_seen_at
        FROM anonymous_users
        WHERE search_count > 0
        ORDER BY last_seen_at DESC
        LIMIT 20
      `),
      userQueryAll(`
        SELECT id, email, name, tier, search_count, created_at
        FROM users
        WHERE search_count > 0 AND ${NOT_TEST_USER}
        ORDER BY search_count DESC
        LIMIT 20
      `)
    ]);

    return {
      anonymous: anonymousStats || { total: 0, searched: 0, total_searches: 0, avg_searches: 0 },
      registered: registeredStats || { total: 0, searched: 0, total_searches: 0, avg_searches: 0 },
      conversions: conversionCount?.count || 0,
      recentAnonymous: recentAnonymous || [],
      activeSearchers: activeSearchers || []
    };
  });

  // =============================================
  // SEO Analytics — Cloudflare traffic data
  // =============================================

  fastify.get('/seo/traffic', { preHandler: requireTier('admin') }, async (request) => {
    const days = parseInt(request.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = new Date().toISOString().slice(0, 10);

    const zoneId = '418ed936d83870f3e451ffa50bfade43';
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!apiToken) {
      return { error: 'CLOUDFLARE_API_TOKEN not configured', data: null };
    }

    const graphqlQuery = `{
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          httpRequests1dGroups(limit: ${days}, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}" }) {
            dimensions { date }
            sum {
              requests
              pageViews
              threats
              bytes
              cachedBytes
              cachedRequests
            }
            uniq { uniques }
          }
          httpRequestsAdaptiveGroups(limit: 20, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}" }) {
            dimensions { clientCountryName }
            count
          }
        }
      }
    }`;

    try {
      const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: graphqlQuery })
      });

      const result = await resp.json();
      const zone = result.data?.viewer?.zones?.[0];

      return {
        daily: zone?.httpRequests1dGroups || [],
        countries: zone?.httpRequestsAdaptiveGroups || [],
        days,
        since: sinceStr,
        until: untilStr
      };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Cloudflare analytics');
      return { error: err.message, data: null };
    }
  });

  // Top pages and referrers from Cloudflare
  fastify.get('/seo/pages', { preHandler: requireTier('admin') }, async (request) => {
    const days = parseInt(request.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = new Date().toISOString().slice(0, 10);

    const zoneId = '418ed936d83870f3e451ffa50bfade43';
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!apiToken) {
      return { error: 'CLOUDFLARE_API_TOKEN not configured', data: null };
    }

    const graphqlQuery = `{
      viewer {
        zones(filter: { zoneTag: "${zoneId}" }) {
          topPaths: httpRequestsAdaptiveGroups(limit: 30, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}" }, orderBy: [count_DESC]) {
            dimensions { clientRequestPath }
            count
          }
          topReferers: httpRequestsAdaptiveGroups(limit: 20, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}", clientRefererHost_neq: "siftersearch.com" }) {
            dimensions { clientRefererHost }
            count
          }
          topBrowsers: httpRequestsAdaptiveGroups(limit: 10, filter: { date_geq: "${sinceStr}", date_lt: "${untilStr}" }) {
            dimensions { userAgent }
            count
          }
        }
      }
    }`;

    try {
      const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: graphqlQuery })
      });

      const result = await resp.json();
      const zone = result.data?.viewer?.zones?.[0];

      return {
        topPages: zone?.topPaths || [],
        topReferrers: zone?.topReferers || [],
        topBrowsers: zone?.topBrowsers || [],
        days
      };
    } catch (err) {
      logger.error({ err }, 'Failed to fetch Cloudflare page analytics');
      return { error: err.message, data: null };
    }
  });

  // =============================================
  // API Key Management
  // =============================================

  fastify.get('/api-keys', { preHandler: requireTier('admin') }, async () => {
    const keys = await getAllApiKeys();
    return { keys: keys || [] };
  });

  fastify.post('/api-keys', { preHandler: requireTier('admin') }, async (request) => {
    const { userId, name, rateLimit, permissions } = request.body || {};
    if (!name) throw new ApiError('name is required', 400);
    const key = await createApiKey(userId || request.user?.id || 0, name, { rateLimit, permissions });
    return key;
  });

  fastify.delete('/api-keys/:id', { preHandler: requireTier('admin') }, async (request) => {
    const { id } = request.params;
    await revokeApiKey(id, 0); // Admin can revoke any key
    // Also try without user restriction
    await query('UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [id]).catch(() => {});
    return { success: true };
  });

  // =============================================
  // Search Log (from new search_log table)
  // =============================================

  fastify.get('/activity/search-log', { preHandler: requireTier('admin') }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit) || 50, 200);
    const offset = parseInt(request.query.offset) || 0;
    const days = parseInt(request.query.days) || 7;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const [logs, total, summary, topQueries, byDay] = await Promise.all([
      userQueryAll(`
        SELECT id, query, user_id, anonymous_user_id, api_key_id, result_count, duration_ms, search_type, created_at
        FROM search_log
        WHERE created_at >= ? AND ${NOT_TEST_EVENT}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [sinceStr, limit, offset]),
      userQueryOne(`SELECT COUNT(*) as count FROM search_log WHERE created_at >= ? AND ${NOT_TEST_EVENT}`, [sinceStr]),
      userQueryOne(`
        SELECT
          COUNT(*) as total_searches,
          COUNT(DISTINCT COALESCE(user_id, anonymous_user_id)) as unique_users,
          AVG(duration_ms) as avg_duration,
          AVG(result_count) as avg_results
        FROM search_log WHERE created_at >= ? AND ${NOT_TEST_EVENT}
      `, [sinceStr]),
      userQueryAll(`
        SELECT query, COUNT(*) as count, AVG(result_count) as avg_results
        FROM search_log
        WHERE created_at >= ? AND ${NOT_TEST_EVENT}
        GROUP BY query
        ORDER BY count DESC
        LIMIT 30
      `, [sinceStr]),
      userQueryAll(`
        SELECT DATE(created_at) as day,
          COUNT(*) as searches,
          COUNT(DISTINCT COALESCE(user_id, anonymous_user_id)) as unique_users
        FROM search_log
        WHERE created_at >= ? AND ${NOT_TEST_EVENT}
        GROUP BY DATE(created_at)
        ORDER BY day DESC
      `, [sinceStr])
    ]);

    return {
      logs: logs || [],
      total: total?.count || 0,
      summary: summary || {},
      topQueries: topQueries || [],
      byDay: byDay || [],
      limit, offset, days
    };
  });

  // ============================================
  // Pipeline Health Report
  // ============================================

  /**
   * GET /api/admin/pipeline/health
   * Returns a summary of what failed at each pipeline stage
   */
  fastify.get('/pipeline/health', { preHandler: requireInternal }, async () => {
    const total = await queryOne('SELECT COUNT(*) as c FROM content WHERE deleted_at IS NULL');
    const hasEmbed = await queryOne('SELECT COUNT(*) as c FROM content WHERE embedding IS NOT NULL AND deleted_at IS NULL');
    const unsynced = await queryOne('SELECT COUNT(*) as c FROM content WHERE synced = 0 AND deleted_at IS NULL');

    // Oversized paragraphs (too big for embedding)
    const oversized = await queryAll(`
      SELECT c.doc_id, d.title, d.religion, COUNT(*) as count, MAX(LENGTH(c.text)) as maxChars
      FROM content c JOIN docs d ON c.doc_id = d.id
      WHERE c.embedding IS NULL AND c.deleted_at IS NULL AND LENGTH(c.text) > 6000
      GROUP BY c.doc_id ORDER BY MAX(LENGTH(c.text)) DESC
    `);

    // Under 6K but still no embedding (should have been embedded)
    const missedEmbedding = await queryOne('SELECT COUNT(*) as c FROM content WHERE embedding IS NULL AND deleted_at IS NULL AND LENGTH(text) <= 6000 AND LENGTH(text) > 0');

    // Documents with 0 paragraphs
    const emptyDocs = await queryAll(`
      SELECT d.id, d.title, d.religion FROM docs d
      WHERE d.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.deleted_at IS NULL) = 0
    `);

    // Recent failed sync jobs
    const failedJobs = await queryAll(`
      SELECT id, job_type, error, failed_items, created_at FROM sync_jobs
      WHERE status = 'failed' ORDER BY id DESC LIMIT 10
    `);

    // Graph pipeline stats
    const graphExtracted   = await queryOne('SELECT COUNT(*) as c FROM content WHERE graph_enriched = 1 AND deleted_at IS NULL');
    const graphPending     = await queryOne('SELECT COUNT(*) as c FROM content WHERE graph_enriched = 0 AND deleted_at IS NULL AND length(text) > 50');
    const extractUnresolved = await queryOne('SELECT COUNT(*) as c FROM paragraph_extractions WHERE resolved = 0');
    const promotionPending = await queryOne('SELECT COUNT(*) as c FROM promotion_queue WHERE resolved = 0');
    const aliasCount       = await queryOne('SELECT COUNT(*) as c FROM entity_aliases');
    const entityCount      = await queryOne('SELECT COUNT(*) as c FROM graph_entities');

    return {
      summary: {
        totalParagraphs: total?.c || 0,
        embedded: hasEmbed?.c || 0,
        embeddedPercent: total?.c > 0 ? ((hasEmbed?.c / total?.c) * 100).toFixed(1) + '%' : '0%',
        unsyncedToMeilisearch: unsynced?.c || 0,
        oversizedParagraphs: oversized.reduce((s, r) => s + r.count, 0),
        missedEmbedding: missedEmbedding?.c || 0,
        emptyDocuments: emptyDocs.length
      },
      graph: {
        extracted: graphExtracted?.c || 0,
        pending: graphPending?.c || 0,
        extractionsUnresolved: extractUnresolved?.c || 0,
        promotionQueuePending: promotionPending?.c || 0,
        entityAliases: aliasCount?.c || 0,
        graphEntities: entityCount?.c || 0,
      },
      oversizedByDocument: oversized,
      emptyDocuments: emptyDocs,
      failedSyncJobs: failedJobs
    };
  });
}
