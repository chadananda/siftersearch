#!/usr/bin/env node
/**
 * Fix Hash Algorithm Migration
 *
 * Updates docs with MD5 hashes (32 chars) to SHA-256 hashes (64 chars)
 * for consistency with ingester.js
 *
 * This enables proper rename detection across all documents.
 *
 * Usage: node scripts/fix-hash-algorithm.js [--dry-run] [--force]
 *   --force: Re-compute body_hash for ALL documents (use after changing hash algorithm)
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { queryAll, query } from '../api/lib/db.js';
import { config } from '../api/lib/config.js';
import { hashContent, parseMarkdownFrontmatter } from '../api/services/ingester.js';

const dryRun = process.argv.includes('--dry-run');
const forceAll = process.argv.includes('--force');
const libraryBasePath = config.library.basePath;

async function main() {
  console.log('Fix Hash Algorithm Migration');
  console.log('============================');
  console.log(`Library: ${libraryBasePath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${forceAll ? ' (FORCE ALL)' : ''}`);
  console.log('');

  // Find docs to update
  const whereClause = forceAll
    ? 'WHERE file_path IS NOT NULL'  // All docs with file_path
    : 'WHERE file_path IS NOT NULL AND (length(file_hash) = 32 OR body_hash IS NULL)';

  const docsToFix = await queryAll(`
    SELECT id, file_path, file_hash, body_hash
    FROM docs
    ${whereClause}
  `);

  console.log(`Found ${docsToFix.length} documents to update`);
  console.log('');

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docsToFix) {
    const filePath = join(libraryBasePath, doc.file_path);

    try {
      // Read file content
      const text = await readFile(filePath, 'utf-8');

      // Compute hashes
      const fileHash = hashContent(text);
      const { content } = parseMarkdownFrontmatter(text);
      const bodyHash = hashContent(content);

      // Check if hashes changed (always update if --force)
      const hashChanged = doc.file_hash !== fileHash;
      const bodyHashChanged = doc.body_hash !== bodyHash;

      if (!forceAll && !hashChanged && !bodyHashChanged) {
        skipped++;
        continue;
      }

      console.log(`[${updated + 1}/${docsToFix.length}] ${doc.file_path}`);
      console.log(`  file_hash: ${doc.file_hash?.substring(0, 16)}... → ${fileHash.substring(0, 16)}...`);
      console.log(`  body_hash: ${doc.body_hash?.substring(0, 16) || 'NULL'}... → ${bodyHash.substring(0, 16)}...`);

      if (!dryRun) {
        await query(`
          UPDATE docs SET file_hash = ?, body_hash = ?, updated_at = datetime('now')
          WHERE id = ?
        `, [fileHash, bodyHash, doc.id]);
      }

      updated++;
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`  SKIP: File not found - ${doc.file_path}`);
        skipped++;
      } else {
        console.error(`  ERROR: ${err.message}`);
        errors++;
      }
    }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (dryRun) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  }

  // Exit cleanly (libsql may have hanging connections)
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
