/**
 * Document Indexing Service
 *
 * Handles parsing, chunking, embedding generation, and indexing of documents.
 * Supports text, markdown, and JSON formats.
 *
 * EMBEDDING CACHING STRATEGY:
 * - Embeddings are expensive (OpenAI API calls)
 * - We store embeddings in libsql alongside paragraph text
 * - content_hash tracks if text/context changed
 * - Only regenerate embeddings when content actually changes
 * - Metadata-only updates (authority, collection) reuse cached embeddings
 */

import crypto from 'crypto';
import { aiService } from '../lib/ai-services.js';
import { indexDocument, deleteDocument, getMeili, INDEXES } from '../lib/search.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';
import { getAuthority } from '../lib/authority.js';
import { query, queryOne, queryAll, batchQuery, batchQueryOne, batchQueryAll } from '../lib/db.js';
import { content } from '../lib/content.js';
import { detectLanguageFeatures } from './segmenter.js';
import {
  normalizeForHash as sharedNormalizeForEmbedding,
  cleanForEmbedding as sharedCleanForEmbedding,
  hashNormalized as sharedHashNormalized
} from '../lib/text-normalize.js';
import { config } from '../lib/config.js';
import { hashContent, parseMarkdownFrontmatter } from './ingester.js';

// Re-export for backwards compatibility (tests import from indexer.js)
export { parseMarkdownFrontmatter };

// Chunking configuration
const CHUNK_CONFIG = {
  maxChunkSize: 1500,      // Max characters per chunk
  minChunkSize: 100,       // Min characters (skip smaller chunks)
  overlapSize: 150,        // Overlap between chunks for context
  sentenceDelimiters: /[.!?]\s+/,
  paragraphDelimiters: /\n\n+/
};

// Current embedding model - text-embedding-3-large with 3072 dimensions for maximum semantic quality
const EMBEDDING_MODEL = config?.ai?.embeddings?.model || 'text-embedding-3-large';

/**
 * Retry a database operation with exponential backoff for SQLITE_BUSY errors
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum retries (default: 5)
 * @param {number} baseDelay - Base delay in ms (default: 100)
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 5, baseDelay = 100) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err.message?.includes('SQLITE_BUSY') && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Compute content hash for change detection
 * Hash includes text and any context that affects embedding quality
 * @param {string} text - The paragraph text
 * @param {string} [context] - Optional context (who, what, where, when)
 * @returns {string} MD5 hash
 */
