/**
 * Content API — the ONLY authorized way to write to the `content` table.
 *
 * Every mutation automatically:
 *   - Sets synced = 0 (marks paragraph dirty for Meilisearch)
 *   - Sets updated_at = now
 *
 * The sole exception is markSynced(), which is the sync-worker's exclusive
 * privilege after Meilisearch has CONFIRMED the data was indexed.
 *
 * Direct SQL writes to `content` are a bug. Use this module instead.
 *
 * Architecture:
 *   Source Files → Ingester → content table (via this API) → sync-worker → Meilisearch
 *   Embedding worker → content table (via this API) → sync-worker → Meilisearch
 *   Admin/Routes → content table (via this API) → sync-worker → Meilisearch
 */

import { createHash } from 'crypto';
import { query, queryOne, queryAll, transaction } from './db.js';
import { logger } from './logger.js';
import config from './config.js';
import { initEmbeddingCache, getEmbedding, insertEmbedding } from './embedding-cache.js';

// ============================================================
// Constants
// ============================================================

/** Expected embedding byte length: 3072 floats × 4 bytes = 12288 */
const EXPECTED_EMBEDDING_BYTES = config.ai.embeddings.dimensions * 4;

/** Expected embedding float count */
const EXPECTED_EMBEDDING_DIMS = config.ai.embeddings.dimensions;

// ============================================================
// Embedding cache (lazy-initialized)
// ============================================================

let embeddingCacheReady = false;
const CACHE_DB_PATH = config.ai?.embeddingCachePath || 'data/embedding_cache.db';
const CACHE_MODEL = config.ai.embeddings.model;
const CACHE_DIM = 512;

/**
 * Lazily initialize the embedding cache DB on first use.
 * Safe to call multiple times — no-ops after first successful init.
 */
async function initEmbeddingCacheIfNeeded() {
  if (embeddingCacheReady) return;
  try {
    await initEmbeddingCache(CACHE_DB_PATH);
    embeddingCacheReady = true;
    logger.info({ path: CACHE_DB_PATH }, 'Embedding cache initialized');
  } catch (err) {
    logger.warn({ err: err.message, path: CACHE_DB_PATH }, 'Embedding cache unavailable — vectors will fall back to inline blob');
  }
}

/**
 * Batch-fetch 512-dim embeddings from embedding_cache.db.
 * @param {string[]} normalizedHashes
 * @returns {Promise<Map<string, number[]>>} Map of hash → float array
 */
async function getEmbeddingsFromCache(normalizedHashes) {
  const result = new Map();
  if (!embeddingCacheReady || !normalizedHashes.length) return result;
  await Promise.all(normalizedHashes.map(async (hash) => {
    if (!hash) return;
    const buf = await getEmbedding(hash, CACHE_MODEL, CACHE_DIM);
    if (!buf) return;
    const fa = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    if (fa.some(v => !Number.isFinite(v))) return;
    result.set(hash, Array.from(fa));
  }));
  return result;
}

// ============================================================
// Internal helpers
// ============================================================

function now() {
  return new Date().toISOString();
}

/**
 * Normalize text for embedding deduplication.
 * Strips formatting/punctuation so semantically identical content matches.
 */
function normalizeForEmbedding(text) {
  return text
    .replace(/<[^>]+>/g, '')           // Remove HTML tags
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .replace(/[^\p{L}\p{N}\s]/gu, '')  // Remove punctuation (keep letters, numbers, spaces)
    .toLowerCase()
    .trim();
}

/**
 * Compute normalized hash for embedding deduplication.
 */
function computeNormalizedHash(text) {
  const normalized = normalizeForEmbedding(text);
  return createHash('md5').update(normalized).digest('hex');
}

/**
 * Compute content hash for change detection.
 */
function computeContentHash(text) {
  return createHash('md5').update(text).digest('hex');
}

/**
 * Validate embedding dimensions. Returns true if valid, false if wrong size.
 * Null/undefined embeddings are valid (paragraph just won't have semantic search).
 */
function validateEmbedding(embedding) {
  if (!embedding) return true;
  const bytes = Buffer.isBuffer(embedding) ? embedding.length : embedding.byteLength || embedding.length;
  return bytes === EXPECTED_EMBEDDING_BYTES;
}

// ============================================================
// Paragraph lifecycle
// ============================================================

