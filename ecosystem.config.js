/**
 * PM2 Ecosystem Configuration for SifterSearch
 *
 * Start all services: pm2 start ecosystem.config.js --env production
 * View status: pm2 status
 * View logs: pm2 logs
 * Restart: pm2 restart all
 * Stop: pm2 stop all
 */

export default {
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
        DEV_MODE: 'false'
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

    // Meilisearch Search Engine
    {
      name: 'meilisearch',
      script: 'meilisearch',
      args: '--db-path ./data/meilisearch --http-addr 127.0.0.1:7700',
      interpreter: 'none',
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      env_production: {
        MEILI_ENV: 'production'
        // MEILI_MASTER_KEY is loaded from environment
      },
      // Restart policies
      exp_backoff_restart_delay: 100,
      max_restarts: 5,
      min_uptime: '30s',
      // Logging
      error_file: './logs/meilisearch-error.log',
      out_file: './logs/meilisearch-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
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
    {
      name: 'siftersearch-updater',
      script: 'scripts/update-server.js',
      instances: 1,
      cron_restart: '*/5 * * * *',  // Run every 5 minutes
      autorestart: false,  // Don't restart on exit - cron handles scheduling
      watch: false,
      // Logging
      error_file: './logs/updater-error.log',
      out_file: './logs/updater-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
