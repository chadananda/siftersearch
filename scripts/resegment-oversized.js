#!/usr/bin/env node

/**
 * Selective Re-segmentation Script
 *
 * Finds and re-segments paragraphs that exceed maxChunkSize (1500 chars).
 * This allows fixing oversized blocks without re-indexing the entire library.
 *
 * Process:
 * 1. Find paragraphs where LENGTH(text) > 1500
 * 2. Re-segment using AI semantic segmentation
 * 3. Delete old oversized paragraphs (SQLite + Meilisearch)
 * 4. Insert new properly-sized paragraphs
 * 5. New paragraphs are marked for embedding generation (embedded = 0)
 *
 * Usage:
 *   node scripts/resegment-oversized.js [options]
 *
 * Options:
 *   --dry-run       Show what would be changed without making changes
 *   --limit=N       Only process first N oversized paragraphs
 *   --document=ID   Only process a specific document
 *   --verbose       Show detailed progress
 */

// Load environment FIRST
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryOne, queryAll, transaction } from '../api/lib/db.js';
import { getMeili, INDEXES, initializeIndexes } from '../api/lib/search.js';
import { segmentText, detectLanguageFeatures } from '../api/services/segmenter.js';
import { hashContent } from '../api/services/ingester.js';
import { logger } from '../api/lib/logger.js';
import { ensureServicesRunning } from '../api/lib/services.js';

// Configuration
const MAX_CHUNK_SIZE = 1500;
const MIN_CHUNK_SIZE = 20;

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const documentArg = args.find(arg => arg.startsWith('--document='));
const documentFilter = documentArg ? documentArg.split('=')[1] : null;

/**
 * Check if indexed_paragraphs table exists
 */
