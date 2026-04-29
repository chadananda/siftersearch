// Backfill the HyPE sidecar Meili index from existing content.hyp_questions.
//
// Existing paragraphs that already have hyp_questions stored in SQLite
// (potentially with enhanced_synced=1 from before the sidecar existed) need
// to be force-resynced. This script flips their enhanced_synced flag back
// to 0 so the worker's runHypeSyncCycle picks them up — OR it can run the
// sync inline for one-shot completion.
//
// Usage:
//   node scripts/backfill-hype-sidecar.mjs --reset-flag           # Just flip flag, let worker do the rest
//   node scripts/backfill-hype-sidecar.mjs --inline --limit 1000  # Run sync inline (faster but uses more memory)
//   node scripts/backfill-hype-sidecar.mjs --inline --all         # Run until done (long-running)

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const args = process.argv.slice(2);
const RESET_FLAG = args.includes('--reset-flag');
const INLINE = args.includes('--inline');
const ALL = args.includes('--all');
const LIMIT = parseInt(args[args.indexOf('--limit') + 1] || '500', 10);

if (!RESET_FLAG && !INLINE) {
  console.error('Usage: --reset-flag (mark all hyp paragraphs unsynced) OR --inline [--all|--limit N]');
  process.exit(1);
}

const { query, queryAll } = await import('../api/lib/db.js');
const { syncHypeBatch } = await import('../api/lib/search.js');
const { getAuthority } = await import('../api/lib/authority.js');

if (RESET_FLAG) {
  console.log('Marking all paragraphs with hyp_questions as enhanced_synced=0...');
  const result = await query(
    `UPDATE content SET enhanced_synced = 0
     WHERE hyp_questions IS NOT NULL AND deleted_at IS NULL`
  );
  const { count } = await queryAll(
    `SELECT COUNT(*) as count FROM content
     WHERE hyp_questions IS NOT NULL AND enhanced_synced = 0 AND deleted_at IS NULL`
  ).then(rows => rows[0]);
  console.log(`Done. ${count} paragraphs now flagged for HyPE sidecar sync.`);
  console.log(`The unified worker will drain them at ~${100 * 60 / 60} per minute (current batch size 100, 60s interval).`);
  console.log(`At that rate, 819K paragraphs ≈ ${Math.round(819000 / (100 * 60))} hours wall-clock.`);
  console.log(`To accelerate, run: node scripts/backfill-hype-sidecar.mjs --inline --all`);
  process.exit(0);
}

if (INLINE) {
  let totalProcessed = 0;
  let totalIndexed = 0;
  const startTime = Date.now();
  const targetCap = ALL ? Infinity : LIMIT;
  console.log(`Running inline sync. Target: ${ALL ? 'ALL pending' : `up to ${LIMIT} paragraphs`}`);

  while (totalProcessed < targetCap) {
    const batchLimit = Math.min(100, targetCap - totalProcessed);
    const result = await syncHypeBatch({ queryAll, query, getAuthority, limit: batchLimit });
    if (result.processed === 0) {
      console.log('No more pending paragraphs. Done.');
      break;
    }
    totalProcessed += result.processed;
    totalIndexed += result.indexed;
    const elapsedSec = (Date.now() - startTime) / 1000;
    const rate = totalProcessed / elapsedSec;
    console.log(`Processed ${totalProcessed} paragraphs / ${totalIndexed} questions indexed (${rate.toFixed(1)} para/s, errors: ${result.errors})`);
  }

  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\nDone in ${elapsedMin} min. ${totalProcessed} paragraphs, ${totalIndexed} questions.`);
  process.exit(0);
}
