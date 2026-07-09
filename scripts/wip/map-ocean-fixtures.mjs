#!/usr/bin/env node
// Maps ocean phrase-match fixtures to their top API result's doc_id + authority.
// Run on tower-nas: PUBLIC_API_URL=http://localhost:7839 SIFTER_API_KEY=... node scripts/wip/map-ocean-fixtures.mjs

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API_BASE = process.env.PUBLIC_API_URL || 'http://localhost:7839';
const API_KEY = process.env.SIFTER_API_KEY || process.env.PUBLIC_SIFTER_API_KEY;
const FIXTURES_PATH = join(ROOT, 'tests/quality/ocean-fixtures.json');
const OUT_PATH = join(ROOT, 'scripts/wip/ocean-fixture-map.json');

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
const phraseMatch = fixtures.filter(f => f.category === 'phrase-match');

console.log(`Mapping ${phraseMatch.length} phrase-match fixtures...`);

const results = [];
for (const fix of phraseMatch) {
  process.stdout.write(`  ${fix.id.padEnd(50)} `);
  try {
    const body = { query: fix.query, limit: 5 };
    if (fix.religion_filter) body.filters = { religion: fix.religion_filter };
    const res = await fetch(`${API_BASE}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    const hits = data.results || data.hits || [];
    const top = hits[0];
    if (!top) { console.log('NO RESULTS'); results.push({ id: fix.id, error: 'no results' }); continue; }

    const doc_id = top.documentId ?? top.document_id ?? top.doc_id;
    const authority = top.authority ?? top.authorityTier ?? top.tier ?? 0;
    const author = top.author || '';
    const title = (top.title || '').slice(0, 50);
    const text = (top.text || '').slice(0, 80);

    // Check if expected_text_contains is satisfied by top hit
    let textHit = true;
    if (Array.isArray(fix.expected_text_contains)) {
      const t = (top.text || '').toLowerCase();
      textHit = fix.expected_text_contains.every(p => t.includes(p.toLowerCase()));
    }

    console.log(`auth=${authority} doc=${doc_id} text=${textHit ? '✓' : '✗'} [${author.slice(0,20)}] ${title}`);
    results.push({ id: fix.id, query: fix.query, doc_id, authority, author, title, text, textHit, religion_filter: fix.religion_filter });
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    results.push({ id: fix.id, error: err.message });
  }
}

writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
console.log(`\nWritten to ${OUT_PATH}`);
console.log(`High-authority (≥7) text-match hits: ${results.filter(r => r.authority >= 7 && r.textHit).length}/${results.length}`);
console.log(`High-authority (≥7) any hit: ${results.filter(r => r.authority >= 7).length}/${results.length}`);
