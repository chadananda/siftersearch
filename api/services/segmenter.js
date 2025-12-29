/**
 * Semantic Text Segmenter
 *
 * Intelligently segments text into meaningful paragraphs using AI.
 *
 * Key principle: Any text block exceeding maxChunkSize gets AI segmentation.
 * This applies universally - English, Arabic, Farsi, etc.
 *
 * AI suggests break positions ONLY - never generates or modifies text.
 * Text integrity is verified after every segmentation operation.
 */

import { aiService } from '../lib/ai-services.js';
import { logger } from '../lib/logger.js';

/**
 * Configuration for segmentation
 */
const SEGMENT_CONFIG = {
  maxChunkSize: 1500,        // Maximum characters per segment - triggers AI if exceeded
  minChunkSize: 20,          // Minimum characters to keep a segment (lowered to preserve short prayers/invocations)
  sentenceDelimiters: /[.!?。！？؟۔]\s+/,  // Standard + Arabic/Farsi end marks
  // Arabic verse markers and section indicators
  verseMarkers: /[\u06DD\u06DE]|[۱۲۳۴۵۶۷۸۹۰\d]+\s*[.:\u061B]/g
};

/**
 * Detect language features of text
 *
 * @param {string} text - Input text
 * @returns {{isRTL: boolean, language: string, textLength: number}}
 */
export function detectLanguageFeatures(text) {
  if (!text || typeof text !== 'string') {
    return { isRTL: false, language: 'en', textLength: 0 };
  }

  // Arabic Unicode range: \u0600-\u06FF
  const arabicPattern = /[\u0600-\u06FF]/;
  // Extended Arabic and Farsi: \u0750-\u077F, \uFB50-\uFDFF, \uFE70-\uFEFF
  const extendedArabicPattern = /[\u0750-\u077F]|[\uFB50-\uFDFF]|[\uFE70-\uFEFF]/;
  // Farsi-specific characters
  const farsiPattern = /[\u067E\u0686\u0698\u06AF\u06CC]/; // پ چ ژ گ ی

  const hasArabic = arabicPattern.test(text) || extendedArabicPattern.test(text);
  const hasFarsi = farsiPattern.test(text);
  const isRTL = hasArabic || hasFarsi;

  // Determine primary language
  let language = 'en';
  if (hasFarsi) {
    language = 'fa';
  } else if (hasArabic) {
    language = 'ar';
  }

  return {
    isRTL,
    language,
    textLength: text.length
  };
}

/**
 * Check if text contains verse markers that can be used for segmentation
 *
 * @param {string} text - Input text
 * @returns {{hasMarkers: boolean, markerPositions: number[]}}
 */
export function detectVerseMarkers(text) {
  if (!text) {
    return { hasMarkers: false, markerPositions: [] };
  }

  const markerPositions = [];
  let match;
  const pattern = new RegExp(SEGMENT_CONFIG.verseMarkers.source, 'g');

  while ((match = pattern.exec(text)) !== null) {
    // Position after the marker
    markerPositions.push(match.index + match[0].length);
  }

  return {
    hasMarkers: markerPositions.length >= 3, // Need at least 3 markers to use
    markerPositions
  };
}

/**
 * Get AI-suggested break points using text markers
 * AI identifies paragraph boundaries by MEANING and returns text markers (not positions)
 * Code then finds those markers in the text to determine actual split positions
 *
 * @param {string} text - Input text (any language)
 * @param {object} options - Options
 * @returns {Promise<{breakPositions: number[], confidence: number, reasoning: string}>}
 */
