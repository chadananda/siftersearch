#!/usr/bin/env node

/**
 * Fix corrupted document titles by re-reading from frontmatter
 *
 * This script:
 * 1. Finds documents with file_path
 * 2. Reads the source file
 * 3. Extracts the correct title from frontmatter
 * 4. Updates just the title in the database
 *
 * Does NOT regenerate embeddings or paragraphs - just fixes titles.
 */

import fs from 'fs/promises';
import path from 'path';
import { query, queryAll } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import config from '../api/lib/config.js';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function fixTitles() {
  console.log('Fix Document Titles from Frontmatter');
  console.log('====================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Library base: ${config.library.basePath}\n`);

  // Get all documents with file_path
  const docs = await queryAll(`
    SELECT id, title, file_path
    FROM docs
    WHERE file_path IS NOT NULL AND file_path != ''
    ORDER BY id
  `);

  console.log(`Found ${docs.length} documents with file_path\n`);

  let fixed = 0;
  let skipped = 0;
  let errors = 0;
  let unchanged = 0;

  for (const doc of docs) {
    const fullPath = path.join(config.library.basePath, doc.file_path);

    try {
      // Read source file
      const content = await fs.readFile(fullPath, 'utf-8');

      // Parse frontmatter
      const { metadata } = parseMarkdownFrontmatter(content);

      if (!metadata.title) {
        if (VERBOSE) console.log(`[SKIP] Doc ${doc.id}: No title in frontmatter`);
        skipped++;
        continue;
      }

      // Compare titles
      if (metadata.title === doc.title) {
        if (VERBOSE) console.log(`[OK] Doc ${doc.id}: Title unchanged`);
        unchanged++;
        continue;
      }

      // Title is different - needs update
      console.log(`[FIX] Doc ${doc.id}:`);
      console.log(`  Old: ${doc.title}`);
      console.log(`  New: ${metadata.title}`);

      if (!DRY_RUN) {
        await query(
          `UPDATE docs SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [metadata.title, doc.id]
        );
      }

      fixed++;
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (VERBOSE) console.log(`[MISS] Doc ${doc.id}: File not found: ${doc.file_path}`);
      } else {
        console.error(`[ERR] Doc ${doc.id}: ${err.message}`);
      }
      errors++;
    }
  }

  console.log('\n====================================');
  console.log('Summary:');
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped (no frontmatter title): ${skipped}`);
  console.log(`  Errors (file not found, etc): ${errors}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  }
}

fixTitles().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
