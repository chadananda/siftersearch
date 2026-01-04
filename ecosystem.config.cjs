/* eslint-env node */
const os = require('os');
const path = require('path');

/**
 * PM2 Ecosystem Configuration for SifterSearch
 *
 * Start all services: pm2 start ecosystem.config.cjs --env production
 * View status: pm2 status
 * View logs: pm2 logs
 * Restart: pm2 restart all
 * Stop: pm2 stop all
 *
 * Auto-updates: Client sends X-Client-Version header with every request.
 * Server triggers update-server.js when client version is newer.
 * Works even when deploying from the same machine (checks PM2 version).
 *
 * Note: Meilisearch is managed by the API (starts on demand), not by PM2.
 */

// Get the directory where this config file lives
const PROJECT_ROOT = __dirname;

module.exports = {
  apps: [
    // SifterSearch API Server
    {
      name: 'siftersearch-api',
      script: 'api/index.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      // Production is the default in config.js (DEV_MODE defaults to false)
      // Dev uses npm run dev which sets DEV_MODE=true
      env: {
        NODE_ENV: 'production'
      },
      // Health check - restart if unresponsive
      listen_timeout: 10000,
      kill_timeout: 5000,
      // Restart policies
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },

    // Health Watchdog
    {
      name: 'siftersearch-watchdog',
      script: 'scripts/watchdog.js',
      cwd: PROJECT_ROOT,
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 1000,
      max_restarts: 3,
      min_uptime: '60s',
      // Logging
      error_file: './logs/watchdog-error.log',
      out_file: './logs/watchdog-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Library Watcher (indexes new/changed documents automatically)
    {
      name: 'siftersearch-library-watcher',
      script: 'scripts/index-library.js',
      cwd: PROJECT_ROOT,
      args: '--watch',
      instances: 1,
      autorestart: true,
      watch: false,
      // Production is the default in config.js (DEV_MODE defaults to false)
      env: {
        NODE_ENV: 'production'
      },
      // Restart policies
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
      // Logging
      error_file: './logs/library-watcher-error.log',
      out_file: './logs/library-watcher-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Job Processor (handles translation, audio generation, etc.)
    // 2 instances for redundancy - if one crashes, the other continues
    // Stuck job recovery ensures jobs resume from checkpoint
    {
      name: 'siftersearch-jobs',
      script: 'api/workers/job-processor.js',
      cwd: PROJECT_ROOT,
      instances: 2,
      exec_mode: 'fork',  // Each instance runs independently
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        JOB_POLL_INTERVAL: '5000',  // 5 seconds
        MAX_CONCURRENT_JOBS: '1'    // 1 job per instance (2 total with 2 instances)
      },
      // Restart policies
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
      // Logging
      error_file: './logs/jobs-error.log',
      out_file: './logs/jobs-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Auto-updater daemon (polls git every 5 minutes)
    {
      name: 'siftersearch-updater',
      script: 'scripts/update-server.js',
      cwd: PROJECT_ROOT,
      args: '--daemon',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        UPDATE_INTERVAL: '300000'  // 5 minutes
      },
      // Restart policies
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '60s',
      // Logging
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
      // Restart policies - tunnel should always be up
      exp_backoff_restart_delay: 1000,
      max_restarts: 50,  // Many retries - tunnel is critical
      min_uptime: '30s',
      // Logging
      error_file: './logs/tunnel-error.log',
      out_file: './logs/tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
