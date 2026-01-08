#!/usr/bin/env node

/**
 * Re-index documents that have file_path but no content in SQLite
 *
 * This script:
 * 1. Finds documents with file_path but no content
 * 2. Reads the source file and re-ingests using the ingester service
 */

import '../api/lib/config.js';
import { queryAll, query, queryOne } from '../api/lib/db.js';
import { ingestDocument } from '../api/services/ingester.js';
import config from '../api/lib/config.js';
import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || 999999;
const VERBOSE = process.argv.includes('--verbose');

async function reindexMissing() {
  console.log('Re-index Documents Missing Content');
  console.log('===================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Library base: ${config.library.basePath}`);
  console.log(`Limit: ${LIMIT === Infinity ? 'none' : LIMIT}\n`);

  // Find documents with file_path but no content
  const docs = await queryAll(`
    SELECT d.id, d.file_path, d.title
    FROM docs d
    WHERE d.file_path IS NOT NULL AND d.file_path != ''
    AND NOT EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id)
    ORDER BY d.id
    LIMIT ?
  `, [LIMIT]);

  console.log(`Found ${docs.length} documents to re-index\n`);

  let success = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    // file_path is always relative to basePath
    const fullPath = path.join(config.library.basePath, doc.file_path);

    if (VERBOSE || (i + 1) % 100 === 0) {
      console.log(`[${i + 1}/${docs.length}] Processing: ${doc.title || doc.file_path}`);
    }

    try {
      // Read file content
      const fileContent = await fs.readFile(fullPath, 'utf-8');

      if (DRY_RUN) {
        if (VERBOSE) console.log(`  [DRY RUN] Would re-index: ${doc.file_path} (${fileContent.length} chars)`);
        success++;
        continue;
      }

      // Clear existing content and file_hash to force re-ingestion
      await query('DELETE FROM content WHERE doc_id = ?', [doc.id]);
      await query('UPDATE docs SET file_hash = NULL WHERE id = ?', [doc.id]);

      // Re-ingest the document
      const result = await ingestDocument(fileContent, { id: doc.id }, doc.file_path);

      if (result.paragraphCount > 0) {
        success++;
        if (VERBOSE) console.log(`  ✓ Indexed ${result.paragraphCount} paragraphs`);
      } else {
        skipped++;
        if (VERBOSE) console.log(`  ⚠ No paragraphs extracted`);
      }
    } catch (err) {
      errors++;
      if (err.code === 'ENOENT') {
        if (VERBOSE) console.log(`  ✗ File not found: ${doc.file_path}`);
      } else {
        console.error(`  ✗ Error for ${doc.id}: ${err.message}`);
      }
    }

    // Progress every 100
    if ((i + 1) % 100 === 0 && !VERBOSE) {
      console.log(`Progress: ${i + 1}/${docs.length} (${success} success, ${errors} errors)`);
    }
  }

  console.log('\n===================================');
  console.log('Summary:');
  console.log(`  Processed: ${docs.length}`);
  console.log(`  Success: ${success}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Skipped (no paragraphs): ${skipped}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }

  // Verify
  if (!DRY_RUN) {
    const remaining = await queryOne(`
      SELECT COUNT(*) as count
      FROM docs d
      WHERE d.file_path IS NOT NULL AND d.file_path != ''
      AND NOT EXISTS (SELECT 1 FROM content c WHERE c.doc_id = d.id)
    `);
    console.log(`\nRemaining docs without content: ${remaining?.count || 0}`);
  }
}

reindexMissing().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
