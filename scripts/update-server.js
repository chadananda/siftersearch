#!/usr/bin/env node
/**
 * SifterSearch Auto-Update Script
 *
 * Checks for updates from git remote and applies them automatically.
 * Designed to run via cron every 5 minutes.
 *
 * Workflow:
 * 1. Fetch latest from origin
 * 2. Check if local is behind
 * 3. Pull latest changes
 * 4. Install dependencies (npm ci)
 * 5. Run migrations
 * 6. Reload API server via PM2
 *
 * Usage:
 *   node scripts/update-server.js
 *
 * Cron example (every 5 minutes):
 *   STAR/5 * * * * cd /path/to/siftersearch && node scripts/update-server.js >> logs/update.log 2>&1
 *   (Replace STAR with asterisk)
 */

import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Configuration
const BRANCH = process.env.UPDATE_BRANCH || 'main';
const REMOTE = process.env.UPDATE_REMOTE || 'origin';
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const DAEMON_MODE = process.argv.includes('--daemon');
const CHECK_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 5 * 60 * 1000; // 5 minutes
const API_PORT = parseInt(process.env.API_PORT) || 7839;
let lastReloadedCommitHash = null; // Track which commit we last reloaded for

/**
 * Log with timestamp
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

/**
 * Run a command in the project directory
 */
async function run(command, options = {}) {
  const { silent = false, maxBuffer = 10 * 1024 * 1024 } = options; // 10MB default
  if (VERBOSE && !silent) {
    log('debug', `Running: ${command}`);
  }
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: PROJECT_ROOT, maxBuffer });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.trim() };
  }
}

/**
 * Check if critical dependencies are available
 * Returns true if node_modules needs repair
 */
async function checkDependencies() {
  // Check if node_modules exists and has critical packages
  const { existsSync } = await import('fs');
  const { join } = await import('path');

  const criticalPackages = ['dotenv', 'fastify'];  // Skip better-sqlite3 (ESM issue)

  for (const pkg of criticalPackages) {
    const pkgPath = join(process.cwd(), 'node_modules', pkg);
    if (!existsSync(pkgPath)) {
      log('warn', `Missing critical dependency: ${pkg}`);
      return true;  // needs repair
    }
  }
  return false;  // all good
}

/**
 * Repair node_modules by running npm install
 */
async function repairDependencies() {
  log('info', 'Repairing node_modules...');
  const npmResult = await run('npm install');
  if (!npmResult.success) {
    log('error', `Failed to repair dependencies: ${npmResult.error}`);
    return false;
  }
  log('info', 'Dependencies repaired successfully');
  return true;
}

/**
 * Check if PM2 is running code older than the latest git commit.
 * Uses commit hash comparison (not timestamps) to avoid reload loops.
 */
async function checkPm2NeedsReload() {
  // Get current HEAD commit hash
  const gitResult = await run('git rev-parse HEAD');
  if (!gitResult.success) {
    log('warn', 'Could not get git HEAD hash');
    return { needsReload: false };
  }
  const currentHash = gitResult.stdout.trim();

  // If we already reloaded for this exact commit, don't reload again
  if (lastReloadedCommitHash === currentHash) {
    return { needsReload: false };
  }

  // Check if PM2 API version matches package.json version
  const pm2Result = await run('pm2 jlist');
  if (!pm2Result.success) {
    log('warn', 'Could not check PM2 processes');
    return { needsReload: false };
  }

  try {
    const processes = JSON.parse(pm2Result.stdout);
    const apiProcess = processes.find(p => p.name === 'siftersearch-api');
    if (!apiProcess) {
      log('warn', 'API process not found in PM2');
      return { needsReload: false };
    }

    const pm2Version = apiProcess.pm2_env?.version;
    const pkgVersion = getCurrentVersion();

    if (pm2Version !== pkgVersion) {
      log('info', `PM2 version ${pm2Version} != package.json ${pkgVersion}, needs reload`);
      return { needsReload: true, commitHash: currentHash };
    }

    // Versions match — no reload needed. Remember this commit.
    lastReloadedCommitHash = currentHash;
    return { needsReload: false };
  } catch (err) {
    log('warn', `Failed to check PM2 state: ${err.message}`);
    return { needsReload: false };
  }
}

