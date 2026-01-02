#!/usr/bin/env node
/**
 * Translate a small sample of Arabic paragraphs using OpenAI
 * Uses structured segment output for phrase-level interactive highlighting
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import { query, queryAll } from '../api/lib/db.js';
import { translateTextWithSegments } from '../api/services/translation.js';

async function main() {
  console.log('=== Translate Sample Arabic Paragraphs (with Aligned Segments) ===\n');

  // Get 10 Arabic paragraphs that don't have translations yet
  const paragraphs = await queryAll(`
    SELECT c.id, c.text, c.paragraph_index, d.title, d.collection
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'ar'
      AND (c.translation IS NULL OR c.translation = '')
      AND LENGTH(c.text) > 50
      AND LENGTH(c.text) < 500
    LIMIT 10
  `);

  console.log(`Found ${paragraphs.length} paragraphs to translate\n`);

  if (paragraphs.length === 0) {
    console.log('No paragraphs need translation. Looking for existing translations to re-translate with segments...\n');

    // Find paragraphs that have translations but no segments
    const existingTranslations = await queryAll(`
      SELECT c.id, c.text, c.paragraph_index, c.translation, d.title, d.collection
      FROM content c
      JOIN docs d ON d.id = c.doc_id
      WHERE d.language = 'ar'
        AND c.translation IS NOT NULL AND c.translation != ''
        AND (c.translation_segments IS NULL OR c.translation_segments = '')
        AND LENGTH(c.text) > 50
        AND LENGTH(c.text) < 500
      LIMIT 10
    `);

    if (existingTranslations.length === 0) {
      console.log('All translations already have segments. Nothing to do.');
      process.exit(0);
    }

    console.log(`Found ${existingTranslations.length} translations to update with segments\n`);

    let updated = 0;
    for (const para of existingTranslations) {
      console.log(`[${para.paragraph_index}] Re-translating from "${para.title}"...`);
      console.log(`  Original: ${para.text.substring(0, 60)}...`);

      try {
        // Detect content type from collection
        const contentType = detectContentType(para.collection);
        const result = await translateTextWithSegments(para.text, 'ar', 'en', contentType);

        console.log(`  Translation: ${result.translation.substring(0, 60)}...`);
        console.log(`  Segments: ${result.segments?.length || 0} aligned phrases`);

        // Save translation and segments
        const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
        await query(
          'UPDATE content SET translation = ?, translation_segments = ?, synced = 0 WHERE id = ?',
          [result.translation, segmentsJson, para.id]
        );
        updated++;
        console.log('  Saved\n');
      } catch (err) {
        console.error(`  Error: ${err.message}\n`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated with segments: ${updated}/${existingTranslations.length}`);
    console.log('\nParagraphs marked synced=0 - they will sync to Meilisearch');
    process.exit(0);
  }

  let translated = 0;
  for (const para of paragraphs) {
    console.log(`[${para.paragraph_index}] Translating from "${para.title}"...`);
    console.log(`  Original: ${para.text.substring(0, 60)}...`);

    try {
      // Detect content type from collection
      const contentType = detectContentType(para.collection);
      const result = await translateTextWithSegments(para.text, 'ar', 'en', contentType);

      console.log(`  Translation: ${result.translation.substring(0, 60)}...`);
      console.log(`  Segments: ${result.segments?.length || 0} aligned phrases`);

      // Save translation and segments
      const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
      await query(
        'UPDATE content SET translation = ?, translation_segments = ?, synced = 0 WHERE id = ?',
        [result.translation, segmentsJson, para.id]
      );
      translated++;
      console.log('  Saved\n');
    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Translated: ${translated}/${paragraphs.length}`);
  console.log('\nParagraphs marked synced=0 - they will sync to Meilisearch');
}

// Detect content type from collection name
function detectContentType(collection) {
  if (!collection) return 'auto';

  const collLower = collection.toLowerCase();
  const scriptureKeywords = ['tablet', 'prayer', 'hidden words', 'kitab', 'core', 'compilations'];
  const historicalKeywords = ['historical', 'pilgrim', 'news', 'letter', 'memoir'];

  for (const kw of scriptureKeywords) {
    if (collLower.includes(kw)) return 'scripture';
  }
  for (const kw of historicalKeywords) {
    if (collLower.includes(kw)) return 'historical';
  }
  return 'auto';
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
