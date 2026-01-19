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

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
  // Try to resolve critical packages that must exist
  const criticalPackages = ['dotenv', 'fastify', 'better-sqlite3'];

  for (const pkg of criticalPackages) {
    const checkResult = await run(`node -e "require.resolve('${pkg}')"`, { silent: true });
    if (!checkResult.success) {
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
 * Check if PM2 is running the correct version
 */
async function checkPm2Version() {
  const pkgVersion = getCurrentVersion();
  const pm2Result = await run('pm2 jlist');
  if (!pm2Result.success) {
    log('warn', 'Could not check PM2 version');
    return { needsReload: false };
  }

  try {
    const processes = JSON.parse(pm2Result.stdout);
    const apiProcess = processes.find(p => p.name === 'siftersearch-api');
    if (!apiProcess) {
      log('warn', 'API process not found in PM2');
      return { needsReload: false };
    }

    const runningVersion = apiProcess.pm2_env?.version || 'unknown';
    if (runningVersion !== pkgVersion) {
      log('info', `PM2 running v${runningVersion}, package.json is v${pkgVersion}`);
      return { needsReload: true, runningVersion, pkgVersion };
    }

    return { needsReload: false };
  } catch (err) {
    log('warn', `Failed to parse PM2 output: ${err.message}`);
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
    // (handles case where git commit happened locally but PM2 wasn't reloaded)
    const pm2Check = await checkPm2Version();
    if (pm2Check.needsReload) {
      return { hasUpdates: false, needsPm2Reload: true };
    }
    return { hasUpdates: false };
  }

  // Get list of commits we're behind
  const logResult = await run(`git log HEAD..${REMOTE}/${BRANCH} --oneline`);
  const commits = logResult.stdout.split('\n').filter(Boolean);

  return { hasUpdates: true, commits };
}

/**
 * Apply updates
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

  // Install dependencies
  log('info', 'Installing dependencies...');
  const npmResult = await run('npm ci --omit=dev');
  if (!npmResult.success) {
    log('error', `Failed to install dependencies: ${npmResult.error}`);
    return false;
  }
  log('info', 'Dependencies installed');

  // Run migrations
  log('info', 'Running migrations...');
  const migrateResult = await run('npm run migrate');
  if (!migrateResult.success) {
    log('warn', `Migration warning: ${migrateResult.stderr || migrateResult.error}`);
    // Don't fail on migration warnings - they might just be "nothing to migrate"
  } else {
    log('info', 'Migrations complete');
  }

  // Run deploy hooks (one-time commands defined in deploy-hooks.json)
  log('info', 'Running deploy hooks...');
  const hooksResult = await run('node scripts/deploy-hooks.js');
  if (!hooksResult.success) {
    log('warn', `Deploy hooks warning: ${hooksResult.stderr || hooksResult.error}`);
    // Don't fail deployment for hook failures - they're logged in the database
  } else {
    if (hooksResult.stdout) {
      // Show hook output
      const lines = hooksResult.stdout.split('\n').slice(0, 10);
      for (const line of lines) {
        log('info', `  ${line}`);
      }
    }
    log('info', 'Deploy hooks complete');
  }

  // Reload all PM2 processes from ecosystem config
  // --update-env picks up any changes to env variables in the ecosystem file
  log('info', 'Reloading PM2 ecosystem...');
  const reloadResult = await run('pm2 reload ecosystem.config.cjs --update-env');
  if (!reloadResult.success) {
    log('warn', `PM2 reload warning: ${reloadResult.error}`);
    // Try startOrReload as fallback (handles new processes)
    log('info', 'Trying startOrReload instead...');
    const startResult = await run('pm2 startOrReload ecosystem.config.cjs --update-env');
    if (!startResult.success) {
      log('error', `Failed to reload PM2: ${startResult.error}`);
      return false;
    }
  }
  log('info', 'PM2 ecosystem reloaded');

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
  log('info', 'Reloading PM2 ecosystem (code already up to date)...');
  const reloadResult = await run('pm2 reload ecosystem.config.cjs --update-env');
  if (!reloadResult.success) {
    log('warn', `PM2 reload warning: ${reloadResult.error}`);
    const startResult = await run('pm2 startOrReload ecosystem.config.cjs --update-env');
    if (!startResult.success) {
      log('error', `Failed to reload PM2: ${startResult.error}`);
      return false;
    }
  }
  log('info', 'PM2 ecosystem reloaded');
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
      await run('pm2 reload ecosystem.config.cjs --update-env');
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