/**
 * Check if there are updates available
 */
async function checkForUpdates() {
  // Fetch latest from remote
  log('info', `Fetching from ${REMOTE}...`);
  const fetchResult = await run(`git fetch ${REMOTE} ${BRANCH}`);
  if (!fetchResult.success) {
    log('error', `Failed to fetch: ${fetchResult.error}`);
    return { hasUpdates: false, error: 'fetch failed' };
  }

  // Check if we're behind
  const statusResult = await run('git status -uno');
  if (!statusResult.success) {
    log('error', `Failed to check status: ${statusResult.error}`);
    return { hasUpdates: false, error: 'status failed' };
  }

  const isBehind = statusResult.stdout.includes('Your branch is behind') ||
                   statusResult.stdout.includes('have diverged');

  if (!isBehind) {
    if (VERBOSE) {
      log('info', 'Already up to date with git');
    }
    // Even if git is up to date, check if PM2 needs reload
    // (handles case where code was pulled but PM2 wasn't reloaded — e.g. updater self-restart)
    const pm2Check = await checkPm2NeedsReload();
    if (pm2Check.needsReload) {
      return { hasUpdates: false, needsPm2Reload: true, commitHash: pm2Check.commitHash };
    }
    return { hasUpdates: false };
  }

  // Get list of commits we're behind
  const logResult = await run(`git log HEAD..${REMOTE}/${BRANCH} --oneline`);
  const commits = logResult.stdout.split('\n').filter(Boolean);

  return { hasUpdates: true, commits };
}

const HEALTH_CHECK_PORT = 7899; // Temp port for pre-deploy health check
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_INTERVAL = 2000; // 2s between retries

/**
 * Hit a health endpoint and return true if it responds 200
 */
function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
}

/**
 * Pre-deploy smoke tests run against the test API instance.
 * Each test returns { name, pass, detail }. All must pass to proceed.
 */
async function runSmokeTests(port) {
  const base = `http://127.0.0.1:${port}`;
  const tests = [];

  // 1. Health endpoint responds
  const health = await httpGet(`${base}/api/search/health`);
  tests.push({ name: 'health', pass: health.ok, detail: health.body || 'no response' });

  // 2. Public API health
  const v1Health = await httpGet(`${base}/api/v1/health`);
  tests.push({ name: 'v1-health', pass: v1Health.ok, detail: v1Health.body || 'no response' });

  // 3. Library stats (verifies DB access + query works)
  const stats = await httpGet(`${base}/api/library/stats`);
  let statsOk = false;
  let statsDetail = 'no response';
  if (stats.ok) {
    try {
      const data = JSON.parse(stats.body);
      statsOk = data.totalDocuments > 0 && data.religions > 0;
      statsDetail = `${data.totalDocuments} docs, ${data.religions} religions`;
    } catch { statsDetail = 'invalid JSON'; }
  }
  tests.push({ name: 'library-stats', pass: statsOk, detail: statsDetail });

  // 4. Recent documents (verifies route registration + DB read)
  const recent = await httpGet(`${base}/api/library/recent?limit=1`);
  let recentOk = false;
  let recentDetail = 'no response';
  if (recent.ok) {
    try {
      const data = JSON.parse(recent.body);
      recentOk = Array.isArray(data.documents) && data.documents.length > 0;
      recentDetail = `${data.documents?.length || 0} docs returned`;
    } catch { recentDetail = 'invalid JSON'; }
  }
  tests.push({ name: 'recent-docs', pass: recentOk, detail: recentDetail });

  return tests;
}

/**
 * Start a test API instance, run smoke tests, return success/failure.
 * Kills the test instance before returning either way.
 */
