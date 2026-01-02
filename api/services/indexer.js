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
import { detectLanguageFeatures } from './segmenter.js';
import { config } from '../lib/config.js';

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
 * Get cached embeddings from libsql for paragraphs that haven't changed
 * @param {string} docId - Document ID
 * @param {Array<{text: string, hash: string}>} paragraphs - Paragraphs with hashes
 * @returns {Promise<Map<number, Float32Array>>} Map of paragraph_index to embedding
 */
async function getCachedEmbeddings(docId, paragraphs) {
  const cached = new Map();

  try {
    // Get existing content rows for this document
    const existing = await queryAll(
      `SELECT paragraph_index, content_hash, embedding, embedding_model
       FROM content WHERE document_id = ?`,
      [docId]
    );

    for (const row of existing) {
      const para = paragraphs[row.paragraph_index];
      // Check if hash matches AND we have an embedding with current model
      if (para &&
          row.content_hash === para.hash &&
          row.embedding &&
          row.embedding_model === EMBEDDING_MODEL) {
        // Convert BLOB back to Float32Array
        const buffer = row.embedding;
        if (buffer && buffer.length > 0) {
          cached.set(row.paragraph_index, new Float32Array(buffer.buffer || buffer));
        }
      }
    }

    logger.debug({ docId, cached: cached.size, total: paragraphs.length }, 'Embedding cache hits');
  } catch (err) {
    logger.warn({ err: err.message, docId }, 'Failed to get cached embeddings');
  }

  return cached;
}

/**
 * Store document and content in libsql
 * @param {Object} document - Document metadata
 * @param {Array<Object>} paragraphs - Paragraphs with text, hash, embedding
 */
async function storeInLibsql(document, paragraphs) {
  const now = new Date().toISOString();

  try {
    // Upsert document
    await query(`
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
      document.id,
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

    // Delete existing paragraphs for this document (simpler than complex upsert)
    await query('DELETE FROM content WHERE document_id = ?', [document.id]);

    // Insert all paragraphs
    for (const para of paragraphs) {
      // Convert Float32Array to Buffer for BLOB storage
      const embeddingBlob = para.embedding
        ? Buffer.from(para.embedding.buffer || para.embedding)
        : null;

      await query(`
        INSERT INTO content (id, document_id, paragraph_index, text, content_hash, heading, blocktype, embedding, embedding_model, synced, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [
        para.id,
        document.id,
        para.paragraph_index,
        para.text,
        para.content_hash,
        para.heading || null,
        para.blocktype || 'paragraph',
        embeddingBlob,
        para.embedding ? EMBEDDING_MODEL : null,
        now,
        now
      ]);
    }

    logger.debug({ docId: document.id, paragraphs: paragraphs.length }, 'Stored in libsql');
  } catch (err) {
    logger.error({ err: err.message, docId: document.id }, 'Failed to store in libsql');
    throw err;
  }
}

/**
 * Parse document text into paragraphs/chunks
 */