async function tableExists() {
  try {
    const result = await queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='indexed_paragraphs'
    `);
    return result !== null;
  } catch {
    return false;
  }
}

/**
 * Find all oversized paragraphs
 */
async function findOversizedParagraphs() {
  // Check if table exists first
  if (!await tableExists()) {
    console.log('');
    console.log('⚠️  The indexed_paragraphs table does not exist.');
    console.log('   This script is designed to run on production where documents are indexed.');
    console.log('   Run document ingestion first to populate the database.');
    console.log('');
    return [];
  }

  let sql = `
    SELECT
      p.id,
      p.document_id,
      p.paragraph_index,
      p.text,
      p.blocktype,
      p.heading,
      p.title,
      p.author,
      p.religion,
      p.collection,
      p.language,
      p.year,
      LENGTH(p.text) as text_length
    FROM indexed_paragraphs p
    WHERE LENGTH(p.text) > ?
  `;

  const params = [MAX_CHUNK_SIZE];

  if (documentFilter) {
    sql += ' AND p.document_id = ?';
    params.push(documentFilter);
  }

  sql += ' ORDER BY text_length DESC';

  if (limit < Infinity) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  return queryAll(sql, params);
}

/**
 * Delete a paragraph from Meilisearch
 */
async function deleteParagraphFromMeili(paragraphId) {
  try {
    const meili = getMeili();
    await meili.index(INDEXES.PARAGRAPHS).deleteDocument(paragraphId);
    return true;
  } catch (err) {
    // Document may not exist in Meilisearch yet
    if (err.code !== 'document_not_found') {
      logger.warn({ paragraphId, error: err.message }, 'Failed to delete from Meilisearch');
    }
    return false;
  }
}

/**
 * Re-segment a single oversized paragraph
 */
async function resegmentParagraph(paragraph) {
  const { id, document_id, text, blocktype, heading, title, author, religion, collection, language, year } = paragraph;

  // Detect language features for segmentation
  const features = detectLanguageFeatures(text);
  const detectedLanguage = language || features.language;

  if (verbose) {
    console.log(`  Segmenting ${text.length} chars (${detectedLanguage})...`);
  }

  // Use AI segmentation
  const segments = await segmentText(text, {
    maxChunkSize: MAX_CHUNK_SIZE,
    minChunkSize: MIN_CHUNK_SIZE,
    language: detectedLanguage
  });

  if (segments.length <= 1) {
    // Couldn't segment further - this shouldn't happen but handle gracefully
    console.log(`  ⚠️  Could not segment further (${segments.length} segments)`);
    return { segmented: false, reason: 'no_split' };
  }

  if (verbose) {
    console.log(`  Split into ${segments.length} segments`);
  }

  return {
    segmented: true,
    segments,
    metadata: { document_id, blocktype, heading, title, author, religion, collection, language: detectedLanguage, year }
  };
}

/**
 * Apply resegmentation changes to database
 */
async function applyResegmentation(oldParagraph, result) {
  const { id: oldId, document_id, paragraph_index } = oldParagraph;
  const { segments, metadata } = result;

  // Delete old paragraph from Meilisearch first
  await deleteParagraphFromMeili(oldId);

  // Prepare SQL statements
  const statements = [];

  // Delete old paragraph from SQLite
  statements.push({
    sql: 'DELETE FROM indexed_paragraphs WHERE id = ?',
    args: [oldId]
  });

  // Insert new segmented paragraphs
  // Use sub-indices to maintain ordering: original_index.0, original_index.1, etc.
  for (let i = 0; i < segments.length; i++) {
    const segmentText = segments[i];
    const contentHash = hashContent(segmentText);
    const newId = `${document_id}_p${paragraph_index}_${i}`;

    statements.push({
      sql: `
        INSERT INTO indexed_paragraphs
        (id, document_id, paragraph_index, text, content_hash, heading, title, author, religion, collection, language, year, blocktype, embedded, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `,
      args: [
        newId,
        document_id,
        paragraph_index + (i * 0.001), // Use fractional index to maintain order
        segmentText,
        contentHash,
        metadata.heading,
        metadata.title,
        metadata.author,
        metadata.religion,
        metadata.collection,
        metadata.language,
        metadata.year,
        metadata.blocktype
      ]
    });
  }

  // Execute in transaction
  await transaction(statements);

  return {
    oldId,
    newCount: segments.length,
    newIds: segments.map((_, i) => `${document_id}_p${paragraph_index}_${i}`)
  };
}

/**
 * Main function
 */
async function main() {
  console.log('');
  console.log('🔧 Oversized Paragraph Re-segmentation');
  console.log('======================================');
  console.log(`Max chunk size: ${MAX_CHUNK_SIZE} chars`);
  if (dryRun) console.log('Mode: DRY RUN (no changes will be made)');
  if (documentFilter) console.log(`Document filter: ${documentFilter}`);
  if (limit < Infinity) console.log(`Limit: ${limit} paragraphs`);
  console.log('');

  // Ensure services are running
  if (!dryRun) {
    console.log('🔧 Ensuring services are running...');
    await ensureServicesRunning();
    await initializeIndexes();
    console.log('✅ Services ready');
    console.log('');
  }

  // Find oversized paragraphs
  console.log('🔍 Finding oversized paragraphs...');
  const oversized = await findOversizedParagraphs();
  console.log(`Found ${oversized.length} oversized paragraphs`);
  console.log('');

  if (oversized.length === 0) {
    console.log('✅ No oversized paragraphs found. Nothing to do!');
    return;
  }

  // Show summary by document
  const byDocument = {};
  for (const p of oversized) {
    if (!byDocument[p.document_id]) {
      byDocument[p.document_id] = { count: 0, maxSize: 0, title: p.title };
    }
    byDocument[p.document_id].count++;
    byDocument[p.document_id].maxSize = Math.max(byDocument[p.document_id].maxSize, p.text_length);
  }

  console.log('📊 Summary by document:');
  for (const [docId, info] of Object.entries(byDocument)) {
    console.log(`  ${info.title || docId}: ${info.count} paragraphs (max ${info.maxSize} chars)`);
  }
  console.log('');

  // Process each oversized paragraph
  const stats = {
    processed: 0,
    segmented: 0,
    skipped: 0,
    failed: 0,
    newParagraphs: 0,
    errors: []
  };

  console.log('🔄 Processing oversized paragraphs...');
  console.log('');

  for (let i = 0; i < oversized.length; i++) {
    const paragraph = oversized[i];
    const progress = `[${i + 1}/${oversized.length}]`;

    try {
      console.log(`${progress} ${paragraph.title} (${paragraph.text_length} chars)`);

      // Re-segment
      const result = await resegmentParagraph(paragraph);
      stats.processed++;

      if (!result.segmented) {
        console.log(`  ⏭️  Skipped: ${result.reason}`);
        stats.skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  🔍 Would split into ${result.segments.length} segments`);
        for (let j = 0; j < result.segments.length; j++) {
          console.log(`     Segment ${j + 1}: ${result.segments[j].length} chars`);
        }
        stats.segmented++;
        stats.newParagraphs += result.segments.length;
        continue;
      }

      // Apply changes
      const applied = await applyResegmentation(paragraph, result);
      console.log(`  ✅ Split into ${applied.newCount} segments`);

      stats.segmented++;
      stats.newParagraphs += applied.newCount;

      // Brief pause to avoid overwhelming AI API
      if (i < oversized.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      stats.failed++;
      stats.errors.push({ paragraph: paragraph.id, error: err.message });
    }
  }

  // Print summary
  console.log('');
  console.log('======================================');
  console.log('📊 Results');
  console.log('======================================');
  console.log(`Processed: ${stats.processed}`);
  console.log(`Segmented: ${stats.segmented}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`New paragraphs created: ${stats.newParagraphs}`);
  console.log(`Net change: +${stats.newParagraphs - stats.segmented} paragraphs`);

  if (stats.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const err of stats.errors.slice(0, 10)) {
      console.log(`  - ${err.paragraph}: ${err.error}`);
    }
  }

  if (!dryRun && stats.newParagraphs > 0) {
    console.log('');
    console.log('ℹ️  New paragraphs need embedding generation.');
    console.log('   They will be processed by the embedding worker automatically.');
    console.log('   Check status with: npm run ingestion-stats');
  }

  console.log('');
  console.log('✅ Done!');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
