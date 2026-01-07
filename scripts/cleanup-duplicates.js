#!/usr/bin/env node
/**
 * Cleanup Duplicate Documents Script
 *
 * Identifies and cleans up duplicate documents that may have been created
 * by the document update bug (where updates created new docs instead of updating).
 *
 * Usage:
 *   node scripts/cleanup-duplicates.js           # Dry run - report only
 *   node scripts/cleanup-duplicates.js --delete  # Actually delete duplicates
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const DELETE_MODE = process.argv.includes('--delete');

async function main() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  console.log(`Connecting to database: ${url}`);
  console.log(DELETE_MODE ? '*** DELETE MODE - Will remove duplicates ***' : '*** DRY RUN - Report only ***');
  console.log('');

  const db = createClient({ url });

  // 1. Find documents with same file_hash but different IDs
  console.log('=== Checking for duplicate file hashes ===');
  const hashDuplicates = await db.execute(`
    SELECT file_hash, COUNT(*) as count, GROUP_CONCAT(id, ', ') as ids
    FROM docs
    WHERE file_hash IS NOT NULL
    GROUP BY file_hash
    HAVING count > 1
  `);

  if (hashDuplicates.rows.length > 0) {
    console.log(`Found ${hashDuplicates.rows.length} duplicate file hashes:`);
    for (const row of hashDuplicates.rows) {
      console.log(`  Hash: ${row.file_hash?.substring(0, 16)}... - ${row.count} docs: ${row.ids}`);
    }
  } else {
    console.log('No duplicate file hashes found.');
  }
  console.log('');

  // 2. Find documents with NULL file_path that might be orphans
  console.log('=== Checking for documents with NULL file_path ===');
  const nullPathDocs = await db.execute(`
    SELECT id, title, file_hash, created_at
    FROM docs
    WHERE file_path IS NULL
    ORDER BY created_at DESC
  `);

  if (nullPathDocs.rows.length > 0) {
    console.log(`Found ${nullPathDocs.rows.length} documents with NULL file_path:`);
    for (const row of nullPathDocs.rows) {
      // Check if there's a doc with the same hash that has a file_path
      const matchingDoc = await db.execute(`
        SELECT id, file_path, title FROM docs
        WHERE file_hash = ? AND file_path IS NOT NULL
        LIMIT 1
      `, [row.file_hash]);

      const isDuplicate = matchingDoc.rows.length > 0;
      const status = isDuplicate ? `DUPLICATE of ${matchingDoc.rows[0].id}` : 'ORPHAN';
      console.log(`  ${row.id}: "${row.title?.substring(0, 40)}" [${status}]`);

      if (DELETE_MODE && isDuplicate) {
        console.log(`    -> Deleting duplicate document and its content...`);
        await db.execute('DELETE FROM content WHERE doc_id = ?', [row.id]);
        await db.execute('DELETE FROM docs WHERE id = ?', [row.id]);
        console.log(`    -> Deleted.`);
      }
    }
  } else {
    console.log('No documents with NULL file_path found.');
  }
  console.log('');

  // 3. Find documents with similar titles that might be duplicates
  console.log('=== Checking for potential duplicates by title ===');
  const titleDuplicates = await db.execute(`
    SELECT title, COUNT(*) as count, GROUP_CONCAT(id, ', ') as ids
    FROM docs
    WHERE title IS NOT NULL
    GROUP BY title
    HAVING count > 1
  `);

  if (titleDuplicates.rows.length > 0) {
    console.log(`Found ${titleDuplicates.rows.length} duplicate titles:`);
    for (const row of titleDuplicates.rows) {
      console.log(`  "${row.title?.substring(0, 50)}": ${row.count} docs - ${row.ids}`);
    }
  } else {
    console.log('No duplicate titles found.');
  }
  console.log('');

  // 4. Show statistics
  console.log('=== Document Statistics ===');
  const stats = await db.execute(`
    SELECT
      COUNT(*) as total_docs,
      COUNT(file_path) as docs_with_path,
      COUNT(*) - COUNT(file_path) as docs_without_path,
      (SELECT COUNT(*) FROM content) as total_paragraphs
    FROM docs
  `);

  const s = stats.rows[0];
  console.log(`  Total documents: ${s.total_docs}`);
  console.log(`  Documents with file_path: ${s.docs_with_path}`);
  console.log(`  Documents without file_path: ${s.docs_without_path}`);
  console.log(`  Total paragraphs: ${s.total_paragraphs}`);
  console.log('');

  // 5. Check for content orphans (content without a doc)
  console.log('=== Checking for orphaned content ===');
  const orphanedContent = await db.execute(`
    SELECT COUNT(*) as count FROM content
    WHERE doc_id NOT IN (SELECT id FROM docs)
  `);

  if (orphanedContent.rows[0].count > 0) {
    console.log(`Found ${orphanedContent.rows[0].count} orphaned content rows.`);
    if (DELETE_MODE) {
      await db.execute('DELETE FROM content WHERE doc_id NOT IN (SELECT id FROM docs)');
      console.log('  -> Deleted orphaned content.');
    }
  } else {
    console.log('No orphaned content found.');
  }
  console.log('');

  if (!DELETE_MODE) {
    console.log('To delete duplicates, run with --delete flag');
  }

  console.log('Done.');
}

main().catch(console.error);
