#!/usr/bin/env node

/**
 * Fix document descriptions from frontmatter
 *
 * Many documents have description = "From <file_path>" which is wrong.
 * This script reads the source files and extracts the actual description from frontmatter.
 */

import { query, queryAll, queryOne } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import { config } from '../api/lib/config.js';
import fs from 'fs/promises';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

async function main() {
  console.log('Fix Document Descriptions from Frontmatter');
  console.log('==========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // Find documents with bad descriptions (starting with "From ")
  const docs = await queryAll(`
    SELECT id, file_path, description
    FROM docs
    WHERE description LIKE 'From %'
      AND deleted_at IS NULL
    ORDER BY id
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Found ${docs.length} documents with "From ..." descriptions`);
  console.log('');

  const libraryBase = config.library.basePath;
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      // Construct file path
      const filePath = path.join(libraryBase, doc.file_path);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        if (verbose) console.log(`⚠️  File not found: ${doc.file_path}`);
        skipped++;
        continue;
      }

      // Read file and parse frontmatter
      const content = await fs.readFile(filePath, 'utf-8');
      const { metadata } = parseMarkdownFrontmatter(content);

      if (!metadata.description) {
        if (verbose) console.log(`⚠️  No description in frontmatter: ${doc.file_path}`);
        skipped++;
        continue;
      }

      // Update database
      if (!dryRun) {
        await query(
          'UPDATE docs SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [metadata.description, doc.id]
        );
      }

      fixed++;
      if (verbose || fixed % 100 === 0) {
        console.log(`✅ [${fixed}] ${doc.file_path.substring(0, 60)}...`);
        if (verbose) {
          console.log(`   Old: ${doc.description.substring(0, 50)}...`);
          console.log(`   New: ${metadata.description.substring(0, 50)}...`);
        }
      }
    } catch (err) {
      console.error(`❌ Error processing doc ${doc.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (dryRun) {
    console.log('');
    console.log('(Dry run - no changes made. Remove --dry-run to apply changes.)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
