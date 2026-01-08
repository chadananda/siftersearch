/**
 * Document Ingester Service
 *
 * Phase 1 of paragraph-centric indexing pipeline.
 * Parses documents into paragraphs and stores in SQLite.
 * NO embeddings generated here - that's the embedding-worker's job.
 */

import { createHash } from 'crypto';
import { query, queryOne, queryAll, transaction } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';
import matter from 'gray-matter';
import { parseMarkdownBlocks, BLOCK_TYPES } from './block-parser.js';
import { segmentBlocks, detectLanguageFeatures, batchAddSentenceMarkers, segmentUnpunctuatedDocument } from './segmenter.js';
import { generateDocSlug, slugifyPath } from '../lib/slug.js';
import { pushRedirect } from '../lib/cloudflare-redirects.js';

// Chunking configuration
const CHUNK_CONFIG = {
  maxChunkSize: 1500,      // Max characters per chunk - triggers AI segmentation if exceeded
  minChunkSize: 20,        // Min characters (lowered to preserve short prayers/invocations)
  overlapSize: 150,        // Overlap between chunks for context
  sentenceDelimiters: /[.!?]\s+/,
  paragraphDelimiters: /\n\n+/
};

/**
 * Generate SHA256 hash of content for change detection
 */
export function hashContent(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Safely parse a year value, returning null for invalid/non-numeric values
 * Handles strings like "n.d.", empty values, and non-numeric data
 */
function safeParseYear(year) {
  if (year === null || year === undefined || year === '') return null;
  const parsed = parseInt(year, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse document text into paragraphs/chunks
 * (Reused from original indexer.js)
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
 * Check if text is unpunctuated (classical Arabic/Farsi without sentence-ending punctuation)
 */
function isUnpunctuatedText(text) {
  if (!text || text.length < 100) return false;

  // Count punctuation marks that would indicate sentence breaks
  const punctuationMarks = (text.match(/[.!?؟:]/g) || []).length;
  const wordsEstimate = text.split(/\s+/).length;

  // If fewer than 1 punctuation per 50 words, consider it unpunctuated
  return punctuationMarks < wordsEstimate / 50;
}

/**
 * Split oversized paragraphs at sentence markers or word boundaries
 * Ensures no paragraph exceeds maxChars for translation compatibility
 *
 * @param {Array<{text: string, blocktype: string}>} chunks - Paragraphs to check
 * @param {number} maxChars - Maximum characters per paragraph (default 1500)
 * @returns {Array<{text: string, blocktype: string}>} - Split paragraphs
 */
function splitOversizedParagraphs(chunks, maxChars = 1500) {
  const result = [];

  for (const chunk of chunks) {
    if (!chunk.text || chunk.text.length <= maxChars) {
      result.push(chunk);
      continue;
    }

    // Text exceeds max - need to split it
    const text = chunk.text;
    const blocktype = chunk.blocktype;

    logger.debug({
      chars: text.length,
      wordCount: text.split(/\s+/).length,
      markerCount: (text.match(/⁅\/s\d+⁆/g) || []).length,
      preview: text.substring(0, 60)
    }, 'Splitting oversized paragraph');

    // Try to split at sentence markers first (⁅/sN⁆)
    const sentenceEndPattern = /⁅\/s\d+⁆/g;
    const sentenceMarkers = [...text.matchAll(sentenceEndPattern)];

    if (sentenceMarkers.length > 1) {
      // Split at sentence boundaries
      let lastEnd = 0;
      let currentChunk = '';

      for (const match of sentenceMarkers) {
        const markerEnd = match.index + match[0].length;
        const sentence = text.slice(lastEnd, markerEnd);

        // If this single sentence is already too long, split IT at word boundaries
        if (sentence.length > maxChars) {
          // First save any accumulated chunk
          if (currentChunk.trim()) {
            result.push(...splitAtWordBoundary(currentChunk, maxChars, blocktype));
          }
          // Then split the long sentence itself
          result.push(...splitAtWordBoundary(sentence, maxChars, blocktype));
          currentChunk = '';
        } else if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
          // Save current chunk and start new one
          result.push({ text: currentChunk.trim(), blocktype });
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }

        lastEnd = markerEnd;
      }

      // Handle remaining text after last marker
      const remaining = text.slice(lastEnd);
      if (remaining.trim()) {
        currentChunk += remaining;
      }

      if (currentChunk.trim()) {
        // If still too long, split at word boundaries
        if (currentChunk.length > maxChars) {
          result.push(...splitAtWordBoundary(currentChunk, maxChars, blocktype));
        } else {
          result.push({ text: currentChunk.trim(), blocktype });
        }
      }
    } else {
      // 0-1 sentence markers - split at word boundaries
      const splits = splitAtWordBoundary(text, maxChars, blocktype);
      logger.debug({
        originalChars: text.length,
        splitCount: splits.length,
        splitSizes: splits.map(s => s.text.length)
      }, 'Word boundary split result');
      result.push(...splits);
    }
  }

  // Final validation pass - force split any remaining oversized chunks
  const finalResult = [];
  for (const chunk of result) {
    if (chunk.text.length > maxChars) {
      logger.debug({
        chars: chunk.text.length,
        maxAllowed: maxChars
      }, 'Final validation catching oversized chunk');
      finalResult.push(...forceSplitByCharLimit(chunk.text, maxChars, chunk.blocktype));
    } else {
      finalResult.push(chunk);
    }
  }

  return finalResult;
}

/**
 * Force split text by character limit - guaranteed to produce chunks <= maxChars
 * Uses sentence markers, spaces, or raw character split as fallback
 */
function forceSplitByCharLimit(text, maxChars, blocktype) {
  const result = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    let breakPoint = -1;

    // Priority 1: Try to break at sentence marker in preferred range (60%-100%)
    const searchStart = Math.floor(maxChars * 0.6);
    const markerMatch = remaining.slice(searchStart, maxChars).match(/⁅\/s\d+⁆/);
    if (markerMatch) {
      breakPoint = searchStart + markerMatch.index + markerMatch[0].length;
    }

    // Priority 2: Try to break at space in preferred range (60%-100%)
    if (breakPoint < 0) {
      const spaceIdx = remaining.slice(searchStart, maxChars).lastIndexOf(' ');
      if (spaceIdx > 0) {
        breakPoint = searchStart + spaceIdx;
      }
    }

    // Priority 3: Find ANY space before maxChars
    if (breakPoint < 0) {
      const lastSpaceBeforeMax = remaining.lastIndexOf(' ', maxChars);
      if (lastSpaceBeforeMax > 0) {
        breakPoint = lastSpaceBeforeMax;
      }
    }

    // Priority 4: Find first space AFTER maxChars (allow slight overshoot to 120%)
    if (breakPoint < 0) {
      const firstSpaceAfterMax = remaining.indexOf(' ', maxChars);
      if (firstSpaceAfterMax > 0 && firstSpaceAfterMax < maxChars * 1.2) {
        breakPoint = firstSpaceAfterMax;
      }
    }

    // Priority 5: Last resort - find ANY space, even if way past maxChars
    if (breakPoint < 0) {
      const anySpace = remaining.indexOf(' ');
      if (anySpace > 0) {
        breakPoint = anySpace;
        logger.warn({ textLen: remaining.length, breakPoint }, 'Force split: using first available space');
      } else {
        // No spaces at all - keep the entire text as one chunk rather than cut words
        logger.warn({ textLen: remaining.length }, 'Force split: no spaces found, keeping as single chunk');
        result.push({ text: remaining.trim(), blocktype });
        remaining = '';
        break;
      }
    }

    result.push({ text: remaining.slice(0, breakPoint).trim(), blocktype });
    remaining = remaining.slice(breakPoint).trim();
  }

  if (remaining.trim()) {
    result.push({ text: remaining.trim(), blocktype });
  }

  logger.debug({
    originalLen: text.length,
    chunks: result.length,
    sizes: result.map(r => r.text.length)
  }, 'Force split applied');

  return result;
}

/**
 * Split text at word boundaries to fit within maxChars
 * Falls back to character-based splitting for text without word boundaries
 * or for individual "words" that exceed maxChars
 */
function splitAtWordBoundary(text, maxChars, blocktype) {
  const result = [];
  const words = text.split(/\s+/);

  // Check if we have any very long "words" (common in classical Arabic without spaces)
  const hasOversizedWords = words.some(w => w.length > maxChars);

  // If very few word boundaries OR has oversized words, use character-based splitting
  if ((words.length <= 2 && text.length > maxChars) || hasOversizedWords) {
    // Split by character count, trying to find good break points
    let remaining = text;
    while (remaining.length > maxChars) {
      // Look for a good break point near maxChars
      let breakPoint = maxChars;

      // Try to find a sentence marker within the last 20% of the chunk
      const searchStart = Math.floor(maxChars * 0.8);
      const markerMatch = remaining.slice(searchStart, maxChars + 50).match(/⁅\/s\d+⁆/);
      if (markerMatch) {
        breakPoint = searchStart + markerMatch.index + markerMatch[0].length;
      } else {
        // Try to find a space near maxChars as secondary break point
        const spaceMatch = remaining.slice(searchStart, maxChars).lastIndexOf(' ');
        if (spaceMatch > 0) {
          breakPoint = searchStart + spaceMatch;
        }
      }

      result.push({ text: remaining.slice(0, breakPoint).trim(), blocktype });
      remaining = remaining.slice(breakPoint).trim();
    }

    if (remaining.trim()) {
      result.push({ text: remaining.trim(), blocktype });
    }

    logger.debug({
      originalLen: text.length,
      splitCount: result.length,
      sizes: result.map(r => r.text.length)
    }, 'Character-based split applied');

    return result;
  }

  // Normal word-boundary splitting
  let currentPart = '';

  for (const word of words) {
    if ((currentPart + ' ' + word).length > maxChars && currentPart.length > 0) {
      result.push({ text: currentPart.trim(), blocktype });
      currentPart = word;
    } else {
      currentPart = currentPart ? currentPart + ' ' + word : word;
    }
  }

  if (currentPart.trim()) {
    result.push({ text: currentPart.trim(), blocktype });
  }

  return result;
}

/**
 * Parse document with blocktype awareness and AI segmentation
 *
 * Returns array of { text, blocktype } objects for storage
 * Uses AI segmentation for ANY block exceeding maxChunkSize (universal approach)
 *
 * For unpunctuated RTL texts (classical Arabic/Farsi), uses sentence-first approach:
 * - Detect all sentences in the document
 * - Group sentences into paragraphs by topic
 * - Return paragraphs with sentence markers already applied
 *
 * @param {string} text - Raw markdown text
 * @param {object} options - Options including language hint
 * @returns {Promise<Array<{text: string, blocktype: string}>>}
 */
export async function parseDocumentWithBlocks(text, options = {}) {
  const {
    maxChunkSize = CHUNK_CONFIG.maxChunkSize,
    minChunkSize = CHUNK_CONFIG.minChunkSize,
    language = 'en'
  } = options;

  if (!text || typeof text !== 'string') {
    return { chunks: [], autoSegmented: false };
  }

  // Detect language for AI hints
  const features = detectLanguageFeatures(text);
  const detectedLanguage = language || features.language;

  logger.debug({
    textLength: text.length,
    detectedLanguage,
    isRTL: features.isRTL
  }, 'Parsing document with block awareness');

  // For unpunctuated RTL texts, use sentence-first approach
  // This is the correct order: sentences first, then group into paragraphs
  if (features.isRTL && isUnpunctuatedText(text)) {
    logger.info({ language: detectedLanguage }, 'Using sentence-first segmentation for unpunctuated RTL text');

    try {
      // Normalize line breaks to spaces (classical texts often have arbitrary line breaks)
      const normalizedText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

      const result = await segmentUnpunctuatedDocument(normalizedText, {
        language: detectedLanguage
      });

      // Convert paragraphs to chunks format
      // Note: sentence markers are already applied by segmentUnpunctuatedDocument
      const chunks = result.paragraphs.map(para => ({
        text: para.text,
        blocktype: BLOCK_TYPES.PARAGRAPH
      }));

      logger.info({
        sentences: result.sentences.length,
        paragraphs: result.paragraphs.length
      }, 'Sentence-first segmentation complete');

      // Split any oversized paragraphs (max 1500 chars for translation compatibility)
      const maxParagraphChars = 1500;
      const finalChunks = splitOversizedParagraphs(chunks, maxParagraphChars);

      if (finalChunks.length !== chunks.length) {
        logger.info({
          before: chunks.length,
          after: finalChunks.length,
          split: finalChunks.length - chunks.length
        }, 'Split oversized paragraphs');
      }

      // AI segmentation was used for unpunctuated RTL text
      return { chunks: finalChunks, autoSegmented: true };
    } catch (err) {
      logger.warn({ err: err.message }, 'Sentence-first segmentation failed, falling back to standard approach');
      // Fall through to standard approach
    }
  }

  // Standard approach for punctuated texts
  // Parse markdown into typed blocks
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) {
    return { chunks: [], autoSegmented: false };
  }

  // Use segmentBlocks for ALL content
  // It will use AI only for blocks > maxChunkSize
  const chunks = await segmentBlocks(blocks, {
    maxChunkSize,
    minChunkSize,
    language: detectedLanguage
  });

  logger.debug({
    inputBlocks: blocks.length,
    outputChunks: chunks.length,
    language: detectedLanguage
  }, 'Document segmented');

  // Split any oversized paragraphs (max 1500 chars for translation compatibility)
  const maxParagraphChars = 1500;
  const finalChunks = splitOversizedParagraphs(chunks, maxParagraphChars);

  if (finalChunks.length !== chunks.length) {
    logger.info({
      before: chunks.length,
      after: finalChunks.length,
      split: finalChunks.length - chunks.length
    }, 'Split oversized paragraphs (standard path)');
  }

  // Standard path preserves natural paragraph breaks (not auto-segmented)
  return { chunks: finalChunks, autoSegmented: false };
}

