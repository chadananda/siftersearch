#!/usr/bin/env node
// Test the Hebrew segmenter against the worst-case paragraphs in the DB.
// Reports chunk count, size distribution, samples, and a roundtrip integrity
// check (concatenating chunks should reproduce the stripped original).

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const { queryAll } = await import('../api/lib/db.js');
const { segmentHebrew } = await import('../api/lib/segmenter-hebrew.js');
const { stripMarkers } = await import('../api/lib/markers.js');

const args = process.argv.slice(2);
const idArg = args.find(a => a.startsWith('--id='))?.split('=')[1];
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 1;

const rows = idArg
  ? await queryAll('SELECT id, doc_id, paragraph_index, text, language FROM content WHERE id = ?', [idArg])
  : await queryAll(
      `SELECT id, doc_id, paragraph_index, text, language FROM content
       WHERE deleted_at IS NULL AND embedding IS NULL AND LENGTH(text) > 6000
       ORDER BY LENGTH(text) DESC LIMIT ?`,
      [limit]
    );

if (rows.length === 0) {
  console.log('No matching paragraphs found.');
  process.exit(0);
}

for (const row of rows) {
  const original = row.text;
  const strippedOriginal = stripMarkers(original);

  const start = Date.now();
  const chunks = segmentHebrew(original, { maxChars: 3000, minChars: 20 });
  const elapsedMs = Date.now() - start;

  const sizes = chunks.map(c => c.length);
  const total = sizes.reduce((a, b) => a + b, 0);
  const min = sizes.length ? Math.min(...sizes) : 0;
  const max = sizes.length ? Math.max(...sizes) : 0;
  const avg = sizes.length ? Math.round(total / sizes.length) : 0;

  // Roundtrip integrity: concatenated chunks should approximate stripped original.
  // Allow whitespace differences (we trim/normalize during packing).
  const reconstructed = chunks.join(' ');
  const normalize = s => s.replace(/\s+/g, ' ').trim();
  const matches = normalize(reconstructed) === normalize(strippedOriginal);
  const reconLen = normalize(reconstructed).length;
  const origLen = normalize(strippedOriginal).length;
  const charsLost = origLen - reconLen;

  console.log('━'.repeat(70));
  console.log(`paragraph_id  : ${row.id}`);
  console.log(`doc_id        : ${row.doc_id} (paragraph_index ${row.paragraph_index})`);
  console.log(`original chars: ${original.length}`);
  console.log(`stripped chars: ${strippedOriginal.length}  (markers ${original.length - strippedOriginal.length})`);
  console.log(`elapsed       : ${elapsedMs}ms`);
  console.log(`chunks        : ${chunks.length}`);
  console.log(`size min/avg/max: ${min} / ${avg} / ${max}`);
  console.log(`exceeds 6000  : ${sizes.filter(s => s > 6000).length}`);
  console.log(`integrity     : ${matches ? 'EXACT' : `lost ${charsLost} chars (${(charsLost / origLen * 100).toFixed(2)}%)`}`);

  if (chunks.length > 0) {
    console.log('');
    console.log('--- chunk[0] (first 250 chars) ---');
    console.log(chunks[0].slice(0, 250) + (chunks[0].length > 250 ? '…' : ''));
    if (chunks.length > 1) {
      console.log('');
      console.log(`--- chunk[${Math.floor(chunks.length / 2)}] (middle, first 250 chars) ---`);
      console.log(chunks[Math.floor(chunks.length / 2)].slice(0, 250) + '…');
    }
  }
}
