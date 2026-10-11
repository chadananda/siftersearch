#!/usr/bin/env node
// Are any live books hollow (no paragraph with text) or carrying empty rows? Per source, with samples. Out of process.
//   node scripts/ops/hollow-report.mjs [--ids]   (--ids prints every affected doc id per source)
import dotenv from 'dotenv';
import { hollowDocs } from '../../api/lib/repos/integrity-repo.js';

dotenv.config({ path: '.env-secrets', quiet: true }); dotenv.config({ path: '.env-public', quiet: true });
const rows = await hollowDocs();
const by = {};
for (const r of rows) {
  const s = (by[r.source] ||= { hollow_no_rows: 0, hollow_empty_rows: 0, docs_with_some_empty_rows: 0, empty_rows: 0, sample: [], ids: [] });
  if (!r.rows) s.hollow_no_rows++; else if (!r.with_text) s.hollow_empty_rows++; else s.docs_with_some_empty_rows++;
  s.empty_rows += r.empty_rows || 0;
  s.ids.push(r.id);
  if (s.sample.length < 5) s.sample.push(`${r.id} ${String(r.title).slice(0, 50)} (${r.rows} rows, ${r.with_text || 0} with text)`);
}
for (const [source, s] of Object.entries(by)) {
  const { ids, ...rest } = s;
  console.log(JSON.stringify({ source, ...rest, ...(process.argv.includes('--ids') ? { ids } : {}) }));
}
console.log(JSON.stringify({ affected_docs: rows.length }));
process.exit(0);
