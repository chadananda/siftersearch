#!/usr/bin/env node
/**
 * Backfill file_hash for existing documents
 *
 * For documents WITH file_path: reads source file and computes SHA256 hash
 * For documents WITHOUT file_path: reconstructs content from paragraphs and computes hash
 *
 * This enables proper deduplication by file content.
 *
 * Usage: node scripts/backfill-file-hash.js [--dry-run] [--limit=N]
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { query, queryAll, queryOne } from '../api/lib/db.js';
import { config } from '../api/lib/config.js';

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function hashContent(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function backfill() {
  console.log('Backfill file_hash for Documents');
  console.log('=================================');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE');
  console.log('Library base:', config.library.basePath);
  if (LIMIT < Infinity) console.log('Limit:', LIMIT);
  console.log('');

  const stats = {
    total: 0,
    fromFile: 0,
    fromContent: 0,
    alreadyHashed: 0,
    fileNotFound: 0,
    errors: 0
  };

  // Get all documents without file_hash
  const docs = await queryAll(`
    SELECT id, file_path, title
    FROM docs
    WHERE file_hash IS NULL OR file_hash = ''
    ORDER BY file_path DESC
    LIMIT ?
  `, [LIMIT]);

  console.log(`Found ${docs.length} documents without file_hash`);
  console.log('');

  for (const doc of docs) {
    stats.total++;

    try {
      let hash = null;
      let source = null;

      // Try to read from file_path first
      if (doc.file_path) {
        // Handle both absolute and relative paths
        let filePath = doc.file_path;
        if (!filePath.startsWith('/')) {
          filePath = `${config.library.basePath}/${filePath}`;
        }

        if (existsSync(filePath)) {
          const content = await readFile(filePath, 'utf-8');
          hash = hashContent(content);
          source = 'file';
          stats.fromFile++;
        } else {
          // File not found - try to reconstruct from content
          source = 'content_fallback';
          stats.fileNotFound++;
        }
      }

      // Fall back to reconstructing from stored content
      if (!hash) {
        const paragraphs = await queryAll(
          'SELECT text FROM content WHERE doc_id = ? ORDER BY paragraph_index',
          [doc.id]
        );

        if (paragraphs.length > 0) {
          const reconstructedContent = paragraphs.map(p => p.text).join('\n\n');
          hash = hashContent(reconstructedContent);
          source = source || 'content';
          stats.fromContent++;
        }
      }

      if (hash) {
        if (DRY_RUN) {
          console.log(`[DRY] ${doc.id}: ${hash.substring(0, 12)}... (${source})`);
        } else {
          await query('UPDATE docs SET file_hash = ? WHERE id = ?', [hash, doc.id]);
          if (stats.total % 100 === 0) {
            console.log(`Processed ${stats.total}/${docs.length}...`);
          }
        }
      } else {
        console.warn(`Warning: No content for ${doc.id}`);
        stats.errors++;
      }
    } catch (err) {
      console.error(`Error processing ${doc.id}: ${err.message}`);
      stats.errors++;
    }
  }

  // Check for duplicate hashes after backfill
  console.log('');
  console.log('Checking for duplicates after backfill...');

  const duplicates = await queryAll(`
    SELECT file_hash, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM docs
    WHERE file_hash IS NOT NULL AND file_hash != ''
    GROUP BY file_hash
    HAVING cnt > 1
    ORDER BY cnt DESC
    LIMIT 20
  `);

  if (duplicates.length > 0) {
    console.log(`Found ${duplicates.length} file hashes with duplicate documents:`);
    for (const dup of duplicates.slice(0, 10)) {
      console.log(`  Hash ${dup.file_hash.substring(0, 12)}...: ${dup.cnt} docs`);
      const ids = dup.ids.split(',');
      for (const id of ids.slice(0, 3)) {
        const doc = await queryOne('SELECT id, file_path, title FROM docs WHERE id = ?', [id]);
        console.log(`    - ${doc?.id || id}: ${doc?.title || 'unknown'}`);
      }
      if (ids.length > 3) {
        console.log(`    ... and ${ids.length - 3} more`);
      }
    }
    console.log('');
    console.log('Run cleanup-duplicates.js again to remove these duplicates.');
  } else {
    console.log('No duplicate hashes found!');
  }

  // Summary
  console.log('');
  console.log('=================================');
  console.log('Summary');
  console.log('=================================');
  console.log(`Total processed: ${stats.total}`);
  console.log(`Hashed from file: ${stats.fromFile}`);
  console.log(`Hashed from content: ${stats.fromContent}`);
  console.log(`Files not found: ${stats.fileNotFound}`);
  console.log(`Errors: ${stats.errors}`);

  if (DRY_RUN) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  }

  // Final hash coverage
  const hashCoverage = await queryOne(`
    SELECT
      SUM(CASE WHEN file_hash IS NOT NULL AND file_hash != '' THEN 1 ELSE 0 END) as with_hash,
      COUNT(*) as total
    FROM docs
  `);
  console.log('');
  console.log(`Hash coverage: ${hashCoverage?.with_hash || 0}/${hashCoverage?.total || 0} documents`);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
