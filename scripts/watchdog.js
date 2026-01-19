#!/usr/bin/env node
/**
 * SifterSearch Health Watchdog
 *
 * Monitors all critical services and restarts them if unresponsive.
 * Runs as a separate PM2 process.
 *
 * Features:
 * - Pings /health endpoints every 30 seconds
 * - Restarts services after 3 consecutive failures
 * - Monitors: API, Meilisearch, and Cloudflare Tunnel
 * - Logs health status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

// Load environment files to get correct ports
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

const execAsync = promisify(exec);

// Get ports from environment (matching config.js defaults)
const API_PORT = process.env.API_PORT || '3000';
const MEILI_PORT = process.env.MEILI_PORT || '7700';

// Configuration - use ports from environment
const API_HEALTH_URL = process.env.API_HEALTH_URL || `http://localhost:${API_PORT}/health`;
const MEILI_HEALTH_URL = process.env.MEILI_HEALTH_URL || `http://localhost:${MEILI_PORT}/health`;
const TUNNEL_HEALTH_URL = process.env.TUNNEL_HEALTH_URL || 'https://api.siftersearch.com/health';
const CHECK_INTERVAL = parseInt(process.env.WATCHDOG_INTERVAL) || 30000; // 30 seconds
const MAX_FAILURES = parseInt(process.env.WATCHDOG_MAX_FAILURES) || 3;
const FETCH_TIMEOUT = parseInt(process.env.WATCHDOG_TIMEOUT) || 5000;
const TUNNEL_TIMEOUT = parseInt(process.env.WATCHDOG_TUNNEL_TIMEOUT) || 10000; // Longer timeout for external

// State
let apiFailures = 0;
let meiliFailures = 0;
let tunnelFailures = 0;
let libraryWatcherFailures = 0;
let jobsFailures = 0;
let isRestarting = false;

// PM2 processes to monitor (no health endpoint, check PM2 status)
const PM2_PROCESSES = [
  'siftersearch-library-watcher',
  'siftersearch-jobs'
];

/**
 * Log with timestamp
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

/**
 * Check health of a service
 */
async function checkHealth(url, timeout = FETCH_TIMEOUT) {
  const controller = new globalThis.AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { healthy: true };
    } else {
      return { healthy: false, status: response.status };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return { healthy: false, error: err.message };
  }
}

/**
 * Restart a PM2 process
 */
async function restartProcess(processName) {
  try {
    log('warn', `Restarting ${processName}...`);
    await execAsync(`pm2 restart ${processName}`);
    log('info', `${processName} restarted successfully`);
    return true;
  } catch (err) {
    log('error', `Failed to restart ${processName}: ${err.message}`);
    return false;
  }
}

/**
 * Check PM2 process status
 * Returns 'online', 'stopped', 'errored', 'waiting', or 'unknown'
 */
async function getPM2Status(processName) {
  try {
    const { stdout } = await execAsync(`pm2 jlist`);
    const processes = JSON.parse(stdout);
    const proc = processes.find(p => p.name === processName);
    if (!proc) {
      return 'unknown';
    }
    return proc.pm2_env?.status || 'unknown';
  } catch (err) {
    log('error', `Failed to get PM2 status for ${processName}: ${err.message}`);
    return 'unknown';
  }
}

/**
 * Monitor PM2 processes that don't have health endpoints
 */
