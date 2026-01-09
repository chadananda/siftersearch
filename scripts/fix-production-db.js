#!/usr/bin/env node
/**
 * Fix Production Database
 *
 * Run this ONCE on production to:
 * 1. Fix religion/collection from file_path
 * 2. Delete orphan documents (no file_path, no content)
 * 3. Strip sentence markers from English content
 *
 * Usage:
 *   node scripts/fix-production-db.js [--dry-run]
 */

import '../api/lib/config.js';
import { query, queryOne, queryAll } from '../api/lib/db.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  console.log('=== Production Database Fix ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // 1. Fix religion from file_path
  console.log('1. Fixing religion from file_path...');
  const religionQuery = `
    UPDATE docs SET
      religion = CASE
        WHEN file_path LIKE 'Baha%i/%' THEN 'Baha''i'
        WHEN file_path LIKE 'Islam/%' THEN 'Islam'
        WHEN file_path LIKE 'Christianity/%' THEN 'Christianity'
        WHEN file_path LIKE 'Judaism/%' THEN 'Judaism'
        WHEN file_path LIKE 'Buddhism/%' THEN 'Buddhism'
        WHEN file_path LIKE 'Hinduism/%' THEN 'Hinduism'
        ELSE religion
      END
    WHERE file_path IS NOT NULL AND file_path != ''
  `;

  if (!dryRun) {
    const result = await query(religionQuery);
    console.log(`   Updated ${result.changes} documents`);
  } else {
    const count = await queryOne(`SELECT COUNT(*) as c FROM docs WHERE file_path IS NOT NULL AND file_path != ''`);
    console.log(`   Would update up to ${count.c} documents`);
  }

  // 2. Fix collection from file_path
  console.log('\n2. Fixing collection from file_path...');
  const collectionQuery = `
    UPDATE docs SET
      collection = substr(file_path,
        instr(file_path, '/') + 1,
        instr(substr(file_path, instr(file_path, '/') + 1), '/') - 1
      )
    WHERE file_path IS NOT NULL
      AND file_path != ''
      AND file_path LIKE '%/%/%'
  `;

  if (!dryRun) {
    const result = await query(collectionQuery);
    console.log(`   Updated ${result.changes} documents`);
  } else {
    const count = await queryOne(`SELECT COUNT(*) as c FROM docs WHERE file_path LIKE '%/%/%'`);
    console.log(`   Would update up to ${count.c} documents`);
  }

  // 3. Delete orphan documents
  console.log('\n3. Deleting orphan documents (no file_path, no content)...');
  const orphanCountResult = await queryOne(`
    SELECT COUNT(*) as c FROM docs
    WHERE (file_path IS NULL OR file_path = '')
      AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = docs.id)
  `);

  if (!dryRun) {
    const result = await query(`
      DELETE FROM docs
      WHERE (file_path IS NULL OR file_path = '')
        AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = docs.id)
    `);
    console.log(`   Deleted ${result.changes} orphan documents`);
  } else {
    console.log(`   Would delete ${orphanCountResult.c} orphan documents`);
  }

  // 4. Delete duplicate documents (same title, no file_path, no content)
  console.log('\n4. Deleting empty duplicates...');
  const dupCountResult = await queryOne(`
    SELECT COUNT(*) as c FROM docs d
    WHERE (d.file_path IS NULL OR d.file_path = '')
      AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = d.id)
      AND EXISTS (
        SELECT 1 FROM docs d2
        WHERE d2.title = d.title
          AND d2.id != d.id
          AND (d2.file_path IS NOT NULL AND d2.file_path != '')
      )
  `);

  if (!dryRun) {
    const result = await query(`
      DELETE FROM docs
      WHERE (file_path IS NULL OR file_path = '')
        AND NOT EXISTS (SELECT 1 FROM content WHERE doc_id = docs.id)
        AND EXISTS (
          SELECT 1 FROM docs d2
          WHERE d2.title = docs.title
            AND d2.id != docs.id
            AND (d2.file_path IS NOT NULL AND d2.file_path != '')
        )
    `);
    console.log(`   Deleted ${result.changes} duplicate documents`);
  } else {
    console.log(`   Would delete ${dupCountResult.c} duplicate documents`);
  }

  // 5. Strip sentence markers from English content
  console.log('\n5. Stripping sentence markers from English content...');
  const markerCountResult = await queryOne(`
    SELECT COUNT(*) as c FROM content c
    JOIN docs d ON c.doc_id = d.id
    WHERE d.language = 'en' AND c.text LIKE '%⁅%'
  `);

  if (!dryRun && markerCountResult.c > 0) {
    // Strip markers in batches (s1-s50)
    for (let batch = 0; batch < 5; batch++) {
      const start = batch * 10 + 1;
      const markers = [];
      for (let i = start; i <= start + 9; i++) {
        markers.push(`'⁅s${i}⁆', ''`);
        markers.push(`'⁅/s${i}⁆', ''`);
      }

      const replaceChain = markers.reduce((sql, pair) => {
        const [from, to] = pair.split(', ');
        return `REPLACE(${sql}, ${from}, ${to})`;
      }, 'text');

      await query(`
        UPDATE content SET
          text = ${replaceChain},
          synced = 0
        WHERE doc_id IN (SELECT id FROM docs WHERE language = 'en')
          AND text LIKE '%⁅%'
      `);
    }

    const remaining = await queryOne(`
      SELECT COUNT(*) as c FROM content c
      JOIN docs d ON c.doc_id = d.id
      WHERE d.language = 'en' AND c.text LIKE '%⁅%'
    `);
    console.log(`   Stripped markers, ${remaining.c} paragraphs still need cleanup`);
  } else {
    console.log(`   ${markerCountResult.c} paragraphs with markers`);
  }

  // Summary
  console.log('\n=== Summary ===');
  const stats = await queryOne(`
    SELECT
      (SELECT COUNT(*) FROM docs) as total_docs,
      (SELECT COUNT(*) FROM content) as total_paragraphs,
      (SELECT COUNT(DISTINCT doc_id) FROM content) as docs_with_content
  `);
  console.log(`Total documents: ${stats.total_docs}`);
  console.log(`Documents with content: ${stats.docs_with_content}`);
  console.log(`Total paragraphs: ${stats.total_paragraphs}`);

  if (!dryRun) {
    console.log('\n✅ Database fixes applied!');
    console.log('Next: Run node scripts/reingest-english-docs.js to re-ingest English documents');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
