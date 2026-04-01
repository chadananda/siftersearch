#!/usr/bin/env node
/**
 * Test translation using real JAFAR reports (unfiltered, $0) + local LLM.
 * Compares: raw local LLM vs JAFAR-guided local LLM.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import { queryOne } from '../api/lib/db.js';
import { callLocalLLM } from '../api/lib/enhancement-ai.js';

const CTAI_URL = process.env.CTAI_API_URL || 'https://ctai.info/api/v1';
const CTAI_KEY = process.env.CTAI_KEY;

// Test paragraphs: diverse classical texts
const TEST_IDS = [
  18159856, // Nahj al-Balagha (Imam Ali) — sermon
  18191352, // Ihya Ulum al-Din (al-Ghazali) — hadith
  17844439, // Sahih al-Bukhari — hadith
];

async function getJafarReport(text) {
  const res = await fetch(`${CTAI_URL}/jafar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CTAI_KEY}`
    },
    body: JSON.stringify({ text, filter: false })
  });
  if (!res.ok) { console.error(`JAFAR error: ${res.status}`); return null; }
  return res.json();
}

function formatJafarForPrompt(report) {
  if (!report || !report.enriched_terms) return '';
  const terms = report.enriched_terms.filter(t => !t.is_stop && t.root);
  if (terms.length === 0) return '';

  const lines = terms.map(t => {
    const root = t.transliteration || '?';
    const literal = t.literal || '?';
    const se = t.se_rendering;
    const spectrum = (t.rendering_spectrum || []).slice(0, 3)
      .map(s => `${s.rendering || s.word}(${s.count || s.pct || ''})`).join(', ');
    let line = `${t.term} [${root}] = ${literal}`;
    if (se) line += ` | SE: "${se}"`;
    if (spectrum) line += ` | spectrum: ${spectrum}`;
    return line;
  });

  return `JAFAR Root Analysis (Shoghi Effendi concordance):\n${lines.join('\n')}`;
}

async function main() {
  console.log('=== Translation Test: JAFAR + Local LLM ===\n');

  if (!CTAI_KEY) { console.error('Set CTAI_KEY in .env-secrets'); process.exit(1); }

  for (const paraId of TEST_IDS) {
    const para = await queryOne(`
      SELECT c.id, c.text, d.title, d.author, d.language
      FROM content c JOIN docs d ON c.doc_id = d.id WHERE c.id = ?
    `, [paraId]);
    if (!para) { console.log(`Para ${paraId} not found\n`); continue; }

    console.log(`━━━ ${para.title} by ${para.author} ━━━`);
    console.log(`ARABIC: ${para.text.slice(0, 150)}...\n`);

    // Get JAFAR report
    console.log('Fetching JAFAR report...');
    const jafar = await getJafarReport(para.text);
    const jafarContext = formatJafarForPrompt(jafar);
    console.log(`  ${jafar?.term_count || 0} terms analyzed\n`);

    // Translation WITH JAFAR
    const systemWithJafar = `Translate this classical Arabic text into clear, dignified English.

${jafarContext}

Rules:
- Follow the terminology and tone suggested by the JAFAR concordance examples above
- Preserve the rhetorical weight and spiritual register of the original
- Transliterate proper names: أبو هريرة → Abū Hurayra
- صلى الله عليه وسلم → (peace be upon him)
- Output ONLY the English translation`;

    const translation = await callLocalLLM(systemWithJafar, `Translate:\n${para.text}`, {
      maxTokens: 500, temperature: 0.3, timeout: 120000
    });

    if (translation) {
      console.log(`WITH JAFAR:\n${translation}\n`);
    } else {
      console.log('WITH JAFAR: FAILED\n');
    }

    console.log('─'.repeat(60) + '\n');
  }

  console.log('=== Test Complete ===');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
