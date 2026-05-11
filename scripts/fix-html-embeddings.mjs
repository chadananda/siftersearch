#!/usr/bin/env node
// Fix embeddings for paragraphs whose text contains HTML verse markers (<sup>).
// These were embedded with HTML noise, causing poor semantic similarity.
//
// Usage:
//   node scripts/fix-html-embeddings.mjs          # dry run (count only)
//   node scripts/fix-html-embeddings.mjs --run    # execute

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const DRY_RUN = !process.argv.includes('--run');
const CONTENT_DB = process.env.TURSO_DATABASE_URL?.replace('file:', '') || join(ROOT, 'data/sifter.db');
const CACHE_DB = process.env.EMBEDDING_CACHE_PATH || join(ROOT, 'data/embedding_cache.db');

function normalizeForHash(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase()
    .trim();
}

const db = new Database(CONTENT_DB, { readonly: DRY_RUN });
let cacheDb;
try {
  cacheDb = new Database(CACHE_DB, { readonly: DRY_RUN });
} catch {
  cacheDb = null;
}

// Only target <sup> tags — these are verse reference markers confirmed to
// cause embedding noise. Other HTML (bold, italic) has minimal impact on
// longer paragraphs and doesn't justify the re-embedding cost.
const affected = db.prepare(`
  SELECT id, text, embedding_model, normalized_hash
  FROM content
  WHERE text LIKE '%<sup%' AND deleted_at IS NULL AND embedding IS NOT NULL
`).all();

console.log(`\nParagraphs with <sup> HTML and existing embeddings: ${affected.length}`);
if (!affected.length) { console.log('Nothing to do.'); process.exit(0); }

// Sample a few to show what we're touching
console.log('\nSample paragraphs:');
affected.slice(0, 5).forEach(r => {
  console.log(`  [${r.id}] ${r.text.slice(0, 80)}`);
});

const hashes = new Set(affected.map(r => r.normalized_hash).filter(Boolean));
console.log(`\nUnique normalized_hash values to evict from embedding cache: ${hashes.size}`);

if (DRY_RUN) {
  console.log('\nDRY RUN — no changes made. Re-run with --run to execute.');
  process.exit(0);
}

// 1. Evict from embedding cache so the worker gets fresh embeddings
if (cacheDb && hashes.size > 0) {
  const placeholders = [...hashes].map(() => '?').join(',');
  const deleted = cacheDb.prepare(
    `DELETE FROM embedding_cache WHERE normalized_hash IN (${placeholders})`
  ).run([...hashes]);
  console.log(`\nEvicted ${deleted.changes} embedding cache entries.`);
}

// 2. Nullify embeddings + mark unsynced so embedding-worker regenerates them
const ids = affected.map(r => r.id);
const placeholders = ids.map(() => '?').join(',');
const updated = db.prepare(
  `UPDATE content SET embedding = NULL, synced = 0 WHERE id IN (${placeholders})`
).run(ids);
console.log(`Nullified embeddings for ${updated.changes} paragraphs.`);
console.log('\nDone. The embedding worker will regenerate clean embeddings on its next cycle.');
