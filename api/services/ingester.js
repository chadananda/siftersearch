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
import { detectLanguageFeatures, batchAddSentenceMarkers, segmentUnpunctuatedDocument } from './segmenter.js';
import { generateDocSlug, slugifyPath } from '../lib/slug.js';
import { pushRedirect } from '../lib/cloudflare-redirects.js';
import { deleteDocument as deleteFromMeilisearch } from '../lib/search.js';

/**
 * Normalize text for embedding deduplication
 * Removes formatting/punctuation so semantically identical content matches
 * @param {string} text - The paragraph text
 * @returns {string} Normalized text
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
 * Compute normalized hash for embedding deduplication
 * Same semantic content across documents will have same normalized_hash
 * @param {string} text - The paragraph text
 * @returns {string} MD5 hash of normalized text
 */
function computeNormalizedHash(text) {
  const normalized = normalizeForEmbedding(text);
  return createHash('md5').update(normalized).digest('hex');
}

// Chunking configuration
const CHUNK_CONFIG = {
  maxChunkSize: 1500,      // Max characters per chunk - triggers AI segmentation if exceeded
  minChunkSize: 20,        // Min characters (lowered to preserve short prayers/invocations)
  overlapSize: 150,        // Overlap between chunks for context
  sentenceDelimiters: /[.!?]\s+/,
  paragraphDelimiters: /\n\n+/
};

// Maximum allowed paragraph length (chars) - reject documents with longer paragraphs
// Based on 2x longest paragraph in well-formatted documents (God Passes By: ~1500 chars)
// This ensures all content fits within embedding model token limits (8192 tokens)
const MAX_PARAGRAPH_LENGTH = 3000;

/**
 * Log a document failure to the database
 * Used for oversized paragraphs and other validation errors that prevent ingestion
 */
async function logDocumentFailure({
  filePath,
  fileName,
  errorType,
  errorMessage,
  details
}) {
  try {
    await query(`
      INSERT INTO document_failures (file_path, file_name, error_type, error_message, details)
      VALUES (?, ?, ?, ?, ?)
    `, [
      filePath || null,
      fileName || null,
      errorType,
      errorMessage,
      details ? JSON.stringify(details) : null
    ]);
    logger.warn({ filePath, errorType, errorMessage }, 'Document failure logged');
  } catch (err) {
    // Don't let failure logging break the flow - just log and continue
    logger.error({ err: err.message, filePath, errorType }, 'Failed to log document failure');
  }
}

/**
 * Generate SHA256 hash of content for change detection
 */
