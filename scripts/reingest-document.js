#!/usr/bin/env node
/**
 * Re-Ingest Document Script
 *
 * Forces re-ingestion of a document from its SOURCE FILE with new AI-based segmentation.
 * Source files are the ONLY source of truth - database content is always derived.
 *
 * Usage:
 *   node scripts/reingest-document.js <document-id>
 *   node scripts/reingest-document.js --list  # List Bab tablets
 */

import '../api/lib/config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { query, queryOne, queryAll } from '../api/lib/db.js';

// Library base path
const libraryBase = join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');
import { ingestDocument } from '../api/services/ingester.js';
import { logger } from '../api/lib/logger.js';

const args = process.argv.slice(2);

async function listDocuments() {
  const docs = await queryAll(`
    SELECT d.id, d.title, d.language, d.file_path, d.paragraph_count,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id) as content_count
    FROM docs d
    WHERE d.author = 'The Báb'
      AND d.language IN ('ar', 'fa')
    ORDER BY d.paragraph_count DESC
    LIMIT 20
  `);

  console.log('\n=== Báb Tablets (largest first) ===\n');
  docs.forEach(d => {
    console.log(`  ${d.id}`);
    console.log(`    ${d.title}`);
    console.log(`    [${d.language.toUpperCase()}] ${d.content_count} paragraphs`);
    if (d.file_path) {
      console.log(`    ${d.file_path.split('/').slice(-2).join('/')}`);
    }
    console.log();
  });
  console.log('Run: node scripts/reingest-document.js <document-id>');
}

async function reingestDocument(docId) {
  // Get document with file path
  const doc = await queryOne('SELECT * FROM docs WHERE id = ?', [docId]);
  if (!doc) {
    console.error(`Document not found: ${docId}`);
    process.exit(1);
  }

  if (!doc.file_path) {
    console.error(`Document has no file path: ${docId}`);
    process.exit(1);
  }

  console.log('\n=== Document Info ===');
  console.log(`ID: ${doc.id}`);
  console.log(`Title: ${doc.title}`);
  console.log(`Language: ${doc.language}`);
  console.log(`File: ${doc.file_path}`);

  // Get existing paragraph stats
  const existingStats = await queryAll(`
    SELECT LENGTH(text) as chars
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [docId]);

  console.log(`\n=== BEFORE Re-Ingestion ===`);
  console.log(`Total paragraphs: ${existingStats.length}`);

  if (existingStats.length > 0) {
    const avgChars = Math.round(existingStats.reduce((sum, p) => sum + p.chars, 0) / existingStats.length);
    const minChars = Math.min(...existingStats.map(p => p.chars));
    const maxChars = Math.max(...existingStats.map(p => p.chars));
    console.log(`Avg chars per paragraph: ${avgChars}`);
    console.log(`Min: ${minChars}, Max: ${maxChars}`);

    // Show distribution
    console.log('\nParagraph size distribution:');
    const buckets = { '<200': 0, '200-500': 0, '500-1000': 0, '1000-1500': 0, '>1500': 0 };
    existingStats.forEach(p => {
      if (p.chars < 200) buckets['<200']++;
      else if (p.chars < 500) buckets['200-500']++;
      else if (p.chars < 1000) buckets['500-1000']++;
      else if (p.chars < 1500) buckets['1000-1500']++;
      else buckets['>1500']++;
    });
    Object.entries(buckets).forEach(([k, v]) => {
      if (v > 0) console.log(`  ${k}: ${v} paragraphs`);
    });
  }

  // Read source file (prepend library base path)
  const fullPath = join(libraryBase, doc.file_path);
  let fileContent;
  try {
    fileContent = await readFile(fullPath, 'utf-8');
    console.log(`\nFile read: ${fileContent.length} characters`);
  } catch (err) {
    console.error(`Cannot read file: ${err.message}`);
    console.error(`Full path: ${fullPath}`);
    process.exit(1);
  }

  // Let incremental logic preserve unchanged content - DON'T reset hashes!
  // The ingester will:
  // - Skip entirely if file_hash unchanged
  // - Update metadata only if body_hash unchanged (frontmatter-only change)
  // - Re-process content only if body actually changed
  console.log('\n=== Re-ingesting (incremental - unchanged content will be preserved)... ===');
  const existingParagraphs = await queryOne(
    'SELECT COUNT(*) as count FROM content WHERE doc_id = ?',
    [docId]
  );
  console.log(`Existing paragraphs: ${existingParagraphs?.count || 0}`);

  const result = await ingestDocument(fileContent, { id: docId }, doc.file_path);

  console.log(`\n=== AFTER Re-Ingestion ===`);
  console.log(`Status: ${result.status}`);
  console.log(`Total paragraphs: ${result.paragraphCount}`);
  console.log(`  Reused (unchanged): ${result.reusedParagraphs || 0}`);
  console.log(`  New/changed: ${result.newParagraphs || 0}`);
  console.log(`  Deleted: ${result.deletedParagraphs || 0}`);

  // Get new paragraph stats
  const newStats = await queryAll(`
    SELECT paragraph_index, LENGTH(text) as chars, SUBSTR(text, 1, 80) as preview
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [docId]);

  if (newStats.length > 0) {
    const avgChars = Math.round(newStats.reduce((sum, p) => sum + p.chars, 0) / newStats.length);
    const minChars = Math.min(...newStats.map(p => p.chars));
    const maxChars = Math.max(...newStats.map(p => p.chars));
    console.log(`Avg chars per paragraph: ${avgChars}`);
    console.log(`Min: ${minChars}, Max: ${maxChars}`);

    // Show distribution
    console.log('\nParagraph size distribution:');
    const buckets = { '<200': 0, '200-500': 0, '500-1000': 0, '1000-1500': 0, '>1500': 0 };
    newStats.forEach(p => {
      if (p.chars < 200) buckets['<200']++;
      else if (p.chars < 500) buckets['200-500']++;
      else if (p.chars < 1000) buckets['500-1000']++;
      else if (p.chars < 1500) buckets['1000-1500']++;
      else buckets['>1500']++;
    });
    Object.entries(buckets).forEach(([k, v]) => {
      if (v > 0) console.log(`  ${k}: ${v} paragraphs`);
    });

    // Show first few paragraphs for inspection
    console.log('\n=== Paragraph Previews (first 10) ===');
    newStats.slice(0, 10).forEach(p => {
      console.log(`\n[${p.paragraph_index + 1}] (${p.chars} chars)`);
      console.log(`  ${p.preview}...`);
    });
  }

  console.log('\n✅ Re-ingestion complete!');
  if (result.newParagraphs > 0) {
    console.log(`Note: ${result.newParagraphs} new/changed paragraphs need embeddings.`);
    console.log('Run the embedding worker or wait for the scheduled job.');
  }
  if (result.reusedParagraphs > 0) {
    console.log(`✓ ${result.reusedParagraphs} unchanged paragraphs kept their embeddings.`);
  }

  // Output JSON summary for frontend parsing
  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    documentId: docId,
    title: doc.title,
    language: doc.language,
    status: result.status,
    paragraphCount: result.paragraphCount,
    reusedParagraphs: result.reusedParagraphs || 0,
    newParagraphs: result.newParagraphs || 0,
    deletedParagraphs: result.deletedParagraphs || 0,
    avgCharsPerParagraph: newStats.length > 0
      ? Math.round(newStats.reduce((sum, p) => sum + p.chars, 0) / newStats.length)
      : 0
  }));
}

async function main() {
  if (args.includes('--list') || args.length === 0) {
    await listDocuments();
    return;
  }

  const docId = args[0];
  await reingestDocument(docId);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