/**
 * Insert a new paragraph.
 * @returns {object} The insert result with lastInsertRowid
 */
async function insertParagraph(docId, {
  paragraphIndex,
  text,
  heading = '',
  blocktype = 'paragraph',
  embedding = null,
  embeddingModel = null,
  // Optional sidecar enrichment carried forward by the indexer's
  // normalized-hash cache (matching paragraphs inherit prior HyPE / disambig).
  hyp_thesis = null,
  hyp_questions = null,
  context = null,
  context_model = null,
  // Optional external paragraph ID — used by the OceanLibrary adapter to
  // round-trip deep links (`source_url/?paraId=external_para_id`).
  external_para_id = null
}) {
  if (embedding && !validateEmbedding(embedding)) {
    logger.warn({ docId, paragraphIndex, size: embedding.length, expected: EXPECTED_EMBEDDING_BYTES },
      'Rejected wrong-dimension embedding on insert');
    embedding = null;
    embeddingModel = null;
  }

  const contentHash = computeContentHash(text);
  const normalizedHash = computeNormalizedHash(text);
  const ts = now();

  // enhanced_synced=0 whenever sidecars are present so Meili picks up the
  // carried-over HyPE on its next sync pass.
  const hasEnrichment = !!(hyp_thesis || hyp_questions || context);

  return query(`
    INSERT INTO content
      (doc_id, paragraph_index, text, content_hash, normalized_hash,
       heading, blocktype, embedding, embedding_model,
       hyp_thesis, hyp_questions, context, context_model, enhanced_synced,
       external_para_id,
       synced, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `, [docId, paragraphIndex, text, contentHash, normalizedHash,
      heading, blocktype, embedding, embeddingModel,
      hyp_thesis, hyp_questions, context, context_model, hasEnrichment ? 0 : 0,
      external_para_id,
      ts, ts]);
}

/**
 * Bulk insert paragraphs in a transaction.
 * Used during document ingestion for performance.
 * @returns {Array} Transaction results
 */
async function bulkInsertParagraphs(docId, paragraphs) {
  const ts = now();
  const statements = paragraphs.map(p => {
    const embedding = (p.embedding && validateEmbedding(p.embedding)) ? p.embedding : null;
    const embeddingModel = embedding ? p.embeddingModel : null;

    return {
      sql: `INSERT INTO content
        (doc_id, paragraph_index, text, content_hash, normalized_hash,
         heading, blocktype, embedding, embedding_model,
         hyp_thesis, hyp_questions, context, context_model, enhanced_synced,
         external_para_id, pdf_page,
         synced, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        docId, p.paragraphIndex, p.text,
        computeContentHash(p.text), computeNormalizedHash(p.text),
        p.heading || '', p.blocktype || 'paragraph',
        embedding, embeddingModel,
        p.hyp_thesis || null, p.hyp_questions || null,
        p.context || null, p.context_model || null,
        // enhanced_synced=0 always — picked up by the sync worker if there's
        // anything to sync; if all sidecars are null, sync is a no-op.
        0,
        p.external_para_id || null,
        // pdf_page is null for primary corpus + HTML-derived sites; set for
        // PDF-derived MD via the site2rag adapter so search results can build
        // deeplinks like `<source_url>#page=<pdf_page>`.
        typeof p.pdf_page === 'number' ? p.pdf_page : null,
        ts, ts
      ]
    };
  });

  return transaction(statements);
}

/**
 * Hard-delete a paragraph by ID.
 */
async function deleteParagraph(id) {
  return query('DELETE FROM content WHERE id = ?', [id]);
}

/**
 * Hard-delete all paragraphs for a document.
 */
async function deleteParagraphsByDoc(docId) {
  return query('DELETE FROM content WHERE doc_id = ?', [docId]);
}

/**
 * Soft-delete all paragraphs for a document (preserves embeddings for reuse).
 */
async function softDeleteByDoc(docId) {
  const ts = now();
  return query(
    'UPDATE content SET deleted_at = ?, synced = 0, updated_at = ? WHERE doc_id = ? AND deleted_at IS NULL',
    [ts, ts, docId]
  );
}

/**
 * Restore soft-deleted paragraphs for a document.
 */
