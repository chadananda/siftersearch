#!/usr/bin/env node
/**
 * Cleanup Duplicate Documents
 *
 * Finds and removes duplicate documents based on:
 * 1. file_hash - same content in different locations
 * 2. documents without file_path that have counterparts with file_path
 *
 * Usage: node scripts/cleanup-duplicates.js [--dry-run]
 */

import { query, queryAll, queryOne } from '../api/lib/db.js';
import { getMeili, INDEXES } from '../api/lib/search.js';

const DRY_RUN = process.argv.includes('--dry-run');

async function cleanup() {
  console.log('Cleanup Duplicate Documents');
  console.log('===========================');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE');
  console.log('');

  const stats = {
    duplicatesByHash: 0,
    orphanedContent: 0,
    totalRemoved: 0
  };

  // 1. Find duplicate documents by file_hash
  console.log('Step 1: Finding duplicates by file_hash...');
  const duplicateHashes = await queryAll(`
    SELECT file_hash, COUNT(*) as cnt
    FROM docs
    WHERE file_hash IS NOT NULL AND file_hash != ''
    GROUP BY file_hash
    HAVING cnt > 1
  `);

  console.log(`Found ${duplicateHashes.length} file hashes with duplicates`);

  for (const { file_hash } of duplicateHashes) {
    // Get all docs with this hash
    const docs = await queryAll(`
      SELECT id, file_path, title, created_at
      FROM docs
      WHERE file_hash = ?
      ORDER BY
        CASE WHEN file_path IS NOT NULL AND file_path != '' THEN 0 ELSE 1 END,
        created_at ASC
    `, [file_hash]);

    // Keep the first one (has file_path, or oldest)
    const keep = docs[0];
    const remove = docs.slice(1);

    console.log(`  Hash ${file_hash.substring(0, 12)}...:`);
    console.log(`    Keep: ${keep.id} (${keep.file_path || 'no path'})`);

    for (const doc of remove) {
      console.log(`    Remove: ${doc.id} (${doc.file_path || 'no path'})`);

      if (!DRY_RUN) {
        // Delete from Meilisearch
        try {
          const meili = getMeili();
          await meili.index(INDEXES.DOCUMENTS).deleteDocument(doc.id);
          // Delete paragraphs
          const paragraphs = await queryAll(
            'SELECT id FROM content WHERE doc_id = ?',
            [doc.id]
          );
          if (paragraphs.length > 0) {
            await meili.index(INDEXES.PARAGRAPHS).deleteDocuments(
              paragraphs.map(p => p.id)
            );
          }
        } catch (err) {
          console.warn(`    Warning: Meilisearch delete failed: ${err.message}`);
        }

        // Delete from SQLite
        await query('DELETE FROM content WHERE doc_id = ?', [doc.id]);
        await query('DELETE FROM docs WHERE id = ?', [doc.id]);
      }

      stats.duplicatesByHash++;
      stats.totalRemoved++;
    }
  }

  // 2. Find documents without file_path that match titles of documents with file_path
  console.log('');
  console.log('Step 2: Finding orphaned documents (no file_path)...');

  // Get orphaned docs that might be duplicates
  const orphanedDocs = await queryAll(`
    SELECT d1.id, d1.title, d1.author, d1.religion, d1.collection
    FROM docs d1
    WHERE (d1.file_path IS NULL OR d1.file_path = '')
      AND EXISTS (
        SELECT 1 FROM docs d2
        WHERE d2.file_path IS NOT NULL
          AND d2.file_path != ''
          AND d2.title = d1.title
          AND d2.author = d1.author
          AND d2.religion = d1.religion
      )
  `);

  console.log(`Found ${orphanedDocs.length} orphaned docs with matching file-backed versions`);

  for (const doc of orphanedDocs) {
    console.log(`  Remove orphan: ${doc.id} - "${doc.title}" by ${doc.author}`);

    if (!DRY_RUN) {
      // Delete from Meilisearch
      try {
        const meili = getMeili();
        await meili.index(INDEXES.DOCUMENTS).deleteDocument(doc.id);
        const paragraphs = await queryAll(
          'SELECT id FROM content WHERE doc_id = ?',
          [doc.id]
        );
        if (paragraphs.length > 0) {
          await meili.index(INDEXES.PARAGRAPHS).deleteDocuments(
            paragraphs.map(p => p.id)
          );
        }
      } catch (err) {
        console.warn(`    Warning: Meilisearch delete failed: ${err.message}`);
      }

      // Delete from SQLite
      await query('DELETE FROM content WHERE doc_id = ?', [doc.id]);
      await query('DELETE FROM docs WHERE id = ?', [doc.id]);
    }

    stats.orphanedContent++;
    stats.totalRemoved++;
  }

  // 3. Clean up orphaned content (content rows without parent doc)
  console.log('');
  console.log('Step 3: Finding orphaned content rows...');

  const orphanedContent = await queryAll(`
    SELECT c.id, c.doc_id
    FROM content c
    LEFT JOIN docs d ON c.doc_id = d.id
    WHERE d.id IS NULL
    LIMIT 100
  `);

  console.log(`Found ${orphanedContent.length} orphaned content rows`);

  if (orphanedContent.length > 0 && !DRY_RUN) {
    const ids = orphanedContent.map(c => c.id);
    await query(`DELETE FROM content WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  }

  // Summary
  console.log('');
  console.log('===========================');
  console.log('Summary');
  console.log('===========================');
  console.log(`Duplicates by hash removed: ${stats.duplicatesByHash}`);
  console.log(`Orphaned docs removed: ${stats.orphanedContent}`);
  console.log(`Total documents removed: ${stats.totalRemoved}`);
  console.log(`Orphaned content rows: ${orphanedContent.length}`);

  if (DRY_RUN) {
    console.log('');
    console.log('This was a dry run. Run without --dry-run to apply changes.');
  }

  // Final counts
  const finalCount = await queryOne('SELECT COUNT(*) as count FROM docs');
  const contentCount = await queryOne('SELECT COUNT(*) as count FROM content');
  console.log('');
  console.log(`Final document count: ${finalCount?.count || 0}`);
  console.log(`Final content count: ${contentCount?.count || 0}`);
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