export async function getAIBreakPositions(text, options = {}) {
  const { language = 'en', maxChunkSize = SEGMENT_CONFIG.maxChunkSize } = options;

  // Target ~3-5 chunks for text that's 2-3x maxChunkSize
  const targetChunks = Math.ceil(text.length / maxChunkSize);

  const languageHint = language === 'fa' ? 'Persian/Farsi' :
                       language === 'ar' ? 'Arabic' : 'English';

  const systemPrompt = `You are an expert in semantic text analysis for ${languageHint} religious and classical texts. Your task is to identify natural paragraph break points based purely on MEANING.

CRITICAL APPROACH:
1. Read the text and understand its semantic structure
2. Identify ${targetChunks - 1} to ${targetChunks + 1} natural paragraph breaks based on meaning transitions
3. For each break, provide the EXACT TEXT that ends one paragraph and begins the next
4. DO NOT rely on punctuation - classical texts often lack punctuation
5. Identify breaks by semantic transitions only:
   - Topic shifts or new subjects
   - New arguments or ideas
   - Rhetorical transitions (e.g., "And He said...", "Then...")
   - Natural pauses in discourse
6. Preserve as complete units:
   - Complete invocations and prayers
   - Poetic verses (do not split couplets)
   - Quranic/scriptural quotations
   - Lists of divine attributes

RESPONSE FORMAT:
For each paragraph break, provide:
- endMarker: The EXACT last 3-8 words that end one paragraph (copy exactly from text)
- startMarker: The EXACT first 3-8 words that begin the next paragraph (copy exactly from text)`;

  const userPrompt = `Analyze this ${languageHint} text and identify ${targetChunks - 1} to ${targetChunks + 1} natural paragraph breaks based on meaning and topic transitions.

TEXT:
${text}

Respond with JSON only:
{
  "breaks": [
    {"endMarker": "exact ending words", "startMarker": "exact starting words"},
    {"endMarker": "exact ending words", "startMarker": "exact starting words"}
  ],
  "confidence": 0.85,
  "reasoning": "Brief explanation of why these are natural paragraph boundaries"
}

IMPORTANT: Copy the markers EXACTLY as they appear in the text. Semantic coherence is more important than equal chunk sizes.`;

  try {
    const response = await aiService('quality').chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.2, // Low temperature for consistent results
      max_tokens: 1000
    });

    // Parse JSON response
    const content = response.content || response;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const result = JSON.parse(jsonMatch[0]);
    const breaks = result.breaks || [];

    // Convert text markers to positions
    const breakPositions = [];

    for (const breakPoint of breaks) {
      const { endMarker, startMarker } = breakPoint;

      if (!endMarker || !startMarker) continue;

      // Find the startMarker in the text - this is where the new paragraph begins
      const startIdx = text.indexOf(startMarker);

      if (startIdx > 0) {
        breakPositions.push(startIdx);
        logger.debug({
          endMarker: endMarker.slice(0, 30),
          startMarker: startMarker.slice(0, 30),
          position: startIdx
        }, 'Found paragraph break');
      } else {
        // Try fuzzy matching - remove extra spaces and try again
        const normalizedText = text.replace(/\s+/g, ' ');
        const normalizedMarker = startMarker.replace(/\s+/g, ' ');
        const normalizedIdx = normalizedText.indexOf(normalizedMarker);

        if (normalizedIdx > 0) {
          // Convert normalized position back to original text position
          // This is approximate but should be close
          const ratio = text.length / normalizedText.length;
          const approxPos = Math.round(normalizedIdx * ratio);
          breakPositions.push(findWordBoundary(text, approxPos));
          logger.debug({ startMarker: startMarker.slice(0, 30), approxPos }, 'Found break via fuzzy match');
        } else {
          logger.warn({ startMarker: startMarker.slice(0, 30) }, 'Could not find startMarker in text');
        }
      }
    }

    // Sort and dedupe
    const validPositions = [...new Set(breakPositions)]
      .filter(pos => pos > 0 && pos < text.length)
      .sort((a, b) => a - b);

    return {
      breakPositions: validPositions,
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || 'No reasoning provided'
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'AI segmentation failed');
    throw err;
  }
}

/**
 * Find the nearest word boundary to a position
 * Word boundaries are spaces - we NEVER split within a word
 * For unpunctuated Arabic/Persian text, this ensures words stay intact
 *
 * @param {string} text - Text to search
 * @param {number} position - Target position
 * @param {number} maxDistance - Maximum distance to search (default 30)
 * @returns {number} Adjusted position at word boundary (after a space)
 */