async function restoreByDoc(docId) {
  const ts = now();
  return query(
    'UPDATE content SET deleted_at = NULL, synced = 0, updated_at = ? WHERE doc_id = ? AND deleted_at IS NOT NULL',
    [ts, docId]
  );
}

/**
 * Hard-delete soft-deleted content older than the given date.
 */
async function hardDeleteExpired(olderThan) {
  return query(
    'DELETE FROM content WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [olderThan]
  );
}

/**
 * Bulk delete + insert in a single transaction (for re-ingestion).
 * Deletes specified IDs, updates positions, inserts new paragraphs.
 */
async function bulkReplace(docId, { toDelete = [], toUpdate = [], toInsert = [] } = {}) {
  const ts = now();
  const statements = [];

  for (const id of toDelete) {
    statements.push({ sql: 'DELETE FROM content WHERE id = ?', args: [id] });
  }

  for (const p of toUpdate) {
    statements.push({
      sql: `UPDATE content
        SET paragraph_index = ?, heading = ?, blocktype = ?, synced = 0, updated_at = ?
        WHERE id = ?`,
      args: [p.paragraphIndex, p.heading || '', p.blocktype || 'paragraph', ts, p.id]
    });
  }

  for (const p of toInsert) {
    const embedding = (p.embedding && validateEmbedding(p.embedding)) ? p.embedding : null;
    statements.push({
      sql: `INSERT INTO content
        (doc_id, paragraph_index, text, content_hash, normalized_hash,
         heading, blocktype, embedding, embedding_model, synced, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        docId, p.paragraphIndex, p.text,
        computeContentHash(p.text), computeNormalizedHash(p.text),
        p.heading || '', p.blocktype || 'paragraph',
        embedding, embedding ? p.embeddingModel : null, ts, ts
      ]
    });
  }

  if (statements.length === 0) return [];
  return transaction(statements);
}

// ============================================================
// Field updates — each one marks the paragraph dirty
// ============================================================

/**
 * Update paragraph text. Recomputes hashes. Clears embedding if text changed
 * (since the old embedding no longer represents this content).
 */
async function updateText(id, newText) {
  const ts = now();
  const contentHash = computeContentHash(newText);
  const normalizedHash = computeNormalizedHash(newText);

  // Check if text actually changed (by hash)
  const existing = await queryOne('SELECT content_hash FROM content WHERE id = ?', [id]);
  if (existing && existing.content_hash === contentHash) {
    return { changes: 0, unchanged: true };
  }

  // Text changed — clear embedding since it's stale
  return query(`
    UPDATE content
    SET text = ?, content_hash = ?, normalized_hash = ?,
        embedding = NULL, embedding_model = NULL,
        synced = 0, updated_at = ?
    WHERE id = ?
  `, [newText, contentHash, normalizedHash, ts, id]);
}

/**
 * Update embedding for a paragraph. Validates dimensions.
 * Also writes 512-dim vector to embedding_cache.db for cache-first sync.
 */
async function updateEmbedding(id, embedding, model) {
  if (!validateEmbedding(embedding)) {
    const actualDims = embedding ? (Buffer.isBuffer(embedding) ? embedding.length / 4 : embedding.length) : 0;
    logger.warn({ id, actualDims, expectedDims: EXPECTED_EMBEDDING_DIMS },
      'Rejected wrong-dimension embedding');
    return { changes: 0, rejected: true, reason: 'wrong_dimensions' };
  }
  const ts = now();
  const dbResult = await query(`
    UPDATE content
    SET embedding = ?, embedding_model = ?, synced = 0, updated_at = ?
    WHERE id = ?
  `, [embedding, model, ts, id]);
  // Also write to embedding_cache.db so sync-worker can read 512-dim vectors from there.
  // We need the normalized_hash for the cache key — read it back if cache is ready.
  if (embeddingCacheReady) {
    try {
      const row = await queryOne(`SELECT normalized_hash FROM content WHERE id = ?`, [id]);
      if (row?.normalized_hash) {
        // embedding is stored as the full-dim blob; extract first 512 dims as the cache entry
        const buf = Buffer.isBuffer(embedding) ? embedding : Buffer.from(embedding);
        const fullArray = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
        const slice512 = fullArray.slice(0, 512);
        let sumSq = 0;
        for (let i = 0; i < 512; i++) sumSq += slice512[i] * slice512[i];
        const scale = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 1;
        const normalized = new Float32Array(512);
        for (let i = 0; i < 512; i++) normalized[i] = slice512[i] * scale;
        const cacheBlob = Buffer.from(normalized.buffer);
        await insertEmbedding(row.normalized_hash, model, 512, 'v1', cacheBlob);
      }
    } catch (err) {
      logger.warn({ id, err: err.message }, 'Failed to write embedding to cache (non-fatal)');
    }
  }
  return dbResult;
}

/**
 * Update translation for a paragraph.
 */
async function updateTranslation(id, translation, segments = null) {
  const ts = now();
  return query(`
    UPDATE content
    SET translation = ?, translation_segments = ?, synced = 0, updated_at = ?
    WHERE id = ?
  `, [translation, segments, ts, id]);
}

/**
 * Clear translation for a paragraph.
 */
async function clearTranslation(id) {
  const ts = now();
  return query(`
    UPDATE content
    SET translation = NULL, translation_segments = NULL, synced = 0, updated_at = ?
    WHERE id = ?
  `, [ts, id]);
}

/**
 * Clear all translations for a document.
 */
async function clearTranslationsForDoc(docId) {
  const ts = now();
  return query(`
    UPDATE content
    SET translation = NULL, translation_segments = NULL, synced = 0, updated_at = ?
    WHERE doc_id = ? AND translation IS NOT NULL
  `, [ts, docId]);
}

/**
 * Clear all translations in the database.
 */
async function clearAllTranslations() {
  const ts = now();
  return query(`
    UPDATE content
    SET translation = NULL, translation_segments = NULL, synced = 0, updated_at = ?
    WHERE translation IS NOT NULL
  `, [ts]);
}

/**
 * Update context (AI-generated disambiguation) for a paragraph.
 */
async function updateContext(id, context) {
  const ts = now();
  return query(`
    UPDATE content SET context = ?, synced = 0, updated_at = ? WHERE id = ?
  `, [context, ts, id]);
}

/**
 * Update context and context_model WITHOUT touching synced or embedding.
 * Used by enhancement worker — disambiguation is a separate sync pass.
 */
async function updateContextOnly(id, context, model) {
  const ts = now();
  return query(`
    UPDATE content SET context = ?, context_model = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?
  `, [context, model || null, ts, id]);
}

/**
 * Update hyp_questions WITHOUT touching synced or embedding.
 */
async function updateHypQuestions(id, questions) {
  const ts = now();
  const val = Array.isArray(questions) ? JSON.stringify(questions) : questions;
  return query(`
    UPDATE content SET hyp_questions = ?, enhanced_synced = 0, updated_at = ? WHERE id = ?
  `, [val, ts, id]);
}

/**
 * Mark enhanced content as synced after Meilisearch confirms indexing.
 */
async function markEnhancedSynced(ids) {
  if (!ids || ids.length === 0) return;
  const BATCH = 500;
  const ts = now();
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await query(`
      UPDATE content SET enhanced_synced = 1, updated_at = ?
      WHERE id IN (${batch.map(() => '?').join(',')})
    `, [ts, ...batch]);
  }
}

/**
 * Get paragraphs that need disambiguation (context IS NULL).
 */
async function getUndisambiguated(limit = 20) {
  return queryAll(`
    SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype
    FROM content c
    WHERE c.context IS NULL AND c.deleted_at IS NULL
    ORDER BY c.doc_id, c.paragraph_index
    LIMIT ?
  `, [limit]);
}

/**
 * Get paragraphs that need HyPE questions (context exists, hyp_questions missing).
 */
async function getUnhyped(limit = 10) {
  return queryAll(`
    SELECT id, doc_id, paragraph_index, text, context
    FROM content
    WHERE hyp_questions IS NULL AND context IS NOT NULL AND deleted_at IS NULL
    ORDER BY id
    LIMIT ?
  `, [limit]);
}

/**
 * Get enhanced paragraphs not yet synced to Meilisearch.
 * Joins doc metadata so the sync processor has full context.
 */
async function getEnhancedUnsynced(limit = 200) {
  return queryAll(`
    SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.context, c.hyp_questions,
           c.heading, c.blocktype, c.enhanced_synced,
           d.title, d.author, d.religion, d.collection, d.language, d.year,
           d.description
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.enhanced_synced = 0 AND c.context IS NOT NULL AND c.deleted_at IS NULL
    LIMIT ?
  `, [limit]);
}

/**
 * Get documents that do not yet have extracted entities.
 */
async function getDocsWithoutEntities(limit = 1) {
  return queryAll(`
    SELECT id, title, author, religion, collection, language, year
    FROM docs
    WHERE deleted_at IS NULL
      AND id NOT IN (SELECT doc_id FROM doc_entities)
    LIMIT ?
  `, [limit]);
}

/**
 * Insert or replace entity data for a document.
 */
async function upsertDocEntities(docId, entities, model) {
  const ts = now();
  const entitiesJson = typeof entities === 'string' ? entities : JSON.stringify(entities);
  return query(`
    INSERT OR REPLACE INTO doc_entities (doc_id, entities, model, updated_at)
    VALUES (?, ?, ?, ?)
  `, [docId, entitiesJson, model || null, ts]);
}

/**
 * Get entity data for a document.
 */
async function getDocEntities(docId) {
  return queryOne('SELECT * FROM doc_entities WHERE doc_id = ?', [docId]);
}

/**
 * Update paragraph position/heading/blocktype (during re-ingestion).
 */
async function updatePosition(id, { paragraphIndex, heading, blocktype }) {
  const ts = now();
  return query(`
    UPDATE content
    SET paragraph_index = ?, heading = ?, blocktype = ?, synced = 0, updated_at = ?
    WHERE id = ?
  `, [paragraphIndex, heading || '', blocktype || 'paragraph', ts, id]);
}

/**
 * Update normalized_hash (backfill/repair).
 */
async function updateNormalizedHash(id, hash) {
  const ts = now();
  return query(
    'UPDATE content SET normalized_hash = ?, synced = 0, updated_at = ? WHERE id = ?',
    [hash, ts, id]
  );
}

/**
 * Mark all paragraphs for a document as dirty.
 * Use when document metadata changes (title, author, religion, etc.)
 * since Meilisearch stores denormalized metadata on each paragraph.
 */
async function markDocDirty(docId) {
  const ts = now();
  return query(
    'UPDATE content SET synced = 0, updated_at = ? WHERE doc_id = ?',
    [ts, docId]
  );
}

// ============================================================
// Embedding operations
// ============================================================

/**
 * Regenerate embedding for a specific paragraph.
 * Clears the current embedding so the embedding-worker picks it up.
 * Sync-worker will then push the new embedding to Meilisearch.
 *
 * The paragraph is marked dirty (synced=0) because:
 * - If the old embedding was wrong-dimension, Meilisearch couldn't use it anyway
 * - With embedding=NULL, the paragraph is still FTS-searchable in Meilisearch
 * - When the embedding-worker generates the new one, updateEmbedding() marks
 *   it dirty again and the sync-worker pushes the complete version
 *
 * If OpenAI is down, the paragraph stays FTS-only until the embedding-worker
 * succeeds. This is strictly better than a wrong-dimension embedding that
 * poisons sync batches.
 */
async function regenerateEmbedding(id) {
  const ts = now();
  return query(`
    UPDATE content
    SET embedding = NULL, embedding_model = NULL, synced = 0, updated_at = ?
    WHERE id = ?
  `, [ts, id]);
}

/**
 * Regenerate embeddings for all paragraphs in a document.
 */
async function regenerateEmbeddingsForDoc(docId) {
  const ts = now();
  const result = await query(`
    UPDATE content
    SET embedding = NULL, embedding_model = NULL, synced = 0, updated_at = ?
    WHERE doc_id = ? AND deleted_at IS NULL
  `, [ts, docId]);
  logger.info({ docId, affected: result.rowsAffected }, 'Cleared embeddings for re-generation');
  return result;
}

/**
 * Find and clear all wrong-dimension embeddings.
 * Wrong-dimension embeddings are useless — Meilisearch rejects them and they
 * poison entire sync batches. Clearing them lets paragraphs:
 * 1. Immediately become FTS-searchable (synced=0 → sync-worker → Meilisearch with null vector)
 * 2. Get correct embeddings when the embedding-worker regenerates them
 *
 * @returns {object} { cleared: number } count of embeddings nulled out
 */
async function clearWrongDimensionEmbeddings() {
  const ts = now();
  const result = await query(`
    UPDATE content
    SET embedding = NULL, embedding_model = NULL, synced = 0, updated_at = ?
    WHERE embedding IS NOT NULL
      AND deleted_at IS NULL
      AND LENGTH(embedding) != ?
  `, [ts, EXPECTED_EMBEDDING_BYTES]);

  const cleared = result.rowsAffected || 0;
  if (cleared > 0) {
    logger.warn({ cleared, expectedBytes: EXPECTED_EMBEDDING_BYTES },
      'Cleared wrong-dimension embeddings for re-generation');
  }
  return { cleared };
}

/**
 * Propagate existing embeddings to rows with matching normalized_hash.
 * Avoids expensive re-generation for duplicate content across documents.
 * Batched in chunks of 1000 to avoid holding the write lock for seconds.
 */
async function propagateEmbeddings() {
  const ts = now();
  const BATCH = 1000;
  let totalPropagated = 0;
  while (true) {
    // Find a batch of rows that need propagation
    const candidates = await queryAll(`
      SELECT c1.id, c1.normalized_hash
      FROM content c1
      WHERE c1.embedding IS NULL
        AND c1.deleted_at IS NULL
        AND c1.normalized_hash IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM content c2
          WHERE c2.normalized_hash = c1.normalized_hash
            AND c2.embedding IS NOT NULL
            AND LENGTH(c2.embedding) = ?
        )
      LIMIT ?
    `, [EXPECTED_EMBEDDING_BYTES, BATCH]);
    if (candidates.length === 0) break;
    // Build batch update using transaction
    const statements = [];
    for (const row of candidates) {
      statements.push({
        sql: `UPDATE content
          SET embedding = (
            SELECT c2.embedding FROM content c2
            WHERE c2.normalized_hash = ? AND c2.embedding IS NOT NULL AND LENGTH(c2.embedding) = ?
            LIMIT 1
          ),
          embedding_model = (
            SELECT c2.embedding_model FROM content c2
            WHERE c2.normalized_hash = ? AND c2.embedding IS NOT NULL AND LENGTH(c2.embedding) = ?
            LIMIT 1
          ),
          synced = 0, updated_at = ?
          WHERE id = ?`,
        args: [row.normalized_hash, EXPECTED_EMBEDDING_BYTES, row.normalized_hash, EXPECTED_EMBEDDING_BYTES, ts, row.id]
      });
    }
    await transaction(statements);
    totalPropagated += candidates.length;
    if (candidates.length < BATCH) break;
  }
  if (totalPropagated > 0) {
    logger.info({ propagated: totalPropagated }, 'Propagated existing embeddings to matching content');
  }
  return { propagated: totalPropagated };
}

// ============================================================
// Sync-worker operations
// ============================================================

/**
 * Get documents that have dirty (synced=0) paragraphs.
 */
async function getDocsWithDirtyParagraphs(limit = 50) {
  // Subquery on partial index is fast; avoids full JOIN scan
  return queryAll(`
    SELECT d.id, d.title, d.author, d.religion, d.collection,
           d.language, d.year, d.description, d.filename
    FROM docs d
    WHERE d.id IN (
      SELECT DISTINCT doc_id FROM content
      WHERE synced = 0 AND deleted_at IS NULL
      LIMIT ?
    )
  `, [limit * 10]);  // over-fetch doc_ids since LIMIT inside subquery is on rows not distinct
}

/**
 * Get a batch of dirty paragraphs (doc-agnostic).
 * Joins doc metadata so the sync processor doesn't need separate doc lookups.
 * Only reads embedding when it exists AND matches expected dimensions (via embedding_model).
 * This avoids reading 12KB BLOBs that will be discarded for wrong-dimension vectors.
 */
async function getDirtyParagraphsBatch(limit = 50) {
  return queryAll(`
    SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.heading, c.blocktype,
           CASE WHEN c.embedding_model = 'text-embedding-3-large' THEN c.embedding ELSE NULL END as embedding,
           c.embedding_model, c.content_hash, c.normalized_hash, c.external_para_id, c.pdf_page,
           c.translation, c.translation_segments, c.context,
           d.title, d.author, d.filename, d.religion, d.collection,
           d.language, d.year, d.description, d.source_site, d.source_url
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.synced = 0 AND c.deleted_at IS NULL
    LIMIT ?
  `, [limit]);
}

/**
 * Get dirty paragraphs for a specific document.
 */
async function getDirtyParagraphsForDoc(docId, limit = 500) {
  // embedding column excluded — worker reads 512-dim vectors from embedding_cache.db.
  // Includes both deleted_at IS NULL and deleted_at IS NOT NULL rows: when
  // a paragraph is soft-deleted OR marked is_duplicate=1, we still need to
  // drive its REMOVAL from Meili. The worker decides upsert vs. delete from
  // the is_duplicate / deleted_at flags.
  return queryAll(`
    SELECT id, doc_id, paragraph_index, text, heading, blocktype,
           embedding_model, content_hash, normalized_hash,
           translation, translation_segments, context,
           is_duplicate, deleted_at
    FROM content
    WHERE doc_id = ? AND synced = 0
    ORDER BY paragraph_index
    LIMIT ?
  `, [docId, limit]);
}

/**
 * Mark paragraphs as synced. ONLY the sync-worker should call this,
 * and ONLY after Meilisearch has confirmed the task succeeded.
 */
async function markSynced(ids) {
  if (!ids || ids.length === 0) return;

  const ts = now();
  const BATCH = 500; // SQLite variable limit safety
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await query(`
      UPDATE content SET synced = 1, updated_at = ?
      WHERE id IN (${batch.map(() => '?').join(',')})
    `, [ts, ...batch]);
  }
}

// ============================================================
// Embedding-worker operations
// ============================================================

/**
 * Get paragraphs that need embedding generation.
 * Uses indexed lookup + pagination instead of GROUP BY full-table scan.
 * Deduplicates by normalized_hash in-memory (much cheaper than SQL GROUP BY on 2.5M rows).
 * Skips paragraphs whose normalized_hash already exists in embedding_cache.db.
 */
async function getUnembedded(limit = 50, maxChars = 6000) {
  // Fetch more than needed since we deduplicate and filter in-memory
  const fetchLimit = limit * 5;
  const rows = await queryAll(`
    SELECT id, text, normalized_hash
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND text IS NOT NULL
      AND text != ''
      AND LENGTH(text) <= ?
    ORDER BY id
    LIMIT ?
  `, [maxChars, fetchLimit]);
  // Deduplicate by normalized_hash — keep first occurrence per hash
  const seen = new Set();
  const candidates = [];
  for (const row of rows) {
    const key = row.normalized_hash || `id:${row.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(row);
    }
  }
  // Filter out hashes that already have a cached 512-dim embedding
  if (!embeddingCacheReady || !candidates.length) return candidates.slice(0, limit);
  const result = [];
  for (const row of candidates) {
    if (result.length >= limit) break;
    if (!row.normalized_hash) { result.push(row); continue; }
    const cached = await getEmbedding(row.normalized_hash, CACHE_MODEL, CACHE_DIM);
    if (cached) {
      // Cache hit — backfill inline embedding so content table stays consistent, then skip
      const fa = new Float32Array(cached.buffer, cached.byteOffset, cached.length / 4);
      const embeddingBuffer = Buffer.from(fa.buffer);
      query(`UPDATE content SET embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?`,
        [embeddingBuffer, CACHE_MODEL, now(), row.id]).catch(err =>
        logger.warn({ id: row.id, err: err.message }, 'Failed to backfill inline embedding from cache'));
    } else {
      result.push(row);
    }
  }
  return result;
}

/**
 * Count paragraphs needing embeddings.
 * Direct COUNT query — partial index keeps this fast.
 */
async function getUnembeddedCount(maxChars = 6000) {
  return queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT normalized_hash) as unique_hashes
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND LENGTH(text) <= ?
  `, [maxChars]);
}

/**
 * Count oversized paragraphs (skipped by embedding worker).
 * Direct COUNT query — partial index keeps this fast.
 */
async function getOversizedCount(maxChars = 6000) {
  return queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT normalized_hash) as unique_hashes
    FROM content
    WHERE embedding IS NULL
      AND deleted_at IS NULL
      AND LENGTH(text) > ?
  `, [maxChars]);
}

