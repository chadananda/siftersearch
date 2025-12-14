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

const execAsync = promisify(exec);

// Configuration
const API_HEALTH_URL = process.env.API_HEALTH_URL || 'http://localhost:3000/health';
const MEILI_HEALTH_URL = process.env.MEILI_HEALTH_URL || 'http://localhost:7700/health';
const TUNNEL_HEALTH_URL = process.env.TUNNEL_HEALTH_URL || 'https://api.siftersearch.com/health';
const CHECK_INTERVAL = parseInt(process.env.WATCHDOG_INTERVAL) || 30000; // 30 seconds
const MAX_FAILURES = parseInt(process.env.WATCHDOG_MAX_FAILURES) || 3;
const FETCH_TIMEOUT = parseInt(process.env.WATCHDOG_TIMEOUT) || 5000;
const TUNNEL_TIMEOUT = parseInt(process.env.WATCHDOG_TUNNEL_TIMEOUT) || 10000; // Longer timeout for external

// State
let apiFailures = 0;
let meiliFailures = 0;
let tunnelFailures = 0;
let isRestarting = false;

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

  // Check Meilisearch health
  const meiliHealth = await checkHealth(MEILI_HEALTH_URL);
  if (meiliHealth.healthy) {
    if (meiliFailures > 0) {
      log('info', `Meilisearch recovered after ${meiliFailures} failures`);
    }
    meiliFailures = 0;
  } else {
    meiliFailures++;
    log('warn', `Meilisearch health check failed (${meiliFailures}/${MAX_FAILURES}): ${meiliHealth.error || `status ${meiliHealth.status}`}`);

    if (meiliFailures >= MAX_FAILURES) {
      isRestarting = true;
      await restartProcess('meilisearch');
      meiliFailures = 0;
      // Wait for Meilisearch to come back up
      await new Promise(resolve => setTimeout(resolve, 15000));
      isRestarting = false;
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
}

/**
 * Startup
 */
log('info', '='.repeat(50));
log('info', 'SifterSearch Watchdog starting...');
log('info', `API Health URL: ${API_HEALTH_URL}`);
log('info', `Meilisearch Health URL: ${MEILI_HEALTH_URL}`);
log('info', `Tunnel Health URL: ${TUNNEL_HEALTH_URL}`);
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
