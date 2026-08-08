#!/usr/bin/env node
// DAILY BACKUP — cron-owned (crontab: 0 10 * * * UTC), moved OUT of the unified worker (2026-08-08).
// Why: runBackup()'s execSync steps (35GB sqlite .backup + ~100GB Meili rsync) blocked the worker's event
// loop → the single-writer went deaf → the watchdog restarted it MID-BACKUP → interrupted rsyncs, orphaned
// 18GB WAL litter, and a morning restart-loop (600+ lifetime restarts). In its own process, the backup can
// take as long as it needs and the writer never notices.
//
// Beyond runBackup() (shared implementation — one backup path), this script adds what "backups actually
// work" requires:
//   1. VERIFY the snapshot: PRAGMA quick_check on the copy + row-count sanity vs the live DB — a 35GB file
//      existing is not the same as a restorable database.
//   2. ALERT on failure: any component failure or verification miss emails a distinct alarm (same channel
//      as the stall-guard). Silent backup failure is the failure mode this exists to kill.
//   3. Prune stray -wal/-shm/-journal litter left by previously interrupted runs.
//
// Usage: node scripts/backup-daily.mjs   (cron; runs the full cycle unconditionally — cron cadence is the gate)
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { runBackup } = await import('../api/lib/backup.js');
const { sendEmail } = await import('../api/services/email.js');
const { logger } = await import('../api/lib/logger.js');

const TO = process.env.DIGEST_EMAIL || process.env.SITE_ADMIN_EMAIL || '';
const BACKUP_DIR = process.env.BACKUP_DIR || '/tank/backups/siftersearch';
const LIVE_DB = process.env.SIFTER_DB_PATH || join(ROOT, 'data', 'sifter.db');
const alarm = (subject, text) => (TO ? sendEmail({ to: TO, subject, text }).catch((e) => logger.error({ err: e.message }, 'backup alarm email failed')) : Promise.resolve());
const sql = (db, q) => execSync(`sqlite3 "${db}" "${q}"`, { stdio: 'pipe', timeout: 30 * 60 * 1000 }).toString().trim();

const t0 = Date.now();
const problems = [];

// ── 1. The backup itself (shared implementation) ─────────────────────────────
let result = null;
try {
  result = await runBackup();
  for (const c of result.components || []) {
    if (!c.success && !c.skipped) problems.push(`${c.component}: ${c.error || 'failed'}`);
  }
  if (!result.success && !problems.length) problems.push(result.error || 'runBackup reported failure');
} catch (e) {
  problems.push(`runBackup threw: ${e.message}`);
}

// ── 2. VERIFY today's sqlite snapshot ────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const snap = join(BACKUP_DIR, `sifter-${today}.db`);
let verify = { ok: false, quickCheck: null, docsLive: -1, docsSnap: -1 };
try {
  if (!fs.existsSync(snap)) throw new Error(`snapshot missing: ${snap}`);
  const size = fs.statSync(snap).size;
  if (size < 1e9) throw new Error(`snapshot suspiciously small: ${(size / 1e9).toFixed(2)}GB`);
  verify.quickCheck = sql(snap, 'PRAGMA quick_check(5);');
  if (verify.quickCheck !== 'ok') throw new Error(`quick_check: ${verify.quickCheck.slice(0, 200)}`);
  verify.docsSnap = Number(sql(snap, 'SELECT COUNT(*) FROM docs;'));
  verify.docsLive = Number(sql(LIVE_DB, 'SELECT COUNT(*) FROM docs;'));
  // The live DB moves during the day; the snapshot must be in the same neighborhood, not identical.
  if (!(verify.docsSnap > 0) || Math.abs(verify.docsLive - verify.docsSnap) / Math.max(verify.docsLive, 1) > 0.02) {
    throw new Error(`doc-count drift: snapshot ${verify.docsSnap} vs live ${verify.docsLive}`);
  }
  verify.ok = true;
} catch (e) {
  problems.push(`VERIFY failed: ${e.message}`);
}

// ── 3. Prune litter from previously interrupted runs (never today's files) ───
let littered = 0;
try {
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!/\.(db-wal|db-shm|db-journal)$/.test(f) || f.includes(today)) continue;
    const p = join(BACKUP_DIR, f);
    if (Date.now() - fs.statSync(p).mtimeMs > 2 * 24 * 3600 * 1000) { fs.unlinkSync(p); littered++; }
  }
} catch { /* best-effort */ }

const mins = Math.round((Date.now() - t0) / 6000) / 10;
const summary = { ok: problems.length === 0, mins, verify, littered, remoteSynced: result?.remoteSynced ?? false, problems };
logger.info(summary, 'backup-daily complete');
console.log(JSON.stringify(summary));

if (problems.length) {
  await alarm(
    '⚠️ SifterSearch DAILY BACKUP FAILED',
    `The daily backup did not fully succeed (${mins}min):\n\n- ${problems.join('\n- ')}\n\n` +
    `Snapshot: ${snap}\nVerification: quick_check=${verify.quickCheck ?? 'n/a'}, docs snapshot=${verify.docsSnap} vs live=${verify.docsLive}\n\n` +
    `Backups are the loss-prevention layer — investigate today. (Runs via cron; rerun manually: node scripts/backup-daily.mjs)`);
  process.exit(1);
}
process.exit(0);
