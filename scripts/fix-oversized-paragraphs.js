#!/usr/bin/env node
/**
 * Fix Oversized Paragraphs Script
 *
 * Re-ingests documents that have oversized paragraphs (>3000 chars).
 * The updated block-parser will now split these at sentence boundaries.
 *
 * Embedding preservation:
 * - Ingester's content_hash matching preserves embeddings for unchanged paragraphs
 * - Only split paragraphs need new embeddings (unavoidable since content changed)
 *
 * Usage:
 *   node scripts/fix-oversized-paragraphs.js           # List affected documents
 *   node scripts/fix-oversized-paragraphs.js --fix     # Re-ingest affected documents
 *   node scripts/fix-oversized-paragraphs.js --dry-run # Show what would happen
 */

import '../api/lib/config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { query, queryAll, queryOne } from '../api/lib/db.js';
import { ingestDocument } from '../api/services/ingester.js';
import { logger } from '../api/lib/logger.js';
import { config } from '../api/lib/config.js';

// Threshold matching block-parser.js MAX_PARAGRAPH_SIZE
const MAX_PARAGRAPH_SIZE = 3000;

const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const dryRun = args.includes('--dry-run');

async function getAffectedDocuments() {
  // Query documents that have at least one oversized paragraph
  const docs = await queryAll(`
    SELECT DISTINCT d.id, d.title, d.file_path, d.language, d.author,
           MAX(LENGTH(c.text)) as max_para_size,
           COUNT(CASE WHEN LENGTH(c.text) > ? THEN 1 END) as oversized_count,
           COUNT(*) as total_paragraphs
    FROM content c
    JOIN docs d ON c.doc_id = d.id
    WHERE LENGTH(c.text) > ?
    GROUP BY d.id
    ORDER BY max_para_size DESC
  `, [MAX_PARAGRAPH_SIZE, MAX_PARAGRAPH_SIZE]);

  return docs;
}

async function getEmbeddingStats() {
  const stats = await queryOne(`
    SELECT
      COUNT(*) as total_paragraphs,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
    FROM content
  `);
  return stats;
}

async function listAffectedDocuments() {
  const docs = await getAffectedDocuments();
  const stats = await getEmbeddingStats();

  console.log('\n=== Embedding Status ===');
  console.log(`Total paragraphs: ${stats.total_paragraphs.toLocaleString()}`);
  console.log(`With embeddings: ${stats.with_embeddings.toLocaleString()}`);

  console.log(`\n=== Documents with Oversized Paragraphs (>${MAX_PARAGRAPH_SIZE} chars) ===\n`);

  if (docs.length === 0) {
    console.log('No documents with oversized paragraphs found!');
    return;
  }

  console.log(`Found ${docs.length} documents with oversized paragraphs:\n`);

  // Group by severity
  const severe = docs.filter(d => d.max_para_size > 100000);
  const high = docs.filter(d => d.max_para_size > 50000 && d.max_para_size <= 100000);
  const medium = docs.filter(d => d.max_para_size > 20000 && d.max_para_size <= 50000);
  const low = docs.filter(d => d.max_para_size <= 20000);

  const showDocs = (label, list) => {
    if (list.length === 0) return;
    console.log(`\n${label} (${list.length} documents):`);
    list.forEach(d => {
      console.log(`  [${d.max_para_size.toLocaleString()} chars] ${d.title}`);
      console.log(`    ID: ${d.id}`);
      console.log(`    ${d.oversized_count} oversized / ${d.total_paragraphs} total paragraphs`);
      if (d.file_path) {
        console.log(`    File: ${d.file_path.split('/').slice(-2).join('/')}`);
      }
    });
  };

  showDocs('SEVERE (>100K chars)', severe);
  showDocs('HIGH (50K-100K chars)', high);
  showDocs('MEDIUM (20K-50K chars)', medium);
  showDocs('LOW (3K-20K chars)', low);

  console.log('\n=== Summary ===');
  console.log(`Total affected documents: ${docs.length}`);
  console.log(`Total oversized paragraphs: ${docs.reduce((sum, d) => sum + d.oversized_count, 0)}`);
  console.log(`\nRun with --fix to re-ingest these documents`);
  console.log(`Run with --dry-run to see what would happen without making changes`);
}

