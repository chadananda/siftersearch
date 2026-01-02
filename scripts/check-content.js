#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { queryAll } from '../api/lib/db.js';

async function check() {
  // Check sample Arabic paragraphs
  const arabicSamples = await queryAll(`
    SELECT c.text, c.doc_id, d.title, d.language
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'ar'
    LIMIT 5
  `);

  console.log('=== Sample Arabic paragraphs ===');
  for (const row of arabicSamples) {
    console.log('\nTitle:', row.title);
    console.log('Text:', row.text.substring(0, 100) + '...');
  }

  // Check sample Persian paragraphs
  const persianSamples = await queryAll(`
    SELECT c.text, c.doc_id, d.title, d.language
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'fa'
    LIMIT 5
  `);

  console.log('\n=== Sample Persian paragraphs ===');
  for (const row of persianSamples) {
    console.log('\nTitle:', row.title);
    console.log('Text:', row.text.substring(0, 100) + '...');
  }

  // Check if there are actual Arabic script texts
  const actualArabic = await queryAll(`
    SELECT COUNT(*) as count
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'ar' AND c.text GLOB '*[ء-ي]*'
  `);
  console.log('\n\nArabic paragraphs with Arabic script:', actualArabic[0]?.count);

  const actualPersian = await queryAll(`
    SELECT COUNT(*) as count
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'fa' AND c.text GLOB '*[ء-ی]*'
  `);
  console.log('Persian paragraphs with Persian script:', actualPersian[0]?.count);
}

check().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
