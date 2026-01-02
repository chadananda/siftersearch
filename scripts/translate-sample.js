#!/usr/bin/env node
/**
 * Translate a small sample of Arabic paragraphs using OpenAI
 * For testing side-by-side results feature
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

import OpenAI from 'openai';
import { query, queryAll } from '../api/lib/db.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SCRIPTURAL_PROMPT = `You are an expert translator specializing in Bahá'í sacred writings. Translate this Arabic text to English using Shoghi Effendi's distinctive biblical translation style.

Style Guidelines:
- Use archaic pronouns for the Divine: Thou, Thee, Thine, Thy
- Employ elevated diction: perceiveth, confesseth, hath, art, doth, verily
- Render divine attributes formally: sovereignty, dominion, majesty, glory
- Use inverted word order for emphasis where appropriate
- Maintain poetic rhythm and cadence

Provide only the translation, no explanations.`;

async function translateText(text) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SCRIPTURAL_PROMPT },
      { role: 'user', content: text }
    ],
    temperature: 0.3,
    max_tokens: Math.max(500, text.length * 3)
  });
  return response.choices[0].message.content.trim();
}

async function main() {
  console.log('=== Translate Sample Arabic Paragraphs ===\n');

  // Get 10 Arabic paragraphs that don't have translations yet
  const paragraphs = await queryAll(`
    SELECT c.id, c.text, c.paragraph_index, d.title
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE d.language = 'ar'
      AND (c.translation IS NULL OR c.translation = '')
      AND LENGTH(c.text) > 50
      AND LENGTH(c.text) < 500
    LIMIT 10
  `);

  console.log(`Found ${paragraphs.length} paragraphs to translate\n`);

  let translated = 0;
  for (const para of paragraphs) {
    console.log(`[${para.paragraph_index}] Translating from "${para.title}"...`);
    console.log(`  Original: ${para.text.substring(0, 80)}...`);

    try {
      const translation = await translateText(para.text);
      console.log(`  Translation: ${translation.substring(0, 80)}...`);

      // Save translation
      await query(
        'UPDATE content SET translation = ?, synced = 0 WHERE id = ?',
        [translation, para.id]
      );
      translated++;
      console.log('  ✓ Saved\n');
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}\n`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Translated: ${translated}/${paragraphs.length}`);
  console.log('\nParagraphs marked synced=0 - they will sync to Meilisearch');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