function computeContentHash(text, context = '') {
  const content = `${text}|||${context}`.trim();
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Normalize text for embedding lookup
 * Strips everything irrelevant to semantic meaning so identical content
 * can be matched even with formatting differences (quotes in 50 docs = 1 embedding)
 * @param {string} text - The paragraph text
 * @returns {string} Normalized text
 */
// Aliased imports — see api/lib/text-normalize.js for the canonical
// implementations. The local names are kept so internal call sites in this
// file don't need to change.
const normalizeForEmbedding = sharedNormalizeForEmbedding;
const cleanForEmbedding = sharedCleanForEmbedding;
const computeNormalizedHash = sharedHashNormalized;

/**
 * Get cached embeddings from libsql for paragraphs that haven't changed
 * Two-phase lookup:
 * 1. Same document: Looks up by file_path/body_hash, matches by paragraph_index + content_hash
 * 2. Global: For uncached paragraphs, looks up ANY content with same normalized_hash
 *    (normalized_hash strips formatting so "Hello World!" matches "hello world")
 * @param {string} filePath - Document file_path for lookup
 * @param {Array<{text: string, hash: string}>} paragraphs - Paragraphs with hashes
 * @param {string} [bodyHash] - Optional body_hash for lookup if file was renamed
 * @returns {Promise<Map<number, Float32Array>>} Map of paragraph_index to embedding
 */
// Cache lookup returns bundles, not just embeddings. When a paragraph's
// normalized_hash matches an existing row, we ALSO inherit any enrichment
// that row already has — disambiguation context, HyPE thesis, HyPE questions —
// so re-ingesting (or importing a verbatim copy from another source like
// OceanLibrary) doesn't re-run paid enrichment on identical text.
//
// Returned shape: Map<paragraph_index, {
//   embedding: Float32Array,
//   embedding_model: string,
//   hyp_thesis?: string,
//   hyp_questions?: string,
//   context?: string,
//   context_model?: string
// }>
async function getCachedEmbeddings(filePath, paragraphs, bodyHash = null) {
  const cached = new Map();

  try {
    // Phase 1: Look up from same document (most efficient - exact content_hash match)
    const doc = await queryOne('SELECT id FROM docs WHERE file_path = ? AND deleted_at IS NULL', [filePath]);

    // DISABLED: body_hash lookup caused duplicate files to share embeddings incorrectly
    // Two files with identical body content should NOT share the same doc record
    // if (!doc && bodyHash) { ... }

    if (doc) {
      const existing = await queryAll(
        `SELECT paragraph_index, content_hash, embedding, embedding_model,
                hyp_thesis, hyp_questions, context, context_model
         FROM content WHERE doc_id = ? AND deleted_at IS NULL`,
        [doc.id]
      );

      for (const row of existing) {
        const para = paragraphs[row.paragraph_index];
        // Check if hash matches AND we have an embedding with current model
        if (para &&
            row.content_hash === para.hash &&
            row.embedding &&
            row.embedding_model === EMBEDDING_MODEL) {
          const buffer = row.embedding;
          if (buffer && buffer.length > 0) {
            cached.set(row.paragraph_index, {
              embedding: new Float32Array(buffer.buffer || buffer),
              embedding_model: row.embedding_model,
              hyp_thesis: row.hyp_thesis || null,
              hyp_questions: row.hyp_questions || null,
              context: row.context || null,
              context_model: row.context_model || null
            });
          }
        }
      }
    }

    // Phase 2: Global lookup for uncached paragraphs by normalized_hash
    // This finds embeddings from ANY document with semantically identical content
    // (same quote in 50 documents = 1 embedding generation, 49 lookups)
    const uncachedIndices = paragraphs
      .map((_, i) => i)
      .filter(i => !cached.has(i));

    if (uncachedIndices.length > 0) {
      // Compute normalized_hash for each uncached paragraph
      const uncachedNormalizedHashes = uncachedIndices.map(i =>
        computeNormalizedHash(paragraphs[i].text)
      );

      // Chunk IN queries to ≤200 params — avoids SQLite SQLITE_MAX_VARIABLE_NUMBER
      // limit and caps per-query memory for large documents (e.g. 1682-para books).
      const HASH_BATCH = 200;
      const globalMatchRows = [];
      for (let b = 0; b < uncachedNormalizedHashes.length; b += HASH_BATCH) {
        const batchHashes = uncachedNormalizedHashes.slice(b, b + HASH_BATCH);
        const placeholders = batchHashes.map(() => '?').join(',');
        const rows = await queryAll(
          `SELECT normalized_hash,
                  MAX(embedding) AS embedding,
                  MAX(embedding_model) AS embedding_model,
                  MAX(hyp_thesis) AS hyp_thesis,
                  MAX(hyp_questions) AS hyp_questions,
                  MAX(context) AS context,
                  MAX(context_model) AS context_model
           FROM content
           WHERE normalized_hash IN (${placeholders})
             AND embedding IS NOT NULL
             AND embedding_model = ?
           GROUP BY normalized_hash`,
          [...batchHashes, EMBEDDING_MODEL]
        );
        globalMatchRows.push(...rows);
      }
      const globalMatches = globalMatchRows;

      // Build normalized_hash -> bundle map from global matches
      const globalBundles = new Map();
      for (const row of globalMatches) {
        if (row.embedding && row.embedding.length > 0) {
          globalBundles.set(row.normalized_hash, {
            embedding: new Float32Array(row.embedding.buffer || row.embedding),
            embedding_model: row.embedding_model,
            hyp_thesis: row.hyp_thesis || null,
            hyp_questions: row.hyp_questions || null,
            context: row.context || null,
            context_model: row.context_model || null
          });
        }
      }

      // Apply global matches to uncached paragraphs
      for (let i = 0; i < uncachedIndices.length; i++) {
        const idx = uncachedIndices[i];
        const normalizedHash = uncachedNormalizedHashes[i];
        if (globalBundles.has(normalizedHash)) {
          cached.set(idx, globalBundles.get(normalizedHash));
        }
      }

      if (globalMatches.length > 0) {
        logger.debug({
          filePath,
          globalHits: globalMatches.length,
          uncachedCount: uncachedIndices.length
        }, 'Global embedding cache hits from normalized_hash lookup');
      }
    }

    logger.debug({ filePath, cached: cached.size, total: paragraphs.length }, 'Total embedding cache hits');
  } catch (err) {
    logger.warn({ err: err.message, filePath }, 'Failed to get cached embeddings');
  }

  return cached;
}

/**
 * Store document and content in libsql
 * @param {Object} document - Document metadata (must include file_path, file_hash, body_hash)
 * @param {Array<Object>} paragraphs - Paragraphs with text, hash, embedding
 * @returns {{ docId: number, paragraphIds: number[] }} Generated integer IDs
 */
async function storeInLibsql(document, paragraphs) {
  const now = new Date().toISOString();
  const insertedIds = [];

  try {
    // DISABLED: body_hash lookup caused duplicate files to be merged
    // Two files with identical body content are NOT necessarily the same document.
    // The upsert by file_path below handles the actual file identity correctly.

    // Upsert by file_path - this is the correct way to identify documents
    const docResult = await query(`
        INSERT INTO docs (file_path, file_hash, body_hash, title, author, religion, collection, language, year, description, paragraph_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          file_hash = excluded.file_hash,
          body_hash = excluded.body_hash,
          title = excluded.title,
          author = excluded.author,
          religion = excluded.religion,
          collection = excluded.collection,
          language = excluded.language,
          year = excluded.year,
          description = excluded.description,
          paragraph_count = excluded.paragraph_count,
          updated_at = excluded.updated_at,
          deleted_at = NULL
        RETURNING id
      `, [
        document.file_path,
        document.file_hash || null,
        document.body_hash || null,
        document.title,
        document.author,
        document.religion,
        document.collection,
        document.language,
        document.year,
        document.description,
        paragraphs.length,
        now,
        now
      ]);

    // Get the INTEGER doc id (either newly inserted or existing)
    const docId = Number(docResult.rows?.[0]?.id || docResult.lastInsertRowid);

    // Delete existing paragraphs for this document via content API
    await content.deleteParagraphsByDoc(docId);

    // Insert all paragraphs via content API and collect auto-generated ids
    for (const para of paragraphs) {
      // Convert embedding to Buffer for BLOB storage.
      // OpenAI returns plain float arrays; Float32Array has .buffer; handle all cases.
      const embeddingBlob = (() => {
        const emb = para.embedding;
        if (!emb) return null;
        if (Buffer.isBuffer(emb)) return emb;
        if (emb.buffer instanceof ArrayBuffer) return Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
        if (Array.isArray(emb) || ArrayBuffer.isView(emb)) return Buffer.from(new Float32Array(emb).buffer);
        return null;
      })();

      const result = await content.insertParagraph(docId, {
        paragraphIndex: para.paragraph_index,
        text: para.text,
        heading: para.heading || '',
        blocktype: para.blocktype || 'paragraph',
        embedding: embeddingBlob,
        embeddingModel: para.embedding ? EMBEDDING_MODEL : null,
        // Sidecar enrichment carried forward from cache hits (NULL when no hit)
        hyp_thesis: para.hyp_thesis || null,
        hyp_questions: para.hyp_questions || null,
        context: para.context || null,
        context_model: para.context_model || null,
        // External-source paragraph ID (e.g. OceanLibrary's "para_13")
        external_para_id: para.external_para_id || null
      });

      // Get the auto-generated id (lastInsertRowid)
      insertedIds.push(Number(result.lastInsertRowid));
    }

    logger.debug({ docId, paragraphs: paragraphs.length }, 'Stored in libsql');
    return { docId, paragraphIds: insertedIds };
  } catch (err) {
    logger.error({ err: err.message, file_path: document.file_path }, 'Failed to store in libsql');
    throw err;
  }
}

/**
 * Chunk markdown document text into embedder-sized paragraphs.
 *
 * Disambiguated from `parseDocument` in api/services/ingester.js — the
 * ingester one returns full document records (frontmatter + paragraphs +
 * metadata) for the ingestion pipeline; this one returns ONLY the chunked
 * text array suitable for embedding generation.
 */
export function chunkDocumentForIndexing(text, options = {}) {
  const {
    maxChunkSize = CHUNK_CONFIG.maxChunkSize,
    minChunkSize = CHUNK_CONFIG.minChunkSize,
    overlapSize = CHUNK_CONFIG.overlapSize
  } = options;

  // Helper to hard-split text that exceeds maxChunkSize
  function hardSplit(text) {
    const result = [];
    for (let i = 0; i < text.length; i += maxChunkSize) {
      result.push(text.slice(i, i + maxChunkSize));
    }
    return result;
  }

  // Split by paragraphs first
  const paragraphs = text.split(CHUNK_CONFIG.paragraphDelimiters)
    .map(p => p.trim())
    .filter(p => p.length >= minChunkSize);

  const chunks = [];

  for (const para of paragraphs) {
    if (para.length <= maxChunkSize) {
      // Paragraph fits in one chunk
      chunks.push(para);
    } else {
      // Need to split paragraph into smaller chunks
      const sentences = para.split(CHUNK_CONFIG.sentenceDelimiters);
      let currentChunk = '';

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        // If a single sentence exceeds max, hard-split it
        if (trimmed.length > maxChunkSize) {
          // Save current chunk first
          if (currentChunk.length >= minChunkSize) {
            chunks.push(currentChunk);
          }
          // Hard-split the oversized sentence
          chunks.push(...hardSplit(trimmed));
          currentChunk = '';
          continue;
        }

        if (currentChunk.length + trimmed.length + 1 <= maxChunkSize) {
          currentChunk += (currentChunk ? ' ' : '') + trimmed;
        } else {
          // Save current chunk if it's long enough
          if (currentChunk.length >= minChunkSize) {
            chunks.push(currentChunk);
          }
          // Start new chunk with overlap
          if (overlapSize > 0 && currentChunk.length > overlapSize) {
            // Include last part of previous chunk for context
            const words = currentChunk.split(/\s+/);
            const overlapWords = [];
            let overlapLen = 0;
            for (let i = words.length - 1; i >= 0 && overlapLen < overlapSize; i--) {
              overlapWords.unshift(words[i]);
              overlapLen += words[i].length + 1;
            }
            currentChunk = overlapWords.join(' ') + ' ' + trimmed;
          } else {
            currentChunk = trimmed;
          }
        }
      }

      // Don't forget the last chunk
      if (currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk);
      }
    }
  }

  return chunks;
}

