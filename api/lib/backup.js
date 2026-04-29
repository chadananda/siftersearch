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

// Configurable backup directory. Defaults to ./data/backups but on machines
// with a dedicated bulk-storage volume (e.g. tower-nas /tank), set BACKUP_DIR
// in the env so daily 21GB SQLite snapshots don't fill the OS root partition.
const BACKUP_DIR = process.env.BACKUP_DIR
  ? (process.env.BACKUP_DIR.startsWith('/')
      ? process.env.BACKUP_DIR
      : join(PROJECT_ROOT, process.env.BACKUP_DIR))
  : join(PROJECT_ROOT, 'data', 'backups');
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

// ──────────────────────────────────────────────────────────────────────
// Meilisearch + embedding-cache backups (called alongside SQLite backup)
//
// On tower-nas, the live indexes live on the NVMe pool (/fast). If that
// pool fails, we want a same-day file-level copy on the bulk pool (/tank).
// Strategy: incremental rsync — fast + storage-efficient since most of
// the LMDB pages don't change between days.
// ──────────────────────────────────────────────────────────────────────

const MEILI_SRC = process.env.MEILI_DB_PATH || '/fast/meilisearch-data';
const EMBED_CACHE_SRC = join(PROJECT_ROOT, 'data', 'embedding_cache.db');

async function runMeiliBackup() {
  if (!existsSync(MEILI_SRC)) {
    return { component: 'meilisearch', skipped: 'src missing', src: MEILI_SRC };
  }
  const dest = join(BACKUP_DIR, 'meilisearch');
  try {
    mkdirSync(dest, { recursive: true });
    logger.info({ src: MEILI_SRC, dest }, 'Starting Meilisearch rsync backup');
    const t0 = Date.now();
    // -aH preserves perms/links/hardlinks; --delete keeps backup in sync
    // (drops files removed from source). Quiet stderr, capture stdout for diag.
    execSync(`rsync -aH --delete "${MEILI_SRC}/" "${dest}/"`,
      { stdio: ['ignore', 'pipe', 'pipe'] });
    const elapsedMs = Date.now() - t0;
    let sizeBytes = 0;
    try {
      sizeBytes = parseInt(execSync(`du -sb "${dest}" | cut -f1`).toString().trim(), 10) || 0;
    } catch { /* size optional */ }
    logger.info({ dest, elapsedMs, sizeBytes }, 'Meilisearch backup complete');
    return { component: 'meilisearch', success: true, dest, elapsedMs, sizeBytes };
  } catch (err) {
    logger.error({ err: err.message, src: MEILI_SRC, dest }, 'Meilisearch backup failed');
    return { component: 'meilisearch', success: false, error: err.message };
  }
}

async function runEmbeddingCacheBackup() {
  if (!existsSync(EMBED_CACHE_SRC)) {
    return { component: 'embedding_cache', skipped: 'src missing' };
  }
  const dest = join(BACKUP_DIR, `embedding_cache-${todayDateString()}.db`);
  try {
    logger.info({ src: EMBED_CACHE_SRC, dest }, 'Starting embedding cache backup');
    // Use sqlite3 .backup (cache db is also WAL-mode SQLite)
    execSync(`sqlite3 "${EMBED_CACHE_SRC}" ".backup ${dest}"`, { stdio: 'pipe' });
    logger.info({ dest }, 'Embedding cache backup complete');
    return { component: 'embedding_cache', success: true, dest };
  } catch (err) {
    logger.error({ err: err.message }, 'Embedding cache backup failed');
    return { component: 'embedding_cache', success: false, error: err.message };
  }
}

function pruneOldEmbeddingCacheBackups(retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let pruned = 0;
  try {
    const files = readdirSync(BACKUP_DIR).filter(f => /^embedding_cache-\d{4}-\d{2}-\d{2}\.db$/.test(f));
    for (const file of files) {
      const m = file.match(/^embedding_cache-(\d{4}-\d{2}-\d{2})\.db$/);
      if (!m) continue;
      if (new Date(m[1]).getTime() < cutoff) {
        unlinkSync(join(BACKUP_DIR, file));
        pruned++;
      }
    }
  } catch { /* prune is best-effort */ }
  return pruned;
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

  // ── 1. SQLite content DB ────────────────────────────────────────
  const components = [];
  try {
    logger.info({ dbPath, backupPath }, 'Starting SQLite backup');
    execSync(`sqlite3 "${dbPath}" ".backup ${backupPath}"`, { stdio: 'pipe' });
    logger.info({ backupPath }, 'SQLite backup complete');
    components.push({ component: 'sqlite_content', success: true, dest: backupPath });
  } catch (err) {
    const error = `sqlite3 backup failed: ${err.message}`;
    logger.error({ err: err.message }, 'SQLite backup failed');
    return { success: false, localPath: backupPath, remoteSynced: false, error };
  }
  writeLastBackupTime();

  // ── 2. Meilisearch index (rsync /fast → BACKUP_DIR/meilisearch) ─
  // Independent failure isolation: if Meili rsync fails, SQLite backup
  // still counted as successful and pruning still runs.
  components.push(await runMeiliBackup());

  // ── 3. Embedding cache (small SQLite, fast .backup) ─────────────
  components.push(await runEmbeddingCacheBackup());

  // ── 4. Optional rsync to remote NAS target (config.backup.nasTarget)
  let remoteSynced = false;
  if (nasTarget) {
    try {
      logger.info({ nasTarget, backupPath }, 'Syncing SQLite backup to NAS');
      execSync(`rsync -az "${backupPath}" "${nasTarget}"`, { stdio: 'pipe' });
      remoteSynced = true;
      logger.info({ nasTarget }, 'Backup synced to NAS');
    } catch (err) {
      logger.error({ err: err.message, nasTarget }, 'rsync to NAS failed — backup still local');
    }
  }

  // ── 5. Pruning ──────────────────────────────────────────────────
  pruneOldBackups(retentionDays);
  pruneOldEmbeddingCacheBackups(retentionDays);

  const allOk = components.every(c => c.success || c.skipped);
  logger.info({ components, allOk }, 'Daily backup cycle complete');
  return { success: allOk, localPath: backupPath, remoteSynced, components };
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