/**
 * Soft-delete oversized content that can't be embedded.
 */
async function softDeleteOversized(maxChars = 6000, docId = null) {
  const ts = now();
  const where = docId
    ? 'doc_id = ? AND embedding IS NULL AND deleted_at IS NULL AND LENGTH(text) > ?'
    : 'embedding IS NULL AND deleted_at IS NULL AND LENGTH(text) > ?';
  const params = docId ? [ts, ts, docId, maxChars] : [ts, ts, maxChars];

  return query(`
    UPDATE content SET deleted_at = ?, synced = 0, updated_at = ?
    WHERE ${where}
  `, params);
}

// ============================================================
// Query helpers (reads — no dirty-flag concerns)
// ============================================================

/**
 * Get a paragraph by ID.
 */
async function getById(id) {
  return queryOne('SELECT * FROM content WHERE id = ?', [id]);
}

/**
 * Get all paragraphs for a document.
 */
async function getByDocId(docId) {
  return queryAll(
    'SELECT * FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index',
    [docId]
  );
}

/**
 * Count paragraphs for a document.
 */
async function countByDocId(docId) {
  const result = await queryOne(
    'SELECT COUNT(*) as count FROM content WHERE doc_id = ? AND deleted_at IS NULL',
    [docId]
  );
  return result?.count || 0;
}

