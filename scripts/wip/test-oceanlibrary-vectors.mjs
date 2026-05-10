#!/usr/bin/env node
// Verify OceanLibrary's 512-dim vectors are compatible with ours (same model).
// Three checks:
//   1) cosine of our re-embedding vs. theirs across N sample paragraphs (>0.99 = same model, harvest)
//   2) self-search: query a vector against their own bank, ensure neighbors come from the same book
//   3) deep-link round-trip: para_id + book.source_url → https://oceanlibrary.com/<slug>/?paraId=para_NN

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const { createEmbedding } = await import(join(ROOT, 'api/lib/ai.js'));
const { config } = await import(join(ROOT, 'api/lib/config.js'));

const OCEAN_BASE = '/Users/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/-sites/oceanlibrary.com';
const SAMPLE_N = 5;

// ── Helpers ─────────────────────────────────────────────────────────────
function blobToFloat32(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const arr = new Float32Array(buf.byteLength / 4);
  for (let i = 0; i < arr.length; i++) arr[i] = buf.readFloatLE(i * 4);
  return Array.from(arr);
}
function cosine(a, b) {
  if (a.length !== b.length) throw new Error(`dim mismatch: ${a.length} vs ${b.length}`);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Open the two OceanLibrary DBs ───────────────────────────────────────
const idx = new Database(join(OCEAN_BASE, 'ocean-index.db'), { readonly: true });
const vec = new Database(join(OCEAN_BASE, 'ocean-vectors.db'), { readonly: true });

console.log(`Our config: ${config.ai.embeddings.model} @ ${config.ai.embeddings.dimensions}-dim\n`);

// Pick SAMPLE_N paragraphs that are substantial (≥ 50 words) and not mere headers
const samples = idx.prepare(`
  SELECT p.id AS para_row_id, p.book_id, p.para_id, p.text, p.word_count,
         b.title, b.slug, b.source_url, b.religion
    FROM paragraphs p JOIN books b ON p.book_id = b.id
   WHERE p.word_count >= 50
     AND p.para_id LIKE 'para_%'
   ORDER BY RANDOM()
   LIMIT ?
`).all(SAMPLE_N);

if (samples.length === 0) {
  console.error('No paragraphs found in ocean-index.db');
  process.exit(1);
}

// Fetch matching vectors for those paragraphs
console.log(`=== Test 1: cosine our-embed vs. their-embed (${samples.length} samples) ===\n`);

const cosines = [];
for (const s of samples) {
  const row = vec.prepare(
    'SELECT embedding FROM paragraph_vectors WHERE book_id = ? AND para_id = ?'
  ).get(s.book_id, s.para_id);

  if (!row) {
    console.log(`  ✗ no vector for book_id=${s.book_id} ${s.para_id}`);
    continue;
  }
  const theirVec = blobToFloat32(row.embedding);
  if (!theirVec || theirVec.length !== config.ai.embeddings.dimensions) {
    console.log(`  ✗ dim mismatch: theirs ${theirVec?.length}, ours ${config.ai.embeddings.dimensions}`);
    continue;
  }

  const { embedding: ourVec } = await createEmbedding(s.text, { caller: 'ol-test' });
  const c = cosine(ourVec, theirVec);
  cosines.push(c);

  const preview = s.text.slice(0, 60).replace(/\s+/g, ' ');
  console.log(`  ${c >= 0.99 ? '✓' : c >= 0.9 ? '~' : '✗'}  cos=${c.toFixed(4)}  ${s.title.slice(0, 35)} ${s.para_id}  "${preview}..."`);
}

const avgCos = cosines.reduce((a, b) => a + b, 0) / cosines.length;
console.log(`\n  Average cosine: ${avgCos.toFixed(4)}`);
const same_model = avgCos >= 0.99;
console.log(`  Verdict: ${same_model ? 'SAME MODEL — harvest their vectors directly' : 'DIFFERENT MODEL — must re-embed'}\n`);

// ── Test 2: self-search (vector → nearest neighbors) ────────────────────
console.log('=== Test 2: self-search — does a query vector find neighbors in same book? ===\n');

// Use the FIRST sample as the query; load all vectors from its book + a random subset of others
const querySample = samples[0];
const queryVecRow = vec.prepare(
  'SELECT embedding FROM paragraph_vectors WHERE book_id = ? AND para_id = ?'
).get(querySample.book_id, querySample.para_id);
const queryVec = blobToFloat32(queryVecRow.embedding);

// Build a candidate pool: every paragraph from the query's book + 5000 random others
const sameBook = vec.prepare('SELECT id, book_id, para_id, embedding FROM paragraph_vectors WHERE book_id = ?').all(querySample.book_id);
const otherBooks = vec.prepare('SELECT id, book_id, para_id, embedding FROM paragraph_vectors WHERE book_id != ? ORDER BY RANDOM() LIMIT 5000').all(querySample.book_id);
const pool = [...sameBook, ...otherBooks];
console.log(`  Pool: ${sameBook.length} from query book + ${otherBooks.length} random others = ${pool.length} total`);

// Score
const scored = pool.map(p => ({
  ...p,
  cos: cosine(queryVec, blobToFloat32(p.embedding))
})).sort((a, b) => b.cos - a.cos);

const top10 = scored.slice(0, 10);
const top10SameBook = top10.filter(t => t.book_id === querySample.book_id).length;
console.log(`  Query: book="${querySample.title.slice(0, 40)}" ${querySample.para_id}`);
console.log(`  Top-10 hits, ${top10SameBook} from query book (expect ≥7 if neighborhood is intact)`);
for (const h of top10.slice(0, 5)) {
  const meta = idx.prepare('SELECT title FROM books WHERE id = ?').get(h.book_id);
  const tag = h.book_id === querySample.book_id ? '★' : ' ';
  console.log(`    ${tag} cos=${h.cos.toFixed(4)} ${h.para_id} (${meta?.title?.slice(0, 40) || '?'})`);
}
console.log();

// ── Test 3: deep-link round-trip ────────────────────────────────────────
console.log('=== Test 3: deep-link generation ===\n');
for (const s of samples.slice(0, 3)) {
  const url = `${s.source_url}/?paraId=${s.para_id}`;
  console.log(`  ${url}`);
  console.log(`    book: "${s.title}"`);
  console.log(`    para: ${s.para_id} (${s.word_count}w)`);
  console.log();
}

idx.close();
vec.close();

// ── Summary ─────────────────────────────────────────────────────────────
console.log('=== SUMMARY ===');
console.log(`  Embedding compatibility: ${same_model ? '✓ harvest directly' : '✗ re-embed'}`);
console.log(`  Self-search neighborhood: ${top10SameBook >= 7 ? '✓ healthy' : '~ check'} (${top10SameBook}/10 from same book)`);
console.log(`  Deep-link format: ${samples[0].source_url}/?paraId=${samples[0].para_id}`);
