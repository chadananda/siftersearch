/**
 * Service Manager
 *
 * Manages external services (Meilisearch, etc.) that the API depends on.
 * Automatically starts services if not running.
 */

import { spawn } from 'child_process';
import { logger } from './logger.js';
import { config } from './config.js';

const SERVICES = {
  meilisearch: {
    name: 'Meilisearch',
    healthUrl: () => `${config.search.host}/health`,
    startCommand: 'meilisearch',
    startArgs: () => [
      '--db-path', './data/meilisearch',
      '--http-addr', new URL(config.search.host).host,
      '--no-analytics',
      ...(process.env.MEILI_MASTER_KEY ? ['--master-key', process.env.MEILI_MASTER_KEY] : [])
    ],
    healthCheck: async (url) => {
      const res = await fetch(url);
      const data = await res.json();
      return data.status === 'available';
    }
  }
};

// Track spawned processes for cleanup
const spawnedProcesses = new Map();

/**
 * Check if a service is healthy
 */
async function isServiceHealthy(serviceName) {
  const service = SERVICES[serviceName];
  if (!service) throw new Error(`Unknown service: ${serviceName}`);

  try {
    const url = service.healthUrl();
    return await service.healthCheck(url);
  } catch {
    return false;
  }
}

/**
 * Wait for a service to become healthy
 */
async function waitForService(serviceName, maxWaitMs = 30000) {
  const service = SERVICES[serviceName];
  const startTime = Date.now();
  const checkInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    if (await isServiceHealthy(serviceName)) {
      return true;
    }
    await new Promise(r => setTimeout(r, checkInterval));
  }

  throw new Error(`${service.name} failed to start within ${maxWaitMs / 1000}s`);
}

/**
 * Start a service if not already running
 */
async function ensureServiceRunning(serviceName) {
  const service = SERVICES[serviceName];
  if (!service) throw new Error(`Unknown service: ${serviceName}`);

  // Check if already running
  if (await isServiceHealthy(serviceName)) {
    logger.info({ service: service.name }, 'Service already running');
    return { started: false, alreadyRunning: true };
  }

  logger.info({ service: service.name }, 'Starting service...');

  // Start the service
  const args = service.startArgs();
  const proc = spawn(service.startCommand, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Log output for debugging
  proc.stdout?.on('data', (data) => {
    logger.debug({ service: service.name, stdout: data.toString().trim() }, 'Service output');
  });

  proc.stderr?.on('data', (data) => {
    const msg = data.toString().trim();
    // Meilisearch logs info to stderr, so check if it's actually an error
    if (msg.toLowerCase().includes('error')) {
      logger.error({ service: service.name, stderr: msg }, 'Service error');
    } else {
      logger.debug({ service: service.name, stderr: msg }, 'Service output');
    }
  });

  proc.on('error', (err) => {
    logger.error({ service: service.name, err }, 'Failed to start service');
  });

  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      logger.warn({ service: service.name, exitCode: code }, 'Service exited');
    }
    spawnedProcesses.delete(serviceName);
  });

  // Don't wait for the process (it's detached)
  proc.unref();
  spawnedProcesses.set(serviceName, proc);

  // Wait for it to be healthy
  await waitForService(serviceName);
  logger.info({ service: service.name, pid: proc.pid }, 'Service started');

  return { started: true, pid: proc.pid };
}

/**
 * Ensure all required services are running
 */
export async function ensureServicesRunning() {
  const results = {};

  for (const serviceName of Object.keys(SERVICES)) {
    try {
      results[serviceName] = await ensureServiceRunning(serviceName);
    } catch (err) {
      logger.error({ service: serviceName, err }, 'Failed to ensure service running');
      results[serviceName] = { error: err.message };
    }
  }

  return results;
}

/**
 * Get status of all services
 */
export async function getServicesStatus() {
  const status = {};

  for (const [name, service] of Object.entries(SERVICES)) {
    status[name] = {
      name: service.name,
      healthy: await isServiceHealthy(name),
      managed: spawnedProcesses.has(name),
      pid: spawnedProcesses.get(name)?.pid
    };
  }

  return status;
}

/**
 * Cleanup spawned processes on shutdown
 */
export function cleanupServices() {
  for (const [name, proc] of spawnedProcesses) {
    logger.info({ service: name, pid: proc.pid }, 'Stopping managed service');
    try {
      process.kill(-proc.pid); // Kill process group
    } catch {
      // Process may already be dead
    }
  }
  spawnedProcesses.clear();
}

export const services = {
  ensureServicesRunning,
  getServicesStatus,
  cleanupServices,
  isServiceHealthy
};

export default services;
