#!/usr/bin/env node
/**
 * Deduplicate documents by title + collection
 * Keeps the most recently modified version
 */

import Database from 'better-sqlite3';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = !process.argv.includes('--delete');

function stripFilePrefix(url) { return url.startsWith('file:') ? url.slice(5) : url; }

async function main() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url);
  console.log(DRY_RUN ? 'DRY RUN MODE' : 'DELETE MODE');
  console.log('');

  const db = new Database(path);
  db.pragma('journal_mode = WAL');

  const duplicates = db.prepare(`
    SELECT title, religion, collection, GROUP_CONCAT(id, ',') as ids, COUNT(*) as count
    FROM docs
    WHERE deleted_at IS NULL AND title IS NOT NULL AND title != ''
    GROUP BY title, religion, collection
    HAVING count > 1
    ORDER BY count DESC, title
  `).all();

  console.log(`Found ${duplicates.length} groups of duplicate titles`);
  console.log('');

  let totalDuplicates = 0;
  let totalDeleted = 0;

  for (const dup of duplicates) {
    const ids = dup.ids.split(',').map(id => parseInt(id));
    totalDuplicates += ids.length - 1;
    console.log(`"${dup.title}" (${dup.count} copies)`);
    console.log(`   ${dup.religion} -> ${dup.collection}`);

    const docs = db.prepare(`SELECT id, file_path, file_hash, paragraph_count, created_at, updated_at FROM docs WHERE id IN (${ids.join(',')}) ORDER BY updated_at DESC, paragraph_count DESC`).all();
    const keepDoc = docs[0];
    console.log(`   KEEP: ${keepDoc.id} (${keepDoc.paragraph_count} paragraphs, updated: ${keepDoc.updated_at?.substring(0, 10)})`);
    console.log(`          ${keepDoc.file_path?.substring(0, 80)}`);

    for (const doc of docs.slice(1)) {
      console.log(`   DELETE: ${doc.id} (${doc.paragraph_count} paragraphs, updated: ${doc.updated_at?.substring(0, 10)})`);
      console.log(`          ${doc.file_path?.substring(0, 80)}`);
      if (!DRY_RUN) {
        db.prepare('UPDATE docs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(doc.id);
        db.prepare('UPDATE content SET deleted_at = CURRENT_TIMESTAMP WHERE doc_id = ?').run(doc.id);
        totalDeleted++;
      }
    }
    console.log('');
  }

  console.log(`\nSummary:`);
  console.log(`   Total duplicate documents: ${totalDuplicates}`);
  if (DRY_RUN) console.log(`\n   Run with --delete to remove duplicates`);
  else console.log(`   Deleted: ${totalDeleted}`);

  db.close();
}

main().catch(console.error);
