#!/usr/bin/env node
// One-shot: clear all existing hyp_questions / hyp_thesis from content
// and wipe the Meili HyPE sidecar. Run BEFORE starting the new Sonnet
// enrichment pipeline.
//
// Usage:
//   node scripts/drop-existing-hype.mjs              # dry-run summary
//   node scripts/drop-existing-hype.mjs --confirm    # actually drop

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const CONFIRM = process.argv.includes('--confirm');

const { query, queryOne } = await import('../api/lib/db.js');
const { getMeili, INDEXES } = await import('../api/lib/search.js');

console.log('=== Drop existing HyPE data ===\n');

// Survey what's currently there
const before = await queryOne(`
  SELECT
    COUNT(*) AS total_paragraphs,
    SUM(CASE WHEN hyp_questions IS NOT NULL THEN 1 ELSE 0 END) AS with_questions,
    SUM(CASE WHEN hyp_thesis IS NOT NULL THEN 1 ELSE 0 END) AS with_thesis,
    SUM(CASE WHEN enhanced_synced = 1 THEN 1 ELSE 0 END) AS synced
  FROM content WHERE deleted_at IS NULL
`);
console.log('Before:');
console.log(`  total paragraphs:        ${before.total_paragraphs}`);
console.log(`  with hyp_questions:      ${before.with_questions}`);
console.log(`  with hyp_thesis:         ${before.with_thesis}`);
console.log(`  enhanced_synced=1:       ${before.synced}`);

// Meili HyPE index doc count
const meili = getMeili();
let meiliCount = -1;
try {
  const stats = await meili.index(INDEXES.HYPE_QUESTIONS).getStats();
  meiliCount = stats.numberOfDocuments;
  console.log(`  Meili hype_questions:    ${meiliCount} docs`);
} catch (err) {
  console.log(`  Meili hype_questions:    (could not read: ${err.message})`);
}

if (!CONFIRM) {
  console.log('\nDRY RUN — pass --confirm to actually drop.\n');
  process.exit(0);
}

console.log('\n--- Dropping ---');

// 1. Clear SQL columns
console.log('1. Clearing hyp_questions, hyp_thesis, context_model in content...');
const sqlResult = await query(`
  UPDATE content
     SET hyp_questions = NULL,
         hyp_thesis = NULL,
         context_model = NULL,
         enhanced_synced = 0
   WHERE hyp_questions IS NOT NULL
      OR hyp_thesis IS NOT NULL
      OR context_model IS NOT NULL
`);
console.log(`   ${sqlResult.rows[0].changes} rows cleared`);

// 2. Clear enrichment_pending (anything queued from old generation)
console.log('2. Clearing enrichment_pending...');
const pendingResult = await query('DELETE FROM enrichment_pending');
console.log(`   ${pendingResult.rows[0].changes} rows deleted`);

// 3. Wipe Meili HyPE sidecar (faster: delete index, recreate from settings)
console.log('3. Wiping Meili hype_questions index...');
try {
  // deleteAllDocuments works without recreating the index
  await meili.index(INDEXES.HYPE_QUESTIONS).deleteAllDocuments();
  console.log('   Meili hype_questions cleared (deleteAllDocuments task enqueued)');
} catch (err) {
  console.log(`   ERROR clearing Meili: ${err.message}`);
}

console.log('\nDone. Ready for fresh enrichment.\n');
process.exit(0);
