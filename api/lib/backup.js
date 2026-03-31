// :arch: SQLite backup via sqlite3 CLI — safe for live WAL databases
// :why: .backup command is the only method that produces a consistent snapshot with active WAL
// :rules: Never use db.js here — backup must be independent of the ORM/client layer

import { execSync } from 'child_process';
import { mkdirSync, readdirSync, unlinkSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// Resolve the actual filesystem path from "file:./data/sifter.db" or absolute paths
function resolveDbPath() {
  const url = config.db.url || 'file:./data/sifter.db';
  const filePath = url.startsWith('file:') ? url.slice(5) : url;
  return filePath.startsWith('/') ? filePath : join(PROJECT_ROOT, filePath);
}

const BACKUP_DIR = join(PROJECT_ROOT, 'data', 'backups');
const LAST_BACKUP_FILE = join(BACKUP_DIR, '.last-backup');

function ensureBackupDir() {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function readLastBackupTime() {
  if (!existsSync(LAST_BACKUP_FILE)) return null;
  try { return readFileSync(LAST_BACKUP_FILE, 'utf-8').trim(); } catch { return null; }
}

function writeLastBackupTime() {
  writeFileSync(LAST_BACKUP_FILE, new Date().toISOString(), 'utf-8');
}

function pruneOldBackups(retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  try {
    const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith('sifter-') && f.endsWith('.db'));
    for (const file of files) {
      // Parse date from filename sifter-YYYY-MM-DD.db
      const match = file.match(/^sifter-(\d{4}-\d{2}-\d{2})\.db$/);
      if (!match) continue;
      const fileDate = new Date(match[1]).getTime();
      if (fileDate < cutoff) {
        unlinkSync(join(BACKUP_DIR, file));
        pruned++;
        logger.info({ file }, 'Pruned old backup');
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to prune old backups');
  }
  return pruned;
}

function countLocalBackups() {
  if (!existsSync(BACKUP_DIR)) return 0;
  try {
    return readdirSync(BACKUP_DIR).filter(f => f.startsWith('sifter-') && f.endsWith('.db')).length;
  } catch { return 0; }
}

// Check sqlite3 CLI is available
function checkSqliteCli() {
  try { execSync('sqlite3 --version', { stdio: 'pipe' }); return true; } catch { return false; }
}

export async function runBackup() {
  ensureBackupDir();
  const dbPath = resolveDbPath();
  const backupFilename = `sifter-${todayDateString()}.db`;
  const backupPath = join(BACKUP_DIR, backupFilename);
  const nasTarget = config.backup?.nasTarget || '';
  const retentionDays = config.backup?.localRetentionDays ?? 7;
  if (!checkSqliteCli()) {
    const error = 'sqlite3 CLI not found — cannot run backup';
    logger.error(error);
    return { success: false, localPath: backupPath, remoteSynced: false, error };
  }
  // Run the backup
  try {
    logger.info({ dbPath, backupPath }, 'Starting SQLite backup');
    execSync(`sqlite3 "${dbPath}" ".backup ${backupPath}"`, { stdio: 'pipe' });
    logger.info({ backupPath }, 'SQLite backup complete');
  } catch (err) {
    const error = `sqlite3 backup failed: ${err.message}`;
    logger.error({ err: err.message }, 'SQLite backup failed');
    return { success: false, localPath: backupPath, remoteSynced: false, error };
  }
  writeLastBackupTime();
  // Rsync to NAS if configured
  let remoteSynced = false;
  if (nasTarget) {
    try {
      logger.info({ nasTarget, backupPath }, 'Syncing backup to NAS');
      execSync(`rsync -az "${backupPath}" "${nasTarget}"`, { stdio: 'pipe' });
      remoteSynced = true;
      logger.info({ nasTarget }, 'Backup synced to NAS');
    } catch (err) {
      logger.error({ err: err.message, nasTarget }, 'rsync to NAS failed — backup still local');
    }
  }
  // Prune old local backups
  pruneOldBackups(retentionDays);
  return { success: true, localPath: backupPath, remoteSynced };
}

export function getBackupStatus() {
  const lastBackupTime = readLastBackupTime();
  const localBackupCount = countLocalBackups();
  const nasTarget = config.backup?.nasTarget || null;
  let staleSince = null;
  if (lastBackupTime) {
    const hoursSince = (Date.now() - new Date(lastBackupTime).getTime()) / (1000 * 60 * 60);
    const intervalHours = config.backup?.intervalHours ?? 24;
    if (hoursSince > intervalHours) staleSince = Math.round(hoursSince);
  } else {
    staleSince = null; // Never backed up — caller can check lastBackupTime === null
  }
  return { lastBackupTime, localBackupCount, staleSince, nasTarget: nasTarget || null };
}

export function shouldRunBackup() {
  const lastBackupTime = readLastBackupTime();
  if (!lastBackupTime) return true;
  const intervalHours = config.backup?.intervalHours ?? 24;
  const hoursSince = (Date.now() - new Date(lastBackupTime).getTime()) / (1000 * 60 * 60);
  return hoursSince >= intervalHours;
}
