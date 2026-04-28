#!/usr/bin/env node
// Driver: find every doc with oversized Hebrew paragraphs and feed each one
// to resegmentOversized() from api/services/segmenter.js — which now
// dispatches to the rule-based segmentHebrew() for Hebrew docs.
//
// Usage:
//   node scripts/resegment-hebrew.js --dry-run    # report only, no writes
//   node scripts/resegment-hebrew.js              # live run
//   node scripts/resegment-hebrew.js --doc-id=19954  # single doc

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { resegmentOversized } = await import('../api/services/segmenter.js');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docIdArg = args.find(a => a.startsWith('--doc-id='))?.split('=')[1];

const docs = docIdArg
  ? await queryAll('SELECT DISTINCT id FROM docs WHERE id = ?', [docIdArg])
  : await queryAll(`
      SELECT DISTINCT d.id
      FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE c.deleted_at IS NULL
        AND c.embedding IS NULL
        AND LENGTH(c.text) > 6000
        AND d.language = 'he'
      ORDER BY d.id
    `);

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
console.log(`Docs to process: ${docs.length}`);
console.log('');

let totalOversized = 0;
let totalNew = 0;
let totalErrors = 0;
const start = Date.now();

for (const { id: docId } of docs) {
  try {
    const result = await resegmentOversized(docId, { dryRun });
    totalOversized += result.oversized;
    totalNew += result.newParagraphs;
    totalErrors += result.errors.length;
    const tag = result.errors.length ? 'ERR' : 'ok';
    console.log(`[${tag}] doc ${docId}: oversized=${result.oversized} → new=${result.newParagraphs} removed=${result.removed} errors=${result.errors.length}`);
    if (result.errors.length) {
      for (const e of result.errors.slice(0, 3)) console.log(`     ${e}`);
    }
  } catch (err) {
    totalErrors++;
    console.log(`[FAIL] doc ${docId}: ${err.message}`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log('');
console.log('━'.repeat(60));
console.log(`Total: ${totalOversized} oversized → ${totalNew} new chunks, ${totalErrors} errors, ${elapsed}s elapsed`);
process.exit(0);
