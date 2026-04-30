/* eslint-env node */
const os = require('os');
const path = require('path');

/**
 * PM2 Ecosystem Configuration for SifterSearch
 *
 * Design principles:
 * - NEVER stop trying to restart. max_restarts: -1 (unlimited)
 * - NO wait_ready — it causes death spirals when startup is slow
 * - Exponential backoff prevents CPU thrashing on persistent failures
 * - Single-writer: only siftersearch-worker writes to SQLite
 */

const PROJECT_ROOT = __dirname;

module.exports = {
  apps: [
    // SifterSearch API Server (read-only DB access)
    {
      name: 'siftersearch-api',
      script: 'api/index.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      // 188GB RAM box — be generous. The previous 500M (and stale 100M
      // PM2 runtime) caused 30-second restart loops during normal search
      // load: any reranking + KV cache spike pushed past the limit and
      // PM2 killed the process mid-request.
      max_memory_restart: '1500M',
      // NO wait_ready — it caused death spirals when Meilisearch was slow
      wait_ready: false,
      env: {
        NODE_ENV: 'production',
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY || ''
      },
      // 30s gives Fastify time to drain in-flight chat SSE streams
      // (typically 5-15s each) before SIGKILL on deploy. 5s was too short —
      // any active chat got 503'd during reloads.
      kill_timeout: 30000,
      exp_backoff_restart_delay: 1000, // 1s, 2s, 4s, ... up to 15s
      max_restarts: 999999,   // effectively unlimited
      min_uptime: '10s',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },

    // Unified Worker (single writer — sync + jobs + indexing)
    {
      name: 'siftersearch-worker',
      script: 'api/workers/unified-worker.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Worker batches LLM calls + holds embedding payloads in memory.
      // Same reasoning as the API: be generous on a 188GB box.
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY || ''
      },
      // 30s for HyPE sidecar batches (which include OpenAI embedding calls
      // ~10-20s wall) to complete before SIGKILL. Default 1.6s would cut
      // mid-batch and waste the embedding work.
      kill_timeout: 30000,
      exp_backoff_restart_delay: 2000, // 2s, 4s, 8s, ... up to 15s
      max_restarts: 999999,   // effectively unlimited
      min_uptime: '10s',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Auto-updater daemon (polls git every 5 minutes)
    {
      name: 'siftersearch-updater',
      script: 'scripts/update-server.js',
      cwd: PROJECT_ROOT,
      args: '--daemon',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production',
        UPDATE_INTERVAL: '300000'
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 999999,   // effectively unlimited
      min_uptime: '60s',
      error_file: './logs/updater-error.log',
      out_file: './logs/updater-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Cloudflare Tunnel (routes api.siftersearch.com -> localhost:7839)
    {
      name: 'cloudflared-tunnel',
      script: 'cloudflared',
      args: 'tunnel --config ' + path.join(os.homedir(), '.cloudflared', 'config-siftersearch.yml') + ' run siftersearch-api',
      interpreter: 'none',
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      max_restarts: 999999,   // effectively unlimited
      min_uptime: '30s',
      error_file: './logs/tunnel-error.log',
      out_file: './logs/tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Library Watcher — Dropbox → SQLite ingest → Meili base index.
    // Entry point of the autonomous content pipeline. New files dropped into
    // the library are detected, parsed, segmented, and written to SQLite +
    // base Meili index. Once ingested, paragraphs sit with context=NULL +
    // hyp_questions=NULL, which is exactly what siftersearch-enrichment
    // looks for next.
    {
      name: 'siftersearch-library-watcher',
      script: 'scripts/index-library.js',
      args: '--watch',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production',
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY || ''
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 999999,
      min_uptime: '60s',
      error_file: './logs/library-watcher-error.log',
      out_file: './logs/library-watcher-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Enrichment — disambiguation + HyPE generation against local vLLM on
    // boss. Iterates ALL paragraphs that still have context=NULL or
    // hyp_questions=NULL, in priority order (highest authority first).
    // Idempotent + resumable — every run scans from the start of the queue
    // and only calls the LLM for paragraphs still NULL, so a crash + restart
    // never re-does work. As paragraphs gain hyp_questions, the worker's
    // syncHypeBatch loop picks them up within 60s and pushes to the HyPE
    // sidecar Meili index — no manual intervention.
    //
    // No --religion flag: the script's priority order naturally puts the
    // Bahá'í corpus first (highest authority), so it finishes that, then
    // moves to other religions automatically. User adds new content to
    // Dropbox; library-watcher ingests it; enrichment finds the new
    // null rows and processes them in queue.
    //
    // NOT touched by the auto-updater's swap path (which only swaps api
    // and worker — see swapPm2Process calls in scripts/update-server.js).
    {
      name: 'siftersearch-enrichment',
      script: 'scripts/run-enrichment.js',
      args: '--resume',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production'
      },
      exp_backoff_restart_delay: 10000, // 10s, 20s, 40s — gentle on boss vLLM
      max_restarts: 999999,
      min_uptime: '60s',
      error_file: './logs/enrichment-error.log',
      out_file: './logs/enrichment-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // Sonnet API enrichment for tier 1-7 (Bahá'í primary doctrinal works).
    // Uses Anthropic Messages Batches API to generate per-paragraph
    // doctrinal thesis + 5 hypothetical questions. Runs in parallel with
    // siftersearch-enrichment (which now skips tier 1-7 docs and handles
    // tier 8-9 via local Qwen3). When new Shoghi Effendi / 'Abdu'l-Bahá /
    // Bahá'u'lláh / Báb / etc. documents are added, paragraphs auto-route
    // here based on doc-tier.js classification.
    {
      name: 'siftersearch-enrichment-api',
      script: 'scripts/run-enrichment-api.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production'
      },
      exp_backoff_restart_delay: 30000,  // 30s, 60s, 120s — Anthropic 429s benefit from longer backoff
      max_restarts: 999999,
      min_uptime: '60s',
      error_file: './logs/enrichment-api-error.log',
      out_file: './logs/enrichment-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
