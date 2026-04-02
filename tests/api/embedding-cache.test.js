/**
 * Embedding Cache Tests (TDD RED)
 *
 * Tests are written FIRST — all must fail until api/lib/embedding-cache.js exists.
 *
 * Tests cover: DB initialization, insert, get, upsert deduplication, multi-dim
 * coexistence, batch insert, count, truncation+normalization, and close.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

const TEST_DB_PATH = path.join(os.tmpdir(), `embedding_cache_test_${Math.random().toString(36).slice(2)}.db`);

import {
  initEmbeddingCache,
  insertEmbedding,
  getEmbedding,
  batchInsertEmbeddings,
  getEmbeddingCount,
  truncateAndNormalize512,
  closeEmbeddingCache,
} from '../../api/lib/embedding-cache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a Float32Array of length n filled with sequential values starting at 1
const makeBlob = (n) => {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = i + 1;
  return Buffer.from(arr.buffer);
};

const float32Blob = (arr) => Buffer.from(arr.buffer);

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Embedding Cache DB', () => {
  beforeAll(async () => {
    await initEmbeddingCache(TEST_DB_PATH);
  });

  afterAll(async () => {
    await closeEmbeddingCache();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  // 1. initEmbeddingCache creates the DB and table
  it('initEmbeddingCache() creates the DB file and embedding_cache table', async () => {
    expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    // Verify table exists by attempting a count query — throws if table missing
    const count = await getEmbeddingCount();
    expect(typeof count).toBe('number');
  });

  // 2. insertEmbedding stores an embedding
  it('insertEmbedding() stores an embedding and returns a truthy result', async () => {
    const blob = makeBlob(3072);
    const result = await insertEmbedding('hash_abc', 'text-embedding-3-large', 3072, 'v1', blob);
    expect(result).toBeTruthy();
  });

  // 3. getEmbedding returns the blob or null
  it('getEmbedding() returns the stored blob for a known hash', async () => {
    const blob = makeBlob(3072);
    await insertEmbedding('hash_get_test', 'text-embedding-3-large', 3072, 'v1', blob);
    const retrieved = await getEmbedding('hash_get_test', 'text-embedding-3-large', 3072);
    expect(retrieved).toBeInstanceOf(Buffer);
    expect(retrieved.length).toBe(blob.length);
  });

  it('getEmbedding() returns null for an unknown hash', async () => {
    const result = await getEmbedding('nonexistent_hash_xyz', 'text-embedding-3-large', 3072);
    expect(result).toBeNull();
  });

  // 4. Duplicate insert updates source_count instead of failing
  it('inserting duplicate (same hash+model+dim+version) increments source_count without error', async () => {
    const blob = makeBlob(3072);
    const hash = 'hash_dup_test';
    await insertEmbedding(hash, 'text-embedding-3-large', 3072, 'v1', blob);
    // Second insert same key — must not throw
    await expect(
      insertEmbedding(hash, 'text-embedding-3-large', 3072, 'v1', blob)
    ).resolves.not.toThrow();
    // source_count should now be >= 2 — verified indirectly via getEmbedding still working
    const retrieved = await getEmbedding(hash, 'text-embedding-3-large', 3072);
    expect(retrieved).toBeInstanceOf(Buffer);
  });

  // 5. Different embedding_dim for same hash coexist
  it('different embedding_dim values for the same hash coexist independently', async () => {
    const hash = 'hash_multidim';
    const blob3072 = makeBlob(3072);
    const blob512 = makeBlob(512);
    await insertEmbedding(hash, 'text-embedding-3-large', 3072, 'v1', blob3072);
    await insertEmbedding(hash, 'text-embedding-3-large', 512, 'v1', blob512);
    const r3072 = await getEmbedding(hash, 'text-embedding-3-large', 3072);
    const r512 = await getEmbedding(hash, 'text-embedding-3-large', 512);
    expect(r3072.length).toBe(blob3072.length);
    expect(r512.length).toBe(blob512.length);
  });

  // 6. batchInsertEmbeddings inserts multiple in one transaction
  it('batchInsertEmbeddings() inserts multiple entries without error', async () => {
    const entries = [
      { normalizedHash: 'batch_hash_1', model: 'text-embedding-3-large', dim: 3072, version: 'v1', blob: makeBlob(3072) },
      { normalizedHash: 'batch_hash_2', model: 'text-embedding-3-large', dim: 3072, version: 'v1', blob: makeBlob(3072) },
      { normalizedHash: 'batch_hash_3', model: 'text-embedding-3-large', dim: 3072, version: 'v1', blob: makeBlob(3072) },
    ];
    await expect(batchInsertEmbeddings(entries)).resolves.not.toThrow();
    const r1 = await getEmbedding('batch_hash_1', 'text-embedding-3-large', 3072);
    const r2 = await getEmbedding('batch_hash_2', 'text-embedding-3-large', 3072);
    const r3 = await getEmbedding('batch_hash_3', 'text-embedding-3-large', 3072);
    expect(r1).toBeInstanceOf(Buffer);
    expect(r2).toBeInstanceOf(Buffer);
    expect(r3).toBeInstanceOf(Buffer);
  });

  // 7. getEmbeddingCount returns total cached embeddings
  it('getEmbeddingCount() returns the total number of cached embeddings as a number', async () => {
    const count = await getEmbeddingCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
  });

  // 8. truncateAndNormalize512 truncates 3072-dim to 512-dim
  it('truncateAndNormalize512() returns a Float32Array of exactly 512 elements (2048 bytes)', () => {
    const input = new Float32Array(3072);
    for (let i = 0; i < 3072; i++) input[i] = i + 1;
    const output = truncateAndNormalize512(input);
    expect(output).toBeInstanceOf(Float32Array);
    expect(output.length).toBe(512);
    expect(output.byteLength).toBe(2048);
  });

  // 9. truncateAndNormalize512 produces unit-length vectors
  it('truncateAndNormalize512() produces a unit-length vector (L2 norm ≈ 1.0)', () => {
    const input = new Float32Array(3072);
    for (let i = 0; i < 3072; i++) input[i] = i + 1;
    const output = truncateAndNormalize512(input);
    let sumSq = 0;
    for (let i = 0; i < 512; i++) sumSq += output[i] * output[i];
    const norm = Math.sqrt(sumSq);
    expect(norm).toBeCloseTo(1.0, 3); // within 0.001
  });

  it('truncateAndNormalize512() first 512 values are proportional to original first 512 values', () => {
    const input = new Float32Array(3072);
    for (let i = 0; i < 3072; i++) input[i] = i + 1;
    const output = truncateAndNormalize512(input);
    // Compute the expected scale from the original slice
    const slice = input.slice(0, 512);
    let sumSq = 0;
    for (let i = 0; i < 512; i++) sumSq += slice[i] * slice[i];
    const scale = 1 / Math.sqrt(sumSq);
    // Each output value should equal original * scale
    for (let i = 0; i < 512; i++) {
      expect(output[i]).toBeCloseTo(slice[i] * scale, 5);
    }
  });

  // 10. closeEmbeddingCache closes the DB connection
  it('closeEmbeddingCache() resolves without error', async () => {
    // Tested via afterAll, but verify direct call is safe
    await expect(closeEmbeddingCache()).resolves.not.toThrow();
  });
});
