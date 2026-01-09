#!/usr/bin/env node
/**
 * Fix documents with frontmatter in first paragraph
 *
 * These documents were ingested before the duplicate frontmatter fix.
 * This script finds them, clears their content, and re-ingests from source.
 */

import { queryAll, query } from '../api/lib/db.js';
import { ingestDocument } from '../api/services/ingester.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Library paths to search for source files
const LIBRARY_PATHS = [
  '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library'
];

async function findAffectedDocuments() {
  const rows = await queryAll(`
    SELECT DISTINCT c.doc_id, d.title, d.file_path
    FROM content c
    JOIN docs d ON c.doc_id = d.id
    WHERE c.paragraph_index = 0
      AND (c.text LIKE '---%' OR c.text LIKE 'id:%' OR c.text LIKE 'title:%')
    ORDER BY c.doc_id
  `);
  return rows;
}

async function findSourceFile(relativePath) {
  for (const basePath of LIBRARY_PATHS) {
    const fullPath = join(basePath, relativePath);
    try {
      const content = await readFile(fullPath, 'utf-8');
      return { path: fullPath, content };
    } catch {
      // Try next path
    }
  }
  return null;
}

async function fixDocument(docId, title, filePath) {
  // Find and read source file
  const source = await findSourceFile(filePath);
  if (!source) {
    console.log(`  ⚠️  Source file not found: ${filePath}`);
    return { status: 'skipped', reason: 'source_not_found' };
  }

  // Clear existing content and reset body_hash
  await query(`DELETE FROM content WHERE doc_id = ?`, [docId]);
  await query(`UPDATE docs SET body_hash = '' WHERE id = ?`, [docId]);

  // Re-ingest with the fixed parser
  try {
    const result = await ingestDocument(source.content, { id: docId }, filePath);
    return { status: 'fixed', paragraphs: result.paragraphCount };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];

  console.log('Finding documents with frontmatter in first paragraph...\n');

  let docs = await findAffectedDocuments();
  console.log(`Found ${docs.length} affected documents\n`);

  if (limit) {
    docs = docs.slice(0, parseInt(limit));
    console.log(`Processing first ${docs.length} documents (--limit=${limit})\n`);
  }

  if (dryRun) {
    console.log('DRY RUN - No changes will be made\n');
    for (const doc of docs) {
      console.log(`[${doc.doc_id}] ${doc.title}`);
      console.log(`    File: ${doc.file_path}\n`);
    }
    return;
  }

  const stats = { fixed: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    console.log(`[${i + 1}/${docs.length}] Fixing doc ${doc.doc_id}: ${doc.title?.substring(0, 50)}...`);

    const result = await fixDocument(doc.doc_id, doc.title, doc.file_path);

    if (result.status === 'fixed') {
      console.log(`  ✅ Fixed (${result.paragraphs} paragraphs)`);
      stats.fixed++;
    } else if (result.status === 'skipped') {
      stats.skipped++;
    } else {
      stats.errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Fixed: ${stats.fixed}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