async function checkPM2Processes() {
  for (const processName of PM2_PROCESSES) {
    const status = await getPM2Status(processName);

    if (status === 'online') {
      // Reset failure counter if we had previous failures
      if (processName.includes('library-watcher') && libraryWatcherFailures > 0) {
        log('info', `${processName} recovered after ${libraryWatcherFailures} failures`);
        libraryWatcherFailures = 0;
      }
      if (processName.includes('jobs') && jobsFailures > 0) {
        log('info', `${processName} recovered`);
        jobsFailures = 0;
      }
    } else if (status === 'stopped' || status === 'errored' || status === 'waiting restart') {
      // Process is down - restart it
      if (processName.includes('library-watcher')) {
        libraryWatcherFailures++;
        log('warn', `${processName} is ${status} (failure ${libraryWatcherFailures})`);
      } else if (processName.includes('jobs')) {
        jobsFailures++;
        log('warn', `${processName} is ${status}`);
      }

      // Immediately restart stopped/errored processes
      log('warn', `${processName} status is "${status}" - restarting...`);
      await restartProcess(processName);
      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Main health check loop
 */
async function runHealthCheck() {
  if (isRestarting) {
    log('debug', 'Skipping check - restart in progress');
    return;
  }

  // Check API health (local)
  const apiHealth = await checkHealth(API_HEALTH_URL);
  if (apiHealth.healthy) {
    if (apiFailures > 0) {
      log('info', `API recovered after ${apiFailures} failures`);
    }
    apiFailures = 0;
  } else {
    apiFailures++;
    log('warn', `API health check failed (${apiFailures}/${MAX_FAILURES}): ${apiHealth.error || `status ${apiHealth.status}`}`);

    if (apiFailures >= MAX_FAILURES) {
      isRestarting = true;
      await restartProcess('siftersearch-api');
      apiFailures = 0;
      // Wait for API to come back up
      await new Promise(resolve => setTimeout(resolve, 10000));
      isRestarting = false;
    }
  }

  // Check Meilisearch health (managed externally - systemd or manual)
  // Watchdog only monitors and logs - does not restart Meilisearch
  const meiliHealth = await checkHealth(MEILI_HEALTH_URL);
  if (meiliHealth.healthy) {
    if (meiliFailures > 0) {
      log('info', `Meilisearch recovered after ${meiliFailures} failures`);
    }
    meiliFailures = 0;
  } else {
    meiliFailures++;
    log('warn', `Meilisearch health check failed (${meiliFailures}): ${meiliHealth.error || `status ${meiliHealth.status}`}`);
    // Note: Meilisearch is managed externally (systemd) - watchdog does not restart it
    if (meiliFailures >= MAX_FAILURES) {
      log('error', `Meilisearch has been down for ${meiliFailures} consecutive checks! Please check systemd: sudo systemctl status meilisearch`);
    }
  }

  // Check Tunnel health (via public URL)
  // Only check if local API is healthy - otherwise tunnel check would also fail
  if (apiFailures === 0) {
    const tunnelHealth = await checkHealth(TUNNEL_HEALTH_URL, TUNNEL_TIMEOUT);
    if (tunnelHealth.healthy) {
      if (tunnelFailures > 0) {
        log('info', `Tunnel recovered after ${tunnelFailures} failures`);
      }
      tunnelFailures = 0;
    } else {
      tunnelFailures++;
      log('warn', `Tunnel health check failed (${tunnelFailures}/${MAX_FAILURES}): ${tunnelHealth.error || `status ${tunnelHealth.status}`}`);

      if (tunnelFailures >= MAX_FAILURES) {
        isRestarting = true;
        await restartProcess('cloudflared-tunnel');
        tunnelFailures = 0;
        // Wait for tunnel to reconnect
        await new Promise(resolve => setTimeout(resolve, 15000));
        isRestarting = false;
      }
    }
  }

  // Check PM2 process status for library-watcher, jobs, etc.
  // These don't have health endpoints but we can check their PM2 status
  await checkPM2Processes();
}

/**
 * Startup
 */
log('info', '='.repeat(50));
log('info', 'SifterSearch Watchdog starting...');
log('info', `API Health URL: ${API_HEALTH_URL}`);
log('info', `Meilisearch Health URL: ${MEILI_HEALTH_URL}`);
log('info', `Tunnel Health URL: ${TUNNEL_HEALTH_URL}`);
log('info', `PM2 Processes: ${PM2_PROCESSES.join(', ')}`);
log('info', `Check interval: ${CHECK_INTERVAL}ms`);
log('info', `Max failures before restart: ${MAX_FAILURES}`);
log('info', '='.repeat(50));

// Initial check after short delay
setTimeout(runHealthCheck, 5000);

// Regular checks
setInterval(runHealthCheck, CHECK_INTERVAL);

// Handle shutdown
process.on('SIGTERM', () => {
  log('info', 'Watchdog shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'Watchdog interrupted');
  process.exit(0);
});