/**
 * Extract metadata from markdown frontmatter using gray-matter
 * Properly handles YAML parsing including arrays, nested objects, etc.
 */
export function parseMarkdownFrontmatter(text) {
  try {
    const parsed = matter(text);

    // Clean up metadata - remove [object Object] values and empty strings
    const metadata = {};
    for (const [key, value] of Object.entries(parsed.data || {})) {
      if (value !== null && value !== undefined && value !== '[object Object]') {
        // Convert arrays/objects to strings if needed
        if (typeof value === 'object') {
          if (Array.isArray(value)) {
            metadata[key] = value.join(', ');
          }
          // Skip nested objects
        } else {
          metadata[key] = String(value).trim();
        }
      }
    }

    return {
      metadata,
      content: parsed.content.trim()
    };
  } catch (err) {
    // If gray-matter fails, return original text as content
    logger.warn({ error: err.message }, 'Failed to parse frontmatter, using raw content');
    return {
      metadata: {},
      content: text
    };
  }
}

/**
 * Try to extract the heading for a chunk from the full document
 * (Reused from original indexer.js)
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
 * Ingest a document - parse into paragraphs and store in SQLite
 *
 * Smart incremental updates:
 * - Unchanged documents are skipped entirely
 * - Changed documents do paragraph-level diffing
 * - Only new/changed paragraphs need embedding generation
 * - Unchanged paragraphs keep their embeddings
 *
 * @param {string} text - Raw document text
 * @param {Object} metadata - Document metadata
 * @param {string} relativePath - Relative path from library base (canonical identifier)
 * @returns {Object} - { documentId, paragraphCount, status }
 */