async function verifyNewCode() {
  log('info', `Starting test API on port ${HEALTH_CHECK_PORT}...`);

  // Kill any orphan process from a previous failed test run
  try {
    execSync(`lsof -ti :${HEALTH_CHECK_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  } catch { /* no process on port */ }

  const child = spawn('node', ['api/index.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, API_PORT: String(HEALTH_CHECK_PORT), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  let testOutput = '';
  child.stdout.on('data', d => testOutput += d.toString());
  child.stderr.on('data', d => testOutput += d.toString());

  // Wait for the process to either exit early (crash) or pass health check
  const earlyExit = new Promise(resolve => {
    child.on('exit', (code) => resolve({ crashed: true, code }));
  });

  // Phase 1: Wait for the server to start responding
  let serverReady = false;
  for (let i = 0; i < HEALTH_CHECK_RETRIES; i++) {
    await new Promise(r => setTimeout(r, HEALTH_CHECK_INTERVAL));

    const raceResult = await Promise.race([
      earlyExit,
      httpGet(`http://127.0.0.1:${HEALTH_CHECK_PORT}/api/search/health`)
    ]);

    if (raceResult.crashed) {
      log('error', `Test API crashed during startup (exit code ${raceResult.code})`);
      log('error', `Test output: ${testOutput.slice(-500)}`);
      return false;
    }

    if (raceResult.ok) {
      log('info', `Server responding on attempt ${i + 1}`);
      serverReady = true;
      break;
    }

    log('info', `Waiting for server... attempt ${i + 1}/${HEALTH_CHECK_RETRIES}`);
  }

  if (!serverReady) {
    log('error', 'Test API failed to start after all retries');
    log('error', `Test output: ${testOutput.slice(-500)}`);
    child.kill('SIGTERM');
    return false;
  }

  // Phase 2: Run smoke tests against the live test instance
  log('info', 'Running pre-deploy smoke tests...');
  const results = await runSmokeTests(HEALTH_CHECK_PORT);
  const failed = results.filter(t => !t.pass);

  for (const t of results) {
    log(t.pass ? 'info' : 'error', `  ${t.pass ? '✓' : '✗'} ${t.name}: ${t.detail}`);
  }

  child.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 500));

  if (failed.length > 0) {
    log('error', `${failed.length}/${results.length} smoke tests failed — aborting deploy`);
    return false;
  }

  log('info', `All ${results.length} smoke tests passed`);
  return true;
}

/**
 * Swap a PM2 process using graceful reload for zero-downtime deploys.
 * For the API (wait_ready=true), PM2 starts the new process, waits for
 * process.send('ready'), then kills the old one — no gap in service.
 * Falls back to delete+start if reload fails.
 */
async function swapPm2Process(name) {
  // CRITICAL: `pm2 reload --update-env` only refreshes env vars — NOT
  // ecosystem.config.cjs settings like max_memory_restart, kill_timeout,
  // exp_backoff_restart_delay. Those changes are silently ignored on reload
  // and persist as stale process attributes until the process is fully
  // re-created. We hit this exact failure mode: max_memory_restart was
  // raised in the config from 100M → 1500M but PM2 kept enforcing 100M
  // because nobody had done a clean restart, causing every-30s SIGINT
  // loops on api/worker.
  //
  // Fix: use `pm2 startOrReload ecosystem.config.cjs --only <name>`, which
  // reads the canonical config file every time and applies all settings.
  // It's graceful (new process starts before old is killed) AND picks up
  // config changes.
  const result = await run(`pm2 startOrReload ecosystem.config.cjs --only ${name} --update-env`);
  if (result.success) {
    return true;
  }
  log('warn', `startOrReload failed for ${name}, falling back to delete+start`);
  await run(`pm2 delete ${name}`);
  const restart = await run(`pm2 start ecosystem.config.cjs --only ${name}`);
  if (!restart.success) {
    log('error', `Failed to start ${name}: ${restart.error}`);
    return false;
  }
  return true;
}

