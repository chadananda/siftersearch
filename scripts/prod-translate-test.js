#!/usr/bin/env node
/**
 * Production Translation Test Script
 *
 * 1. Clears all translations from the content table
 * 2. Translates one small document with aligned segments
 *
 * Usage:
 *   node scripts/prod-translate-test.js [document_id]
 *
 * Default document: baha_i_core_tablets_the_b_b_006_prayer_divine_praise (2 paragraphs)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryAll, queryOne } from '../api/lib/db.js';
import { translateTextWithSegments } from '../api/services/translation.js';

const DOC_ID = process.argv[2] || 'baha_i_core_tablets_the_b_b_006_prayer_divine_praise';

async function main() {
  console.log('=== Production Translation Test ===\n');

  // 1. Show current translation stats
  const stats = await queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN translation IS NOT NULL THEN 1 ELSE 0 END) as with_translation,
      SUM(CASE WHEN translation_segments IS NOT NULL THEN 1 ELSE 0 END) as with_segments
    FROM content
  `);

  console.log('Current translation stats:');
  console.log(`  Total paragraphs: ${stats.total}`);
  console.log(`  With translation: ${stats.with_translation}`);
  console.log(`  With segments: ${stats.with_segments}`);

  // 2. Clear all translations
  console.log('\nClearing all translations...');
  await query(`
    UPDATE content
    SET translation = NULL, translation_segments = NULL, synced = 0
    WHERE translation IS NOT NULL
  `);
  console.log('✓ All translations cleared');

  // 3. Get target document paragraphs
  console.log(`\nFetching document: ${DOC_ID}`);
  const paragraphs = await queryAll(`
    SELECT id, doc_id, paragraph_index, text
    FROM content
    WHERE doc_id = ?
    ORDER BY paragraph_index
  `, [DOC_ID]);

  if (paragraphs.length === 0) {
    console.log('No paragraphs found for document.');
    console.log('Checking if document exists in documents table...');
    const doc = await queryOne('SELECT id, title, language FROM docs WHERE id = ?', [DOC_ID]);
    if (doc) {
      console.log(`Document exists: ${doc.title} (${doc.language})`);
      console.log('Content may need to be populated from Meilisearch.');
    } else {
      console.log('Document not found in database.');
    }
    return;
  }

  console.log(`Found ${paragraphs.length} paragraphs to translate\n`);

  // 4. Translate each paragraph
  for (const para of paragraphs) {
    console.log(`Translating paragraph ${para.paragraph_index + 1}...`);

    try {
      const result = await translateTextWithSegments(para.text, 'ar', 'en', 'scripture');

      const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;

      await query(
        'UPDATE content SET translation = ?, translation_segments = ?, synced = 0 WHERE id = ?',
        [result.translation, segmentsJson, para.id]
      );

      console.log(`  ✓ ${result.segments?.length || 0} segments`);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }
  }

  // 5. Verify results
  console.log('\n=== Results ===');
  const translated = await queryAll(`
    SELECT paragraph_index,
           LENGTH(translation) as trans_len,
           LENGTH(translation_segments) as seg_len
    FROM content
    WHERE doc_id = ? AND translation IS NOT NULL
    ORDER BY paragraph_index
  `, [DOC_ID]);

  console.log(`Translated ${translated.length}/${paragraphs.length} paragraphs`);
  translated.forEach(p => {
    console.log(`  Para ${p.paragraph_index + 1}: ${p.trans_len} chars, segments: ${p.seg_len ? 'YES' : 'NO'}`);
  });

  console.log('\n✓ Done! View at:');
  console.log(`  https://siftersearch.com/print/study?doc=${DOC_ID}`);
  console.log(`  https://siftersearch.com/print/reading?doc=${DOC_ID}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
