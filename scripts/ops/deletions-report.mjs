#!/usr/bin/env node
// Explain a content drop: paragraphs soft-deleted per day × source (api/lib/repos/integrity-repo.js). Out of process.
//   node scripts/ops/deletions-report.mjs [--days 14]
import dotenv from 'dotenv';
import { deletionsByDay } from '../../api/lib/repos/integrity-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const days = Number(process.argv.includes('--days') ? process.argv[process.argv.indexOf('--days') + 1] : 14);
const rows = await deletionsByDay(days);
const total = rows.reduce((n, r) => n + r.paragraphs, 0);
for (const r of rows) console.log(JSON.stringify(r));
console.log(JSON.stringify({ days, total_paragraphs_deleted: total }));
process.exit(0);