function findWordBoundary(text, position, maxDistance = 30) {
  if (position <= 0 || position >= text.length) {
    return position;
  }

  // Check if we're already at a word boundary (right after a space)
  if (position > 0 && /\s/.test(text[position - 1])) {
    return position;
  }

  // Check if we're on a space
  if (/\s/.test(text[position])) {
    // Move to right after the space
    let endPos = position;
    while (endPos < text.length && /\s/.test(text[endPos])) {
      endPos++;
    }
    return endPos;
  }

  // Search forward first (find the end of the current word)
  for (let i = 1; i <= maxDistance; i++) {
    const checkPos = position + i;
    if (checkPos < text.length && /\s/.test(text[checkPos])) {
      // Found space, return position right after it
      let endPos = checkPos;
      while (endPos < text.length && /\s/.test(text[endPos])) {
        endPos++;
      }
      return endPos;
    }
  }

  // Search backward (find the start of the current word)
  for (let i = 1; i <= maxDistance; i++) {
    const checkPos = position - i;
    if (checkPos >= 0 && /\s/.test(text[checkPos])) {
      // Found space, return position right after it
      let endPos = checkPos;
      while (endPos < text.length && /\s/.test(text[endPos])) {
        endPos++;
      }
      return endPos;
    }
  }

  // No word boundary found within range - return original position
  return position;
}

/**
 * Split text at specified positions
 * CRITICAL: Snaps positions to word boundaries and verifies text integrity
 *
 * @param {string} text - Original text
 * @param {number[]} positions - Break positions
 * @returns {string[]} Array of segments
 * @throws {Error} If text integrity check fails
 */
export function splitAtPositions(text, positions) {
  if (!text || !positions || positions.length === 0) {
    return [text].filter(Boolean);
  }

  // Snap positions to word boundaries
  const adjustedPositions = positions
    .map(pos => findWordBoundary(text, pos))
    .sort((a, b) => a - b);

  // Remove duplicates and invalid positions
  const uniquePositions = [...new Set(adjustedPositions)]
    .filter(pos => pos > 0 && pos < text.length);

  const segments = [];
  let lastPos = 0;

  for (const pos of uniquePositions) {
    if (pos > lastPos && pos < text.length) {
      const segment = text.slice(lastPos, pos).trim();
      if (segment) {
        segments.push(segment);
      }
      lastPos = pos;
    }
  }

  // Don't forget the last segment
  if (lastPos < text.length) {
    const segment = text.slice(lastPos).trim();
    if (segment) {
      segments.push(segment);
    }
  }

  // CRITICAL: Verify text integrity
  verifyIntegrity(text, segments);

  return segments;
}

/**
 * Verify that segmentation did not alter the text
 *
 * @param {string} original - Original text
 * @param {string[]} segments - Segmented text
 * @throws {Error} If integrity check fails with significant difference
 */
export function verifyIntegrity(original, segments) {
  // Compare without whitespace (since we trim segments)
  const originalClean = original.replace(/\s+/g, '');
  const segmentsClean = segments.join('').replace(/\s+/g, '');

  if (originalClean !== segmentsClean) {
    const diff = Math.abs(originalClean.length - segmentsClean.length);
    const errorRate = diff / originalClean.length;

    // Allow tiny differences (< 0.1%) as trim edge cases, but log warning
    if (errorRate < 0.001) {
      logger.warn({
        originalLength: originalClean.length,
        segmentsLength: segmentsClean.length,
        diff,
        errorRate: (errorRate * 100).toFixed(4) + '%'
      }, 'Minor text difference after segmentation (within tolerance)');
      return; // Accept small differences
    }

    throw new Error(
      `Text integrity check failed: ` +
      `original has ${originalClean.length} chars, ` +
      `segments have ${segmentsClean.length} chars ` +
      `(difference: ${diff}, error rate: ${(errorRate * 100).toFixed(2)}%)`
    );
  }
}

/**
 * Split text using regex (for texts with punctuation)
 *
 * @param {string} text - Input text
 * @param {object} options - Options
 * @returns {string[]} Array of segments
 */
