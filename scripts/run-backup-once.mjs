#!/usr/bin/env node
// Manually trigger one full backup cycle (SQLite + Meilisearch + embedding cache).
// Useful for verifying backup config or triggering an off-schedule snapshot before
// risky operations.
//
// Usage: node scripts/run-backup-once.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const { runBackup } = await import('../api/lib/backup.js');
const result = await runBackup();
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