export function parseDocument(text, options = {}) {
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
 * Extract metadata from markdown frontmatter
 */
export function parseMarkdownFrontmatter(text) {
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { metadata: {}, content: text };
  }

  const [, frontmatter, content] = frontmatterMatch;
  const metadata = {};

  // Parse YAML-like frontmatter (simple key: value pairs)
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      metadata[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  return { metadata, content };
}

/**
 * Index a document from raw text
 * Uses embedding cache in libsql to avoid regenerating unchanged paragraphs
 */
export async function indexDocumentFromText(text, metadata = {}) {
  const documentId = metadata.id || `doc_${nanoid(12)}`;

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
  let content = text;
  let extractedMeta = {};

  if (text.startsWith('---')) {
    const parsed = parseMarkdownFrontmatter(text);
    content = parsed.content;
    extractedMeta = parsed.metadata;
  }

  // Merge metadata (frontmatter takes precedence for author, explicit path metadata for other fields)
  // Author: prefer frontmatter over path-extracted 'Unknown'
  const finalAuthor = extractedMeta.author ||
    (metadata.author && metadata.author !== 'Unknown' ? metadata.author : author);

  // Detect language from content - this is more reliable than frontmatter
  // Arabic/Farsi detection should OVERRIDE frontmatter 'en' since it's often wrong
  const detectedLang = detectLanguageFeatures(content);
  const contentLanguage = detectedLang.language !== 'en' ? detectedLang.language : null;

  // Language priority: content detection (for RTL) > frontmatter > metadata > default
  const finalLanguage = contentLanguage || extractedMeta.language || metadata.language || language;

  const finalMeta = {
    title: metadata.title || extractedMeta.title || title,
    author: finalAuthor,
    religion: metadata.religion || extractedMeta.religion || religion,
    collection: metadata.collection || extractedMeta.collection || collection,
    language: finalLanguage,
    year: metadata.year || extractedMeta.year || year,
    description: metadata.description || extractedMeta.description || description
  };

  // Parse into chunks
  const chunks = parseDocument(content);

  if (chunks.length === 0) {
    throw new Error('Document has no content to index');
  }

  // Compute content hashes for change detection
  const chunksWithHashes = chunks.map((text, index) => ({
    text,
    index,
    hash: computeContentHash(text)
  }));

  // Check for cached embeddings in libsql
  const cachedEmbeddings = await getCachedEmbeddings(documentId, chunksWithHashes);
  const cachedCount = cachedEmbeddings.size;

  // Find chunks that need new embeddings
  const chunksToEmbed = chunksWithHashes.filter((_, i) => !cachedEmbeddings.has(i));

  logger.info({
    documentId,
    chunks: chunks.length,
    cached: cachedCount,
    toGenerate: chunksToEmbed.length
  }, 'Embedding status');

  // Generate embeddings only for new/changed chunks
  let newEmbeddings = [];
  if (chunksToEmbed.length > 0) {
    const textsToEmbed = chunksToEmbed.map(c => c.text);
    newEmbeddings = await aiService('embedding').embed(textsToEmbed);
    logger.info({ documentId, generated: newEmbeddings.length }, 'Generated new embeddings');
  }

  // Merge cached and new embeddings
  const embeddings = [];
  let newEmbeddingIndex = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (cachedEmbeddings.has(i)) {
      embeddings.push(cachedEmbeddings.get(i));
    } else {
      embeddings.push(newEmbeddings[newEmbeddingIndex++]);
    }
  }

  // Calculate authority (doctrinal weight) based on author, collection, religion
  const authority = getAuthority({
    author: finalMeta.author,
    religion: finalMeta.religion,
    collection: finalMeta.collection,
    authority: metadata.authority  // Allow explicit override
  });

  logger.debug({ documentId, authority, author: finalMeta.author, collection: finalMeta.collection }, 'Calculated document authority');

  // Create document record
  const document = {
    id: documentId,
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

  // Create paragraph records with embeddings (for Meilisearch)
  const paragraphs = chunks.map((text, index) => ({
    id: `${documentId}_p${index}`,
    document_id: documentId,
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
  await indexDocument(document, paragraphs);

  // Also store in libsql (with embeddings for caching)
  const libsqlParagraphs = chunks.map((text, index) => ({
    id: `${documentId}_p${index}`,
    paragraph_index: index,
    text,
    content_hash: chunksWithHashes[index].hash,
    heading: extractHeading(content, text),
    blocktype: 'paragraph',
    embedding: embeddings[index]
  }));

  await storeInLibsql(document, libsqlParagraphs);

  return {
    documentId,
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
            filter: `document_id = "${doc.id}"`,
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

            // Use document_id as the primary column (NOT NULL in schema)
            // Also populate doc_id if that column exists for backward compatibility
            await withRetry(() => batchQuery(`
              INSERT INTO content (id, document_id, paragraph_index, text, content_hash, heading, blocktype, embedding, embedding_model, synced, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?11)
              ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
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
  parseDocument,
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
