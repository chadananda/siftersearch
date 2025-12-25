#!/usr/bin/env node

/**
 * Deploy Hooks Runner
 *
 * Runs one-time commands during deployment. Each hook runs exactly once,
 * tracked in the database to prevent re-execution.
 *
 * Hooks are defined in deploy-hooks.json at project root.
 *
 * Usage:
 *   node scripts/deploy-hooks.js           # Run pending hooks
 *   node scripts/deploy-hooks.js --list    # List all hooks and status
 *   node scripts/deploy-hooks.js --reset   # Reset a hook to run again
 *
 * Hook file format (deploy-hooks.json):
 * [
 *   {
 *     "id": "2024-01-15-resegment-oversized",
 *     "description": "Re-segment oversized paragraphs after schema update",
 *     "command": "npm run resegment",
 *     "enabled": true
 *   }
 * ]
 */

import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Load env
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

// Import db module - wrap in try/catch for resilience
let query, queryAll;
try {
  const db = await import('../api/lib/db.js');
  query = db.query;
  queryAll = db.queryAll;
} catch (err) {
  console.error(`[${new Date().toISOString()}] ❌ Failed to connect to database: ${err.message}`);
  console.error('Deploy hooks skipped - database unavailable');
  process.exit(0); // Exit cleanly so deployment continues
}

const HOOKS_FILE = join(PROJECT_ROOT, 'deploy-hooks.json');

// CLI args
const args = process.argv.slice(2);
const listMode = args.includes('--list');
const resetMode = args.includes('--reset');
const resetHookId = resetMode ? args[args.indexOf('--reset') + 1] : null;
const VERBOSE = args.includes('--verbose') || args.includes('-v');

/**
 * Log with timestamp
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    skip: '⏭️'
  }[level] || '•';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

/**
 * Ensure deploy_hooks table exists
 */
async function ensureHooksTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS deploy_hooks (
      id TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL,
      output TEXT,
      success INTEGER DEFAULT 1
    )
  `);
}

/**
 * Get executed hooks from database
 */
async function getExecutedHooks() {
  try {
    const rows = await queryAll('SELECT id, executed_at, success FROM deploy_hooks');
    return new Map(rows.map(r => [r.id, r]));
  } catch {
    return new Map();
  }
}

/**
 * Load hooks from file
 */
function loadHooks() {
  if (!existsSync(HOOKS_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(HOOKS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    log('error', `Failed to parse ${HOOKS_FILE}: ${err.message}`);
    return [];
  }
}

/**
 * Run a single hook
 */
async function runHook(hook) {
  log('info', `Running: ${hook.description || hook.id}`);
  if (VERBOSE) {
    log('info', `  Command: ${hook.command}`);
  }

  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(hook.command, {
      cwd: PROJECT_ROOT,
      timeout: hook.timeout || 10 * 60 * 1000, // 10 minutes default
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');

    // Record success
    await query(`
      INSERT OR REPLACE INTO deploy_hooks (id, executed_at, output, success)
      VALUES (?, ?, ?, 1)
    `, [hook.id, new Date().toISOString(), output.slice(0, 10000)]);

    log('success', `Completed in ${duration}s: ${hook.id}`);
    return { success: true, output };

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const output = err.stdout + `\n\nERROR:\n${err.message}`;

    // Record failure
    await query(`
      INSERT OR REPLACE INTO deploy_hooks (id, executed_at, output, success)
      VALUES (?, ?, ?, 0)
    `, [hook.id, new Date().toISOString(), output.slice(0, 10000)]);

    log('error', `Failed after ${duration}s: ${hook.id}`);
    log('error', `  ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Reset a hook to allow re-execution
 */
async function resetHook(hookId) {
  await ensureHooksTable();

  const result = await query('DELETE FROM deploy_hooks WHERE id = ?', [hookId]);

  if (result.rowsAffected > 0) {
    log('success', `Reset hook: ${hookId}`);
    log('info', 'Hook will run again on next deployment');
  } else {
    log('warn', `Hook not found in database: ${hookId}`);
  }
}

/**
 * List all hooks and their status
 */
async function listHooks() {
  await ensureHooksTable();

  const hooks = loadHooks();
  const executed = await getExecutedHooks();

  console.log('');
  console.log('Deploy Hooks Status');
  console.log('='.repeat(60));

  if (hooks.length === 0) {
    console.log('No hooks defined in deploy-hooks.json');
    console.log('');
    return;
  }

  for (const hook of hooks) {
    const status = executed.get(hook.id);
    const enabled = hook.enabled !== false;

    let statusIcon, statusText;
    if (!enabled) {
      statusIcon = '⏸️';
      statusText = 'disabled';
    } else if (status) {
      statusIcon = status.success ? '✅' : '❌';
      statusText = status.success ? `executed ${status.executed_at}` : `failed ${status.executed_at}`;
    } else {
      statusIcon = '🔜';
      statusText = 'pending';
    }

    console.log(`${statusIcon} ${hook.id}`);
    console.log(`   ${hook.description || '(no description)'}`);
    console.log(`   Status: ${statusText}`);
    console.log(`   Command: ${hook.command}`);
    console.log('');
  }
}

/**
 * Run all pending hooks
 */
async function runPendingHooks() {
  await ensureHooksTable();

  const hooks = loadHooks();
  const executed = await getExecutedHooks();

  // Filter to pending enabled hooks
  const pending = hooks.filter(h =>
    h.enabled !== false && !executed.has(h.id)
  );

  if (pending.length === 0) {
    if (VERBOSE) {
      log('info', 'No pending deploy hooks');
    }
    return { total: 0, success: 0, failed: 0 };
  }

  log('info', `Found ${pending.length} pending hook(s)`);
  console.log('');

  let success = 0;
  let failed = 0;

  for (const hook of pending) {
    const result = await runHook(hook);
    if (result.success) {
      success++;
    } else {
      failed++;
      // Don't fail the whole deploy for hook failures - just log
    }
  }

  console.log('');
  log('info', `Hooks complete: ${success} success, ${failed} failed`);

  return { total: pending.length, success, failed };
}

/**
 * Main
 */
async function main() {
  console.log('');
  console.log('🚀 Deploy Hooks');
  console.log('='.repeat(40));

  if (listMode) {
    await listHooks();
    return;
  }

  if (resetMode) {
    if (!resetHookId) {
      log('error', 'Usage: --reset <hook-id>');
      process.exit(1);
    }
    await resetHook(resetHookId);
    return;
  }

  // Default: run pending hooks
  const result = await runPendingHooks();

  if (result.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  log('error', `Unexpected error: ${err.message}`);
  process.exit(1);
});
