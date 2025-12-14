#!/usr/bin/env node
/**
 * Development Server Orchestrator
 *
 * Starts all local services for development:
 * 1. Runs preflight check to validate environment
 * 2. Meilisearch (starts if not already running)
 * 3. API server (with hot reload)
 * 4. Astro dev server
 *
 * All services connect locally - no tunnel required.
 *
 * Usage:
 *   npm run dev             # Full preflight + start all services
 *   npm run dev -- --quick  # Skip preflight, just start services
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-public' });
dotenv.config({ path: '.env-secrets' });

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  runPreflight,
  checkUrl,
  commandExists,
  colors as c,
  INSTALL_INSTRUCTIONS,
  platform,
  isMac
} from './preflight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COLORS = {
  meili: '\x1b[33m', // yellow
  api: '\x1b[36m',   // cyan
  ui: '\x1b[35m',    // magenta
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
  reset: '\x1b[0m'
};

const MEILI_URL = 'http://127.0.0.1:7700';
const API_PORT = process.env.API_PORT || '3000';
const UI_PORT = process.env.APP_PORT || '4321';

const SKIP_PREFLIGHT = process.argv.includes('--quick') || process.argv.includes('-q');

let meiliProcess = null;
let apiProcess = null;
let uiProcess = null;

function log(level, msg) {
  const color = COLORS[level] || COLORS.reset;
  console.log(`${color}[${level.toUpperCase()}]${COLORS.reset} ${msg}`);
}

function prefixOutput(name, color, stream) {
  stream.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      console.log(`${color}[${name}]${COLORS.reset} ${line}`);
    });
  });
}

async function isMeilisearchRunning() {
  const result = await checkUrl(`${MEILI_URL}/health`, 2000);
  return result.ok;
}

async function startMeilisearch() {
  log('info', 'Checking Meilisearch...');

  if (await isMeilisearchRunning()) {
    log('info', 'Meilisearch already running');
    return null;
  }

  log('info', 'Starting Meilisearch...');

  // Check if meilisearch is installed
  if (!commandExists('meilisearch')) {
    log('error', 'Meilisearch not installed.');
    const inst = INSTALL_INSTRUCTIONS['meilisearch'];
    const cmd = inst[platform];
    if (cmd) {
      console.log(`\n  ${c.cyan}Install with:${c.reset}`);
      console.log(`  ${c.green}$ ${cmd}${c.reset}`);
      if (inst.note) {
        console.log(`  ${c.dim}${inst.note}${c.reset}`);
      }
    }
    process.exit(1);
  }

  const meiliKey = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY;
  const args = [
    '--db-path', join(ROOT, 'data/meilisearch'),
    '--http-addr', '127.0.0.1:7700'
  ];

  if (meiliKey) {
    args.push('--master-key', meiliKey);
  }

  meiliProcess = spawn('meilisearch', args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  prefixOutput('MEILI', COLORS.meili, meiliProcess.stdout);
  prefixOutput('MEILI', COLORS.meili, meiliProcess.stderr);

  // Wait for Meilisearch to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await isMeilisearchRunning()) {
      log('info', 'Meilisearch ready');
      return meiliProcess;
    }
  }

  log('error', 'Meilisearch failed to start');
  process.exit(1);
}

async function runMigrations() {
  log('info', 'Running database migrations...');

  return new Promise((resolve, reject) => {
    const migrate = spawn('node', ['scripts/migrate.js'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env }
    });

    migrate.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Migration failed with code ${code}`));
    });
  });
}

function startAPI() {
  log('info', `Starting API server on port ${API_PORT}...`);

  apiProcess = spawn('node', ['--watch', 'api/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: API_PORT,
      NODE_ENV: 'development',
      DEV_MODE: 'true'
    }
  });

  prefixOutput('API', COLORS.api, apiProcess.stdout);
  prefixOutput('API', COLORS.api, apiProcess.stderr);

  apiProcess.on('error', (err) => log('error', `API error: ${err.message}`));
  apiProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log('error', `API exited with code ${code}`);
    }
  });

  return apiProcess;
}

function startUI() {
  log('info', `Starting Astro dev server on port ${UI_PORT}...`);

  // Force local API URL for development
  uiProcess = spawn('npx', ['astro', 'dev', '--port', UI_PORT], {
    cwd: ROOT,
    env: {
      ...process.env,
      PUBLIC_API_URL: `http://localhost:${API_PORT}`
    }
  });

  prefixOutput('UI', COLORS.ui, uiProcess.stdout);
  prefixOutput('UI', COLORS.ui, uiProcess.stderr);

  uiProcess.on('error', (err) => log('error', `UI error: ${err.message}`));
  uiProcess.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log('error', `UI exited with code ${code}`);
    }
  });

  return uiProcess;
}

function cleanup() {
  console.log('\n');
  log('info', 'Shutting down...');

  if (uiProcess) uiProcess.kill();
  if (apiProcess) apiProcess.kill();
  if (meiliProcess) {
    log('info', 'Stopping Meilisearch (started by dev script)');
    meiliProcess.kill();
  }

  process.exit(0);
}

async function main() {
  const platformName = isMac ? 'macOS' : 'Linux';

  console.log(`
${COLORS.info}════════════════════════════════════════════════════════════════${COLORS.reset}
${COLORS.info}              SifterSearch Development Environment${COLORS.reset}
${COLORS.info}════════════════════════════════════════════════════════════════${COLORS.reset}

  Platform:    ${platformName}
  Meilisearch: ${MEILI_URL}
  API Server:  http://localhost:${API_PORT}
  Web UI:      http://localhost:${UI_PORT}

  All services running locally - no tunnel required.
`);

  // Handle cleanup on exit
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Run preflight check (unless --quick flag)
  if (!SKIP_PREFLIGHT) {
    log('info', 'Running preflight check...\n');
    const { success } = await runPreflight({ exitOnFail: true });
    if (!success) {
      process.exit(1);
    }
    console.log(''); // Add spacing after preflight
  } else {
    log('info', 'Skipping preflight check (--quick mode)\n');
  }

  // Start services in order
  await startMeilisearch();
  await runMigrations();
  startAPI();

  // Give API a moment to start before UI
  await new Promise(r => setTimeout(r, 1000));
  startUI();

  log('info', `\nDevelopment servers ready! Open http://localhost:${UI_PORT}\n`);
}

main().catch((err) => {
  log('error', err.message);
  cleanup();
});
