#!/usr/bin/env node
// `npm run migrate` (the updater runs it on every deploy): the ONE migration system, api/lib/migrations (runner.js,
// CURRENT_VERSION). The legacy SQL runner it replaced (migrations/*.sql, 2025-12) failed on every deploy since at least
// 10-10 ("near context": an indexed_paragraphs table that no longer exists) and wrote SQLite directly — retired 10-11,
// files archived under planning/archive/legacy-sql-migrations/. The worker and API also run migrations at boot.
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
dotenv.config({ path: join(ROOT, '.env-public'), quiet: true });
const { runMigrations } = await import('../api/lib/migrations.js');
const r = await runMigrations();
console.log(`Migrations complete (applied ${r?.applied ?? 0})`);
process.exit(0);
