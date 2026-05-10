// Direct probe — what does multiIndexSearch + raw HyPE sidecar return
// for queries about Iqán paragraph 248 (the love/hate true-seeker passage)?
// Helps diagnose retrieval quality after the Sonnet HyPE backfill.

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.PWD = join(__dirname, '..', '..');
process.chdir(process.env.PWD);

const { multiIndexSearch, searchHypeQuestions } = await import('../../api/lib/search.js');

const QUERIES = [
  'love or hate seeker',
  'Why does Bahá\'u\'lláh say you need to let go of both love and hate to find truth?',
  'true seeker purify heart',
  'remnant of love or hate',
  'epistemological barrier emotional bias',
  'spiritual prerequisites for divine knowledge'
];

const TARGET_PARAGRAPH_ID = 6808275;  // Iqán para 248 — the love/hate passage

for (const q of QUERIES) {
  console.log(`\n=== "${q}" ===`);
  try {
    const merged = await multiIndexSearch(q, { limit: 5 });
    const targetRank = (merged.hits || []).findIndex(h => h.id === TARGET_PARAGRAPH_ID || h.paragraph_id === TARGET_PARAGRAPH_ID);
    console.log(`multiIndexSearch top 5 (target rank: ${targetRank >= 0 ? targetRank + 1 : 'NOT IN TOP 5'}):`);
    for (let i = 0; i < (merged.hits || []).slice(0, 5).length; i++) {
      const h = merged.hits[i];
      const text = (h.text || '').replace(/\s+/g, ' ').slice(0, 80);
      const layers = h._layerRanks ? `[main:${h._layerRanks.main ?? '-'} hype:${h._layerRanks.hype ?? '-'}]` : '';
      console.log(`  ${i + 1}. id=${h.id} doc=${h.doc_id} para=${h.paragraph_index} ${layers} | ${text}`);
    }
    // Also probe HyPE sidecar alone
    const hype = await searchHypeQuestions(q, { limit: 5 });
    const hypeTargetRank = (hype.hits || []).findIndex(h => h.paragraph_id === TARGET_PARAGRAPH_ID);
    console.log(`HyPE sidecar top 5 (target rank: ${hypeTargetRank >= 0 ? hypeTargetRank + 1 : 'NOT IN TOP 5'}):`);
    for (let i = 0; i < (hype.hits || []).slice(0, 5).length; i++) {
      const h = hype.hits[i];
      console.log(`  ${i + 1}. para_id=${h.paragraph_id} doc=${h.doc_id} | ${(h.question_text || '').slice(0, 100)}`);
    }
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
  }
}
