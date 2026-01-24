#!/usr/bin/env node
/**
 * Deduplicate documents by title + collection
 * Keeps the most recently modified version
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN = !process.argv.includes('--delete');

async function main() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  console.log(DRY_RUN ? '🔍 DRY RUN MODE' : '⚠️  DELETE MODE');
  console.log('');

  const db = createClient({ url });

  // Find documents with duplicate titles within the same religion/collection
  const duplicates = await db.execute(`
    SELECT title, religion, collection, GROUP_CONCAT(id, ',') as ids, COUNT(*) as count
    FROM docs
    WHERE deleted_at IS NULL AND title IS NOT NULL AND title != ''
    GROUP BY title, religion, collection
    HAVING count > 1
    ORDER BY count DESC, title
  `);

  console.log(`Found ${duplicates.rows.length} groups of duplicate titles`);
  console.log('');

  let totalDuplicates = 0;
  let totalDeleted = 0;

  for (const dup of duplicates.rows) {
    const ids = dup.ids.split(',').map(id => parseInt(id));
    totalDuplicates += ids.length - 1; // -1 because we keep one

    console.log(`📄 "${dup.title}" (${dup.count} copies)`);
    console.log(`   ${dup.religion} → ${dup.collection}`);

    // Get full details for each duplicate
    const docs = await db.execute(`
      SELECT id, file_path, file_hash, paragraph_count, created_at, updated_at
      FROM docs
      WHERE id IN (${ids.join(',')})
      ORDER BY updated_at DESC, paragraph_count DESC
    `);

    // Keep the most recently updated one with the most content
    const keepDoc = docs.rows[0];
    const deleteIds = docs.rows.slice(1).map(d => d.id);

    console.log(`   ✅ KEEP: ${keepDoc.id} (${keepDoc.paragraph_count} ¶, updated: ${keepDoc.updated_at?.substring(0, 10)})`);
    console.log(`          ${keepDoc.file_path?.substring(0, 80)}`);

    for (const doc of docs.rows.slice(1)) {
      console.log(`   🗑️  DELETE: ${doc.id} (${doc.paragraph_count} ¶, updated: ${doc.updated_at?.substring(0, 10)})`);
      console.log(`          ${doc.file_path?.substring(0, 80)}`);

      if (!DRY_RUN) {
        // Soft delete
        await db.execute('UPDATE docs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [doc.id]);
        await db.execute('UPDATE content SET deleted_at = CURRENT_TIMESTAMP WHERE doc_id = ?', [doc.id]);
        totalDeleted++;
      }
    }

    console.log('');
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total duplicate documents: ${totalDuplicates}`);
  if (DRY_RUN) {
    console.log(`\n   Run with --delete to remove duplicates`);
  } else {
    console.log(`   Deleted: ${totalDeleted}`);
  }
}

main().catch(console.error);
