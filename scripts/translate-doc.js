#!/usr/bin/env node
/**
 * Translate a specific document with aligned segments
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

// Force remote AI
process.env.USE_REMOTE_AI = 'true';

import { query, queryAll } from '../api/lib/db.js';
import { translateTextWithSegments } from '../api/services/translation.js';

const DOC_ID = process.argv[2] || '067_excellence_of_knowledge';

async function main() {
  console.log(`\n=== Translating Document: ${DOC_ID} ===\n`);

  // Get untranslated paragraphs
  const paragraphs = await queryAll(`
    SELECT c.id, c.text, c.paragraph_index
    FROM content c
    WHERE c.doc_id = ?
      AND (c.translation IS NULL OR c.translation = '')
    ORDER BY c.paragraph_index
  `, [DOC_ID]);

  console.log(`Found ${paragraphs.length} paragraphs to translate\n`);

  if (paragraphs.length === 0) {
    console.log('All paragraphs already translated!');
    process.exit(0);
  }

  for (const para of paragraphs) {
    console.log(`[${para.paragraph_index}] Translating...`);
    console.log(`  Original: ${para.text.substring(0, 80)}...`);

    try {
      const result = await translateTextWithSegments(para.text, 'ar', 'en', 'scripture');
      
      console.log(`  Translation: ${result.translation.substring(0, 80)}...`);
      console.log(`  Segments: ${result.segments?.length || 0} aligned phrases`);

      // Save
      const segmentsJson = result.segments ? JSON.stringify(result.segments) : null;
      await query(
        'UPDATE content SET translation = ?, translation_segments = ?, synced = 0 WHERE id = ?',
        [result.translation, segmentsJson, para.id]
      );
      console.log('  ✓ Saved\n');
    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('=== Done! ===');
  console.log(`\nView at: http://localhost:5173/library/document/${DOC_ID}`);
  console.log(`Print Study: http://localhost:5173/print/study?doc=${DOC_ID}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