async function fixDocument(doc) {
  const libraryBase = config.library.basePath;
  const fullPath = join(libraryBase, doc.file_path);

  console.log(`\n--- Processing: ${doc.title} ---`);
  console.log(`File: ${doc.file_path}`);
  console.log(`Max paragraph size: ${doc.max_para_size.toLocaleString()} chars`);
  console.log(`Oversized paragraphs: ${doc.oversized_count}`);

  // Get before stats
  const beforeStats = await queryOne(`
    SELECT
      COUNT(*) as count,
      COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
      MAX(LENGTH(text)) as max_size
    FROM content WHERE doc_id = ?
  `, [doc.id]);

  console.log(`BEFORE: ${beforeStats.count} paragraphs, ${beforeStats.with_embeddings} with embeddings`);

  if (dryRun) {
    console.log('  [DRY-RUN] Would re-ingest this document');
    return { success: true, skipped: true };
  }

  try {
    // CRITICAL: Clear file_hash AND body_hash to force re-processing
    // The ingester checks file_hash first, then body_hash
    // We need to clear both to ensure content is fully re-processed
    await query(`UPDATE docs SET file_hash = NULL, body_hash = NULL WHERE id = ?`, [doc.id]);

    // Read source file
    const fileContent = await readFile(fullPath, 'utf-8');

    // Re-ingest (updated block-parser will split oversized paragraphs)
    const result = await ingestDocument(fileContent, { id: doc.id }, doc.file_path);

    // Get after stats
    const afterStats = await queryOne(`
      SELECT
        COUNT(*) as count,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
        MAX(LENGTH(text)) as max_size
      FROM content WHERE doc_id = ?
    `, [doc.id]);

    console.log(`AFTER: ${afterStats.count} paragraphs, ${afterStats.with_embeddings} with embeddings`);
    console.log(`Max paragraph size: ${afterStats.max_size?.toLocaleString() || 0} chars`);

    const embeddingsPreserved = afterStats.with_embeddings;
    const newParagraphs = afterStats.count - beforeStats.count;
    console.log(`Result: ${newParagraphs > 0 ? '+' : ''}${newParagraphs} paragraphs, ${embeddingsPreserved} embeddings preserved`);

    return { success: true, newParagraphs, embeddingsPreserved };
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function fixAllDocuments() {
  const docs = await getAffectedDocuments();
  const beforeStats = await getEmbeddingStats();

  console.log('\n=== Fix Oversized Paragraphs ===\n');

  if (docs.length === 0) {
    console.log('No documents with oversized paragraphs found!');
    return;
  }

  console.log(`Found ${docs.length} documents to process`);
  console.log(`Before: ${beforeStats.total_paragraphs.toLocaleString()} total paragraphs, ${beforeStats.with_embeddings.toLocaleString()} with embeddings`);

  if (dryRun) {
    console.log('\n[DRY-RUN MODE - no changes will be made]\n');
  }

  let successCount = 0;
  let errorCount = 0;
  let totalNewParagraphs = 0;

  for (let i = 0; i < docs.length; i++) {
    console.log(`\n[${i + 1}/${docs.length}]`);
    const result = await fixDocument(docs[i]);

    if (result.success) {
      successCount++;
      if (result.newParagraphs) {
        totalNewParagraphs += result.newParagraphs;
      }
    } else {
      errorCount++;
    }
  }

  const afterStats = await getEmbeddingStats();

  console.log('\n=== Final Summary ===');
  console.log(`Documents processed: ${successCount}/${docs.length}`);
  console.log(`Errors: ${errorCount}`);
  if (!dryRun) {
    console.log(`Before: ${beforeStats.total_paragraphs.toLocaleString()} paragraphs, ${beforeStats.with_embeddings.toLocaleString()} embeddings`);
    console.log(`After: ${afterStats.total_paragraphs.toLocaleString()} paragraphs, ${afterStats.with_embeddings.toLocaleString()} embeddings`);
    console.log(`Net change: ${totalNewParagraphs > 0 ? '+' : ''}${totalNewParagraphs} paragraphs`);
  }

  // Verify no more oversized paragraphs
  const remaining = await queryOne(`
    SELECT COUNT(*) as count FROM content WHERE LENGTH(text) > ?
  `, [MAX_PARAGRAPH_SIZE]);

  console.log(`\nOversized paragraphs remaining: ${remaining.count}`);

  if (remaining.count > 0 && !dryRun) {
    console.log('\nNote: Some paragraphs may still be oversized if:');
    console.log('  - Source file has no sentence boundaries to split on');
    console.log('  - Re-run indexer or check source files manually');
  }
}

// Main
async function main() {
  if (fixMode || dryRun) {
    await fixAllDocuments();
  } else {
    await listAffectedDocuments();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
