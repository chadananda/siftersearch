#!/usr/bin/env node
/**
 * Re-Segment Document Script
 *
 * Reconstructs original text from existing paragraphs and re-segments
 * using the new concept-based AI segmentation.
 *
 * For documents without a file_path, we recreate the source from stored paragraphs.
 *
 * Usage:
 *   node scripts/resegment-document.js <document-id>
 *   node scripts/resegment-document.js <document-id> --dry-run  # Preview only
 */

import '../api/lib/config.js';
import { query, queryOne, queryAll, transaction } from '../api/lib/db.js';
import { segmentText, verifyIntegrity } from '../api/services/segmenter.js';
import { hashContent } from '../api/services/ingester.js';
import { nanoid } from 'nanoid';
import { logger } from '../api/lib/logger.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docId = args.find(a => !a.startsWith('--'));

if (!docId) {
  console.log('Usage: node scripts/resegment-document.js <document-id> [--dry-run]');
  process.exit(1);
}

async function main() {
  // Get document
  const doc = await queryOne('SELECT * FROM docs WHERE id = ?', [docId]);
  if (!doc) {
    console.error('Document not found:', docId);
    process.exit(1);
  }

  console.log('\n=== Document ===');
  console.log('ID:', doc.id);
  console.log('Title:', doc.title);
  console.log('Language:', doc.language);

  // Get all existing paragraphs in order
  const paragraphs = await queryAll(`
    SELECT paragraph_index, text, blocktype
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [docId]);

  console.log('\n=== BEFORE Re-Segmentation ===');
  console.log('Paragraphs:', paragraphs.length);

  const charDist = paragraphs.map(p => p.text.length);
  console.log('Sizes:', charDist.slice(0, 10).join(', '), '...');
  console.log('Avg:', Math.round(charDist.reduce((a, b) => a + b, 0) / charDist.length));
  console.log('At 1500 (hard split):', charDist.filter(c => c === 1500).length);

  // Reconstruct original text (join with space)
  // Note: We may lose some whitespace nuance, but the core content is preserved
  const originalText = paragraphs.map(p => p.text).join('\n\n');
  console.log('\nReconstructed text length:', originalText.length);

  // Re-segment with new AI-based concept segmentation
  console.log('\n=== Running AI Concept Segmentation... ===');
  console.log('(This may take a moment...)\n');

  const newSegments = await segmentText(originalText, {
    language: doc.language,
    maxChunkSize: 2500,  // Allow larger chunks based on concepts
    minChunkSize: 50
  });

  console.log('=== AFTER Re-Segmentation ===');
  console.log('New paragraphs:', newSegments.length);

  const newCharDist = newSegments.map(s => s.length);
  console.log('Sizes:', newCharDist.slice(0, 10).join(', '), '...');
  console.log('Avg:', Math.round(newCharDist.reduce((a, b) => a + b, 0) / newCharDist.length));
  console.log('At 1500 (hard split):', newCharDist.filter(c => c === 1500).length);

  // Verify integrity
  console.log('\n=== Integrity Check ===');
  try {
    verifyIntegrity(originalText, newSegments);
    console.log('✅ PASSED: No text was lost or added');
  } catch (err) {
    console.error('❌ FAILED:', err.message);
    process.exit(1);
  }

  // Show preview of new segments
  console.log('\n=== New Paragraph Previews (first 15) ===');
  newSegments.slice(0, 15).forEach((seg, i) => {
    const preview = seg.substring(0, 80).replace(/\n/g, ' ');
    console.log(`\n[${i + 1}] (${seg.length} chars)`);
    console.log(`  ${preview}...`);
  });

  if (dryRun) {
    console.log('\n--- DRY RUN: No changes made ---');
    console.log('Run without --dry-run to apply changes');
    return;
  }

  // Apply changes
  console.log('\n=== Applying Changes ===');

  // Delete existing content
  await query('DELETE FROM content WHERE doc_id = ?', [docId]);
  console.log('Deleted old paragraphs');

  // Insert new segments
  const statements = newSegments.map((seg, index) => ({
    sql: `
      INSERT INTO content (id, doc_id, paragraph_index, text, content_hash, blocktype, synced)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
    args: [
      `${docId}_p${index}`,
      docId,
      index,
      seg,
      hashContent(seg),
      'paragraph'
    ]
  }));

  // Execute in batches
  const BATCH_SIZE = 50;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await transaction(statements.slice(i, i + BATCH_SIZE));
  }
  console.log('Inserted', newSegments.length, 'new paragraphs');

  // Update doc paragraph count
  await query('UPDATE docs SET paragraph_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [newSegments.length, docId]);

  console.log('\n✅ Re-segmentation complete!');
  console.log('Paragraphs changed:', paragraphs.length, '→', newSegments.length);
  console.log('\nNote: Embeddings will need regeneration.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