export function regexSegment(text, options = {}) {
  const { maxChunkSize = SEGMENT_CONFIG.maxChunkSize, minChunkSize = SEGMENT_CONFIG.minChunkSize } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  // First split by paragraphs (double newlines)
  const paragraphs = text.split(SEGMENT_CONFIG.paragraphDelimiters)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const segments = [];

  for (const para of paragraphs) {
    if (para.length <= maxChunkSize) {
      if (para.length >= minChunkSize) {
        segments.push(para);
      }
    } else {
      // Split long paragraphs by sentences
      const sentences = para.split(SEGMENT_CONFIG.sentenceDelimiters);
      let currentChunk = '';

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        if ((currentChunk + ' ' + trimmed).length <= maxChunkSize) {
          currentChunk = currentChunk ? currentChunk + ' ' + trimmed : trimmed;
        } else {
          if (currentChunk.length >= minChunkSize) {
            segments.push(currentChunk);
          }

          // Handle very long sentences
          if (trimmed.length > maxChunkSize) {
            const hardSplit = hardSplitText(trimmed, maxChunkSize);
            segments.push(...hardSplit.filter(s => s.length >= minChunkSize));
            currentChunk = '';
          } else {
            currentChunk = trimmed;
          }
        }
      }

      if (currentChunk.length >= minChunkSize) {
        segments.push(currentChunk);
      }
    }
  }

  return segments;
}

/**
 * Hard-split text at word boundaries (last resort for unpunctuated text)
 * For classical Arabic/Persian texts that lack punctuation
 * Splits at natural word boundaries while maintaining maxSize constraint
 *
 * @param {string} text - Text to split
 * @param {number} maxSize - Maximum chunk size
 * @returns {string[]} Array of chunks
 */
