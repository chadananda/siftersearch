#!/usr/bin/env node
/**
 * Backfill Script: Add Sentence Markers
 *
 * Adds sentence markers (⁅s1⁆...⁅/s1⁆) to existing paragraphs.
 * This enables per-sentence translations and URL anchors.
 *
 * Usage:
 *   node scripts/add-sentence-markers.js [--dry-run] [--limit=N] [--doc-id=ID]
 *
 * Options:
 *   --dry-run    Preview changes without saving
 *   --limit=N    Process only N paragraphs (default: all)
 *   --doc-id=ID  Process only paragraphs for specific document
 *   --force      Re-process paragraphs that already have markers
 */

import { query, queryAll } from '../api/lib/db.js';
import { addSentenceMarkers } from '../api/services/segmenter.js';
import { hasMarkers, verifyMarkedText, stripMarkers } from '../api/lib/markers.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const docIdArg = args.find(a => a.startsWith('--doc-id='));
const docId = docIdArg ? docIdArg.split('=')[1] : null;

async function main() {
  console.log('='.repeat(60));
  console.log('Sentence Marker Backfill Script');
  console.log('='.repeat(60));
  console.log(`Options: dry-run=${dryRun}, force=${force}, limit=${limit || 'all'}, doc-id=${docId || 'all'}`);
  console.log();

  // Build query
  let sql = `
    SELECT c.id, c.doc_id, c.paragraph_index, c.text, d.language
    FROM content c
    JOIN docs d ON c.doc_id = d.id
  `;
  const params = [];

  const conditions = [];
  if (!force) {
    // Skip paragraphs that already have markers
    conditions.push(`c.text NOT LIKE '%⁅%'`);
  }
  if (docId) {
    conditions.push(`c.doc_id = ?`);
    params.push(docId);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY c.doc_id, c.paragraph_index`;

  if (limit) {
    sql += ` LIMIT ?`;
    params.push(limit);
  }

  // Get paragraphs to process
  const paragraphs = await queryAll(sql, params);
  console.log(`Found ${paragraphs.length} paragraphs to process`);

  if (paragraphs.length === 0) {
    console.log('Nothing to do!');
    return;
  }

  // Process each paragraph
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let totalSentences = 0;

  const batchSize = 10;
  const now = new Date().toISOString();

  for (let i = 0; i < paragraphs.length; i += batchSize) {
    const batch = paragraphs.slice(i, i + batchSize);

    // Process batch in parallel
    const results = await Promise.all(batch.map(async (para) => {
      // Skip if already has markers (unless force)
      if (!force && hasMarkers(para.text)) {
        return { id: para.id, skipped: true };
      }

      // Store original for verification
      const originalText = para.text;

      try {
        const { text: markedText, sentenceCount } = await addSentenceMarkers(para.text, {
          language: para.language
        });

        return {
          id: para.id,
          originalText,
          markedText,
          sentenceCount,
          success: true
        };
      } catch (err) {
        return {
          id: para.id,
          error: err.message,
          success: false
        };
      }
    }));

    // Update database (unless dry-run)
    for (const result of results) {
      if (result.skipped) {
        skipped++;
        continue;
      }

      if (!result.success) {
        console.error(`  Error processing ${result.id}: ${result.error}`);
        errors++;
        continue;
      }

      // STRICT VALIDATION: Verify marked text strips to exactly original
      const verification = verifyMarkedText(result.originalText, result.markedText);
      if (!verification.valid) {
        console.error(`  VALIDATION FAILED ${result.id}: ${verification.error}`);
        errors++;
        continue;
      }

      if (dryRun) {
        console.log(`  [DRY-RUN] Would update ${result.id}: ${result.sentenceCount} sentences (verified)`);
      } else {
        await query(
          `UPDATE content SET text = ?, synced = 0, updated_at = ? WHERE id = ?`,
          [result.markedText, now, result.id]
        );
      }

      processed++;
      totalSentences += result.sentenceCount;
    }

    // Progress update every batch
    const progress = Math.min(i + batchSize, paragraphs.length);
    console.log(`Progress: ${progress}/${paragraphs.length} (${processed} updated, ${skipped} skipped, ${errors} errors)`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Errors:    ${errors}`);
  console.log(`  Total sentences added: ${totalSentences}`);
  console.log('='.repeat(60));

  if (!dryRun && processed > 0) {
    console.log();
    console.log('Next steps:');
    console.log('1. Run the sync worker to update Meilisearch: npm run sync');
    console.log('2. Existing translations may need regeneration for segment alignment');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