export function hashContent(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Strip sentence/phrase markers from text, returning just the words
 * Used for content hashing - so same words with different marker positions hash the same
 * Markers: ⁅s1⁆ ⁅/s1⁆ ⁅ph1⁆ ⁅/ph1⁆ etc.
 */
export function stripMarkersForHash(text) {
  return text
    .replace(/⁅\/?(?:s|ph)\d+⁆/g, '')  // Remove sentence/phrase markers
    .replace(/\s+/g, ' ')                // Normalize whitespace
    .trim();
}

/**
 * Generate content hash that ignores marker positions
 * Same words with different sentence/phrase boundaries = same hash
 */
export function hashContentWords(text) {
  const stripped = stripMarkersForHash(text);
  return createHash('sha256').update(stripped).digest('hex');
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
// Check if text ends with an incomplete word (preposition, relative pronoun, conjunction)
// These words require continuation and shouldn't be split after
function endsWithIncompleteWord(text) {
  // Strip sentence markers to get actual text
  const cleanText = text.replace(/⁅\/?s\d+⁆/g, '').trim();
  if (!cleanText) return false;

  // Pattern for words that require continuation (same list as in segmenter.js)
  // - Prepositions: بين، من، الى، على، في، عن، etc.
  // - Relative pronouns: الذي، التي، الذين، etc.
  // - Conjunctions: كما، لان، اذ، كي، etc.
  const incompletePattern = /\s(بين|من|الى|إلى|على|في|عن|ب|ل|و|ف|ثم|ان|أن|لا|ما|الا|إلا|حتى|مع|عند|نحو|قبل|بعد|فوق|تحت|دون|غير|الذي|التي|الذين|اللاتي|اللواتي|كما|لان|لأن|لانه|لأنه|اذ|إذ|كي|لكي|بان|بأن|لدى|كنت|يوجد|كان|يكون|ليس)$/;

  return incompletePattern.test(cleanText);
}

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
      // Split at sentence boundaries, but only at COMPLETE sentences
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
          // Want to split here, but first check if currentChunk ends with incomplete word
          if (endsWithIncompleteWord(currentChunk)) {
            // Don't split - the sentence is incomplete, keep accumulating
            logger.debug({
              ending: currentChunk.slice(-50),
              reason: 'incomplete sentence ending'
            }, 'Skipping split at incomplete sentence');
            currentChunk += sentence;
          } else {
            // Safe to split - sentence is complete
            result.push({ text: currentChunk.trim(), blocktype });
            currentChunk = sentence;
          }
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

  // Document-type check: Does this need segmentation?
  // Only unpunctuated Arabic/Farsi classical texts need AI segmentation
  if (features.isRTL && isUnpunctuatedText(text)) {
    logger.info({ language: detectedLanguage, textLength: text.length }, 'Unpunctuated RTL text - using AI segmentation');

    try {
      // Strip HTML comments (manual exclusions like page markers)
      const cleanText = text.replace(/<!--[\s\S]*?-->/g, '');

      // Segmentation creates paragraphs from sentences
      // Handles large documents internally via chunking with carryover
      const result = await segmentUnpunctuatedDocument(cleanText, {
        language: detectedLanguage
      });

      // Convert paragraphs to chunks (preserve blocktype from segmentation)
      const chunks = result.paragraphs.map(p => ({
        text: p.text,
        blocktype: p.blocktype || BLOCK_TYPES.PARAGRAPH
      }));

      logger.info({ paragraphs: chunks.length }, 'AI segmentation complete');

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

      return { chunks: finalChunks, autoSegmented: true };
    } catch (err) {
      logger.warn({ err: err.message }, 'AI segmentation failed, falling back to markdown blocks');
      // Fall through to standard approach
    }
  }

  // Standard approach for punctuated texts (English, etc.)
  // Already segmented - just parse markdown and use directly
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) {
    return { chunks: [], autoSegmented: false };
  }

  // Use markdown paragraphs directly - NO processing needed
  const chunks = blocks
    .filter(block => block.content && block.content.length >= minChunkSize)
    .map(block => ({
      text: block.content,
      blocktype: block.type
    }));

  logger.debug({
    blocks: blocks.length,
    chunks: chunks.length,
    language: detectedLanguage
  }, 'Using markdown paragraphs directly (already segmented)');

  // Already segmented text - return as-is
  return { chunks, autoSegmented: false };
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

    // Strip any additional frontmatter blocks at the start of content
    // (some files have duplicate frontmatter blocks)
    let content = parsed.content.trim();
    const additionalFrontmatter = content.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*([\s\S]*)$/);
    if (additionalFrontmatter) {
      logger.warn('Stripping additional frontmatter block from content');
      content = additionalFrontmatter[2].trim();
    }

    return {
      metadata,
      content
    };
  } catch (err) {
    // If gray-matter fails (malformed YAML), manually strip frontmatter block
    logger.warn({ error: err.message }, 'Failed to parse frontmatter, stripping manually');

    // Try to find and remove frontmatter block (between --- markers)
    const frontmatterMatch = text.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]+([\s\S]*)$/);
    if (frontmatterMatch) {
      // Found frontmatter block - return content after it (can't parse metadata)
      return {
        metadata: {},
        content: frontmatterMatch[2].trim()
      };
    }

    // No frontmatter block found - return original text
    return {
      metadata: {},
      content: text
    };
  }
}

