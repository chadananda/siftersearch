#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { queryOne, queryAll } from '../api/lib/db.js';

async function check() {
  // Check translation field existence and counts
  const stats = await queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN translation IS NOT NULL AND translation != '' THEN 1 ELSE 0 END) as with_translation
    FROM content
  `);
  console.log('Content table stats:', stats);

  // Sample translated content
  const samples = await queryAll(`
    SELECT c.id, c.text, c.translation, d.language, d.title
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.translation IS NOT NULL AND c.translation != ''
    LIMIT 3
  `);
  console.log('\nSample translated content:', samples.length, 'found');
  for (const s of samples) {
    console.log('---');
    console.log('Language:', s.language);
    console.log('Original:', s.text?.substring(0, 100));
    console.log('Translation:', s.translation?.substring(0, 100));
  }

  // Check by language
  const byLang = await queryAll(`
    SELECT d.language,
           COUNT(*) as total,
           SUM(CASE WHEN c.translation IS NOT NULL AND c.translation != '' THEN 1 ELSE 0 END) as translated
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    GROUP BY d.language
  `);
  console.log('\nTranslations by language:');
  for (const row of byLang) {
    console.log(`  ${row.language}: ${row.translated}/${row.total} translated`);
  }
}

check().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
