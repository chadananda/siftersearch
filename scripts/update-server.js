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
  const { silent = false } = options;
  if (VERBOSE && !silent) {
    log('debug', `Running: ${command}`);
  }
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: PROJECT_ROOT });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.trim() };
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
      log('info', 'Already up to date');
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

  // Reload API server
  log('info', 'Reloading API server...');
  const reloadResult = await run('pm2 reload siftersearch-api');
  if (!reloadResult.success) {
    log('error', `Failed to reload API: ${reloadResult.error}`);
    // Try restart as fallback
    log('info', 'Trying restart instead...');
    const restartResult = await run('pm2 restart siftersearch-api');
    if (!restartResult.success) {
      log('error', `Failed to restart API: ${restartResult.error}`);
      return false;
    }
  }
  log('info', 'API server reloaded');

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
 * Main
 */
async function main() {
  const versionBefore = getCurrentVersion();
  log('info', '='.repeat(50));
  log('info', `SifterSearch Auto-Update (v${versionBefore})`);
  log('info', `Branch: ${BRANCH}, Remote: ${REMOTE}`);
  if (DRY_RUN) log('info', 'DRY RUN - no changes will be made');
  log('info', '='.repeat(50));

  // Check for updates
  const updateCheck = await checkForUpdates();

  if (updateCheck.error) {
    log('error', `Update check failed: ${updateCheck.error}`);
    process.exit(1);
  }

  if (!updateCheck.hasUpdates) {
    log('info', 'No updates available');
    process.exit(0);
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
    process.exit(0);
  }

  // Apply updates
  const success = await applyUpdates();

  if (success) {
    const versionAfter = getCurrentVersion();
    log('info', '='.repeat(50));
    log('info', `Update complete! ${versionBefore} → ${versionAfter}`);
    log('info', '='.repeat(50));
    process.exit(0);
  } else {
    log('error', 'Update failed');
    process.exit(1);
  }
}

main().catch(err => {
  log('error', `Unexpected error: ${err.message}`);
  process.exit(1);
});
