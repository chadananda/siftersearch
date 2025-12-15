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
 * Note: Meilisearch is managed externally (systemd or manual) - not by PM2.
 * This keeps PM2 focused on the Node.js app and avoids port confusion.
 */

module.exports = {
  apps: [
    // SifterSearch API Server
    {
      name: 'siftersearch-api',
      script: 'api/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        DEV_MODE: 'false',
        // Production uses port 7700 (dev uses 7701)
        MEILI_HOST: 'http://localhost:7700',
        API_PORT: '3000'
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

    // Auto-Updater (checks for git updates every 5 minutes)
    // Runs continuously with built-in interval, not cron
    {
      name: 'siftersearch-updater',
      script: 'scripts/update-server.js',
      args: '--daemon',
      instances: 1,
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
      // Logging
      error_file: './logs/updater-error.log',
      out_file: './logs/updater-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },

    // Library Watcher (indexes new/changed documents automatically)
    {
      name: 'siftersearch-library-watcher',
      script: 'scripts/index-library.js',
      args: '--watch',
      instances: 1,
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        DEV_MODE: 'false',
        // Production uses port 7700 (dev uses 7701)
        MEILI_HOST: 'http://localhost:7700'
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