/**
 * Apply updates with zero-downtime deploy
 */
async function applyUpdates() {
  log('info', 'Pulling latest changes...');

  // Check for uncommitted changes
  const statusResult = await run('git status --porcelain');
  if (statusResult.stdout) {
    log('warn', 'Uncommitted changes detected, stashing...');
    const stashResult = await run('git stash');
    if (!stashResult.success) {
      log('error', `Failed to stash: ${stashResult.error}`);
      return false;
    }
  }

  // Pull latest
  const pullResult = await run(`git pull ${REMOTE} ${BRANCH}`);
  if (!pullResult.success) {
    log('error', `Failed to pull: ${pullResult.error}`);
    return false;
  }
  log('info', 'Pull successful');

  // Skip npm ci if package-lock.json didn't change
  const lockChanged = await run(`git diff HEAD~1 --name-only -- package-lock.json`);
  if (lockChanged.success && lockChanged.stdout.includes('package-lock.json')) {
    log('info', 'package-lock.json changed — installing dependencies...');
    const npmResult = await run('npm ci --omit=dev');
    if (!npmResult.success) {
      log('error', `Failed to install dependencies: ${npmResult.error}`);
      return false;
    }
    log('info', 'Dependencies installed');
  } else {
    log('info', 'package-lock.json unchanged — skipping npm ci');
  }

  // Run migrations
  log('info', 'Running migrations...');
  const migrateResult = await run('npm run migrate');
  if (!migrateResult.success) {
    log('warn', `Migration warning: ${migrateResult.stderr || migrateResult.error}`);
  } else {
    log('info', 'Migrations complete');
  }

  // Run deploy hooks
  log('info', 'Running deploy hooks...');
  const hooksResult = await run('node scripts/deploy-hooks.js');
  if (!hooksResult.success) {
    log('warn', `Deploy hooks warning: ${hooksResult.stderr || hooksResult.error}`);
  } else {
    if (hooksResult.stdout) {
      const lines = hooksResult.stdout.split('\n').slice(0, 10);
      for (const line of lines) log('info', `  ${line}`);
    }
    log('info', 'Deploy hooks complete');
  }

  // Pre-deploy verification: start test API on temp port, health check it
  log('info', 'Verifying new code before deploy...');
  const verified = await verifyNewCode();
  if (!verified) {
    log('error', 'New code failed verification — aborting deploy, old server stays running');
    return false;
  }
  log('info', 'Verification passed — swapping to new code');

  // Swap API first (user-facing), then background workers
  let failed = false;
  if (!await swapPm2Process('siftersearch-api')) failed = true;
  if (!await swapPm2Process('siftersearch-worker')) failed = true;
  if (!await swapPm2Process('siftersearch-deep-research')) failed = true;
  // Library-watcher and enrichment workers — restart after API/worker to
  // avoid SQLite write contention during the deploy window.
  await swapPm2Process('siftersearch-library-watcher');
  await swapPm2Process('siftersearch-enrichment');
  await swapPm2Process('siftersearch-enrichment-api');
  // Graph pipeline workers — crash-resistance fixes must propagate on deploy.
  await swapPm2Process('siftersearch-graph-extractor');
  await swapPm2Process('siftersearch-graph-validator');
  await swapPm2Process('siftersearch-graph-resolver');
  await swapPm2Process('siftersearch-graph-promoter');

  if (failed) {
    log('error', 'Some processes failed to start');
    return false;
  }

  // Post-deploy: verify the PM2-managed API is healthy
  log('info', 'Post-deploy health check...');
  await new Promise(r => setTimeout(r, 3000)); // Give PM2 process time to start
  const postCheck = await httpGet(`http://127.0.0.1:${API_PORT}/api/search/health`);
  if (!postCheck.ok) {
    log('warn', 'Post-deploy health check failed — API may still be starting');
  } else {
    log('info', 'Post-deploy health check passed');
  }

  log('info', 'All PM2 processes recreated');
  return true;
}

/**
 * Get current version from package.json
 */