/**
 * Index a document from raw text
 * Uses embedding cache in libsql to avoid regenerating unchanged paragraphs
 */
export async function indexDocumentFromText(text, metadata = {}) {
  // file_path is required for database uniqueness (comes from metadata.relativePath)
  const filePath = metadata.relativePath || metadata.file_path || `generated/${nanoid(12)}.md`;

  const {
    title = 'Untitled',
    author = 'Unknown',
    religion = 'General',
    collection = 'General',
    language = 'en',
    year = null,
    description = ''
  } = metadata;

  // Parse content (handle markdown frontmatter if present)
  let bodyText = text;
  let extractedMeta = {};

  if (text.startsWith('---')) {
    const parsed = parseMarkdownFrontmatter(text);
    bodyText = parsed.content;
    extractedMeta = parsed.metadata;
  }

  // Merge metadata (frontmatter takes precedence for author, explicit path metadata for other fields)
  // Author: prefer frontmatter over path-extracted 'Unknown'
  const finalAuthor = extractedMeta.author ||
    (metadata.author && metadata.author !== 'Unknown' ? metadata.author : author);

  // Detect language from content - this is more reliable than frontmatter
  // Arabic/Farsi detection should OVERRIDE frontmatter 'en' since it's often wrong
  const detectedLang = detectLanguageFeatures(bodyText);
  const contentLanguage = detectedLang.language !== 'en' ? detectedLang.language : null;

  // Language priority: content detection (for RTL) > frontmatter > metadata > default
  const finalLanguage = contentLanguage || extractedMeta.language || metadata.language || language;

  const finalMeta = {
    // Title: frontmatter takes precedence over path-extracted metadata
    title: extractedMeta.title || metadata.title || title,
    author: finalAuthor,
    religion: metadata.religion || extractedMeta.religion || religion,
    collection: metadata.collection || extractedMeta.collection || collection,
    language: finalLanguage,
    year: extractedMeta.year || metadata.year || year,
    description: extractedMeta.description || metadata.description || description
  };

  // Chunk into embedder-sized blocks
  const chunks = chunkDocumentForIndexing(bodyText);

  if (chunks.length === 0) {
    throw new Error('Document has no content to index');
  }

  // Compute content hashes for change detection
  const chunksWithHashes = chunks.map((text, index) => ({
    text,
    index,
    hash: computeContentHash(text)
  }));

  // Compute hashes for document deduplication and rename detection (SHA-256 for consistency with ingester)
  const fileHash = hashContent(text);     // Full file including frontmatter
  const bodyHash = hashContent(bodyText); // Body only - use for rename detection

  // Check for cached embeddings in libsql (using file_path for lookup, fallback to body_hash for renames)
  const cachedEmbeddings = await getCachedEmbeddings(filePath, chunksWithHashes, bodyHash);
  const cachedCount = cachedEmbeddings.size;

  // Find chunks that need new embeddings
  const chunksToEmbed = chunksWithHashes.filter((_, i) => !cachedEmbeddings.has(i));

  logger.info({
    documentId: filePath,
    chunks: chunks.length,
    cached: cachedCount,
    toGenerate: chunksToEmbed.length
  }, 'Embedding status');

  // Generate embeddings only for new/changed chunks
  let newEmbeddings = [];
  if (chunksToEmbed.length > 0) {
    const textsToEmbed = chunksToEmbed.map(c => cleanForEmbedding(c.text));
    newEmbeddings = await aiService('embedding').embed(textsToEmbed, { caller: 'indexer' });
    logger.info({ documentId: filePath, generated: newEmbeddings.length }, 'Generated new embeddings');
  }

  // Merge cached bundles and freshly-generated embeddings.
  // Bundles carry sidecar enrichment (HyPE / disambig) — captured here so
  // they ride along into storeInLibsql.
  const embeddings = [];
  const sidecars = [];  // parallel array, same indices as embeddings
  let newEmbeddingIndex = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (cachedEmbeddings.has(i)) {
      const bundle = cachedEmbeddings.get(i);
      embeddings.push(bundle.embedding);
      sidecars.push({
        hyp_thesis: bundle.hyp_thesis,
        hyp_questions: bundle.hyp_questions,
        context: bundle.context,
        context_model: bundle.context_model
      });
    } else {
      embeddings.push(newEmbeddings[newEmbeddingIndex++]);
      sidecars.push(null);
    }
  }

  // Calculate authority (doctrinal weight) based on author, collection, religion
  const authority = getAuthority({
    author: finalMeta.author,
    religion: finalMeta.religion,
    collection: finalMeta.collection,
    authority: metadata.authority  // Allow explicit override
  });

  logger.debug({ filePath, authority, author: finalMeta.author, collection: finalMeta.collection }, 'Calculated document authority');

  // Create document record for SQLite (id is auto-generated INTEGER)
  const document = {
    file_path: filePath,
    file_hash: fileHash,
    body_hash: bodyHash,  // Body only - used for rename detection
    title: finalMeta.title,
    author: finalMeta.author,
    religion: finalMeta.religion,
    collection: finalMeta.collection,
    language: finalMeta.language,
    year: finalMeta.year ? parseInt(finalMeta.year, 10) : null,
    description: finalMeta.description,
    authority,  // Doctrinal weight (1-10) for ranking
    chunk_count: chunks.length,
    created_at: new Date().toISOString()
  };

  // Store in SQLite first (to get auto-generated INTEGER ids).
  // Sidecar fields ride along when the cache had a hash hit on prior enrichment.
  const libsqlParagraphs = chunks.map((text, index) => ({
    paragraph_index: index,
    text,
    content_hash: chunksWithHashes[index].hash,
    heading: extractHeading(content, text),
    blocktype: 'paragraph',
    embedding: embeddings[index],
    ...(sidecars[index] || {})
  }));

  const { docId, paragraphIds } = await storeInLibsql(document, libsqlParagraphs);

  // storeInLibsql() deleted all old content rows and inserted new ones with new IDs.
  // Delete old paragraphs from Meilisearch to prevent orphaned entries.
  try {
    const meili = getMeili();
    if (meili) {
      await meili.index(INDEXES.PARAGRAPHS).deleteDocuments({
        filter: `doc_id = ${docId}`
      });
    }
  } catch (err) {
    logger.warn({ docId, err: err.message }, 'Failed to clean old paragraphs from Meilisearch before re-index');
  }

  // Create document record for Meilisearch (uses INTEGER id from SQLite)
  const meiliDocument = {
    id: docId,  // INTEGER id from SQLite
    title: finalMeta.title,
    author: finalMeta.author,
    religion: finalMeta.religion,
    collection: finalMeta.collection,
    language: finalMeta.language,
    year: finalMeta.year ? parseInt(finalMeta.year, 10) : null,
    description: finalMeta.description,
    authority,
    chunk_count: chunks.length,
    created_at: new Date().toISOString()
  };

  // Create paragraph records for Meilisearch using SQLite-generated ids
  const paragraphs = chunks.map((text, index) => ({
    id: paragraphIds[index],  // INTEGER id from SQLite
    doc_id: docId,  // INTEGER from SQLite docs.id
    paragraph_index: index,
    text,
    title: finalMeta.title,
    author: finalMeta.author,
    religion: finalMeta.religion,
    collection: finalMeta.collection,
    language: finalMeta.language,
    year: finalMeta.year ? parseInt(finalMeta.year, 10) : null,
    authority,  // Doctrinal weight (1-10) for ranking - same as parent document
    heading: extractHeading(content, text), // Try to find section heading
    _vectors: {
      default: embeddings[index]
    },
    created_at: new Date().toISOString()
  }));

  // Index in Meilisearch
  await indexDocument(meiliDocument, paragraphs);

  // Mark paragraphs as synced via content API
  // NOTE: indexDocument() above uses fire-and-forget Meilisearch enqueue.
  // The sync-worker will handle verified sync for any that fail.
  // This optimistic mark is acceptable here because the sync-worker
  // will re-dirty and re-sync any that Meilisearch actually rejected.
  if (paragraphIds.length > 0) {
    await content.markSynced(paragraphIds);
  }

  return {
    documentId: docId,
    filePath,
    title: finalMeta.title,
    chunks: chunks.length,
    cached: cachedCount,
    generated: chunks.length - cachedCount,
    success: true
  };
}