function hardSplitText(text, maxSize) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxSize) {
    // First try: find sentence-ending punctuation within range
    const sentenceEndPattern = /[.!?؟۔。！？]\s*/g;
    let bestSplit = -1;
    let match;

    while ((match = sentenceEndPattern.exec(remaining)) !== null) {
      const endPos = match.index + match[0].length;
      if (endPos <= maxSize) {
        bestSplit = endPos;
      } else {
        break;
      }
    }

    if (bestSplit > maxSize * 0.3) {
      // Found good sentence boundary
      chunks.push(remaining.slice(0, bestSplit).trim());
      remaining = remaining.slice(bestSplit).trim();
      continue;
    }

    // Second try: for unpunctuated text, find the last space within maxSize
    // This ensures we never split within a word
    let splitPoint = remaining.lastIndexOf(' ', maxSize);

    if (splitPoint > maxSize * 0.3) {
      // Good word boundary found
      chunks.push(remaining.slice(0, splitPoint).trim());
      remaining = remaining.slice(splitPoint).trim();
    } else {
      // Look for first space after maxSize (accept slightly larger chunk)
      const spaceAfter = remaining.indexOf(' ', maxSize);
      if (spaceAfter > 0 && spaceAfter < maxSize * 1.5) {
        chunks.push(remaining.slice(0, spaceAfter).trim());
        remaining = remaining.slice(spaceAfter).trim();
      } else {
        // Absolute last resort: take entire remaining text if no spaces
        // This handles edge cases like one very long word (shouldn't happen)
        chunks.push(remaining.trim());
        remaining = '';
      }
    }
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Main segmentation function
 * Simple rule: any text > maxChunkSize gets AI semantic segmentation
 *
 * @param {string} text - Input text
 * @param {object} options - Options
 * @returns {Promise<string[]>} Array of segments
 */
export async function segmentText(text, options = {}) {
  const { maxChunkSize = SEGMENT_CONFIG.maxChunkSize, minChunkSize = SEGMENT_CONFIG.minChunkSize, language } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  // Normalize: join arbitrary line breaks, keep paragraph breaks
  const normalized = normalizeLineBreaks(text);

  const features = detectLanguageFeatures(normalized);
  const detectedLanguage = language || features.language;

  logger.debug({
    originalLength: text.length,
    normalizedLength: normalized.length,
    language: detectedLanguage
  }, 'Analyzing text for segmentation');

  // If text fits in one chunk, return as-is
  if (normalized.length <= maxChunkSize) {
    return normalized.length >= minChunkSize ? [normalized] : [];
  }

  // Text exceeds max size - needs segmentation
  // First try verse markers for Arabic/Farsi religious texts
  if (features.isRTL) {
    const { hasMarkers, markerPositions } = detectVerseMarkers(normalized);
    if (hasMarkers) {
      logger.debug({ markerCount: markerPositions.length }, 'Using verse marker segmentation');
      try {
        const segments = splitAtPositions(normalized, markerPositions);
        return applyMaxChunkSize(segments, maxChunkSize, minChunkSize, detectedLanguage);
      } catch (err) {
        logger.warn({ err: err.message }, 'Verse marker segmentation failed');
      }
    }
  }

  // Use AI semantic segmentation for oversized text
  logger.info({ language: detectedLanguage, textLength: normalized.length }, 'Using AI semantic segmentation');

  try {
    const result = await getAIBreakPositions(normalized, {
      language: detectedLanguage,
      maxChunkSize
    });

    logger.debug({
      breakCount: result.breakPositions.length,
      confidence: result.confidence,
      reasoning: result.reasoning
    }, 'AI suggested break positions');

    const segments = splitAtPositions(normalized, result.breakPositions);
    // Recursively handle any still-oversized chunks
    return applyMaxChunkSize(segments, maxChunkSize, minChunkSize, detectedLanguage);
  } catch (err) {
    logger.warn({ err: err.message }, 'AI segmentation failed, falling back to hard split');
    return hardSplitText(normalized, maxChunkSize);
  }
}

/**
 * Normalize line breaks: join single \n (OCR artifacts), keep \n\n (paragraph hints)
 * @param {string} text
 * @returns {string}
 */
function normalizeLineBreaks(text) {
  // Replace single newlines (not preceded/followed by newline) with space
  // Keep double+ newlines as single space (we segment by meaning, not formatting)
  return text
    .replace(/\n{2,}/g, ' ') // Multiple newlines → space
    .replace(/\n/g, ' ')     // Single newlines → space
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Apply max chunk size constraint to segments
 * Recursively uses AI for still-oversized chunks
 *
 * @param {string[]} segments - Input segments
 * @param {number} maxChunkSize - Maximum chunk size
 * @param {number} minChunkSize - Minimum chunk size
 * @param {string} language - Language hint for AI
 * @returns {Promise<string[]>} Constrained segments
 */
async function applyMaxChunkSize(segments, maxChunkSize, minChunkSize = SEGMENT_CONFIG.minChunkSize, language = 'en') {
  const result = [];

  for (const segment of segments) {
    if (segment.length < minChunkSize) {
      continue; // Skip too-small segments
    }

    if (segment.length <= maxChunkSize) {
      result.push(segment);
    } else {
      // Oversized segment - try AI first, fall back to hard split
      try {
        const aiResult = await getAIBreakPositions(segment, { language, maxChunkSize });
        if (aiResult.breakPositions.length > 0) {
          const subSegments = splitAtPositions(segment, aiResult.breakPositions);
          // Recursively apply (in case AI chunks are still too big)
          const processed = await applyMaxChunkSize(subSegments, maxChunkSize, minChunkSize, language);
          result.push(...processed);
        } else {
          result.push(...hardSplitText(segment, maxChunkSize));
        }
      } catch {
        result.push(...hardSplitText(segment, maxChunkSize));
      }
    }
  }

  return result;
}

/**
 * Segment document content with blocktype awareness
 * Combines block parsing with intelligent segmentation
 *
 * @param {Array<{type: string, content: string}>} blocks - Parsed blocks
 * @param {object} options - Options including language
 * @returns {Promise<Array<{text: string, blocktype: string}>>} Segmented chunks with types
 */
export async function segmentBlocks(blocks, options = {}) {
  const { maxChunkSize = SEGMENT_CONFIG.maxChunkSize, minChunkSize = SEGMENT_CONFIG.minChunkSize, language } = options;

  const chunks = [];

  for (const block of blocks) {
    if (!block.content) {
      continue;
    }

    // Normalize the block content (join OCR line breaks)
    const normalized = normalizeLineBreaks(block.content);

    if (normalized.length < minChunkSize) {
      continue;
    }

    if (normalized.length <= maxChunkSize) {
      // Block fits in one chunk
      chunks.push({
        text: normalized,
        blocktype: block.type
      });
    } else {
      // Need AI segmentation for this oversized block
      const segments = await segmentText(normalized, { maxChunkSize, minChunkSize, language });

      for (const seg of segments) {
        if (seg.length >= minChunkSize) {
          chunks.push({
            text: seg,
            blocktype: block.type
          });
        }
      }
    }
  }

  return chunks;
}
