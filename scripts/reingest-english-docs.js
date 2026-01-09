#!/usr/bin/env node
/**
 * Re-Ingest English Documents
 *
 * Re-ingests all English documents from source files to restore correct segmentation.
 * This removes incorrectly added sentence markers and restores original paragraph structure.
 *
 * Usage:
 *   node scripts/reingest-english-docs.js [--dry-run] [--limit N]
 */

import '../api/lib/config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { query, queryAll } from '../api/lib/db.js';
import { ingestDocument } from '../api/services/ingester.js';

const libraryBase = join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

async function main() {
  console.log('=== Re-Ingesting English Documents ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} documents`);
  console.log();

  // Get all English documents with content and file_path
  const docs = await queryAll(`
    SELECT d.id, d.title, d.file_path, d.language,
           (SELECT COUNT(*) FROM content WHERE doc_id = d.id) as paragraph_count
    FROM docs d
    WHERE d.language = 'en'
      AND d.file_path IS NOT NULL
      AND d.file_path != ''
      AND d.id IN (SELECT DISTINCT doc_id FROM content)
    ORDER BY d.id
    ${limit ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Found ${docs.length} English documents to re-ingest\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (const doc of docs) {
    const fullPath = join(libraryBase, doc.file_path);

    try {
      // Read source file
      const fileContent = await readFile(fullPath, 'utf-8');

      if (dryRun) {
        console.log(`[DRY RUN] Would re-ingest: ${doc.id} - ${doc.title?.substring(0, 50)}`);
        skipped++;
        continue;
      }

      // Delete existing content (force fresh segmentation)
      await query('DELETE FROM content WHERE doc_id = ?', [doc.id]);

      // Reset hashes to force full re-ingestion
      await query('UPDATE docs SET file_hash = NULL, body_hash = NULL WHERE id = ?', [doc.id]);

      // Re-ingest
      const result = await ingestDocument(fileContent, { id: doc.id }, doc.file_path);

      console.log(`✓ ${doc.id} - ${doc.title?.substring(0, 40)} (${result.paragraphCount} paragraphs)`);
      success++;

    } catch (err) {
      console.error(`✗ ${doc.id} - ${doc.title?.substring(0, 40)}: ${err.message}`);
      failed++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Summary ===');
  console.log(`Total: ${docs.length}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  if (dryRun) console.log(`Skipped (dry run): ${skipped}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Rate: ${(success / elapsed).toFixed(1)} docs/sec`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
