#!/usr/bin/env node
// Strategy-audit digest (PM2 siftersearch-audit-digest; runs ON tower). Verdicts from /tank/sifter/audit/audits.db (the audit's
// own store, not the main DB) → api/lib/audit/audit-digest.js → a section in data/run/maintenance/audit-digest.json for the
// weekly maintenance email (Chad 11-03). It sends no mail. system-checks.mjs --weekly runs it with --hours=168 first.
//   node scripts/audit/audit-digest.mjs [--hours=168] [--dry]   (--dry prints instead of writing the section)
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildAuditDigest } from '../../api/lib/audit/audit-digest.js';
import { maintenanceDir } from '../../api/lib/ops/maintenance.js';

// PM2 does not pass the env files to every app: load them here (as the other tower scripts do)
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(join(dirname(fileURLToPath(import.meta.url)), '..', '..'), f), quiet: true });
const HOURS = Number((process.argv.find((a) => a.startsWith('--hours=')) || '--hours=168').split('=')[1]);
const DRY = process.argv.includes('--dry');
const STORE = process.env.AUDIT_DB || '/tank/sifter/audit/audits.db';
if (!existsSync(STORE)) { console.log('no audits yet'); process.exit(0); }

const db = new Database(STORE, { readonly: true });
const rows = db.prepare(`SELECT * FROM audits WHERE audited_at >= datetime('now', ?)`).all(`-${HOURS} hours`);
db.close();
const d = buildAuditDigest(rows, { hours: HOURS });
if (DRY) { console.log(d.text); process.exit(0); }
const out = join(maintenanceDir(), 'audit-digest.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.tmp`, JSON.stringify(d.section, null, 1)); renameSync(`${out}.tmp`, out);
console.log(`audit digest section → ${out}: ${d.section.summary}`);
process.exit(0);
