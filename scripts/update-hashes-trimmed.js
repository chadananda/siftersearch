#!/usr/bin/env node
/**
 * Update document hashes to use trimmed content
 *
 * This script updates file_hash and body_hash to use trimmed content,
 * WITHOUT re-processing the actual content. This fixes the hash mismatch
 * issue where whitespace differences caused unnecessary re-ingestion.
 *
 * Usage: node scripts/update-hashes-trimmed.js [--dry-run]
 */

import '../api/lib/config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { query, queryAll } from '../api/lib/db.js';
import { parseMarkdownFrontmatter } from '../api/services/ingester.js';
import config from '../api/lib/config.js';

const dryRun = process.argv.includes('--dry-run');

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function main() {
  console.log(`\n=== Update Hashes to Trimmed (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Get all documents with file paths
  const docs = await queryAll(`
    SELECT id, title, file_path, file_hash, body_hash
    FROM docs
    WHERE file_path IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY id
  `);

  console.log(`Found ${docs.length} documents to check\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    try {
      const fullPath = doc.file_path.startsWith('/')
        ? doc.file_path
        : join(config.library.basePath, doc.file_path);

      // Read source file
      let content;
      try {
        content = await readFile(fullPath, 'utf-8');
      } catch (err) {
        // File not found - skip
        skipped++;
        continue;
      }

      // Compute new trimmed hashes
      const { content: bodyContent } = parseMarkdownFrontmatter(content);
      const newFileHash = hashContent(content.trim());
      const newBodyHash = hashContent(bodyContent.trim());

      // Check if hashes changed
      const fileHashChanged = doc.file_hash !== newFileHash;
      const bodyHashChanged = doc.body_hash !== newBodyHash;

      if (fileHashChanged || bodyHashChanged) {
        console.log(`${doc.id}: ${doc.title?.slice(0, 50)}`);
        if (fileHashChanged) console.log(`  file_hash: ${doc.file_hash?.slice(0, 16)}... → ${newFileHash.slice(0, 16)}...`);
        if (bodyHashChanged) console.log(`  body_hash: ${doc.body_hash?.slice(0, 16)}... → ${newBodyHash.slice(0, 16)}...`);

        if (!dryRun) {
          await query(`
            UPDATE docs SET file_hash = ?, body_hash = ? WHERE id = ?
          `, [newFileHash, newBodyHash, doc.id]);
        }
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`Error processing ${doc.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (unchanged): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (dryRun && updated > 0) {
    console.log(`\nRun without --dry-run to apply changes.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