export async function ingestDocument(text, metadata = {}, relativePath = null) {
  // Parse frontmatter FIRST to separate body from metadata
  // This allows us to detect metadata-only changes vs content changes
  const { content: bodyContent, metadata: frontmatterMeta } = parseMarkdownFrontmatter(text);

  const fileHash = hashContent(text);           // Hash of entire file (detects ANY change)
  const bodyHash = hashContent(bodyContent);    // Hash of body only (detects CONTENT change)

  let existingDoc = null;
  let existingParagraphs = new Map(); // content_hash -> paragraph data

  // PRIORITY 1: If explicit ID is passed, look up by ID first
  // This is critical for updating documents through the editor - the ID must be preserved
  if (metadata.id) {
    existingDoc = await queryOne(
      'SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE id = ?',
      [metadata.id]
    );
    if (existingDoc) {
      logger.debug({ documentId: metadata.id }, 'Found existing document by explicit ID');
      // Update relativePath to match the existing document's file_path if not provided
      if (!relativePath && existingDoc.file_path) {
        relativePath = existingDoc.file_path;
      }
    }
  }

  // PRIORITY 2: Look up by relative path if no explicit ID or ID not found
  if (!existingDoc && relativePath) {
    existingDoc = await queryOne(
      'SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE file_path = ?',
      [relativePath]
    );
    if (existingDoc) {
      logger.debug({ documentId: existingDoc.id, relativePath }, 'Found existing document by file path');
    }
  }

  // Note: documentId is now INTEGER, auto-generated by SQLite
  // We no longer generate IDs from paths - SQLite handles this

  // PRIORITY 3: Look up by file_hash if file was moved
  // This handles the case where a file is moved to a different folder/collection
  // We recognize it by content hash and update the path-derived metadata
  if (!existingDoc && relativePath) {
    const movedDoc = await queryOne(
      `SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE file_hash = ?`,
      [fileHash]
    );

    if (movedDoc) {
      // File was moved! Use existing doc and update path-derived fields
      existingDoc = movedDoc;
      logger.info({
        documentId: movedDoc.id,
        oldPath: movedDoc.file_path,
        newPath: relativePath,
        title: movedDoc.title
      }, 'File moved detected by hash - will update path and metadata');
    }
  }

  // Check if document content is unchanged
  if (existingDoc && existingDoc.file_hash === fileHash) {
    // Content unchanged, but check if path-derived metadata changed (file moved)
    const pathChanged = existingDoc.file_path !== relativePath;

    if (pathChanged && relativePath) {
      // File was moved - update path and path-derived metadata only
      const pathParts = relativePath.split('/');
      let newReligion = existingDoc.religion;
      let newCollection = existingDoc.collection;

      // Extract religion/collection from path (e.g., "Baha'i/Core Tablets/...")
      if (pathParts.length >= 2) {
        newReligion = pathParts[0];
        newCollection = pathParts[1];
      }

      await query(`
        UPDATE docs SET
          file_path = ?,
          religion = ?,
          collection = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [relativePath, newReligion, newCollection, existingDoc.id]);

      // Mark all paragraphs as unsynced so religion/collection updates propagate to search
      const updateResult = await query(`
        UPDATE content SET synced = 0 WHERE doc_id = ?
      `, [existingDoc.id]);

      logger.info({
        documentId: existingDoc.id,
        oldPath: existingDoc.file_path,
        newPath: relativePath,
        religion: newReligion,
        collection: newCollection,
        paragraphsMarkedUnsynced: updateResult.changes || 0
      }, 'File moved - updated path and metadata, marked paragraphs for re-sync');

      return {
        documentId: existingDoc.id,
        paragraphCount: updateResult.changes || 0,
        status: 'moved',
        skipped: false,
        oldPath: existingDoc.file_path,
        newPath: relativePath
      };
    }

    // Truly unchanged - skip entirely
    logger.info({ documentId: existingDoc.id, relativePath }, 'Document unchanged, skipping');
    return {
      documentId: existingDoc.id,
      paragraphCount: 0,
      status: 'unchanged',
      skipped: true
    };
  }

  // NEW: Check if body content unchanged but metadata (frontmatter) changed
  // This allows updating title, author, etc. without re-processing expensive content segmentation
  if (existingDoc && existingDoc.body_hash === bodyHash) {
    // Body unchanged - only update metadata in docs table, skip content processing
    const pathParts = relativePath?.split('/') || [];
    const newReligion = frontmatterMeta.religion || (pathParts.length >= 1 ? pathParts[0] : existingDoc.religion);
    const newCollection = frontmatterMeta.collection || (pathParts.length >= 2 ? pathParts[1] : existingDoc.collection);

    await query(`
      UPDATE docs SET
        file_path = ?,
        file_hash = ?,
        title = ?,
        author = ?,
        religion = ?,
        collection = ?,
        language = ?,
        year = ?,
        description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      relativePath || existingDoc.file_path,
      fileHash,
      frontmatterMeta.title || existingDoc.title,
      frontmatterMeta.author || existingDoc.author,
      newReligion,
      newCollection,
      frontmatterMeta.language || existingDoc.language,
      safeParseYear(frontmatterMeta.year) || existingDoc.year,
      frontmatterMeta.description || existingDoc.description,
      existingDoc.id
    ]);

    // Mark paragraphs as unsynced so metadata updates propagate to search
    const updateResult = await query(`
      UPDATE content SET synced = 0 WHERE doc_id = ?
    `, [existingDoc.id]);

    logger.info({
      documentId: existingDoc.id,
      title: frontmatterMeta.title || existingDoc.title,
      paragraphsMarkedUnsynced: updateResult.changes || 0
    }, 'Metadata-only update (body unchanged)');

    return {
      documentId: existingDoc.id,
      paragraphCount: updateResult.changes || 0,
      status: 'metadata_updated',
      skipped: false
    };
  }

  // Document changed - get existing paragraphs for smart diffing
  if (existingDoc) {
    const paragraphs = await queryAll(
      'SELECT id, content_hash, embedding, synced FROM content WHERE doc_id = ?',
      [existingDoc.id]
    );
    for (const p of paragraphs) {
      existingParagraphs.set(p.content_hash, p);
    }
    logger.info({ documentId: existingDoc.id, relativePath, existingParagraphs: paragraphs.length }, 'Document changed, doing incremental update');
  }

  // Parse frontmatter using gray-matter (handles detection automatically)
  const { content, metadata: extractedMeta } = parseMarkdownFrontmatter(text);

  // Detect language from content - this is more reliable than frontmatter
  // Arabic/Farsi detection should OVERRIDE frontmatter 'en' since it's often wrong
  const detectedLang = detectLanguageFeatures(content);
  const contentLanguage = detectedLang.language !== 'en' ? detectedLang.language : null;

  // Merge metadata: frontmatter takes precedence over filename-extracted data
  // Use frontmatter if available, fall back to filename-extracted, then defaults
  // Exception: if filename-extracted has meaningful data (not "Unknown"), prefer that for some fields
  const finalMeta = {
    title: extractedMeta.title || metadata.title || 'Untitled',
    // For author: prefer frontmatter, unless filename has real author and frontmatter doesn't
    author: extractedMeta.author || (metadata.author !== 'Unknown' ? metadata.author : null) || 'Unknown',
    religion: extractedMeta.religion || metadata.religion || 'General',
    collection: extractedMeta.collection || metadata.collection || 'General',
    // Language: detected Arabic/Farsi > frontmatter > filename metadata > default 'en'
    // Content detection takes priority because frontmatter often incorrectly says 'en' for RTL texts
    language: contentLanguage || extractedMeta.language || metadata.language || 'en',
    year: extractedMeta.year || metadata.year || null,
    description: extractedMeta.description || metadata.description || ''
  };

  // Parse into chunks/paragraphs with blocktype awareness
  // Uses AI segmentation for RTL languages without punctuation
  const { chunks, autoSegmented } = await parseDocumentWithBlocks(content, {
    language: finalMeta.language
  });

  if (chunks.length === 0) {
    logger.warn({ documentId: existingDoc?.id, relativePath }, 'Document has no content to ingest');
    return {
      documentId: existingDoc?.id ?? null,
      paragraphCount: 0,
      status: 'empty',
      error: 'No content to index'
    };
  }

  // Add sentence markers to paragraphs that don't already have them
  // (sentence-first approach for RTL texts already has markers applied)
  // This enables per-sentence translations and URL anchors
  let totalSentences = 0;

  // Check if chunks already have sentence markers (from sentence-first segmentation)
  const hasExistingMarkers = chunks.some(c => c.text && c.text.includes('\u2045'));

  if (hasExistingMarkers) {
    // Count existing sentences
    for (const chunk of chunks) {
      const matches = chunk.text?.match(/⁅s\d+⁆/g);
      totalSentences += matches ? matches.length : 0;
    }
    logger.debug({ paragraphs: chunks.length, sentences: totalSentences }, 'Using pre-existing sentence markers');
  } else {
    // Add sentence markers in batch (1-2 AI calls instead of 100+)
    try {
      const paragraphsToMark = chunks.map((chunk, idx) => ({
        id: String(idx),
        text: chunk.text
      }));

      const markedResults = await batchAddSentenceMarkers(paragraphsToMark, finalMeta.language);

      // Apply results back to chunks
      for (const result of markedResults) {
        const idx = parseInt(result.id, 10);
        if (idx >= 0 && idx < chunks.length) {
          chunks[idx].text = result.text;
          totalSentences += result.sentenceCount;
        }
      }
    } catch (err) {
      // If batch marking fails completely, log but keep original text
      // Individual paragraphs will still have fallback single-sentence wrapping
      logger.warn({ err: err.message }, 'Failed to batch add sentence markers');
    }

    logger.debug({ paragraphs: chunks.length, sentences: totalSentences }, 'Added sentence markers');
  }

  // Use existing document ID if updating, otherwise null (will be assigned after INSERT)
  let finalDocId = existingDoc ? existingDoc.id : null;

  // Extract filename from path for slug generation
  const fileName = relativePath ? relativePath.split('/').pop() : existingDoc?.filename || null;

  // Generate unique slug for this document
  // Format: author_title_lang (e.g., the-bab_address-to-believers_ar)
  const baseSlug = generateDocSlug({
    title: finalMeta.title,
    author: finalMeta.author,
    filename: fileName,
    language: finalMeta.language
  });

  // Check for slug conflicts within same religion/collection (excluding this document if updating)
  let finalSlug = baseSlug;
  const slugQuery = finalDocId
    ? `SELECT slug FROM docs WHERE religion = ? AND collection = ? AND slug LIKE ? AND id != ?`
    : `SELECT slug FROM docs WHERE religion = ? AND collection = ? AND slug LIKE ?`;
  const slugParams = finalDocId
    ? [finalMeta.religion, finalMeta.collection, `${baseSlug}%`, finalDocId]
    : [finalMeta.religion, finalMeta.collection, `${baseSlug}%`];
  const existingSlugs = await queryAll(slugQuery, slugParams);

  if (existingSlugs.length > 0) {
    // Find next available number suffix
    const usedSlugs = new Set(existingSlugs.map(r => r.slug));
    if (usedSlugs.has(baseSlug)) {
      let counter = 2;
      while (usedSlugs.has(`${baseSlug}-${counter}`)) {
        counter++;
      }
      finalSlug = `${baseSlug}-${counter}`;
      logger.info({ baseSlug, finalSlug, docId: finalDocId }, 'Slug conflict resolved with numeric suffix');
    }
  }

  // Insert or update document record
  if (existingDoc) {
    // UPDATE existing document
    await query(`
      UPDATE docs SET
        file_path = ?,
        file_hash = ?,
        body_hash = ?,
        title = ?,
        author = ?,
        religion = ?,
        collection = ?,
        language = ?,
        year = ?,
        description = ?,
        paragraph_count = ?,
        slug = ?,
        auto_segmented = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      relativePath,
      fileHash,
      bodyHash,
      finalMeta.title,
      finalMeta.author,
      finalMeta.religion,
      finalMeta.collection,
      finalMeta.language,
      safeParseYear(finalMeta.year),
      finalMeta.description,
      chunks.length,
      finalSlug,
      autoSegmented ? 1 : 0,
      finalDocId
    ]);
  } else {
    // INSERT new document (let SQLite generate the INTEGER id)
    const result = await query(`
      INSERT INTO docs
      (file_path, file_hash, body_hash, title, author, religion, collection, language, year, description, paragraph_count, slug, auto_segmented, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      relativePath,
      fileHash,
      bodyHash,
      finalMeta.title,
      finalMeta.author,
      finalMeta.religion,
      finalMeta.collection,
      finalMeta.language,
      safeParseYear(finalMeta.year),
      finalMeta.description,
      chunks.length,
      finalSlug,
      autoSegmented ? 1 : 0
    ]);
    // Get the auto-generated INTEGER id
    finalDocId = Number(result.lastInsertRowid);
    logger.debug({ finalDocId, relativePath }, 'Created new document with INTEGER id');
  }

  // Create redirect if URL slug changed (for SEO and link preservation)
  if (existingDoc) {
    // Use stored slug if available, otherwise generate from old metadata
    const oldSlug = existingDoc.slug || generateDocSlug(existingDoc);
    const oldReligionSlug = slugifyPath(existingDoc.religion || '');
    const oldCollectionSlug = slugifyPath(existingDoc.collection || '');
    const oldPath = `/library/${oldReligionSlug}/${oldCollectionSlug}/${oldSlug}`;

    // Use the finalSlug we just generated (handles conflicts)
    const newReligionSlug = slugifyPath(finalMeta.religion || '');
    const newCollectionSlug = slugifyPath(finalMeta.collection || '');
    const newPath = `/library/${newReligionSlug}/${newCollectionSlug}/${finalSlug}`;

    if (oldPath !== newPath && oldSlug && finalSlug) {
      try {
        await query(`
          INSERT INTO redirects (old_path, new_path, doc_id)
          VALUES (?, ?, ?)
          ON CONFLICT(old_path) DO UPDATE SET
            new_path = excluded.new_path,
            doc_id = excluded.doc_id
        `, [oldPath, newPath, finalDocId]);
        logger.info({ oldPath, newPath, docId: finalDocId }, 'Created URL redirect during ingestion');

        // Push to Cloudflare edge (async, non-blocking)
        // Only executes if CLOUDFLARE_REDIRECTS_ENABLED=true
        pushRedirect(oldPath, newPath).catch(() => {});
      } catch (err) {
        logger.warn({ err: err.message, oldPath, newPath }, 'Failed to create redirect during ingestion');
      }
    }
  }

  // Smart paragraph diffing: compare new chunks with existing paragraphs
  const newContentHashes = new Set();
  const paragraphStatements = [];
  let reusedCount = 0;
  let newCount = 0;

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const chunkText = chunk.text;
    const blocktype = chunk.blocktype || BLOCK_TYPES.PARAGRAPH;
    const contentHash = hashContent(chunkText);
    newContentHashes.add(contentHash);

    const existing = existingParagraphs.get(contentHash);

    if (existing) {
      // Paragraph content unchanged - update metadata only (position might have changed)
      reusedCount++;
      paragraphStatements.push({
        sql: `
          UPDATE content
          SET paragraph_index = ?, heading = ?, blocktype = ?, synced = 0
          WHERE id = ?
        `,
        args: [
          index,
          extractHeading(content, chunkText),
          blocktype,
          existing.id
        ]
      });
      // Mark as used so we don't delete it later
      existingParagraphs.delete(contentHash);
    } else {
      // New paragraph - insert it with blocktype
      newCount++;
      paragraphStatements.push({
        sql: `
          INSERT INTO content
          (id, doc_id, paragraph_index, text, content_hash, heading, blocktype)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          `${finalDocId}_p${index}`,
          finalDocId,
          index,
          chunkText,
          contentHash,
          extractHeading(content, chunkText),
          blocktype
        ]
      });
    }
  }

  // Delete paragraphs that no longer exist in the document (remainders in existingParagraphs)
  let deletedCount = 0;
  for (const [, oldParagraph] of existingParagraphs) {
    deletedCount++;
    // Delete from paragraph_embeddings first (but keep the content_hash based cache!)
    // Note: We DON'T delete from paragraph_embeddings by paragraph_id anymore
    // The embeddings table is keyed by content_hash, so they persist for reuse
    paragraphStatements.push({
      sql: `DELETE FROM content WHERE id = ?`,
      args: [oldParagraph.id]
    });
  }

  // Execute in batches of 100 to avoid hitting limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < paragraphStatements.length; i += BATCH_SIZE) {
    const batch = paragraphStatements.slice(i, i + BATCH_SIZE);
    await transaction(batch);
  }

  logger.info({
    documentId: finalDocId,
    title: finalMeta.title,
    paragraphs: chunks.length,
    reused: reusedCount,
    new: newCount,
    deleted: deletedCount,
    autoSegmented,
    relativePath
  }, existingDoc ? 'Document updated (incremental)' : 'Document ingested');

  return {
    documentId: finalDocId,
    title: finalMeta.title,
    paragraphCount: chunks.length,
    reusedParagraphs: reusedCount,
    newParagraphs: newCount,
    deletedParagraphs: deletedCount,
    status: existingDoc ? 'updated' : 'ingested'
  };
}

/**
 * Remove a document and all its content
 */
export async function removeDocument(documentId) {
  // Delete content first (foreign key constraint), then doc
  await query('DELETE FROM content WHERE doc_id = ?', [documentId]);
  await query('DELETE FROM docs WHERE id = ?', [documentId]);

  logger.info({ documentId }, 'Document removed from SQLite');
  return { documentId, removed: true };
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats() {
  const docCount = await queryOne('SELECT COUNT(*) as count FROM docs');
  const contentTotal = await queryOne('SELECT COUNT(*) as count FROM content');
  const contentEmbedded = await queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NOT NULL');
  const contentUnembedded = await queryOne('SELECT COUNT(*) as count FROM content WHERE embedding IS NULL');
  const contentSynced = await queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 1');
  const contentUnsynced = await queryOne('SELECT COUNT(*) as count FROM content WHERE synced = 0');

  return {
    documents: docCount?.count || 0,
    content: {
      total: contentTotal?.count || 0,
      embedded: contentEmbedded?.count || 0,
      unembedded: contentUnembedded?.count || 0,
      synced: contentSynced?.count || 0,
      unsynced: contentUnsynced?.count || 0
    }
  };
}

/**
 * Get documents that need embedding
 */
export async function getUnprocessedDocuments(limit = 100) {
  const results = await queryAll(`
    SELECT d.*,
           (SELECT COUNT(*) FROM content c WHERE c.doc_id = d.id AND c.embedding IS NULL) as unembedded_count
    FROM docs d
    WHERE EXISTS (
      SELECT 1 FROM content c WHERE c.doc_id = d.id AND c.embedding IS NULL
    )
    LIMIT ?
  `, [limit]);

  return results;
}

/**
 * Check if a file has been ingested (by path)
 */
export async function isFileIngested(filePath) {
  const doc = await queryOne(
    'SELECT id, file_hash FROM docs WHERE file_path = ?',
    [filePath]
  );
  return doc !== null;
}

/**
 * Get document by file path
 */
export async function getDocumentByPath(filePath) {
  return queryOne(
    'SELECT * FROM docs WHERE file_path = ?',
    [filePath]
  );
}

export const ingester = {
  hashContent,
  parseDocument,
  parseDocumentWithBlocks,
  parseMarkdownFrontmatter,
  ingestDocument,
  removeDocument,
  getIngestionStats,
  getUnprocessedDocuments,
  isFileIngested,
  getDocumentByPath
};

export default ingester;
