#!/usr/bin/env node
/**
 * Cleanup Duplicate Documents Script
 *
 * Usage:
 *   node scripts/cleanup-duplicates.js           # Dry run
 *   node scripts/cleanup-duplicates.js --delete  # Delete duplicates
 */

import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const DELETE_MODE = process.argv.includes('--delete');

function stripFilePrefix(url) { return url.startsWith('file:') ? url.slice(5) : url; }

async function main() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url);
  console.log(`Connecting to database: ${path}`);
  console.log(DELETE_MODE ? '*** DELETE MODE ***' : '*** DRY RUN ***');
  console.log('');

  const db = new Database(path);
  db.pragma('journal_mode = WAL');

  console.log('=== Checking for duplicate file hashes ===');
  const hashDuplicates = db.prepare(`SELECT file_hash, COUNT(*) as count, GROUP_CONCAT(id, ', ') as ids FROM docs WHERE file_hash IS NOT NULL GROUP BY file_hash HAVING count > 1`).all();
  if (hashDuplicates.length > 0) {
    console.log(`Found ${hashDuplicates.length} duplicate file hashes:`);
    for (const row of hashDuplicates) console.log(`  Hash: ${row.file_hash?.substring(0, 16)}... - ${row.count} docs: ${row.ids}`);
  } else {
    console.log('No duplicate file hashes found.');
  }
  console.log('');

  console.log('=== Checking for documents with NULL file_path ===');
  const nullPathDocs = db.prepare(`SELECT id, title, file_hash, created_at FROM docs WHERE file_path IS NULL ORDER BY created_at DESC`).all();
  if (nullPathDocs.length > 0) {
    console.log(`Found ${nullPathDocs.length} documents with NULL file_path:`);
    for (const row of nullPathDocs) {
      const matchingDoc = db.prepare(`SELECT id, file_path, title FROM docs WHERE file_hash = ? AND file_path IS NOT NULL LIMIT 1`).get(row.file_hash);
      const isDuplicate = !!matchingDoc;
      const status = isDuplicate ? `DUPLICATE of ${matchingDoc.id}` : 'ORPHAN';
      console.log(`  ${row.id}: "${row.title?.substring(0, 40)}" [${status}]`);
      if (DELETE_MODE && isDuplicate) {
        db.prepare('DELETE FROM content WHERE doc_id = ?').run(row.id);
        db.prepare('DELETE FROM docs WHERE id = ?').run(row.id);
        console.log(`    -> Deleted.`);
      }
    }
  } else {
    console.log('No documents with NULL file_path found.');
  }
  console.log('');

  console.log('=== Checking for potential duplicates by title ===');
  const titleDuplicates = db.prepare(`SELECT title, COUNT(*) as count, GROUP_CONCAT(id, ', ') as ids FROM docs WHERE title IS NOT NULL GROUP BY title HAVING count > 1`).all();
  if (titleDuplicates.length > 0) {
    console.log(`Found ${titleDuplicates.length} duplicate titles:`);
    for (const row of titleDuplicates) console.log(`  "${row.title?.substring(0, 50)}": ${row.count} docs - ${row.ids}`);
  } else {
    console.log('No duplicate titles found.');
  }
  console.log('');

  console.log('=== Document Statistics ===');
  const s = db.prepare(`SELECT COUNT(*) as total_docs, COUNT(file_path) as docs_with_path, COUNT(*) - COUNT(file_path) as docs_without_path, (SELECT COUNT(*) FROM content) as total_paragraphs FROM docs`).get();
  console.log(`  Total documents: ${s.total_docs}`);
  console.log(`  Documents with file_path: ${s.docs_with_path}`);
  console.log(`  Documents without file_path: ${s.docs_without_path}`);
  console.log(`  Total paragraphs: ${s.total_paragraphs}`);
  console.log('');

  console.log('=== Checking for orphaned content ===');
  const { count: orphanCount } = db.prepare(`SELECT COUNT(*) as count FROM content WHERE doc_id NOT IN (SELECT id FROM docs)`).get();
  if (orphanCount > 0) {
    console.log(`Found ${orphanCount} orphaned content rows.`);
    if (DELETE_MODE) { db.prepare('DELETE FROM content WHERE doc_id NOT IN (SELECT id FROM docs)').run(); console.log('  -> Deleted orphaned content.'); }
  } else {
    console.log('No orphaned content found.');
  }
  console.log('');

  if (!DELETE_MODE) console.log('To delete duplicates, run with --delete flag');
  console.log('Done.');
  db.close();
}

main().catch(console.error);