/**
 * Try to extract the heading for a chunk from the full document
 * Only assigns heading if it IMMEDIATELY precedes this chunk (no other paragraphs between)
 *
 * NOTE: This function is disabled due to unreliable position matching.
 * The indexOf() approach can find wrong positions when text repeats.
 * Headings should be extracted during segmentation when positions are known.
 */
function extractHeading(_fullContent, _chunkText) {
  // Disabled - was causing duplicate headings across paragraphs
  // due to unreliable substring position matching
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
  // CRITICAL: Every document MUST have a file_path - no exceptions
  // The file_path is the canonical identifier and enables the UNIQUE constraint
  // to prevent duplicate documents. Documents are always tied to source files.
  if (!relativePath) {
    throw new Error('ingestDocument requires relativePath - every document must have a source file');
  }

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
  // Exclude soft-deleted documents (deleted_at IS NULL)
  if (!existingDoc && relativePath) {
    existingDoc = await queryOne(
      'SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE file_path = ? AND deleted_at IS NULL',
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
  // Exclude soft-deleted documents (deleted_at IS NULL)
  if (!existingDoc && relativePath) {
    const movedDoc = await queryOne(
      `SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE file_hash = ? AND deleted_at IS NULL`,
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
      }, 'File moved detected by file_hash - will update path and metadata');
    }
  }

  // PRIORITY 4: Look up by body_hash if file_hash didn't match (handles renames with frontmatter changes)
  // Body content unchanged but frontmatter or path changed - find by body hash
  // Exclude soft-deleted documents (deleted_at IS NULL)
  if (!existingDoc && relativePath && bodyHash) {
    const movedDoc = await queryOne(
      `SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug FROM docs WHERE body_hash = ? AND deleted_at IS NULL`,
      [bodyHash]
    );

    if (movedDoc) {
      // Body content matches! File was moved/renamed with possible frontmatter changes
      existingDoc = movedDoc;
      logger.info({
        documentId: movedDoc.id,
        oldPath: movedDoc.file_path,
        newPath: relativePath,
        title: movedDoc.title
      }, 'File moved detected by body_hash - will update path and metadata');
    }
  }

  // PRIORITY 5: Check for SOFT-DELETED document with same file_path
  // If found, RESTORE it instead of trying to INSERT (which would fail on UNIQUE constraint)
  // This handles the case where a file was deleted and then re-added at the same path
  if (!existingDoc && relativePath) {
    const deletedDoc = await queryOne(
      `SELECT id, file_path, file_hash, body_hash, title, filename, religion, collection, language, slug, deleted_at FROM docs WHERE file_path = ? AND deleted_at IS NOT NULL`,
      [relativePath]
    );

    if (deletedDoc) {
      // Found a soft-deleted doc at this path - restore it!
      await query(`UPDATE docs SET deleted_at = NULL WHERE id = ?`, [deletedDoc.id]);
      // Also restore any soft-deleted content rows for this doc
      await query(`UPDATE content SET deleted_at = NULL WHERE doc_id = ? AND deleted_at IS NOT NULL`, [deletedDoc.id]);

      existingDoc = { ...deletedDoc, deleted_at: null };
      logger.info({
        documentId: deletedDoc.id,
        filePath: relativePath,
        wasDeleted: deletedDoc.deleted_at,
        title: deletedDoc.title
      }, 'Restored soft-deleted document at same file_path - will update content');
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
    // Religion/collection come ONLY from path (folder structure = library organization)
    // Frontmatter religion/collection is ignored - it refers to archive codes, not library categories
    const pathParts = relativePath?.split('/') || [];
    const newReligion = pathParts.length >= 1 ? pathParts[0] : existingDoc.religion;
    const newCollection = pathParts.length >= 2 ? pathParts[1] : existingDoc.collection;

    // Build metadata JSON from frontmatter extras
    const metaExtras = {};
    if (frontmatterMeta.translator) metaExtras.translator = frontmatterMeta.translator;
    if (frontmatterMeta.subtitle) metaExtras.subtitle = frontmatterMeta.subtitle;
    if (frontmatterMeta.publisher) metaExtras.publisher = frontmatterMeta.publisher;
    if (frontmatterMeta.sourceUrl) metaExtras.sourceUrl = frontmatterMeta.sourceUrl;
    if (frontmatterMeta.publicationName) metaExtras.publicationName = frontmatterMeta.publicationName;
    if (frontmatterMeta.documentType) metaExtras.documentType = frontmatterMeta.documentType;
    const metaJson = Object.keys(metaExtras).length > 0 ? JSON.stringify(metaExtras) : null;

    // Extract filename from path
    const effectivePath = relativePath || existingDoc.file_path;
    const newFilename = effectivePath ? effectivePath.split('/').pop()?.replace(/\.md$/i, '') : null;

    await query(`
      UPDATE docs SET
        file_path = ?,
        file_hash = ?,
        filename = ?,
        title = ?,
        author = ?,
        religion = ?,
        collection = ?,
        language = ?,
        year = ?,
        description = ?,
        metadata = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      effectivePath,
      fileHash,
      newFilename,
      frontmatterMeta.title || existingDoc.title || null,
      frontmatterMeta.author || existingDoc.author || null,
      newReligion || null,
      newCollection || null,
      frontmatterMeta.language || existingDoc.language || null,
      safeParseYear(frontmatterMeta.year) ?? existingDoc.year ?? null,
      frontmatterMeta.description || existingDoc.description || null,
      metaJson,
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
  // Use word hashes (ignoring markers) so re-segmentation preserves embeddings
  if (existingDoc) {
    const paragraphs = await queryAll(
      'SELECT id, text, content_hash, embedding, synced FROM content WHERE doc_id = ?',
      [existingDoc.id]
    );
    for (const p of paragraphs) {
      // Key by word hash (ignoring markers) so same words match even if markers differ
      // Skip paragraphs without text (shouldn't happen, but defensive)
      if (!p.text) continue;
      const wordHash = hashContentWords(p.text);
      existingParagraphs.set(wordHash, p);
    }
    logger.info({ documentId: existingDoc.id, relativePath, existingParagraphs: paragraphs.length }, 'Document changed, doing incremental update');
  }

  // Parse frontmatter using gray-matter (handles detection automatically)
  const { content, metadata: extractedMeta } = parseMarkdownFrontmatter(text);

  // Detect language from content - this is more reliable than frontmatter
  // Arabic/Farsi detection should OVERRIDE frontmatter 'en' since it's often wrong
  const detectedLang = detectLanguageFeatures(content);
  const contentLanguage = detectedLang.language !== 'en' ? detectedLang.language : null;

  // Extract religion/collection from path (e.g., "Baha'i/Core Tablets/...")
  // This provides fallback when frontmatter doesn't specify these fields
  const pathParts = relativePath?.split('/') || [];
  const pathReligion = pathParts.length >= 1 ? pathParts[0] : null;
  const pathCollection = pathParts.length >= 2 ? pathParts[1] : null;

  // Merge metadata: religion/collection come ONLY from path (folder structure = library organization)
  // Frontmatter religion/collection is ignored - it refers to archive codes, not library categories
  // This keeps documents portable - moving a file changes its collection
  // IMPORTANT: Don't default to fake data - error out if required fields are missing
  const finalMeta = {
    title: extractedMeta.title || metadata.title || 'Untitled',
    // For author: prefer frontmatter, unless filename has real author and frontmatter doesn't
    author: extractedMeta.author || (metadata.author !== 'Unknown' ? metadata.author : null) || 'Unknown',
    religion: pathReligion || existingDoc?.religion || null,
    collection: pathCollection || existingDoc?.collection || null,
    // Language: detected Arabic/Farsi > frontmatter > filename metadata > default 'en'
    // Content detection takes priority because frontmatter often incorrectly says 'en' for RTL texts
    language: contentLanguage || extractedMeta.language || metadata.language || 'en',
    year: extractedMeta.year || metadata.year || null,
    description: extractedMeta.description || metadata.description || ''
  };

  // Extra metadata fields stored as JSON (translator, subtitle, publisher, sourceUrl, etc.)
  const extraMeta = {};
  if (extractedMeta.translator) extraMeta.translator = extractedMeta.translator;
  if (extractedMeta.subtitle) extraMeta.subtitle = extractedMeta.subtitle;
  if (extractedMeta.publisher) extraMeta.publisher = extractedMeta.publisher;
  if (extractedMeta.sourceUrl) extraMeta.sourceUrl = extractedMeta.sourceUrl;
  if (extractedMeta.publicationName) extraMeta.publicationName = extractedMeta.publicationName;
  if (extractedMeta.documentType) extraMeta.documentType = extractedMeta.documentType;
  const metadataJson = Object.keys(extraMeta).length > 0 ? JSON.stringify(extraMeta) : null;

  // Validate required fields - error out rather than using fake defaults
  if (!finalMeta.religion || !finalMeta.collection) {
    const error = `Missing required metadata: religion=${finalMeta.religion}, collection=${finalMeta.collection}. ` +
                  `Path must be in format: Religion/Collection/filename.md (got: ${relativePath})`;
    logger.error({ relativePath, religion: finalMeta.religion, collection: finalMeta.collection }, error);
    return {
      documentId: existingDoc?.id ?? null,
      paragraphCount: 0,
      status: 'error',
      error
    };
  }

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

  // Validate paragraph lengths for non-RTL languages only
  // RTL languages (Arabic, Farsi, Hebrew, Urdu) use AI segmentation which handles long text
  // English and other LTR languages must have properly-segmented paragraphs in advance
  const AI_SEGMENTED_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
  const languageUsesAISegmentation = AI_SEGMENTED_LANGUAGES.includes(finalMeta.language);

  if (!languageUsesAISegmentation) {
    const oversizedChunks = chunks
      .map((chunk, idx) => ({ idx, length: chunk.text?.length || 0, preview: chunk.text?.substring(0, 100) }))
      .filter(c => c.length > MAX_PARAGRAPH_LENGTH);

    if (oversizedChunks.length > 0) {
      const errorMessage = `Document has ${oversizedChunks.length} paragraph(s) exceeding ${MAX_PARAGRAPH_LENGTH} characters. ` +
                           `Longest: ${Math.max(...oversizedChunks.map(c => c.length))} chars at paragraph ${oversizedChunks[0].idx + 1}. ` +
                           `Please split long paragraphs manually.`;

      // Log to document_failures table
      await logDocumentFailure({
        filePath: relativePath,
        fileName: relativePath?.split('/').pop(),
        errorType: 'oversized_paragraph',
        errorMessage,
        details: {
          oversizedCount: oversizedChunks.length,
          maxLength: MAX_PARAGRAPH_LENGTH,
          language: finalMeta.language,
          paragraphs: oversizedChunks.map(c => ({
            index: c.idx,
            length: c.length,
            preview: c.preview
          }))
        }
      });

      logger.error({
        relativePath,
        language: finalMeta.language,
        oversizedCount: oversizedChunks.length,
        maxAllowed: MAX_PARAGRAPH_LENGTH,
        longest: Math.max(...oversizedChunks.map(c => c.length))
      }, 'Document rejected: oversized paragraphs');

      return {
        documentId: existingDoc?.id ?? null,
        paragraphCount: 0,
        status: 'error',
        error: errorMessage
      };
    }
  }

  // Add sentence markers to paragraphs that don't already have them
  // (sentence-first approach for RTL texts already has markers applied)
  // This enables per-sentence translations and URL anchors
  let totalSentences = 0;

  // Check if chunks already have sentence markers (from sentence-first segmentation)
  const hasExistingMarkers = chunks.some(c => c.text && c.text.includes('\u2045'));

  // Only add sentence markers for RTL texts (Arabic, Farsi, Hebrew, Urdu)
  // English and other LTR texts don't need sentence markers
  const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];
  const isRTLText = RTL_LANGUAGES.includes(finalMeta.language);

  if (hasExistingMarkers) {
    // Count existing sentences
    for (const chunk of chunks) {
      const matches = chunk.text?.match(/⁅s\d+⁆/g);
      totalSentences += matches ? matches.length : 0;
    }
    logger.debug({ paragraphs: chunks.length, sentences: totalSentences }, 'Using pre-existing sentence markers');
  } else if (isRTLText && !existingDoc) {
    // ONLY add sentence markers for NEW RTL documents (not updates)
    // For updates, we'll reuse existing markers from DB paragraphs
    // This avoids expensive GPT-4o calls for re-ingestion of unchanged paragraphs
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
      logger.debug({ paragraphs: chunks.length, sentences: totalSentences }, 'Added sentence markers for NEW RTL document');
    } catch (err) {
      // If batch marking fails completely, log but keep original text
      logger.warn({ err: err.message }, 'Failed to batch add sentence markers');
    }
  } else if (isRTLText && existingDoc) {
    // For RTL document UPDATES, markers will be preserved from existing DB paragraphs
    // via the paragraph matching logic below (reusedParagraphs preserve their text)
    logger.debug({ paragraphs: chunks.length, documentId: existingDoc.id }, 'Skipping sentence detection for RTL document update - will reuse existing markers');
  } else {
    // LTR texts (English, etc.) - no sentence markers needed
    logger.debug({ paragraphs: chunks.length, language: finalMeta.language }, 'Skipping sentence markers for LTR text');
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
  // file_mtime tracks when the source file was last modified (for accurate "added" vs "modified" filtering)
  const fileMtime = metadata.file_mtime || null;
  // Extract filename from path (e.g., "Baha'i/Core/Author - Title.md" -> "Author - Title")
  const filename = relativePath ? relativePath.split('/').pop()?.replace(/\.md$/i, '') : null;

  if (existingDoc) {
    // UPDATE existing document
    await query(`
      UPDATE docs SET
        file_path = ?,
        file_hash = ?,
        body_hash = ?,
        filename = ?,
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
        metadata = ?,
        file_mtime = COALESCE(?, file_mtime),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      relativePath,
      fileHash,
      bodyHash,
      filename,
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
      metadataJson,
      fileMtime,
      finalDocId
    ]);
  } else {
    // INSERT new document (let SQLite generate the INTEGER id)
    const result = await query(`
      INSERT INTO docs
      (file_path, file_hash, body_hash, filename, title, author, religion, collection, language, year, description, paragraph_count, slug, auto_segmented, metadata, file_mtime, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      relativePath,
      fileHash,
      bodyHash,
      filename,
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
      metadataJson,
      fileMtime
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

    // Only create redirect if both old and new paths have valid religion/collection
    // Avoid creating redirects to 'general/general' which is a fallback for missing metadata
    const hasValidOldPath = oldReligionSlug && oldCollectionSlug && oldReligionSlug !== 'general';
    const hasValidNewPath = newReligionSlug && newCollectionSlug && newReligionSlug !== 'general';

    if (oldPath !== newPath && oldSlug && finalSlug && hasValidOldPath && hasValidNewPath) {
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
  // Execute in order: DELETEs first, then UPDATEs, then INSERTs
  // This avoids UNIQUE constraint errors when paragraph positions change
  const newWordHashes = new Set();  // Track word hashes (ignoring markers)
  const deleteStatements = [];  // Stale paragraphs to remove
  const updateStatements = [];  // Reused paragraphs (update position, possibly markers)
  const insertStatements = [];  // New paragraphs
  let reusedCount = 0;
  let newCount = 0;

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    const chunkText = chunk.text;
    const blocktype = chunk.blocktype || BLOCK_TYPES.PARAGRAPH;
    // Use word hash (ignoring markers) for comparison
    // Same words with different sentence/phrase boundaries = same paragraph
    const wordHash = hashContentWords(chunkText);
    const contentHash = hashContent(chunkText);  // Full hash for storage
    newWordHashes.add(wordHash);

    const existing = existingParagraphs.get(wordHash);

    if (existing) {
      // Same words found - REUSE existing text with markers (preserves embeddings AND markers!)
      // This avoids regenerating sentence markers via expensive GPT-4o calls
      // Only update position and sync flag if they differ
      reusedCount++;
      const reuseText = existing.text;  // Use DB text with existing markers
      const reuseHash = existing.content_hash;  // Keep existing hash

      // Only mark as needing sync if position changed
      const positionChanged = existing.paragraph_index !== index;
      updateStatements.push({
        sql: `
          UPDATE content
          SET paragraph_index = ?, heading = ?, blocktype = ?${positionChanged ? ', synced = 0' : ''}
          WHERE id = ?
        `,
        args: [
          index,
          extractHeading(content, reuseText),
          blocktype,
          existing.id
        ]
      });
      // Mark as used so we don't delete it later
      existingParagraphs.delete(wordHash);
    } else {
      // New paragraph - insert it with blocktype
      // Let SQLite auto-generate INTEGER id (matches Meilisearch rowid)
      newCount++;
      insertStatements.push({
        sql: `
          INSERT INTO content
          (doc_id, paragraph_index, text, content_hash, normalized_hash, heading, blocktype)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          finalDocId,
          index,
          chunkText,
          contentHash,
          computeNormalizedHash(chunkText),
          extractHeading(content, chunkText),
          blocktype
        ]
      });
    }
  }

  // For RTL document UPDATES with NEW paragraphs, add sentence markers only to new ones
  // This is the cost-efficient path: reuse existing markers, only process truly new content
  if (isRTLText && existingDoc && insertStatements.length > 0) {
    try {
      // Extract new paragraph texts for sentence detection
      const newParagraphs = insertStatements.map((stmt, idx) => ({
        id: String(idx),
        text: stmt.args[2]  // text is at index 2 in args
      }));

      logger.info({ count: newParagraphs.length }, 'Adding sentence markers to NEW paragraphs only (RTL update)');
      const markedResults = await batchAddSentenceMarkers(newParagraphs, finalMeta.language);

      // Update INSERT statements with marked text and recalculated hash
      for (const result of markedResults) {
        const idx = parseInt(result.id, 10);
        if (idx >= 0 && idx < insertStatements.length) {
          insertStatements[idx].args[2] = result.text;  // Update text
          insertStatements[idx].args[3] = hashContent(result.text);  // Update content_hash
          totalSentences += result.sentenceCount;
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to add sentence markers to new paragraphs');
    }
  }

  // Collect stale paragraphs that no longer exist in the document
  let deletedCount = 0;
  for (const [, oldParagraph] of existingParagraphs) {
    deletedCount++;
    // Note: Embeddings are cached by content_hash, not paragraph_id
    // So deleting the content row doesn't lose the embedding cache
    deleteStatements.push({
      sql: `DELETE FROM content WHERE id = ?`,
      args: [oldParagraph.id]
    });
  }

  // Execute in order: DELETEs first, then UPDATEs, then INSERTs
  // This prevents UNIQUE constraint errors when paragraph positions shift
  const BATCH_SIZE = 100;

  // 1. Delete stale paragraphs first (frees up ids/positions)
  for (let i = 0; i < deleteStatements.length; i += BATCH_SIZE) {
    const batch = deleteStatements.slice(i, i + BATCH_SIZE);
    await transaction(batch);
  }

  // 2. Update existing paragraphs (position changes, preserves embeddings)
  for (let i = 0; i < updateStatements.length; i += BATCH_SIZE) {
    const batch = updateStatements.slice(i, i + BATCH_SIZE);
    await transaction(batch);
  }

  // 3. Insert new paragraphs
  for (let i = 0; i < insertStatements.length; i += BATCH_SIZE) {
    const batch = insertStatements.slice(i, i + BATCH_SIZE);
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
 * Soft-delete a document and all its content
 * Preserves embeddings for 30 days to avoid regenerating when re-importing similar content.
 * Content is immediately removed from Meilisearch search index.
 */
export async function removeDocument(documentId) {
  const now = new Date().toISOString();

  // Soft-delete: set deleted_at timestamp instead of DELETE
  // This preserves embeddings for potential reuse
  await query('UPDATE content SET deleted_at = ? WHERE doc_id = ?', [now, documentId]);
  await query('UPDATE docs SET deleted_at = ? WHERE id = ?', [now, documentId]);

  // Remove from Meilisearch immediately (exclude from search)
  try {
    await deleteFromMeilisearch(documentId);
  } catch (err) {
    // Log but don't fail - Meilisearch might not have this document
    logger.warn({ err: err.message, documentId }, 'Failed to remove from Meilisearch (may not exist)');
  }

  logger.info({ documentId }, 'Document soft-deleted (embeddings retained for 30 days)');
  return { documentId, removed: true, softDeleted: true };
}

/**
 * Hard-delete documents that have been soft-deleted for more than 30 days
 * Called periodically to clean up old embeddings
 */
export async function purgeOldDeletedContent(retentionDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString();

  // Delete content first (foreign key), then docs
  const contentResult = await query(
    'DELETE FROM content WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoffStr]
  );
  const docsResult = await query(
    'DELETE FROM docs WHERE deleted_at IS NOT NULL AND deleted_at < ?',
    [cutoffStr]
  );

  const contentDeleted = contentResult?.changes || 0;
  const docsDeleted = docsResult?.changes || 0;

  if (contentDeleted > 0 || docsDeleted > 0) {
    logger.info({
      contentDeleted,
      docsDeleted,
      retentionDays,
      cutoff: cutoffStr
    }, 'Purged old soft-deleted content');
  }

  return { contentDeleted, docsDeleted };
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
 * Excludes soft-deleted documents
 */
export async function isFileIngested(filePath) {
  const doc = await queryOne(
    'SELECT id, file_hash FROM docs WHERE file_path = ? AND deleted_at IS NULL',
    [filePath]
  );
  return doc !== null;
}

/**
 * Get document by file path
 */
export async function getDocumentByPath(filePath) {
  // Exclude soft-deleted documents
  return queryOne(
    'SELECT * FROM docs WHERE file_path = ? AND deleted_at IS NULL',
    [filePath]
  );
}

/**
 * Get document by body hash (content without frontmatter)
 * Excludes soft-deleted documents
 */
export async function getDocumentByBodyHash(bodyHash) {
  return queryOne(
    'SELECT * FROM docs WHERE body_hash = ? AND deleted_at IS NULL',
    [bodyHash]
  );
}

/**
 * Check if body_hash exists at a different path (content was moved)
 * Excludes soft-deleted documents
 * @param {string} bodyHash - The body hash to check
 * @param {string} excludePath - The path to exclude from the search
 * @returns {Object|null} - The document at the new location, or null
 */
export async function getMovedDocumentByBodyHash(bodyHash, excludePath) {
  return queryOne(
    'SELECT * FROM docs WHERE body_hash = ? AND file_path != ? AND deleted_at IS NULL',
    [bodyHash, excludePath]
  );
}

export const ingester = {
  hashContent,
  hashContentWords,
  stripMarkersForHash,
  parseDocument,
  parseDocumentWithBlocks,
  parseMarkdownFrontmatter,
  ingestDocument,
  removeDocument,
  purgeOldDeletedContent,
  getIngestionStats,
  getUnprocessedDocuments,
  isFileIngested,
  getDocumentByPath,
  getDocumentByBodyHash,
  getMovedDocumentByBodyHash
};

export default ingester;
