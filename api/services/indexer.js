/**
 * Document Indexing Service
 *
 * Handles parsing, chunking, embedding generation, and indexing of documents.
 * Supports text, markdown, and JSON formats.
 */

import { createEmbeddings } from '../lib/ai.js';
import { indexDocument, deleteDocument, getMeili, INDEXES } from '../lib/search.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

// Chunking configuration
const CHUNK_CONFIG = {
  maxChunkSize: 1500,      // Max characters per chunk
  minChunkSize: 100,       // Min characters (skip smaller chunks)
  overlapSize: 150,        // Overlap between chunks for context
  sentenceDelimiters: /[.!?]\s+/,
  paragraphDelimiters: /\n\n+/
};

/**
 * Parse document text into paragraphs/chunks
 */
export function parseDocument(text, options = {}) {
  const {
    maxChunkSize = CHUNK_CONFIG.maxChunkSize,
    minChunkSize = CHUNK_CONFIG.minChunkSize,
    overlapSize = CHUNK_CONFIG.overlapSize
  } = options;

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

  // Merge metadata (explicit takes precedence)
  const finalMeta = {
    title: metadata.title || extractedMeta.title || title,
    author: metadata.author || extractedMeta.author || author,
    religion: metadata.religion || extractedMeta.religion || religion,
    collection: metadata.collection || extractedMeta.collection || collection,
    language: metadata.language || extractedMeta.language || language,
    year: metadata.year || extractedMeta.year || year,
    description: metadata.description || extractedMeta.description || description
  };

  // Parse into chunks
  const chunks = parseDocument(content);

  if (chunks.length === 0) {
    throw new Error('Document has no content to index');
  }

  logger.info({ documentId, chunks: chunks.length }, 'Generating embeddings');

  // Generate embeddings for all chunks
  const embeddings = await createEmbeddings(chunks);

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
    chunk_count: chunks.length,
    created_at: new Date().toISOString()
  };

  // Create paragraph records with embeddings
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
    heading: extractHeading(content, text), // Try to find section heading
    _vectors: {
      default: embeddings[index]
    },
    created_at: new Date().toISOString()
  }));

  // Index in Meilisearch
  await indexDocument(document, paragraphs);

  return {
    documentId,
    title: finalMeta.title,
    chunks: chunks.length,
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

  const tasks = await meili.getTasks({
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

export const indexer = {
  parseDocument,
  parseMarkdownFrontmatter,
  indexDocumentFromText,
  batchIndexDocuments,
  indexFromJSON,
  removeDocument,
  reindexAll,
  getIndexingStatus
};

export default indexer;
