/* eslint-env node */
const os = require('os');
const path = require('path');

/**
 * PM2 Ecosystem Configuration for SifterSearch
 *
 * Single-writer architecture: only siftersearch-worker writes to SQLite.
 * API is read-only (reads + queues jobs). No watchdog needed (PM2 handles restarts).
 *
 * Start all services: pm2 start ecosystem.config.cjs --env production
 * View status: pm2 status
 * View logs: pm2 logs
 */

const PROJECT_ROOT = __dirname;

module.exports = {
  apps: [
    // SifterSearch API Server (read-only DB access)
    // Uses wait_ready for zero-downtime reloads: new process signals 'ready'
    // after full init, then PM2 kills the old one. Use `pm2 reload` not `restart`.
    {
      name: 'siftersearch-api',
      script: 'api/index.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      wait_ready: true,
      env: {
        NODE_ENV: 'production',
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY || ''
      },
      listen_timeout: 30000,
      kill_timeout: 5000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
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
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY || ''
      },
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
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
      max_restarts: 10,
      min_uptime: '60s',
      error_file: './logs/updater-error.log',
      out_file: './logs/updater-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Cloudflare Tunnel (routes api.siftersearch.com -> localhost:3000)
    {
      name: 'cloudflared-tunnel',
      script: 'cloudflared',
      args: 'tunnel --config ' + path.join(os.homedir(), '.cloudflared', 'config-siftersearch.yml') + ' run siftersearch-api',
      interpreter: 'none',
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      max_restarts: 50,
      min_uptime: '30s',
      error_file: './logs/tunnel-error.log',
      out_file: './logs/tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
