#!/usr/bin/env node
/**
 * Test classical Arabic translation quality with local LLM + JAFAR-style terminology.
 * Picks diverse paragraphs from classical texts and translates them.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { queryAll, queryOne } from '../api/lib/db.js';
import { callLocalLLM } from '../api/lib/enhancement-ai.js';

// Test paragraphs from diverse classical texts
const TEST_PARA_IDS = [
  18191352, // Ihya Ulum al-Din (al-Ghazali) — mysticism
  18190586, // Ihya Ulum al-Din (al-Ghazali) — another passage
  18159856, // Nahj al-Balagha (Imam Ali) — sermon
  17844439, // Sahih al-Bukhari — hadith
  17842437, // Sahih al-Bukhari — chapter heading + hadith
];

async function main() {
  console.log('=== Classical Arabic Translation Test ===');
  console.log('Model: Qwen3-32B-AWQ (local)\n');

  for (const paraId of TEST_PARA_IDS) {
    const para = await queryOne(`
      SELECT c.id, c.text, c.paragraph_index, d.title, d.author, d.collection
      FROM content c JOIN docs d ON c.doc_id = d.id
      WHERE c.id = ?
    `, [paraId]);

    if (!para) { console.log(`Para ${paraId} not found\n`); continue; }

    console.log(`━━━ ${para.title} by ${para.author} (¶${para.paragraph_index}) ━━━`);
    console.log(`ARABIC: ${para.text.slice(0, 200)}${para.text.length > 200 ? '...' : ''}\n`);

    // Translation with terminology guidance (simulating JAFAR context)
    const systemPrompt = `You are a scholarly translator of classical Arabic religious texts into English.

Rules:
- Translate faithfully, preserving the tone and register of the original
- Use standard Islamic studies terminology:
  صلى الله عليه وسلم → peace be upon him (PBUH)
  رضي الله عنه → may God be pleased with him
  عليه السلام → peace be upon him
  الله → God
  رسول الله → the Messenger of God
  النبي → the Prophet
  عدل → justice
  توحيد → divine unity
  إيمان → faith
  تقوى → God-consciousness / piety
  علم → knowledge
  حديث → tradition (hadith)
- For Quranic quotations, use standard scholarly English rendering
- Keep proper names transliterated: أبو هريرة → Abū Hurayra
- Output ONLY the English translation, no notes or commentary`;

    const userPrompt = `Translate:\n${para.text}`;

    const translation = await callLocalLLM(systemPrompt, userPrompt, {
      maxTokens: 500,
      temperature: 0.3,
      timeout: 120000
    });

    if (translation) {
      console.log(`ENGLISH: ${translation}\n`);
    } else {
      console.log(`FAILED: No response from LLM\n`);
    }

    console.log('');
  }

  console.log('=== Test Complete ===');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