/**
 * Try to extract the heading for a chunk from the full document
 */
function extractHeading(fullContent, chunkText) {
  // Find chunk position in document
  const chunkPos = fullContent.indexOf(chunkText.substring(0, 100));
  if (chunkPos === -1) return null;

  // Look for markdown headings before this position
  const beforeChunk = fullContent.substring(0, chunkPos);
  const headingMatches = beforeChunk.match(/^#+\s+(.+)$/gm);

  if (headingMatches && headingMatches.length > 0) {
    // Return the last heading before this chunk
    const lastHeading = headingMatches[headingMatches.length - 1];
    return lastHeading.replace(/^#+\s+/, '');
  }

  return null;
}

/**
 * Index multiple documents in batch
 */
export async function batchIndexDocuments(documents) {
  const results = [];

  for (const doc of documents) {
    try {
      const result = await indexDocumentFromText(doc.text, doc.metadata);
      results.push(result);
    } catch (err) {
      logger.error({ err, metadata: doc.metadata }, 'Failed to index document');
      results.push({
        documentId: doc.metadata?.id,
        title: doc.metadata?.title,
        success: false,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Index from JSON format (structured documents)
 */
export async function indexFromJSON(jsonData) {
  // Supports formats:
  // { documents: [{ text, metadata }] }
  // { title, author, chapters: [{ title, text }] }
  // [{ text, metadata }]

  if (Array.isArray(jsonData)) {
    return batchIndexDocuments(jsonData.map(d => ({
      text: d.text || d.content,
      metadata: d.metadata || d
    })));
  }

  if (jsonData.documents) {
    return batchIndexDocuments(jsonData.documents);
  }

  if (jsonData.chapters) {
    // Book format with chapters
    const baseMetadata = {
      title: jsonData.title,
      author: jsonData.author,
      religion: jsonData.religion,
      collection: jsonData.collection,
      language: jsonData.language,
      year: jsonData.year
    };

    const documents = jsonData.chapters.map((chapter, i) => ({
      text: chapter.text || chapter.content,
      metadata: {
        ...baseMetadata,
        id: `${jsonData.id || 'book'}_ch${i + 1}`,
        title: `${jsonData.title} - ${chapter.title || `Chapter ${i + 1}`}`
      }
    }));

    return batchIndexDocuments(documents);
  }

  // Single document
  return indexDocumentFromText(
    jsonData.text || jsonData.content,
    jsonData.metadata || jsonData
  );
}

/**
 * Remove a document from the index
 */
export async function removeDocument(documentId) {
  await deleteDocument(documentId);
  return { documentId, removed: true };
}

/**
 * Reindex all documents (rebuild index)
 * Note: This is destructive - use carefully
 */
export async function reindexAll(documents) {
  const meili = getMeili();

  // Clear existing indexes
  await meili.index(INDEXES.DOCUMENTS).deleteAllDocuments();
  await meili.index(INDEXES.PARAGRAPHS).deleteAllDocuments();

  logger.info('Cleared existing indexes, reindexing...');

  // Reindex all documents
  return batchIndexDocuments(documents);
}

/**
 * Get indexing queue status
 */
export async function getIndexingStatus() {
  const meili = getMeili();

  // Note: Meilisearch JS v0.50+ uses client.tasks.getTasks() instead of client.getTasks()
  const tasks = await meili.tasks.getTasks({
    statuses: ['processing', 'enqueued'],
    limit: 20
  });

  return {
    pending: tasks.results.length,
    tasks: tasks.results.map(t => ({
      uid: t.uid,
      status: t.status,
      type: t.type,
      indexUid: t.indexUid,
      enqueuedAt: t.enqueuedAt
    }))
  };
}

/**
 * Migrate existing embeddings from Meilisearch to libsql
 * This preserves paid-for OpenAI embeddings so we don't have to regenerate them
 * @param {Object} options
 * @param {number} options.batchSize - Documents per batch (default: 100)
 * @param {boolean} options.dryRun - If true, just count documents
 * @returns {Promise<{documents: number, paragraphs: number, embeddings: number}>}
 */
export async function migrateEmbeddingsFromMeilisearch(options = {}) {
  const { batchSize = 100, dryRun = false, onProgress = null } = options;
  const meili = getMeili();
  const now = new Date().toISOString();

  const stats = { documents: 0, paragraphs: 0, embeddings: 0, errors: 0 };

  try {
    // Get all documents from Meilisearch (we need their metadata)
    const docsIndex = meili.index(INDEXES.DOCUMENTS);
    const parasIndex = meili.index(INDEXES.PARAGRAPHS);

    // Get total count for progress reporting
    const docStats = await docsIndex.getStats();
    const totalDocs = docStats.numberOfDocuments || 0;
    logger.info({ totalDocs }, 'Starting embedding migration');

    // Fetch documents in batches
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Get batch of documents
      const docsResponse = await docsIndex.getDocuments({
        limit: batchSize,
        offset
      });

      const docs = docsResponse.results;
      if (docs.length === 0) {
        hasMore = false;
        break;
      }

      logger.info({ offset, count: docs.length, total: totalDocs }, 'Processing document batch');

      for (const doc of docs) {
        try {
          // Get paragraphs for this document with vectors
          const parasResponse = await parasIndex.search('', {
            filter: `doc_id = ${doc.id}`,  // INTEGER, no quotes
            limit: 1000,
            retrieveVectors: true
          });

          const paragraphs = parasResponse.hits;

          if (dryRun) {
            stats.documents++;
            stats.paragraphs += paragraphs.length;
            stats.embeddings += paragraphs.filter(p => p._vectors?.default).length;
            if (onProgress) {
              onProgress({ ...stats, total: totalDocs });
            }
            continue;
          }

          // Store document in libsql (with retry for SQLITE_BUSY)
          // Uses batch connection to avoid blocking auth
          await withRetry(() => batchQuery(`
            INSERT INTO docs (id, title, author, religion, collection, language, year, description, paragraph_count, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              author = excluded.author,
              religion = excluded.religion,
              collection = excluded.collection,
              language = excluded.language,
              year = excluded.year,
              description = excluded.description,
              paragraph_count = excluded.paragraph_count,
              updated_at = excluded.updated_at
          `, [
            doc.id,
            doc.title,
            doc.author,
            doc.religion,
            doc.collection,
            doc.language,
            doc.year,
            doc.description,
            paragraphs.length,
            now,
            now
          ]));

          stats.documents++;

          // Report progress after each document
          if (onProgress) {
            onProgress({ ...stats, total: totalDocs });
          }

          // Store paragraphs with embeddings
          for (const para of paragraphs) {
            const embedding = para._vectors?.default;
            const embeddingBlob = embedding
              ? Buffer.from(new Float32Array(embedding).buffer)
              : null;

            const contentHash = computeContentHash(para.text);

            // Ensure we have valid paragraph ID and text
            if (!para.id || !para.text) {
              logger.warn({ docId: doc.id, paraId: para.id }, 'Skipping paragraph with missing id or text');
              continue;
            }

            // TODO: Direct SQL — recovery path from Meilisearch, sets synced=1
            // since data is already confirmed in Meilisearch. No content API equivalent.
            await withRetry(() => batchQuery(`
              INSERT INTO content (id, doc_id, paragraph_index, text, content_hash, heading, blocktype, embedding, embedding_model, synced, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11)
              ON CONFLICT(id) DO UPDATE SET
                doc_id = excluded.doc_id,
                text = excluded.text,
                content_hash = excluded.content_hash,
                heading = excluded.heading,
                embedding = excluded.embedding,
                embedding_model = excluded.embedding_model,
                synced = 1,
                updated_at = excluded.updated_at
            `, [
              para.id,
              doc.id,
              para.paragraph_index ?? 0,
              para.text,
              contentHash,
              para.heading || null,
              'paragraph',
              embeddingBlob,
              embedding ? EMBEDDING_MODEL : null,
              now,
              now
            ]));

            stats.paragraphs++;
            if (embedding) stats.embeddings++;
          }

          logger.debug({ docId: doc.id, paragraphs: paragraphs.length }, 'Migrated document');
        } catch (err) {
          logger.error({ err: err.message, docId: doc.id }, 'Failed to migrate document');
          stats.errors++;
        }
      }

      offset += batchSize;
      if (docs.length < batchSize) {
        hasMore = false;
      }
    }

    logger.info(stats, 'Migration complete');
    return stats;
  } catch (err) {
    logger.error({ err: err.message }, 'Migration failed');
    throw err;
  }
}

/**
 * Get embedding cache statistics
 */
export async function getEmbeddingCacheStats() {
  // Uses batch connection - typically called during migrations
  try {
    const [docCount, paraCount, embeddingCount] = await Promise.all([
      batchQueryOne('SELECT COUNT(*) as count FROM docs'),
      batchQueryOne('SELECT COUNT(*) as count FROM content'),
      batchQueryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL')
    ]);

    return {
      documents: docCount?.count || 0,
      paragraphs: paraCount?.count || 0,
      withEmbeddings: embeddingCount?.count || 0,
      cacheHitRate: paraCount?.count > 0
        ? Math.round((embeddingCount?.count || 0) / paraCount.count * 100)
        : 0
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to get cache stats');
    return { documents: 0, paragraphs: 0, withEmbeddings: 0, cacheHitRate: 0 };
  }
}

export const indexer = {
  chunkDocumentForIndexing,
  parseMarkdownFrontmatter,
  indexDocumentFromText,
  batchIndexDocuments,
  indexFromJSON,
  removeDocument,
  reindexAll,
  getIndexingStatus,
  migrateEmbeddingsFromMeilisearch,
  getEmbeddingCacheStats
};

export default indexer;