/**
 * Get count of dirty (unsynced) paragraphs.
 */
async function getDirtyCount() {
  const result = await queryOne(`
    SELECT
      COUNT(DISTINCT doc_id) as documents,
      COUNT(*) as paragraphs
    FROM content
    WHERE synced = 0 AND deleted_at IS NULL
  `);
  return result || { documents: 0, paragraphs: 0 };
}

/**
 * Get all content IDs for a document (for orphan cleanup).
 */
async function getIdsForDoc(docId) {
  return queryAll('SELECT id FROM content WHERE doc_id = ?', [docId]);
}

/**
 * Get embedding stats for diagnostics.
 */
async function getEmbeddingStats() {
  return queryOne(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) = ${EXPECTED_EMBEDDING_BYTES} THEN 1 ELSE 0 END) as correct_embeddings,
      SUM(CASE WHEN embedding IS NOT NULL AND LENGTH(embedding) != ${EXPECTED_EMBEDDING_BYTES} THEN 1 ELSE 0 END) as wrong_embeddings,
      SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) as missing_embeddings,
      SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) as dirty
    FROM content
    WHERE deleted_at IS NULL
  `);
}

// ============================================================
// Exports
// ============================================================

export const content = {
  // Lifecycle
  insertParagraph,
  bulkInsertParagraphs,
  deleteParagraph,
  deleteParagraphsByDoc,
  softDeleteByDoc,
  restoreByDoc,
  hardDeleteExpired,
  bulkReplace,

  // Field updates (all mark dirty)
  updateText,
  updateEmbedding,
  updateTranslation,
  clearTranslation,
  clearTranslationsForDoc,
  clearAllTranslations,
  updateContext,
  updateContextOnly,
  updateHypQuestions,
  markEnhancedSynced,
  updatePosition,
  updateNormalizedHash,
  markDocDirty,

  // Enhancement-worker
  getUndisambiguated,
  getUnhyped,
  getEnhancedUnsynced,
  getDocsWithoutEntities,
  upsertDocEntities,
  getDocEntities,

  // Embedding operations
  regenerateEmbedding,
  regenerateEmbeddingsForDoc,
  clearWrongDimensionEmbeddings,
  propagateEmbeddings,

  // Sync-worker (exclusive)
  getDocsWithDirtyParagraphs,
  getDirtyParagraphsBatch,
  getDirtyParagraphsForDoc,
  markSynced,

  // Embedding cache helpers
  initEmbeddingCacheIfNeeded,
  getEmbeddingsFromCache,

  // Embedding-worker
  getUnembedded,
  getUnembeddedCount,
  getOversizedCount,
  softDeleteOversized,

  // Reads
  getById,
  getByDocId,
  countByDocId,
  getDirtyCount,
  getIdsForDoc,
  getEmbeddingStats,

  // Utility (exported for ingester)
  computeContentHash,
  computeNormalizedHash,
  normalizeForEmbedding,
  validateEmbedding,
  EXPECTED_EMBEDDING_BYTES,
  EXPECTED_EMBEDDING_DIMS
};

export default content;
