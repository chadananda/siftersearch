#!/usr/bin/env node

/**
 * Sync document metadata from source files
 *
 * Updates title and description in database from frontmatter
 * for all documents where they differ.
 */

import { query, queryAll } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import { config } from '../api/lib/config.js';
import fs from 'fs/promises';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

async function main() {
  console.log('Sync Document Metadata from Source Files');
  console.log('========================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // Get all active documents
  const docs = await queryAll(`
    SELECT id, file_path, title, description
    FROM docs
    WHERE deleted_at IS NULL
    ORDER BY id
    ${limit > 0 ? `LIMIT ${limit}` : ''}
  `);

  console.log(`Checking ${docs.length} documents...`);
  console.log('');

  const libraryBase = config.library.basePath;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let unchanged = 0;

  for (const doc of docs) {
    try {
      const filePath = path.join(libraryBase, doc.file_path);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        skipped++;
        continue;
      }

      // Read and parse
      const content = await fs.readFile(filePath, 'utf-8');
      const { metadata } = parseMarkdownFrontmatter(content);

      // Check what needs updating
      const updates = [];
      const values = [];

      if (metadata.title && metadata.title !== doc.title) {
        updates.push('title = ?');
        values.push(metadata.title);
      }

      if (metadata.description && metadata.description !== doc.description) {
        updates.push('description = ?');
        values.push(metadata.description);
      }

      if (updates.length === 0) {
        unchanged++;
        continue;
      }

      // Update
      if (!dryRun) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(doc.id);
        await query(
          `UPDATE docs SET ${updates.slice(0, -1).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          values
        );
      }

      updated++;
      if (verbose || updated % 100 === 0) {
        console.log(`✅ [${updated}] ${doc.file_path.substring(0, 60)}`);
        if (verbose && metadata.title !== doc.title) {
          console.log(`   Title: "${doc.title?.substring(0, 40)}" → "${metadata.title?.substring(0, 40)}"`);
        }
        if (verbose && metadata.description !== doc.description) {
          console.log(`   Desc updated`);
        }
      }
    } catch (err) {
      if (verbose) console.error(`❌ Doc ${doc.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Updated: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped (file not found): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (dryRun) {
    console.log('');
    console.log('(Dry run - no changes made)');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