function getCurrentVersion() {
  try {
    const pkgPath = join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/**
 * Reload PM2 only (no git pull needed)
 */
async function reloadPm2Only() {
  log('info', 'Verifying code before PM2 reload...');
  const verified = await verifyNewCode();
  if (!verified) {
    log('error', 'Code verification failed — keeping current processes');
    return false;
  }

  log('info', 'Verification passed — recreating PM2 processes...');
  if (!await swapPm2Process('siftersearch-api')) return false;
  if (!await swapPm2Process('siftersearch-worker')) return false;
  if (!await swapPm2Process('siftersearch-deep-research')) return false;
  log('info', 'All PM2 processes recreated');
  return true;
}

/**
 * Run a single update check
 */
async function runOnce() {
  const versionBefore = getCurrentVersion();

  // First, check if node_modules needs repair (critical packages missing)
  const needsRepair = await checkDependencies();
  if (needsRepair) {
    log('warn', 'Critical dependencies missing - repairing node_modules');
    const repaired = await repairDependencies();
    if (repaired) {
      // Reload PM2 after repair
      log('info', 'Reloading PM2 after dependency repair...');
      await swapPm2Process('siftersearch-api');
      await swapPm2Process('siftersearch-worker');
      await swapPm2Process('siftersearch-deep-research');
    } else {
      log('error', 'Failed to repair dependencies');
      return false;
    }
  }

  // Check for updates
  const updateCheck = await checkForUpdates();

  if (updateCheck.error) {
    log('error', `Update check failed: ${updateCheck.error}`);
    return false;
  }

  // Handle case where git is up to date but PM2 needs reload
  if (updateCheck.needsPm2Reload) {
    log('info', 'Git is up to date but PM2 needs reload');
    if (DRY_RUN) {
      log('info', 'DRY RUN - skipping PM2 reload');
      return true;
    }
    const success = await reloadPm2Only();
    if (success) {
      // Record commit hash so we don't reload again for the same commit
      lastReloadedCommitHash = updateCheck.commitHash || null;
      log('info', '='.repeat(50));
      log('info', `PM2 reloaded to v${versionBefore}`);
      log('info', '='.repeat(50));
    }
    return success;
  }

  if (!updateCheck.hasUpdates) {
    if (VERBOSE) log('info', 'No updates available');
    return true;
  }

  log('info', `Found ${updateCheck.commits.length} new commit(s):`);
  for (const commit of updateCheck.commits.slice(0, 5)) {
    log('info', `  - ${commit}`);
  }
  if (updateCheck.commits.length > 5) {
    log('info', `  ... and ${updateCheck.commits.length - 5} more`);
  }

  if (DRY_RUN) {
    log('info', 'DRY RUN - skipping actual update');
    return true;
  }

  // Apply updates
  const success = await applyUpdates();

  if (success) {
    const versionAfter = getCurrentVersion();
    log('info', '='.repeat(50));
    log('info', `Update complete! ${versionBefore} → ${versionAfter}`);
    log('info', '='.repeat(50));
  } else {
    log('error', 'Update failed');
  }

  return success;
}

/**
 * Main
 */
async function main() {
  const versionBefore = getCurrentVersion();
  log('info', '='.repeat(50));
  log('info', `SifterSearch Auto-Update (v${versionBefore})`);
  log('info', `Branch: ${BRANCH}, Remote: ${REMOTE}`);
  if (DRY_RUN) log('info', 'DRY RUN - no changes will be made');
  if (DAEMON_MODE) log('info', `DAEMON MODE - checking every ${CHECK_INTERVAL / 1000}s`);
  log('info', '='.repeat(50));

  if (DAEMON_MODE) {
    // Run continuously
    while (true) {
      await runOnce();
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }
  } else {
    // Run once and exit
    const success = await runOnce();
    process.exit(success ? 0 : 1);
  }
}

main().catch(err => {
  log('error', `Unexpected error: ${err.message}`);
  process.exit(1);
});
