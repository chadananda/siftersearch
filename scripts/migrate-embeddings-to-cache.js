#!/usr/bin/env node
/**
 * Migrate Embeddings to Cache
 *
 * Reads distinct (normalized_hash, embedding_model) pairs from sifter.db content table,
 * truncates each 3072-dim embedding to 512-dim (L2-normalized), and inserts into
 * the deduplicated embedding_cache.db.
 *
 * Usage:
 *   node scripts/migrate-embeddings-to-cache.js
 *   node scripts/migrate-embeddings-to-cache.js --dry-run
 *   node scripts/migrate-embeddings-to-cache.js --verify
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

import {
  initEmbeddingCache,
  batchInsertEmbeddings,
  truncateAndNormalize512,
  getEmbeddingCount,
  getEmbedding,
  closeEmbeddingCache,
} from '../api/lib/embedding-cache.js';

const BATCH_SIZE = 1000;
const SOURCE_BYTES = 3072 * 4;
const TARGET_DIM = 512;
const CACHE_DB_PATH = join(PROJECT_ROOT, 'data', 'embedding_cache.db');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verify = args.includes('--verify');

function stripFilePrefix(url) { return url?.startsWith('file:') ? url.slice(5) : url; }

function openSourceDb() {
  const url = process.env.TURSO_DATABASE_URL || `file:${join(PROJECT_ROOT, 'data', 'sifter.db')}`;
  return new Database(stripFilePrefix(url), { readonly: true });
}

function blobToFloat32Array(blob) {
  if (!blob) return null;
  let buf;
  if (Buffer.isBuffer(blob)) buf = blob;
  else if (blob instanceof Uint8Array) buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  else if (blob instanceof ArrayBuffer) buf = Buffer.from(blob);
  else { try { buf = Buffer.from(blob); } catch { return null; } }
  if (buf.length !== SOURCE_BYTES) return null;
  const aligned = Buffer.alloc(SOURCE_BYTES);
  buf.copy(aligned);
  return new Float32Array(aligned.buffer, aligned.byteOffset, SOURCE_BYTES / 4);
}

function countSourceRows(sourceDb) {
  return Number(sourceDb.prepare(`SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL AND deleted_at IS NULL AND LENGTH(embedding) = ${SOURCE_BYTES}`).get().count);
}

function countDistinctHashes(sourceDb) {
  return Number(sourceDb.prepare(`SELECT COUNT(*) as count FROM (SELECT normalized_hash, embedding_model FROM content WHERE embedding IS NOT NULL AND deleted_at IS NULL AND LENGTH(embedding) = ${SOURCE_BYTES} GROUP BY normalized_hash, embedding_model)`).get().count);
}

async function runMigration(sourceDb) {
  const startTime = Date.now();
  console.log('=== Migrate Embeddings to Cache ===');
  if (dryRun) console.log('DRY RUN — no writes to embedding_cache.db\n');

  const totalRows = countSourceRows(sourceDb);
  const totalDistinct = countDistinctHashes(sourceDb);
  console.log(`Source rows with 3072-dim embeddings: ${totalRows.toLocaleString()}`);
  console.log(`Distinct (hash, model) groups:        ${totalDistinct.toLocaleString()}`);
  console.log(`Dedup ratio: ${totalRows > 0 ? (totalRows / totalDistinct).toFixed(2) : 'N/A'}x\n`);

  if (!dryRun) await initEmbeddingCache(CACHE_DB_PATH);
  const cacheCountBefore = dryRun ? 0 : await getEmbeddingCount();
  if (!dryRun) console.log(`Cache entries before migration: ${cacheCountBefore.toLocaleString()}\n`);

  let processed = 0;
  let errors = 0;
  let batchNum = 0;
  let offset = 0;

  const batchStmt = sourceDb.prepare(`SELECT normalized_hash, embedding_model, embedding FROM content WHERE embedding IS NOT NULL AND deleted_at IS NULL AND LENGTH(embedding) = ${SOURCE_BYTES} GROUP BY normalized_hash, embedding_model LIMIT ${BATCH_SIZE} OFFSET ?`);

  while (true) {
    const rows = batchStmt.all(offset);
    if (!rows.length) break;
    batchNum++;
    const entries = [];
    for (const row of rows) {
      const floats = blobToFloat32Array(row.embedding);
      if (!floats) { errors++; continue; }
      entries.push({ normalizedHash: row.normalized_hash, model: row.embedding_model, dim: TARGET_DIM, version: 'v1', blob: Buffer.from(truncateAndNormalize512(floats).buffer) });
    }
    if (!dryRun && entries.length > 0) await batchInsertEmbeddings(entries);
    processed += entries.length;
    offset += rows.length;
    process.stdout.write(`  Batch ${batchNum}: processed ${processed.toLocaleString()} / ~${totalDistinct.toLocaleString()} distinct (${errors} errors)\r`);
    if (rows.length < BATCH_SIZE) break;
  }

  console.log();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const cacheCountAfter = dryRun ? 0 : await getEmbeddingCount();

  console.log('\n=== Summary ===');
  console.log(`Distinct hashes migrated: ${processed.toLocaleString()}`);
  console.log(`Errors (bad blobs):       ${errors}`);
  if (!dryRun) {
    console.log(`Cache entries before:     ${cacheCountBefore.toLocaleString()}`);
    console.log(`Cache entries after:      ${cacheCountAfter.toLocaleString()}`);
    console.log(`New entries inserted:     ${(cacheCountAfter - cacheCountBefore).toLocaleString()}`);
  }
  console.log(`Total source rows:        ${totalRows.toLocaleString()}`);
  console.log(`Dedup ratio:              ${processed > 0 ? (totalRows / processed).toFixed(2) : 'N/A'}x`);
  console.log(`Time elapsed:             ${elapsed}s`);
}

async function runVerify(sourceDb) {
  console.log('=== Verify: Spot-checking 100 random hashes ===\n');
  await initEmbeddingCache(CACHE_DB_PATH);
  const rows = sourceDb.prepare(`SELECT normalized_hash, embedding_model FROM content WHERE embedding IS NOT NULL AND deleted_at IS NULL AND LENGTH(embedding) = ${SOURCE_BYTES} GROUP BY normalized_hash, embedding_model ORDER BY RANDOM() LIMIT 100`).all();
  if (!rows.length) { console.log('No rows found to verify.'); return; }
  let found = 0;
  let missing = 0;
  for (const row of rows) {
    const cached = await getEmbedding(row.normalized_hash, row.embedding_model, TARGET_DIM);
    if (cached) found++; else missing++;
  }
  console.log(`Checked: ${rows.length}`);
  console.log(`Found in cache:   ${found}`);
  console.log(`Missing from cache: ${missing}`);
  if (missing === 0) console.log('\nAll spot-checked hashes are in the cache.');
  else console.log(`\nWARNING: ${missing} hashes not found.`);
}

async function main() {
  const sourceDb = openSourceDb();
  try {
    if (verify) await runVerify(sourceDb);
    else await runMigration(sourceDb);
  } finally {
    sourceDb.close();
    await closeEmbeddingCache();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
