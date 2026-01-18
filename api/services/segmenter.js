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
import { wrapSentence, stripMarkers, validateMarkers, verifyMarkedText } from '../lib/markers.js';

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

  // Count characters by script type to determine MAJORITY language
  // Arabic Unicode ranges: \u0600-\u06FF, \u0750-\u077F, \uFB50-\uFDFF, \uFE70-\uFEFF
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  // Latin characters (basic + extended)
  const latinChars = (text.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;

  // Farsi-specific characters: پ چ ژ گ ی
  const farsiChars = (text.match(/[\u067E\u0686\u0698\u06AF\u06CC]/g) || []).length;

  const totalAlpha = arabicChars + latinChars;
  if (totalAlpha === 0) {
    return { isRTL: false, language: 'en', textLength: text.length };
  }

  // Calculate ratio - document is RTL only if MAJORITY (>50%) is Arabic script
  const arabicRatio = arabicChars / totalAlpha;
  const isRTL = arabicRatio > 0.5;

  // Determine primary language based on majority
  let language = 'en';
  if (isRTL) {
    // Among RTL, check if Farsi-specific chars (پ چ ژ گ ی) are present
    // Threshold: 10% Farsi-specific chars among all Arabic-script chars = Farsi document
    // Farsi shares most chars with Arabic, only these 5 are unique
    // 10% threshold prevents Arabic docs with occasional Farsi quotes from being misclassified
    const farsiRatio = arabicChars > 0 ? farsiChars / arabicChars : 0;
    language = farsiRatio > 0.10 ? 'fa' : 'ar';
  }

  return {
    isRTL,
    language,
    textLength: text.length,
    arabicRatio  // Include for debugging
  };
}

/**
 * Check if text has sufficient punctuation for sentence-based splitting
 * Text is considered "punctuated" if it has sentence-ending marks every ~200 chars average
 *
 * @param {string} text - Input text
 * @returns {boolean} True if text has sufficient punctuation
 */
export function hasPunctuation(text) {
  if (!text || typeof text !== 'string') return false;

  // Count sentence-ending punctuation marks (., !, ?, etc.)
  const punctuationMarks = (text.match(/[.!?؟۔。！？]/g) || []).length;

  // Text should have punctuation roughly every 200 chars on average
  // If text is 10000 chars, we expect ~50 sentence endings
  const expectedPunctuation = Math.floor(text.length / 200);

  // Require at least 50% of expected punctuation to consider it "punctuated"
  return punctuationMarks >= Math.max(3, expectedPunctuation * 0.5);
}

/**
 * Split text at sentence boundaries (for punctuated text)
 * Uses standard punctuation marks followed by whitespace
 *
 * @param {string} text - Input text
 * @param {number} maxChunkSize - Maximum chars per chunk
 * @param {number} minChunkSize - Minimum chars per chunk
 * @returns {string[]} Array of segments
 */
function splitAtSentenceBoundaries(text, maxChunkSize, minChunkSize) {
  // Split on sentence endings followed by space
  const sentences = text.split(/(?<=[.!?؟۔。！？])\s+/);

  const segments = [];
  let currentSegment = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    // If adding this sentence would exceed max, save current and start new
    if (currentSegment.length + trimmedSentence.length + 1 > maxChunkSize && currentSegment.length >= minChunkSize) {
      segments.push(currentSegment.trim());
      currentSegment = trimmedSentence;
    } else {
      currentSegment = currentSegment ? `${currentSegment} ${trimmedSentence}` : trimmedSentence;
    }
  }

  // Don't forget the last segment
  if (currentSegment.trim().length >= minChunkSize) {
    segments.push(currentSegment.trim());
  }

  return segments;
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

  const languageHint = language === 'fa' ? 'Persian/Farsi' :
                       language === 'ar' ? 'Arabic' : 'English';

  const systemPrompt = `You are an expert in semantic text analysis for ${languageHint} religious and classical texts. Your task is to identify where to split this text into paragraphs based on CONCEPTUAL BOUNDARIES.

## CORE PRINCIPLE
A paragraph is a set of sentences that support ONE main idea or concept. Split when the concept shifts.

## HOW TO FIND PARAGRAPH BOUNDARIES
1. Read the text to identify distinct ideas, themes, or topics
2. Find where the author transitions from one concept to another
3. A new paragraph begins when:
   - The subject or topic shifts
   - A new argument or point is introduced
   - The author moves from one idea to the next
   - A rhetorical transition occurs ("And He said...", "Then...", "Know that...")
   - An address to a different audience begins

## ABSOLUTELY NEVER
- Split in the middle of a sentence
- Split in the middle of a word
- Create paragraphs that cut off ideas mid-thought
- Worry about paragraph SIZE - let conceptual coherence drive the splits

## PRESERVE AS COMPLETE UNITS
- Full sentences always stay together
- Complete invocations and prayers
- Poetic verses and couplets
- Quranic/scriptural quotations with their context
- Lists of divine attributes or qualities

## RESPONSE FORMAT
For each paragraph break you identify:
- endMarker: The EXACT last 5-10 words that end one paragraph (copy exactly from text)
- startMarker: The EXACT first 5-10 words that begin the next paragraph (copy exactly from text)

Split by MEANING, not by size. Some paragraphs may be long if they develop one extended idea.`;

  const userPrompt = `Analyze this ${languageHint} text and identify natural paragraph boundaries where the concept or topic shifts.

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
    // Force remote API for segmentation (OpenAI GPT-4 for best quality)
    const response = await aiService('quality', { forceRemote: true }).chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.2, // Low temperature for consistent results
      max_tokens: 1000,
      caller: 'segmenter'
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
    // NEVER fall back to fake processing - fail clearly so the issue can be fixed
    logger.error({ err: err.message }, 'AI segmentation FAILED - not falling back to hard split');
    throw new Error(`AI segmentation failed: ${err.message}. Source file needs manual review.`);
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

  // For punctuated text, use fast sentence-based splitting (no AI needed)
  if (hasPunctuation(normalized)) {
    logger.info({ language: detectedLanguage, textLength: normalized.length }, 'Using sentence-based segmentation (punctuated text)');
    const segments = splitAtSentenceBoundaries(normalized, maxChunkSize, minChunkSize);
    if (segments.length > 0) {
      return segments;
    }
    logger.warn('Sentence-based segmentation produced no segments, falling back to AI');
  }

  // Use AI semantic segmentation for unpunctuated text
  logger.info({ language: detectedLanguage, textLength: normalized.length }, 'Using AI semantic segmentation (unpunctuated text)');

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
    // NEVER fall back to hard split - that produces garbage paragraphs
    // Fail clearly so the source file can be reviewed
    logger.error({ err: err.message, textLength: normalized.length }, 'AI segmentation FAILED');
    throw err;
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
      // Oversized segment - use AI to find conceptual breaks
      // If AI fails, throw error - never produce garbage paragraphs
      const aiResult = await getAIBreakPositions(segment, { language, maxChunkSize });
      if (aiResult.breakPositions.length > 0) {
        const subSegments = splitAtPositions(segment, aiResult.breakPositions);
        // Recursively apply (in case AI chunks are still too big)
        const processed = await applyMaxChunkSize(subSegments, maxChunkSize, minChunkSize, language);
        result.push(...processed);
      } else {
        // No break points found but segment is too large
        // This means the segment is a single large conceptual unit - keep it as-is
        // Better to have one large meaningful paragraph than multiple garbage splits
        logger.warn({ segmentLength: segment.length }, 'AI found no break points for oversized segment - keeping as single unit');
        result.push(segment);
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

/**
 * Add sentence markers to text
 *
 * Uses AI for Arabic/Persian texts, punctuation rules for Latin scripts.
 * Returns text with ⁅s1⁆...⁅/s1⁆ markers identifying sentence boundaries.
 *
 * @param {string} text - Input paragraph text
 * @param {object} options - Options
 * @returns {Promise<{text: string, sentenceCount: number}>}
 */
export async function addSentenceMarkers(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { text: '', sentenceCount: 0 };
  }

  const features = detectLanguageFeatures(text);
  const language = options.language || features.language;

  // Skip if already has markers
  if (text.includes('\u2045')) {
    logger.debug('Text already has markers, skipping');
    return { text, sentenceCount: (text.match(/⁅s\d+⁆/g) || []).length };
  }

  let boundaries; // Array of {start, end} positions in original text

  if (features.isRTL) {
    // Use AI for Arabic/Persian - punctuation rules don't apply
    boundaries = await getAISentenceBoundaries(text, language);
  } else {
    // Use punctuation rules for Latin scripts
    boundaries = getPunctuationBoundaries(text);
  }

  if (!boundaries || boundaries.length === 0) {
    // No sentences found - treat entire text as one sentence
    const marked = wrapSentence(text, 1);
    return { text: marked, sentenceCount: 1 };
  }

  // Insert markers INTO the original text at boundary positions
  // CRITICAL: Snap all positions to word boundaries first
  // Work backwards to preserve positions
  let markedText = text;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    let { start, end } = boundaries[i];

    // Snap end to word boundary - go forward to end of current word
    while (end < text.length && !/\s/.test(text[end])) {
      end++;
    }

    // Snap start to word boundary - skip leading whitespace
    while (start < end && /\s/.test(text[start])) {
      start++;
    }

    const id = i + 1;
    // Insert closing marker at end
    markedText = markedText.slice(0, end) + `⁅/s${id}⁆` + markedText.slice(end);
    // Insert opening marker at start
    markedText = markedText.slice(0, start) + `⁅s${id}⁆` + markedText.slice(start);
  }

  // STRICT validation - marked text must strip to EXACTLY the original
  const verification = verifyMarkedText(text, markedText);
  if (!verification.valid) {
    logger.error({
      error: verification.error
    }, 'CRITICAL: Marking altered text - this should never happen');
    // Fall back to single sentence wrapping original
    const fallback = wrapSentence(text, 1);
    return { text: fallback, sentenceCount: 1 };
  }

  return {
    text: markedText,
    sentenceCount: boundaries.length
  };
}

/**
 * Get sentence boundaries using AI for RTL text
 *
 * APPROACH: AI returns sentence TEXT, algorithm finds exact positions
 * This is more reliable because:
 * - AI is good at semantic understanding (where sentences end)
 * - String matching is deterministic and exact
 * - We can validate that sentences are found in order and cover the text
 *
 * @param {string} text - Input text
 * @param {string} language - Language code (ar, fa)
 * @returns {Promise<Array<{start: number, end: number}>>} Boundary positions
 */
async function getAISentenceBoundaries(text, language) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  const systemPrompt = `You are an expert in ${languageHint} text analysis. Your task is to identify sentences in classical/religious texts.

## WHAT IS A SENTENCE
A sentence is a complete thought or statement. In Arabic/Persian texts without punctuation, look for:
- Complete grammatical clauses
- Natural pause points in recitation
- Shifts in subject or topic within a verse
- End of an invocation or blessing

## CRITICAL: COPY TEXT EXACTLY
You must return the EXACT text of each sentence, character-for-character, including:
- All spaces exactly as they appear
- All punctuation exactly as it appears
- No trimming, no modifications, no "cleanup"

## WHAT TO PRESERVE AS SINGLE UNITS
- Divine names and attributes (الله, الرحمن الرحيم, etc.)
- Blessing formulas (صلى الله عليه وسلم, etc.)
- Complete invocations (بسم الله الرحمن الرحيم)

## RESPONSE FORMAT
Return a JSON array of sentences IN ORDER:
{"sentences": ["exact sentence 1", "exact sentence 2", ...]}

The sentences must:
- Be in the same order they appear in the text
- Together cover ALL the text (no missing parts)
- Be copied EXACTLY from the input`;

  const userPrompt = `Split this ${languageHint} text into sentences.

TEXT:
${text}

Return JSON with exact sentence text copied from above:
{"sentences": ["sentence 1", "sentence 2", ...]}

CRITICAL: Copy each sentence EXACTLY as it appears. Do not modify, trim, or "clean up" the text.`;

  try {
    const response = await aiService('quality', { forceRemote: true }).chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 4000,
      caller: 'segmenter'
    });

    const content = response.content || response;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const result = JSON.parse(jsonMatch[0]);
    const sentences = result.sentences || [];

    if (sentences.length === 0) {
      throw new Error('No sentences returned');
    }

    // Find each sentence in the original text sequentially
    const boundaries = findSentencesInText(text, sentences);

    if (!boundaries) {
      throw new Error('Could not locate sentences in original text');
    }

    return boundaries;
  } catch (err) {
    logger.error({ err: err.message }, 'AI sentence detection failed');
    // Return null to trigger fallback
    return null;
  }
}

/**
 * Find exact positions of sentences in original text
 * Uses sequential matching to locate each sentence
 *
 * @param {string} text - Original text
 * @param {string[]} sentences - Sentences to find (in order)
 * @returns {Array<{start: number, end: number}>|null} Boundaries or null if failed
 */
function findSentencesInText(text, sentences) {
  const boundaries = [];
  let searchStart = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // Try exact match first
    let pos = text.indexOf(sentence, searchStart);

    if (pos === -1) {
      // Try with normalized whitespace (AI might have changed spacing)
      const normalizedSentence = sentence.replace(/\s+/g, ' ').trim();

      // Search remaining text with normalized comparison
      const remainingText = text.slice(searchStart);
      pos = findNormalizedMatch(remainingText, normalizedSentence);

      if (pos !== -1) {
        pos += searchStart; // Adjust for offset
      }
    }

    if (pos === -1) {
      logger.warn({
        sentenceIndex: i,
        sentence: sentence.slice(0, 50) + '...',
        searchStart
      }, 'Could not find sentence in text');
      return null;
    }

    // Handle gap between previous sentence and this one (whitespace)
    if (pos > searchStart) {
      const gap = text.slice(searchStart, pos);
      if (gap.trim().length > 0) {
        // There's non-whitespace content between sentences - this is a problem
        logger.warn({
          gap: gap.slice(0, 50),
          sentenceIndex: i
        }, 'Non-whitespace gap between sentences');
        // But continue anyway - better to have partial coverage than none
      }
    }

    // Find the actual end by looking for the sentence content
    const sentenceEnd = pos + findActualLength(text, pos, sentence);

    boundaries.push({
      start: pos,
      end: sentenceEnd
    });

    searchStart = sentenceEnd;
  }

  // Validate we covered most of the text
  const lastEnd = boundaries[boundaries.length - 1].end;
  const remainingContent = text.slice(lastEnd).trim();

  if (remainingContent.length > 0) {
    logger.warn({
      remaining: remainingContent.slice(0, 100),
      remainingLength: remainingContent.length
    }, 'Text after last sentence');
    // Extend last boundary to cover remaining text
    boundaries[boundaries.length - 1].end = text.length;
  }

  // Adjust first boundary to start at 0 if there's only whitespace before
  if (boundaries[0].start > 0) {
    const before = text.slice(0, boundaries[0].start);
    if (before.trim().length === 0) {
      boundaries[0].start = 0;
    }
  }

  return boundaries;
}

/**
 * Find a sentence in text using normalized whitespace comparison
 *
 * @param {string} text - Text to search in
 * @param {string} normalizedSentence - Sentence with normalized whitespace
 * @returns {number} Position or -1 if not found
 */
function findNormalizedMatch(text, normalizedSentence) {
  // Create a regex that matches the words with flexible whitespace
  const words = normalizedSentence.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return -1;

  // Escape special regex characters in words
  const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Build pattern: words separated by flexible whitespace
  const pattern = escapedWords.join('\\s+');

  try {
    const regex = new RegExp(pattern);
    const match = text.match(regex);
    return match ? match.index : -1;
  } catch (err) {
    // Regex failed - fall back to word-by-word search
    logger.debug({ err: err.message }, 'Regex match failed, trying word search');
    return -1;
  }
}

/**
 * Find the actual length of a sentence match in text
 * Handles cases where AI whitespace differs from original
 *
 * @param {string} text - Original text
 * @param {number} start - Start position
 * @param {string} sentence - Sentence to match
 * @returns {number} Length of match in original text
 */
function findActualLength(text, start, sentence) {
  // Get the words from the sentence
  const words = sentence.trim().split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return sentence.length;

  // Find each word sequentially
  let pos = start;
  let lastWordEnd = start;

  for (const word of words) {
    // Skip whitespace
    while (pos < text.length && /\s/.test(text[pos])) pos++;

    // Find this word
    const wordStart = text.indexOf(word, pos);
    if (wordStart === -1 || wordStart > pos + 10) {
      // Word not found at expected position - use sentence length
      return sentence.length;
    }

    lastWordEnd = wordStart + word.length;
    pos = lastWordEnd;
  }

  return lastWordEnd - start;
}

/**
 * Get sentence boundaries using punctuation for Latin scripts
 * Returns positions in the ORIGINAL text - never modifies content
 *
 * @param {string} text - Input text
 * @returns {Array<{start: number, end: number}>} Boundary positions
 */
function getPunctuationBoundaries(text) {
  const boundaries = [];
  const sentenceEnders = /[.!?]/g;

  let lastEnd = 0;
  let match;

  while ((match = sentenceEnders.exec(text)) !== null) {
    const punctPos = match.index;

    // Find the end of this sentence (after punctuation and any trailing space)
    let end = punctPos + 1;
    while (end < text.length && /\s/.test(text[end])) {
      end++;
    }

    // Only create boundary if there's content
    if (punctPos >= lastEnd) {
      boundaries.push({
        start: lastEnd,
        end: end
      });
      lastEnd = end;
    }
  }

  // Handle remaining text after last punctuation
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining.length > 0) {
      boundaries.push({
        start: lastEnd,
        end: text.length
      });
    }
  }

  // If no boundaries found but text exists, treat as single sentence
  if (boundaries.length === 0 && text.trim().length > 0) {
    boundaries.push({ start: 0, end: text.length });
  }

  return boundaries;
}

// ============================================================================
// BATCH SENTENCE DETECTION (Optimized - 1-2 API calls instead of 100+)
// ============================================================================

/**
 * Detect sentence boundaries for ALL paragraphs in minimal AI calls
 *
 * Uses "ending words" approach: AI returns just the last 3-5 words of each sentence,
 * we find those endings in the original text to determine exact positions.
 *
 * @param {Array<{id: string, text: string}>} paragraphs - All paragraphs to process
 * @param {string} language - Language code ('ar', 'fa', 'en', etc.)
 * @param {object} options - Options
 * @returns {Promise<Map<string, string[]>>} Map of paragraph ID → sentence ending phrases
 */
export async function detectAllSentenceBoundaries(paragraphs, language, options = {}) {
  const { maxCharsPerBatch = 15000 } = options;

  if (!paragraphs || paragraphs.length === 0) {
    return new Map();
  }

  const features = detectLanguageFeatures(paragraphs[0]?.text || '');
  const isRTL = language === 'ar' || language === 'fa' || features.isRTL;

  // For Latin scripts, use local punctuation detection (no AI needed)
  if (!isRTL) {
    return detectPunctuationBoundariesBatch(paragraphs);
  }

  // Batch paragraphs by character count to stay within token limits
  const results = new Map();
  const batches = [];
  let currentBatch = [];
  let currentChars = 0;

  for (const para of paragraphs) {
    const paraChars = para.text?.length || 0;

    // If adding this paragraph exceeds limit, start new batch
    if (currentBatch.length > 0 && currentChars + paraChars > maxCharsPerBatch) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }

    currentBatch.push(para);
    currentChars += paraChars;
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  logger.info({
    totalParagraphs: paragraphs.length,
    batches: batches.length,
    language
  }, 'Batch sentence detection starting');

  // Process batches (can be parallelized if needed)
  for (const batch of batches) {
    const batchResults = await detectSentenceEndingsForBatch(batch, language);

    for (const [id, endings] of batchResults) {
      results.set(id, endings);
    }
  }

  logger.info({
    processedParagraphs: results.size
  }, 'Batch sentence detection complete');

  return results;
}

/**
 * Detect sentence endings for a batch of paragraphs in ONE AI call
 *
 * @param {Array<{id: string, text: string}>} paragraphs - Batch of paragraphs
 * @param {string} language - Language code
 * @returns {Promise<Map<string, string[]>>} Map of paragraph ID → sentence ending phrases
 */
async function detectSentenceEndingsForBatch(paragraphs, language) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  // Build the prompt with all paragraphs
  const paraTexts = paragraphs.map((p, idx) =>
    `PARA_${p.id}:\n${p.text}`
  ).join('\n\n---\n\n');

  const systemPrompt = `You are an expert in classical ${languageHint} religious texts. These are UNPUNCTUATED 19th century texts - NO punctuation marks exist.

Find ALL sentences by MEANING. Return the LAST 3-4 WORDS of each sentence exactly as written.

Sentence boundaries in these texts:
- Complete invocations (بسم الله الرحمن الرحيم)
- Divine attributes (هو العزيز الحكيم)
- Address changes (يا أيها...)
- Topic/subject shifts
- Complete commands

Return JSON only.`;

  const userPrompt = `Find ALL sentence endings in these UNPUNCTUATED ${languageHint} paragraphs.

${paraTexts}

Return JSON with the EXACT last 3-4 words of each sentence:
{
  ${paragraphs.map(p => `"PARA_${p.id}": ["ending1", "ending2", ...]`).join(',\n  ')}
}`;

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiService('quality', { forceRemote: true }).chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.1 + (attempt - 1) * 0.1,  // Slightly increase temp on retries
        max_tokens: 8000,
        caller: 'segmenter'
      });

      const content = response.content || response;

      // Try to extract JSON from response - handle code blocks and various formats
      let jsonStr = null;

      // Try code block first
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Try bare JSON object
      if (!jsonStr) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }

      if (!jsonStr) {
        throw new Error('No JSON in AI response');
      }

      // Try to fix common JSON issues
      jsonStr = jsonStr
        .replace(/,\s*}/g, '}')  // Trailing commas
        .replace(/,\s*]/g, ']'); // Trailing commas in arrays

      const result = JSON.parse(jsonStr);
      const results = new Map();

      for (const para of paragraphs) {
        const key = `PARA_${para.id}`;
        let endings = result[key] || [];

        // Normalize endings - AI might return arrays of words instead of joined strings
        if (Array.isArray(endings)) {
          endings = endings.map(e => {
            if (Array.isArray(e)) {
              // Join word arrays into phrase
              return e.join(' ');
            }
            return String(e);
          }).filter(e => e && e.trim());
        }

        // Sanity check: cap endings at reasonable max based on paragraph length
        // ~1 sentence per 150 chars for classical Arabic (sentences are longer than modern text)
        const maxEndings = Math.max(3, Math.ceil(para.text.length / 150));
        if (endings.length > maxEndings) {
          logger.debug({
            paraId: para.id,
            returned: endings.length,
            capped: maxEndings
          }, 'Capping excessive endings');
          endings = endings.slice(0, maxEndings);
        }

        results.set(para.id, endings);
      }

      if (attempt > 1) {
        logger.info({ attempt, batchSize: paragraphs.length }, 'Batch sentence detection succeeded on retry');
      }

      return results;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        logger.warn({ err: err.message, attempt, maxRetries, batchSize: paragraphs.length }, 'Batch sentence detection failed, retrying...');
        // Brief delay before retry
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }

  // All retries exhausted - fall back to single sentence
  logger.error({ err: lastError?.message, batchSize: paragraphs.length }, 'Batch sentence detection failed after all retries');

  const fallback = new Map();
  for (const para of paragraphs) {
    // Use last 5 words as the single "ending"
    const words = para.text.trim().split(/\s+/);
    const ending = words.slice(-5).join(' ');
    fallback.set(para.id, [ending]);
  }
  return fallback;
}

/**
 * Detect punctuation-based boundaries for a batch (no AI needed)
 *
 * @param {Array<{id: string, text: string}>} paragraphs
 * @returns {Map<string, string[]>} Map of paragraph ID → sentence ending phrases
 */
function detectPunctuationBoundariesBatch(paragraphs) {
  const results = new Map();

  for (const para of paragraphs) {
    const endings = [];
    const sentenceEnders = /[.!?]/g;
    let match;

    while ((match = sentenceEnders.exec(para.text)) !== null) {
      // Get last 3-5 words before this punctuation
      const beforePunct = para.text.slice(0, match.index + 1);
      const words = beforePunct.trim().split(/\s+/);
      const ending = words.slice(-5).join(' ');
      endings.push(ending);
    }

    // If no punctuation, use last words of paragraph
    if (endings.length === 0 && para.text.trim()) {
      const words = para.text.trim().split(/\s+/);
      endings.push(words.slice(-5).join(' '));
    }

    results.set(para.id, endings);
  }

  return results;
}

/**
 * Normalize Arabic text for flexible matching
 * Removes diacritics (tashkeel), normalizes whitespace and some letter forms
 */
function normalizeArabic(text) {
  return text
    // Remove Arabic diacritical marks (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove combining hamza/madda marks
    .replace(/[\u0653\u0654\u0655]/g, '')
    // Normalize alef variations to basic alef
    .replace(/[\u0622\u0623\u0625\u0627]/g, '\u0627')
    // Normalize teh marbuta to heh
    .replace(/\u0629/g, '\u0647')
    // Normalize Arabic yeh variations
    .replace(/\u064A/g, '\u06CC')  // Arabic yeh → Farsi yeh (common in these texts)
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find ending phrase in text with flexible matching
 * Handles AI variations in spacing, diacritics, and minor word differences
 *
 * @param {string} text - Text to search in
 * @param {string} ending - Ending phrase to find
 * @param {number} searchStart - Position to start searching from
 * @returns {{pos: number, len: number}|null} Position and length of match, or null
 */
function findFlexibleMatch(text, ending, searchStart) {
  // Try exact match first
  let pos = text.indexOf(ending, searchStart);
  if (pos !== -1) return { pos, len: ending.length };

  // Try with normalized whitespace
  const normalizedEnding = ending.replace(/\s+/g, ' ').trim();
  const textSlice = text.slice(searchStart);

  pos = textSlice.indexOf(normalizedEnding);
  if (pos !== -1) return { pos: searchStart + pos, len: normalizedEnding.length };

  // Try Arabic normalization (remove diacritics, normalize whitespace)
  const normText = normalizeArabic(textSlice);
  const normEnding = normalizeArabic(normalizedEnding);

  pos = normText.indexOf(normEnding);
  if (pos !== -1) {
    // Convert normalized position back to original text position
    const origStart = normalizedPosToOriginal(textSlice, pos);
    const origEnd = normalizedPosToOriginal(textSlice, pos + normEnding.length);
    return { pos: searchStart + origStart, len: origEnd - origStart };
  }

  // Try matching just the last 2-3 words (AI might return slightly different phrase)
  const words = normalizedEnding.split(' ');
  if (words.length >= 2) {
    // Try last 3 words, then last 2
    for (let wordCount = Math.min(3, words.length); wordCount >= 2; wordCount--) {
      const partialEnding = words.slice(-wordCount).join(' ');
      const normPartial = normalizeArabic(partialEnding);

      pos = normText.indexOf(normPartial);
      if (pos !== -1) {
        const origStart = normalizedPosToOriginal(textSlice, pos);
        const origEnd = normalizedPosToOriginal(textSlice, pos + normPartial.length);
        return { pos: searchStart + origStart, len: origEnd - origStart };
      }
    }
  }

  // Try finding individual key words (at least 4 chars) near each other
  const keyWords = words.filter(w => w.length >= 4).slice(-3);
  if (keyWords.length >= 2) {
    const firstWord = normalizeArabic(keyWords[0]);
    let wordPos = normText.indexOf(firstWord);

    if (wordPos !== -1) {
      // Check if other words appear within 50 chars
      const searchWindow = normText.slice(wordPos, wordPos + 50);
      const foundAll = keyWords.slice(1).every(w =>
        searchWindow.includes(normalizeArabic(w))
      );

      if (foundAll) {
        // Find the last key word position for the end
        const lastWord = normalizeArabic(keyWords[keyWords.length - 1]);
        const lastWordPos = searchWindow.indexOf(lastWord);
        const normEndPos = wordPos + lastWordPos + lastWord.length;
        const origStart = normalizedPosToOriginal(textSlice, wordPos);
        const origEnd = normalizedPosToOriginal(textSlice, normEndPos);
        return { pos: searchStart + origStart, len: origEnd - origStart };
      }
    }
  }

  // Final fallback: find just the last 2 significant words
  const significantWords = words.filter(w => w.length >= 3);
  if (significantWords.length >= 2) {
    const lastTwo = significantWords.slice(-2);
    const searchPattern = lastTwo.map(w => normalizeArabic(w));

    // Find first word
    const firstWordPos = normText.indexOf(searchPattern[0]);
    if (firstWordPos !== -1) {
      // Check if second word is nearby (within 30 chars)
      const window = normText.slice(firstWordPos, firstWordPos + 30);
      if (window.includes(searchPattern[1])) {
        const secondPos = window.indexOf(searchPattern[1]);
        const normEndPos = firstWordPos + secondPos + searchPattern[1].length;
        const origStart = normalizedPosToOriginal(textSlice, firstWordPos);
        const origEnd = normalizedPosToOriginal(textSlice, normEndPos);
        return { pos: searchStart + origStart, len: origEnd - origStart };
      }
    }
  }

  // Ultimate fallback: try just the very last word if it's distinctive (5+ chars)
  const lastWord = words[words.length - 1];
  if (lastWord && lastWord.length >= 5) {
    const normLastWord = normalizeArabic(lastWord);
    pos = normText.indexOf(normLastWord);
    if (pos !== -1) {
      const origStart = normalizedPosToOriginal(textSlice, pos);
      const origEnd = normalizedPosToOriginal(textSlice, pos + normLastWord.length);
      return { pos: searchStart + origStart, len: origEnd - origStart };
    }
  }

  return null;
}

/**
 * Convert a position in normalized text back to original text position
 * Accounts for removed diacritics and collapsed whitespace
 */
function normalizedPosToOriginal(originalText, normPos) {
  let origPos = 0;
  let normCount = 0;
  let prevWasSpace = false;

  while (origPos < originalText.length && normCount < normPos) {
    const char = originalText[origPos];

    // Diacritics are removed in normalization - don't count them
    if (/[\u064B-\u065F\u0670]/.test(char)) {
      origPos++;
      continue;
    }

    // Whitespace is collapsed in normalization
    const isSpace = /\s/.test(char);
    if (isSpace) {
      if (!prevWasSpace) {
        // First space in a sequence counts as one
        normCount++;
      }
      prevWasSpace = true;
    } else {
      normCount++;
      prevWasSpace = false;
    }

    origPos++;
  }

  return origPos;
}

/**
 * Insert sentence markers into text using sentence ending phrases
 *
 * Finds each ending phrase in the text and inserts markers around the sentence.
 * CRITICAL: Markers are ONLY inserted at word boundaries (spaces) - never mid-word.
 *
 * @param {string} text - Original paragraph text
 * @param {string[]} endings - Sentence ending phrases (last 3-5 words of each)
 * @returns {{text: string, sentenceCount: number}}
 */
export function insertSentenceMarkersFromEndings(text, endings) {
  if (!text || !endings || endings.length === 0) {
    // No endings = single sentence
    const marked = wrapSentence(text, 1);
    return { text: marked, sentenceCount: 1 };
  }

  // Find positions of each ending in the text
  const boundaries = [];
  let searchStart = 0;

  for (const ending of endings) {
    if (!ending || !ending.trim()) continue;

    // Find this ending in the text using flexible matching
    const match = findFlexibleMatch(text, ending, searchStart);

    if (!match) {
      logger.debug({ ending: ending.slice(0, 30), searchStart }, 'Ending not found in text');
      continue;
    }

    const { pos, len } = match;
    let endPos = pos + len;

    // CRITICAL: Snap endPos to word boundary - go forward to end of current word
    // This ensures we never insert markers in the middle of a word
    while (endPos < text.length && !/\s/.test(text[endPos])) {
      endPos++;
    }

    // Sentence starts after previous boundary (or at text start)
    let startPos = boundaries.length > 0 ? boundaries[boundaries.length - 1].end : 0;

    // Skip leading whitespace for sentence start, but also ensure we're at word start
    while (startPos < endPos && /\s/.test(text[startPos])) {
      startPos++;
    }

    // Double-check: if startPos is mid-word, go back to word start
    if (startPos > 0 && !/\s/.test(text[startPos - 1]) && startPos < text.length && !/\s/.test(text[startPos])) {
      // We might be mid-word - this shouldn't happen but let's be safe
      while (startPos > 0 && !/\s/.test(text[startPos - 1])) {
        startPos--;
      }
    }

    boundaries.push({
      start: startPos,
      end: endPos
    });

    searchStart = endPos;
  }

  // Handle any remaining text after the last ending
  if (boundaries.length > 0) {
    const lastEnd = boundaries[boundaries.length - 1].end;
    const remaining = text.slice(lastEnd).trim();

    if (remaining.length > 0) {
      // Extend last boundary to end of text
      boundaries[boundaries.length - 1].end = text.length;
    }
  }

  // If first boundary doesn't start at 0, extend it
  if (boundaries.length > 0 && boundaries[0].start > 0) {
    const before = text.slice(0, boundaries[0].start).trim();
    if (before.length === 0) {
      // Just whitespace, extend to 0
      boundaries[0].start = 0;
    }
  }

  if (boundaries.length === 0) {
    // No boundaries found - treat as single sentence
    const marked = wrapSentence(text, 1);
    return { text: marked, sentenceCount: 1 };
  }

  // Insert markers working backwards to preserve positions
  let markedText = text;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const { start, end } = boundaries[i];
    const id = i + 1;
    // Insert closing marker at end
    markedText = markedText.slice(0, end) + `⁅/s${id}⁆` + markedText.slice(end);
    // Insert opening marker at start
    markedText = markedText.slice(0, start) + `⁅s${id}⁆` + markedText.slice(start);
  }

  // Verify text integrity
  const verification = verifyMarkedText(text, markedText);
  if (!verification.valid) {
    logger.error({ error: verification.error }, 'Batch marking altered text - falling back');
    const fallback = wrapSentence(text, 1);
    return { text: fallback, sentenceCount: 1 };
  }

  return {
    text: markedText,
    sentenceCount: boundaries.length
  };
}

/**
 * Process all paragraphs with batch sentence detection
 *
 * Convenience function that combines detectAllSentenceBoundaries + insertSentenceMarkersFromEndings
 *
 * @param {Array<{id: string, text: string}>} paragraphs - Paragraphs to process
 * @param {string} language - Language code
 * @returns {Promise<Array<{id: string, text: string, sentenceCount: number}>>}
 */
export async function batchAddSentenceMarkers(paragraphs, language) {
  // Get all sentence endings in 1-2 AI calls
  const endings = await detectAllSentenceBoundaries(paragraphs, language);

  // Insert markers locally (no AI calls)
  const results = [];

  for (const para of paragraphs) {
    // Skip if already has markers
    if (para.text.includes('\u2045')) {
      results.push({
        id: para.id,
        text: para.text,
        sentenceCount: (para.text.match(/⁅s\d+⁆/g) || []).length
      });
      continue;
    }

    const paraEndings = endings.get(para.id) || [];
    const marked = insertSentenceMarkersFromEndings(para.text, paraEndings);

    results.push({
      id: para.id,
      text: marked.text,
      sentenceCount: marked.sentenceCount
    });
  }

  return results;
}

/**
 * Segment an entire document into sentences, then group into paragraphs.
 *
 * For UNPUNCTUATED texts (classical Arabic/Farsi), this is the correct order:
 * 1. First detect ALL sentence boundaries (semantic units)
 * 2. Then group sentences into paragraphs (by topic)
 *
 * Uses a streaming approach for large documents:
 * - Process in chunks (~10-15k chars)
 * - Detect sentences in each chunk
 * - Peel off complete paragraphs (clear topic shifts)
 * - Carry incomplete final paragraph sentences to next chunk
 *
 * @param {string} text - Entire document text
 * @param {object} options - Options
 * @returns {Promise<{sentences: string[], paragraphs: Array<{text: string, sentences: string[], sentenceCount: number}>}>}
 */
export async function segmentUnpunctuatedDocument(text, options = {}) {
  const { language = 'ar', chunkSize = 10000 } = options;

  if (!text || !text.trim()) {
    return { sentences: [], paragraphs: [] };
  }

  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  logger.info({ textLength: text.length, language, chunkSize }, 'Segmenting unpunctuated document');

  // ============================================================================
  // STAGE 0: Structure & Noise Detection
  // - Identifies verse/header sections (preserve line breaks)
  // - Identifies non-content text (instructions, page numbers) → wrap in <!-- -->
  // - Joins prose lines for segmentation
  // ============================================================================
  const { cleanedText, hasStructure } = await stage0_detectStructure(text, languageHint);
  logger.info({ originalLen: text.length, cleanedLen: cleanedText.length, hasStructure }, 'Stage 0 complete');

  // Strip comments for segmentation (they're preserved in cleanedText for reference)
  const textForSegmentation = cleanedText.replace(/<!--.*?-->/g, '').replace(/\s+/g, ' ').trim();
  const processText = textForSegmentation;

  // ============================================================================
  // STAGES 1-3: Phrase → Sentence → Paragraph Pipeline
  // Stage 1: AI identifies phrase boundaries from numbered words
  // Stage 2: AI identifies which phrases END sentences
  // Stage 3: AI identifies which sentences BEGIN paragraphs
  // Chunk handling: Last incomplete paragraph is carried to next chunk
  // ============================================================================

  const allParagraphs = [];
  let carryoverText = ''; // Last incomplete paragraph from previous chunk
  let position = 0;
  const cleanText = processText; // Use cleaned text from Stage 0

  while (position < cleanText.length) {
    // Get chunk, breaking at whitespace
    let chunkEnd = Math.min(position + chunkSize, cleanText.length);
    if (chunkEnd < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', chunkEnd);
      if (lastSpace > position + chunkSize * 0.7) chunkEnd = lastSpace;
    }

    const rawChunk = cleanText.slice(position, chunkEnd);
    const chunk = carryoverText ? carryoverText + ' ' + rawChunk : rawChunk;
    const isLastChunk = chunkEnd >= cleanText.length;

    logger.info({ position, chunkEnd, chunkLen: chunk.length, carryover: carryoverText.length, isLastChunk }, 'Processing chunk');

    // STAGE 1: Mark phrases (every word gets inside a phrase marker)
    const phrases = await stage1_markPhrases(chunk, languageHint);
    logger.info({ phrasesFound: phrases.length, wordCount: chunk.split(/\s+/).length }, 'Stage 1 complete');

    // STAGE 2: Identify sentence ends (which phrases end complete sentences)
    const sentenceEndIds = await stage2_identifySentenceEnds(phrases, languageHint);
    logger.info({ sentenceEndsFound: sentenceEndIds.length }, 'Stage 2 complete');

    // Build sentences from phrases
    const sentences = buildSentencesFromPhrases(phrases, sentenceEndIds);
    logger.info({ sentencesBuilt: sentences.length }, 'Sentences built');

    // STAGE 3: Group sentences into paragraphs
    const paragraphStartIds = await stage3_identifyParagraphStarts(sentences, languageHint);
    logger.info({ paragraphStartsFound: paragraphStartIds.length }, 'Stage 3 complete');

    // Build paragraphs from sentences
    const paragraphs = buildParagraphsFromSentences(sentences, paragraphStartIds);
    logger.info({ paragraphsBuilt: paragraphs.length }, 'Paragraphs built');

    if (isLastChunk) {
      // Last chunk: add all paragraphs
      allParagraphs.push(...paragraphs);
      carryoverText = '';
    } else {
      // Not last chunk: keep last paragraph as carryover
      if (paragraphs.length > 1) {
        allParagraphs.push(...paragraphs.slice(0, -1));
      }
      // Strip tags from last paragraph and carry to next chunk
      const lastPara = paragraphs[paragraphs.length - 1];
      carryoverText = lastPara ? lastPara.text.replace(/⁅\/?[sp]\d+⁆/g, '') : '';
    }

    position = chunkEnd;
    while (position < cleanText.length && /\s/.test(cleanText[position])) position++;
  }

  // Extract all sentences from paragraphs for return value
  const allSentences = [];
  for (const para of allParagraphs) {
    if (para.sentences) allSentences.push(...para.sentences);
  }

  logger.info({ totalSentences: allSentences.length, totalParagraphs: allParagraphs.length }, 'Document segmentation complete');

  // Validate against text-for-segmentation (excludes noise that was commented out)
  const strictValidation = validateSegmentationStrict(textForSegmentation, allParagraphs);
  if (!strictValidation.valid) {
    logger.error({ errors: strictValidation.errors }, 'CRITICAL SEGMENTATION ERROR');
    throw new Error(`Segmentation validation failed: ${strictValidation.errors.join('; ')}`);
  }

  logger.info('✅ Segmentation validation passed');
  return { sentences: allSentences, paragraphs: allParagraphs };
}

// ============================================================================
// STAGE 0: Structure & Noise Detection
// Identifies verse/headers, non-content (instructions, page numbers), and prose
// ============================================================================
async function stage0_detectStructure(text, languageHint) {
  // Split into lines, preserving structure
  const lines = text.split('\n').map((line, i) => ({ id: i + 1, text: line.trim() })).filter(l => l.text);

  if (lines.length === 0) {
    return { cleanedText: '', hasStructure: false };
  }

  // For short texts, skip structure detection
  if (lines.length < 5 || text.length < 500) {
    return { cleanedText: text.replace(/\n+/g, ' '), hasStructure: false };
  }

  // Number lines for AI
  const numberedLines = lines.map(l => `${l.id}. ${l.text}`).join('\n');

  const prompt = `You are an expert in classical ${languageHint} manuscripts and OCR cleanup.

Below is OCR'd text with line numbers. Classify each line:

CONTENT TYPES:
- prose: Main content (scripture, teaching) - will be joined for segmentation
- verse: Headers, invocations, poetry - preserve line breaks
- noise: Editorial instructions (often Persian in Arabic texts), page numbers, footnotes - wrap in comments

Examples of NOISE to exclude:
- Persian instructions: "را تلاوت نمايد" (read this), "بگويد" (say), "ايمان باين واحد اورده"
- Page numbers: "۱۲۳", "صفحه ۴۵"
- Chapter markers that aren't content: "الواحد الاول" when just a label

Examples of VERSE to preserve breaks:
- Invocations: "بسم الله الرحمن الرحيم", "بسم الله الامنع الاقدس"
- Short headers: "الواحد الثاني" when starting a section
- Poetry with intentional line structure

LINES:
${numberedLines}

For each line, output: LINE_NUMBER:TYPE
Example:
1:verse
2:verse
3:prose
4:noise
5:prose`;

  try {
    const response = await aiService('quality', { forceRemote: true }).chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.1, maxTokens: 2000, caller: 'segmenter' });

    const content = response.choices?.[0]?.message?.content || response.content || '';

    // Parse classifications
    const classifications = new Map();
    for (const line of content.trim().split('\n')) {
      const match = line.match(/(\d+)\s*:\s*(\w+)/);
      if (match) {
        classifications.set(parseInt(match[1], 10), match[2].toLowerCase());
      }
    }

    // Build cleaned text (noise wrapped in comments, verse with line breaks)
    const resultParts = [];
    let noiseCount = 0;
    let inProse = false;

    for (const line of lines) {
      const type = classifications.get(line.id) || 'prose';

      if (type === 'noise') {
        // Wrap in HTML comment (preserved for validation, ignored in display)
        resultParts.push(` <!-- ${line.text} --> `);
        noiseCount++;
        inProse = false;
      } else if (type === 'verse') {
        // Preserve with markdown line break
        if (inProse && resultParts.length > 0) resultParts.push('\n');
        resultParts.push(line.text + '  \n'); // Two spaces + newline = MD line break
        inProse = false;
      } else {
        // Prose - join with space
        resultParts.push((inProse ? ' ' : '') + line.text);
        inProse = true;
      }
    }

    if (noiseCount > 0) {
      logger.info({ noiseLines: noiseCount }, 'Stage 0: Wrapped noise in comments');
    }

    const cleanedText = resultParts.join('').trim();
    const hasNoise = noiseCount > 0;
    const hasVerse = [...classifications.values()].some(t => t === 'verse');

    logger.debug({
      totalLines: lines.length,
      noise: [...classifications.values()].filter(t => t === 'noise').length,
      verse: [...classifications.values()].filter(t => t === 'verse').length,
      prose: [...classifications.values()].filter(t => t === 'prose').length
    }, 'Stage 0: Structure detected');

    return { cleanedText, hasStructure: hasNoise || hasVerse };
  } catch (err) {
    logger.warn({ err: err.message }, 'Stage 0 failed, using raw text');
    return { cleanedText: text.replace(/\n+/g, ' '), hasStructure: false };
  }
}

// ============================================================================
// STAGE 1: Identify phrase boundaries
// AI identifies which word numbers end phrases
// ============================================================================
async function stage1_markPhrases(text, languageHint) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  // Number words simply: "word₁ word₂ word₃" - subscript numbers don't disrupt reading
  const numberedText = words.map((w, i) => `${w}₍${i + 1}₎`).join(' ');

  const prompt = `You are an expert in classical ${languageHint} texts.

Below is text with word numbers in subscript: word₍N₎

Your task: List the word numbers that END each phrase.

A phrase is 3-8 words forming a grammatical/semantic unit.
Read naturally and identify where phrases end.

Return ONLY comma-separated numbers, nothing else.
Example: 5, 12, 18, 25, 33

TEXT:
${numberedText}`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 2000, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';

  // Parse word IDs from AI response
  const phraseEndIds = content.match(/\d+/g)?.map(n => parseInt(n, 10)) || [];

  // Validate and sort IDs
  const validIds = phraseEndIds
    .filter(id => id >= 1 && id <= words.length)
    .sort((a, b) => a - b);

  // Ensure last word is included
  if (validIds.length === 0 || validIds[validIds.length - 1] !== words.length) {
    validIds.push(words.length);
  }

  // Build phrases from word boundaries
  const phrases = [];
  let wordStart = 0;
  let phraseId = 1;

  for (const endIdx of validIds) {
    if (endIdx > wordStart) {
      const phraseWords = words.slice(wordStart, endIdx);
      phrases.push({ id: phraseId++, text: phraseWords.join(' ') });
      wordStart = endIdx;
    }
  }

  logger.debug({ phrases: phrases.length, words: words.length, aiEndIds: validIds.length }, 'Stage 1: Phrases marked');
  return phrases;
}

// ============================================================================
// STAGE 2: Identify which phrases END complete sentences
// ============================================================================
async function stage2_identifySentenceEnds(phrases, languageHint) {
  if (phrases.length === 0) return [];

  // Clean numbered list - no markers in the text
  const numberedList = phrases.map(p => `${p.id}. ${p.text}`).join('\n');

  const prompt = `You are an expert in classical ${languageHint} texts.

Below is a numbered list of phrases from an unpunctuated text.

Your task: List which phrase numbers END a complete sentence.

A complete sentence expresses a FINISHED thought:
✓ "الله قوي عزيز" - COMPLETE (God is Powerful, Mighty)
✗ "وهو على كل" - INCOMPLETE (needs شيء قدير)
✓ "صراط مستقيم" - COMPLETE (straight path)
✗ "على صراط" - INCOMPLETE (needs مستقيم)

DO NOT include phrases ending with: كل، من، الى، على، في، عن، الا، حتى، الذي، التي

PHRASES:
${numberedList}

Return ONLY comma-separated phrase numbers that END sentences.
Example: 3, 7, 12, 18, ${phrases.length}`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 1000, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';
  const endIds = content.match(/\d+/g)?.map(n => parseInt(n, 10)) || [];

  // Validate and ensure last phrase included
  const uniqueIds = [...new Set(endIds)]
    .filter(id => id >= 1 && id <= phrases.length)
    .sort((a, b) => a - b);

  if (uniqueIds.length === 0 || uniqueIds[uniqueIds.length - 1] !== phrases.length) {
    uniqueIds.push(phrases.length);
  }

  logger.debug({ sentenceEnds: uniqueIds.length }, 'Stage 2: Sentence ends identified');
  return uniqueIds;
}

function buildSentencesFromPhrases(phrases, sentenceEndIds) {
  if (phrases.length === 0) return [];

  const sentences = [];
  let sentenceId = 1;
  let startIdx = 0;

  for (const endId of sentenceEndIds) {
    // Find the phrase index for this ID
    const endIdx = phrases.findIndex(p => p.id === endId);
    if (endIdx >= startIdx) {
      const sentencePhrases = phrases.slice(startIdx, endIdx + 1);
      if (sentencePhrases.length > 0) {
        sentences.push({
          id: sentenceId++,
          text: sentencePhrases.map(p => p.text).join(' '),
          phrases: sentencePhrases.map(p => p.text)
        });
      }
      startIdx = endIdx + 1;
    }
  }

  return sentences;
}

// ============================================================================
// STAGE 3: Group sentences into paragraphs
// ============================================================================
async function stage3_identifyParagraphStarts(sentences, languageHint) {
  if (sentences.length === 0) return [1];

  // Clean numbered list of sentences
  const numberedList = sentences.map(s => `${s.id}. ${s.text}`).join('\n');

  const prompt = `You are an expert in classical ${languageHint} texts.

Below is a numbered list of sentences. Group them into paragraphs.

A paragraph is 2-5 related sentences. Break when:
- Topic shifts significantly
- New address begins (يا ايها، قل)
- New invocation (بسم الله، اللهم)

SENTENCES:
${numberedList}

Return ONLY comma-separated sentence numbers that START new paragraphs.
Example: 1, 5, 12, 18

Sentence 1 always starts the first paragraph.
With ${sentences.length} sentences, expect roughly ${Math.ceil(sentences.length / 4)} paragraphs.`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 500, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';
  const ids = content.match(/\d+/g)?.map(n => parseInt(n, 10)) || [];

  // Validate and ensure sentence 1 included
  const uniqueStarts = [...new Set(ids)]
    .filter(id => id >= 1 && id <= sentences.length)
    .sort((a, b) => a - b);

  if (!uniqueStarts.includes(1)) {
    uniqueStarts.unshift(1);
  }

  logger.debug({ paragraphStarts: uniqueStarts.length }, 'Stage 3: Paragraph starts identified');
  return uniqueStarts;
}

function buildParagraphsFromSentences(sentences, paragraphStartIds) {
  if (sentences.length === 0) return [];

  const paragraphs = [];
  let currentSentences = [];

  for (const sentence of sentences) {
    if (paragraphStartIds.includes(sentence.id) && currentSentences.length > 0) {
      paragraphs.push(buildParagraph(currentSentences));
      currentSentences = [];
    }
    currentSentences.push(sentence);
  }

  if (currentSentences.length > 0) {
    paragraphs.push(buildParagraph(currentSentences));
  }

  return paragraphs;
}

function buildParagraph(sentences) {
  // Add sentence markers ⁅sN⁆...⁅/sN⁆
  let sentenceNum = 1;
  const markedSentences = sentences.map(s => {
    const marked = `⁅s${sentenceNum}⁆${s.text}⁅/s${sentenceNum}⁆`;
    sentenceNum++;
    return marked;
  });

  return {
    text: markedSentences.join(' '),
    sentences: sentences.map(s => s.text),
    sentenceCount: sentences.length
  };
}

// Note: Legacy code removed - now using clean 3-stage pipeline above

/**
 * Validate that segmentation didn't break any words
 * Compares words in the segmented output to words in the original text
 * @param {string} originalText - Original source text
 * @param {string[]} sentences - Segmented sentences
 * @returns {{ valid: boolean, brokenWords: string[] }}
 */
function validateSegmentationIntegrity(originalText, sentences) {
  // Get all words from original text (normalize and split by whitespace)
  const originalWords = new Set(
    originalText.replace(/\s+/g, ' ').trim().split(' ')
      .map(w => normalizeArabic(w))
      .filter(w => w.length > 0)
  );

  // Get all words from segmented sentences (strip markers first)
  const brokenWords = [];
  for (const sentence of sentences) {
    // Strip sentence markers like ⁅s1⁆ and ⁅/s1⁆
    const cleanSentence = sentence.replace(/⁅\/?s\d+⁆/g, '').trim();
    const sentenceWords = cleanSentence.split(/\s+/).filter(w => w.length > 0);

    for (const word of sentenceWords) {
      const normalizedWord = normalizeArabic(word);
      // Skip if word is in original (it's valid)
      if (originalWords.has(normalizedWord)) continue;

      // Word not found in original - might be broken
      // Check if it's a fragment (part of a longer word in original)
      let isFragment = false;
      for (const origWord of originalWords) {
        if (origWord.includes(normalizedWord) && origWord !== normalizedWord) {
          isFragment = true;
          brokenWords.push({
            fragment: word,
            likelyFrom: origWord,
            sentence: sentence.substring(0, 60) + '...'
          });
          break;
        }
      }

      // If not a fragment of any word, might be a legitimate new word or variant
      // (don't flag these as they could be false positives from normalization differences)
    }
  }

  return {
    valid: brokenWords.length === 0,
    brokenWords
  };
}

/**
 * Split sentences into complete paragraphs and incomplete remainder
 * Uses discourse markers to find natural paragraph breaks, then keeps
 * the last partial paragraph as "incomplete" for carry-over to next chunk.
 */
async function splitCompleteParagraphs(sentences, language) {
  if (sentences.length <= 5) {
    // Not enough to determine paragraph breaks - carry all forward
    return { complete: [], incomplete: sentences };
  }

  // Use marker-based grouping (deterministic, fast) - NO sentence count limit
  const allParagraphs = groupSentencesByMarkers(sentences);

  if (allParagraphs.length <= 1) {
    // If we got a single paragraph or none, carry everything forward
    return { complete: [], incomplete: sentences };
  }

  // Keep all but the last paragraph as complete
  // The last paragraph might continue in the next chunk
  const complete = allParagraphs.slice(0, -1);
  const lastPara = allParagraphs[allParagraphs.length - 1];
  const incomplete = lastPara.sentences;

  return { complete, incomplete };
}

/**
 * Detect all sentences in a document, processing in chunks if needed
 */
async function detectDocumentSentences(text, language, maxCharsPerBatch) {
  const maxRetries = 3;

  // For manageable texts, process in one call
  if (text.length <= maxCharsPerBatch) {
    return await detectSentencesInChunk(text, language, maxRetries);
  }

  // For large texts, process in overlapping chunks to avoid breaking sentences
  const chunks = splitIntoChunks(text, maxCharsPerBatch, 200); // 200 char overlap
  const allSentences = [];
  let processedEnd = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkSentences = await detectSentencesInChunk(chunk.text, language, maxRetries);

    // For first chunk, take all sentences
    // For subsequent chunks, skip sentences that overlap with previous chunk
    for (const sentence of chunkSentences) {
      const globalStart = chunk.start + (chunk.text.indexOf(sentence) || 0);
      if (globalStart >= processedEnd) {
        allSentences.push(sentence);
        processedEnd = globalStart + sentence.length;
      }
    }
  }

  return allSentences;
}

/**
 * Split text into chunks with overlap to avoid breaking sentences
 */
function splitIntoChunks(text, maxSize, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxSize, text.length);

    // Try to find a good break point (whitespace) near the end
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + maxSize * 0.8) {
        end = lastSpace;
      }
    }

    chunks.push({
      text: text.slice(start, end),
      start: start,
      end: end
    });

    // Next chunk starts before the end for overlap
    start = end - overlap;
    if (start < 0) start = 0;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Detect sentences in a chunk, returning sentences and trailing text.
 *
 * CRITICAL: Trailing text after the last AI-detected sentence ending ALWAYS
 * gets carried forward to the next chunk. NEVER use trailing text unless
 * this is the FINAL chunk. No exceptions, no heuristics needed.
 *
 * @param {string} text - Chunk text (includes carryover from previous chunk)
 * @param {string} language - Language code
 * @param {number} maxRetries - Max AI retries
 * @param {boolean} isLastChunk - Whether this is the final chunk
 * @returns {Promise<{sentences: string[], trailingText: string}>}
 */
async function detectSentencesInChunkWithTrailing(text, language, maxRetries, isLastChunk) {
  // Call with returnTrailing=true to get both sentences AND any trailing text
  const result = await detectSentencesInChunk(text, language, maxRetries, !isLastChunk);

  if (isLastChunk) {
    // Last chunk: trailing text becomes final sentence (already handled inside)
    return { sentences: result.sentences, trailingText: '' };
  }

  // Not last chunk: trailing text MUST be carried forward
  return { sentences: result.sentences, trailingText: result.trailingText || '' };
}

/**
 * THREE-STAGE PIPELINE for unpunctuated text segmentation:
 * Stage 1: Detect PHRASES (small, natural units of 3-10 words) - assign IDs
 * Stage 2: AI returns phrase IDs that END complete sentences
 * Stage 3: AI returns sentence IDs that END complete paragraphs
 *
 * The AI only returns IDs - all grouping is done in code. This eliminates
 * text matching errors and simplifies the AI task.
 */

/**
 * Stage 1: Detect phrase boundaries and assign IDs
 * Returns text with phrase markers: ⁅p1⁆text⁅/p1⁆ ⁅p2⁆text⁅/p2⁆ ...
 */
async function detectAndMarkPhrases(text, language) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  const prompt = `You are an expert in classical ${languageHint} texts. This is UNPUNCTUATED text.

Find natural PHRASE boundaries. A phrase is 3-10 words that belong together as a unit of meaning.

Examples:
- "بسم الله الرحمن الرحيم" = one phrase (the basmala)
- "ان هذا كتاب قد نزل" = one phrase ("this book has been revealed")
- "على الارض المقدسة بين الحرمين" = two phrases ("upon the holy land" + "between the two sanctuaries")

Return the LAST 2-3 WORDS of each phrase, one per line. Nothing else.

TEXT:
${text}`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 4000, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';
  const endings = content.trim().split('\n').map(l => l.trim()).filter(l => l.length >= 3);

  // Split text into words for robust matching
  const words = text.split(/\s+/);
  const phrases = [];
  let wordStart = 0;
  let phraseId = 1;

  for (const ending of endings) {
    const endingWords = ending.split(/\s+/);
    if (endingWords.length === 0) continue;

    // Find where this ending appears in our word array
    let foundAt = -1;
    for (let i = wordStart; i <= words.length - endingWords.length; i++) {
      let match = true;
      for (let j = 0; j < endingWords.length; j++) {
        // Normalize for comparison (remove diacritics for matching)
        const w1 = words[i + j].replace(/[\u064B-\u0652\u0670]/g, '');
        const w2 = endingWords[j].replace(/[\u064B-\u0652\u0670]/g, '');
        if (w1 !== w2) {
          match = false;
          break;
        }
      }
      if (match) {
        foundAt = i;
        break;
      }
    }

    if (foundAt >= 0) {
      const phraseEndWord = foundAt + endingWords.length;
      const phraseWords = words.slice(wordStart, phraseEndWord);
      if (phraseWords.length > 0) {
        phrases.push({ id: phraseId++, text: phraseWords.join(' ') });
      }
      wordStart = phraseEndWord;
    }
  }

  // Capture remaining words
  if (wordStart < words.length) {
    const remaining = words.slice(wordStart).join(' ');
    if (remaining.trim()) phrases.push({ id: phraseId++, text: remaining });
  }

  logger.debug({ phraseCount: phrases.length, totalWords: words.length }, 'Stage 1: Phrases detected');
  return phrases;
}

/**
 * Stage 2: Given marked phrases, ask AI which phrase IDs end complete sentences
 */
async function getSentenceEndingPhraseIds(phrases, language) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  // Format phrases with IDs
  const markedText = phrases.map(p => `⁅p${p.id}⁆${p.text}⁅/p${p.id}⁆`).join(' ');

  const prompt = `You are an expert in classical ${languageHint} texts.

Below is text with PHRASE markers ⁅pN⁆...⁅/pN⁆. Each phrase has an ID number.

Your task: List the phrase IDs that mark the END of a complete sentence.

A complete sentence expresses a finished thought. If it leaves the reader asking "what?" or "who?" - it's incomplete, so don't include that phrase ID.

TEXT:
${markedText}

Output ONLY the phrase ID numbers that end complete sentences, one per line. Example:
3
7
12

Nothing else - just the numbers.`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 1000, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';

  // Parse IDs
  const sentenceEndIds = [];
  for (const line of content.trim().split('\n')) {
    const num = parseInt(line.trim());
    if (!isNaN(num) && num >= 1 && num <= phrases.length) {
      sentenceEndIds.push(num);
    }
  }

  // Sort and deduplicate
  const uniqueIds = [...new Set(sentenceEndIds)].sort((a, b) => a - b);
  logger.debug({ sentenceEndIds: uniqueIds }, 'Stage 2: Sentence endings identified');
  return uniqueIds;
}

/**
 * Stage 3: Given sentences, ask AI which sentence IDs end complete paragraphs
 */
async function getParagraphEndingSentenceIds(sentences, language) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  // Format sentences with IDs (truncated for readability)
  const markedText = sentences.map((s, i) =>
    `⁅s${i + 1}⁆${s.text.substring(0, 60)}...⁅/s${i + 1}⁆`
  ).join('\n');

  // Calculate target: every ~4-6 sentences should be a paragraph
  const targetParagraphSize = Math.max(3, Math.min(6, Math.floor(sentences.length / 10)));

  const prompt = `You are an expert in classical ${languageHint} religious texts.

Below are SENTENCES with markers ⁅sN⁆...⁅/sN⁆ (shown truncated).

Your task: Group sentences into READING PARAGRAPHS (3-6 sentences each).

A paragraph should end when there's a natural pause in the text:
- A thought is completed
- A point is made
- Before addressing something new

Create paragraphs roughly every ${targetParagraphSize} sentences. With ${sentences.length} sentences, aim for ${Math.ceil(sentences.length / targetParagraphSize)} paragraphs.

SENTENCES:
${markedText}

Output ONLY the sentence ID numbers that end paragraphs, one per line.
For ${sentences.length} sentences, give approximately ${Math.ceil(sentences.length / targetParagraphSize)} paragraph endings.

Nothing else - just the numbers.`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], { temperature: 0.1, maxTokens: 500, caller: 'segmenter' });

  const content = response.choices?.[0]?.message?.content || response.content || '';

  // Parse IDs
  const paragraphEndIds = [];
  for (const line of content.trim().split('\n')) {
    const num = parseInt(line.trim());
    if (!isNaN(num) && num >= 1 && num <= sentences.length) {
      paragraphEndIds.push(num);
    }
  }

  // Sort, deduplicate, ensure last sentence is included
  const uniqueIds = [...new Set(paragraphEndIds)].sort((a, b) => a - b);
  if (uniqueIds.length === 0 || uniqueIds[uniqueIds.length - 1] !== sentences.length) {
    uniqueIds.push(sentences.length);
  }

  logger.debug({ paragraphEndIds: uniqueIds }, 'Stage 3: Paragraph endings identified');
  return uniqueIds;
}

/**
 * Process a chunk using the three-stage ID-based pipeline
 */
async function processChunkWithPipeline(text, language) {
  // Stage 1: Detect and mark phrases
  const phrases = await detectAndMarkPhrases(text, language);
  if (phrases.length === 0) {
    return { sentences: [], paragraphs: [] };
  }

  // Stage 2: Get phrase IDs that end sentences
  const sentenceEndIds = await getSentenceEndingPhraseIds(phrases, language);
  if (sentenceEndIds.length === 0) {
    // Fallback: treat all phrases as one sentence
    const allText = phrases.map(p => p.text).join(' ');
    return {
      sentences: [{ id: 1, text: allText }],
      paragraphs: [{ text: allText, sentences: [allText], sentenceCount: 1 }]
    };
  }

  // Group phrases into sentences based on ending IDs
  const sentences = [];
  let sentenceStart = 0;
  for (const endId of sentenceEndIds) {
    const sentencePhrases = phrases.slice(sentenceStart, endId);
    const sentenceText = sentencePhrases.map(p => p.text).join(' ');
    sentences.push({ id: sentences.length + 1, text: sentenceText });
    sentenceStart = endId;
  }

  // Capture any trailing phrases not included in the last sentence
  if (sentenceStart < phrases.length) {
    const trailingPhrases = phrases.slice(sentenceStart);
    if (trailingPhrases.length > 0) {
      const trailingSentenceText = trailingPhrases.map(p => p.text).join(' ');
      sentences.push({ id: sentences.length + 1, text: trailingSentenceText });
    }
  }

  // Stage 3: Get sentence IDs that end paragraphs
  const paragraphEndIds = await getParagraphEndingSentenceIds(sentences, language);

  // Group sentences into paragraphs based on ending IDs
  // Add sentence markers ⁅sN⁆...⁅/sN⁆ to each sentence
  const paragraphs = [];
  let paraStart = 0;
  let globalSentenceNum = 1;  // Track sentence numbers across paragraphs

  for (const endId of paragraphEndIds) {
    const paraSentences = sentences.slice(paraStart, endId);

    // Add markers to each sentence and join
    // Reset sentence numbering within each paragraph for consistency
    let paraSentenceNum = 1;
    const markedSentences = paraSentences.map(s => {
      const marked = `⁅s${paraSentenceNum}⁆${s.text}⁅/s${paraSentenceNum}⁆`;
      paraSentenceNum++;
      globalSentenceNum++;
      return marked;
    });

    const paraText = markedSentences.join(' ');
    paragraphs.push({
      text: paraText,
      sentences: paraSentences.map(s => s.text),
      sentenceCount: paraSentences.length
    });
    paraStart = endId;
  }

  // Capture any trailing sentences not included in the last paragraph
  if (paraStart < sentences.length) {
    const trailingSentences = sentences.slice(paraStart);
    if (trailingSentences.length > 0) {
      let paraSentenceNum = 1;
      const markedSentences = trailingSentences.map(s => {
        const marked = `⁅s${paraSentenceNum}⁆${s.text}⁅/s${paraSentenceNum}⁆`;
        paraSentenceNum++;
        return marked;
      });
      const paraText = markedSentences.join(' ');
      paragraphs.push({
        text: paraText,
        sentences: trailingSentences.map(s => s.text),
        sentenceCount: trailingSentences.length
      });
    }
  }

  logger.info({
    phrases: phrases.length,
    sentences: sentences.length,
    paragraphs: paragraphs.length
  }, 'Pipeline segmentation complete');

  return { sentences: sentences.map(s => s.text), paragraphs };
}

/**
 * Detect sentences in a single chunk of text using ending words approach
 * Returns array of sentence texts extracted from the chunk
 *
 * @param {boolean} skipTrailing - If true, don't capture trailing text as a sentence
 */
async function detectSentencesInChunk(text, language, maxRetries, skipTrailing = false) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  const systemPrompt = `You are an expert in classical ${languageHint} religious texts. This is UNPUNCTUATED text from the 19th century.

Your task: Find where COMPLETE SENTENCES end.

A COMPLETE SENTENCE expresses a finished thought. If removing the last word would leave the meaning intact, you've gone too far. If the sentence leaves the reader asking "what?" or "about whom?" - it's incomplete.

Test each potential ending by asking: "Does this make sense on its own?"
- "فسبحان الله" ✓ (Glory be to God - complete praise)
- "فسبحان الله الذي" ✗ (Glory be to God who... - who WHAT? Incomplete!)
- "اتقوا الله يا اولي الالباب" ✓ (Fear God, O possessors of understanding - complete command)
- "واذا شاء الله يبين من" ✗ (And if God wills He clarifies from... - from WHAT? Incomplete!)

Sentence length: typically 50-150 characters. Divine names and blessings belong WITH their sentences, not separate.

Output: The LAST 3-5 WORDS of each complete sentence, one per line. Nothing else.`;

  // Build user prompt
  const makeUserPrompt = (attemptNum) => {
    const feedback = attemptNum > 1 ? `
IMPORTANT: Previous attempt had issues. Remember:
- Sentences should be 50-150 characters (8-25 words) on average
- If you're finding more than 1 ending per 60 characters, you're breaking too often
- Only break at COMPLETE THOUGHTS, not every phrase` : '';

    return `Identify COMPLETE SENTENCE endings in this UNPUNCTUATED ${languageHint} text.
${feedback}
TEXT:
${text}

Output ONLY the last 3-5 words of each COMPLETE sentence, one per line.`;
  };

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiService('quality', { forceRemote: true }).chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: makeUserPrompt(attempt) }
      ], {
        temperature: 0.1 + (attempt - 1) * 0.1,
        max_tokens: 16000,  // Increased for long documents with many sentences
        caller: 'segmenter'
      });

      // Handle various AI response formats
      let content = response;
      if (response && typeof response === 'object') {
        content = response.content || response.message?.content || response.text || JSON.stringify(response);
      }
      if (typeof content !== 'string') {
        content = String(content);
      }

      // Parse line-based TOON format - one ending per line
      // Remove any code blocks, numbered lists, explanatory text
      let cleanContent = content
        .replace(/```[\s\S]*?```/g, '')  // Remove code blocks
        .replace(/^\d+[.):]\s*/gm, '')    // Remove numbering like "1. " or "1) "
        .replace(/^[-*]\s*/gm, '')        // Remove bullet points
        .trim();

      // Extract endings - one per line, filter out empty or too-short lines
      // Also reject endings that end with prepositions, relative pronouns, or conjunctions requiring continuation
      // - Prepositions: بين، من، الى، على، في، عن، etc.
      // - Relative pronouns: الذي، التي، الذين، اللاتي، اللواتي (who/which - require relative clause)
      // - Conjunctions requiring continuation: كما، لان، اذ، كي، لكي (as, because, since, in order to)
      const INCOMPLETE_ENDING_PATTERN = /\s(بين|من|الى|إلى|على|في|عن|ب|ل|و|ف|ثم|ان|أن|لا|ما|الا|إلا|حتى|مع|عند|نحو|قبل|بعد|فوق|تحت|دون|غير|الذي|التي|الذين|اللاتي|اللواتي|كما|لان|لأن|لانه|لأنه|اذ|إذ|كي|لكي|بان|بأن)$/;

      const rawEndings = cleanContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Valid ending: 10+ chars, mostly Arabic/Persian characters, no explanation markers
          if (line.length < 10) return false;
          if (line.includes(':') || line.includes('Note') || line.includes('Example')) return false;
          // Check for Arabic/Persian characters (U+0600-U+06FF, U+0750-U+077F, U+FB50-U+FDFF)
          const arabicChars = (line.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF]/g) || []).length;
          return arabicChars > line.length * 0.5;  // At least 50% Arabic/Persian
        });

      // Validate: reject endings that end with prepositions/particles
      const rejectedEndings = rawEndings.filter(e => INCOMPLETE_ENDING_PATTERN.test(e));
      const endings = rawEndings.filter(e => !INCOMPLETE_ENDING_PATTERN.test(e));

      if (rejectedEndings.length > 0) {
        logger.warn({
          rejected: rejectedEndings.length,
          examples: rejectedEndings.slice(0, 3).map(e => e.slice(-30))
        }, 'Rejected endings that end with prepositions (incomplete sentences)');
      }

      logger.debug({
        responseLength: content?.length,
        rawEndingsFound: rawEndings.length,
        validEndingsAfterFilter: endings.length,
        sampleEndings: endings.slice(0, 5)
      }, 'Parsed and validated sentence endings');

      if (endings.length === 0) {
        throw new Error('No valid sentence endings found in response');
      }

      // Convert endings to actual sentences by finding them in the text
      // Pass skipTrailing - if true, trailing text returned separately (not as sentence)
      const { sentences, trailingText } = extractSentencesFromEndings(text, endings, skipTrailing);

      if (sentences.length > 0) {
        // Only MAX_SENTENCE_CHARS matters - for translation API limits on paragraphs
        // Sentence detection is purely AI-based on meaning, not length rules
        const SUSPICIOUS_SENTENCE_CHARS = 200;  // Above this, may have missed boundaries
        const MAX_SENTENCE_CHARS = 500;   // Practical limit for translation APIs

        // Check for very long sentences that might have missed boundaries
        // (This is for practical chunking, not semantic correctness)
        const suspicious = sentences.filter(s => s.length > SUSPICIOUS_SENTENCE_CHARS);

        if (suspicious.length > 0) {
          logger.info({
            suspiciousCount: suspicious.length,
            sizes: suspicious.map(s => s.length)
          }, 'Found suspicious-length sentences, verifying with AI');

          // Re-check each suspicious sentence with targeted AI verification
          // Pass MAX_SENTENCE_CHARS so oversized sentences get split at phrase boundaries
          const verifiedSentences = await verifySuspiciousSentences(
            sentences,
            SUSPICIOUS_SENTENCE_CHARS,
            languageHint,
            MAX_SENTENCE_CHARS
          );

          // After phrase-boundary splitting, sentences should all be under max
          // But verify and log if any still exceed (shouldn't happen)
          const stillOversized = verifiedSentences.filter(s => s.length > MAX_SENTENCE_CHARS);
          if (stillOversized.length > 0) {
            logger.warn({
              count: stillOversized.length,
              sizes: stillOversized.map(s => s.length)
            }, 'Sentences still exceed max after phrase-boundary splitting (edge case)');
          }

          return { sentences: verifiedSentences, trailingText };
        }

        return { sentences, trailingText };
      }

      throw new Error('No sentences extracted from endings');

    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        logger.warn({ err: err.message, attempt }, 'Sentence detection failed, retrying...');
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }

  logger.error({ err: lastError?.message, textLength: text.length }, 'Sentence detection FAILED after all retries');

  // CRITICAL: NO FALLBACK - we MUST NOT treat the entire chunk as one sentence
  // This causes massive paragraphs with no semantic structure
  // Fail loudly so the issue can be fixed upstream
  throw new Error(`Sentence detection failed after ${maxRetries} retries: ${lastError?.message}. Document needs manual review.`);
}

/**
 * Extract actual sentences from text using ending phrases
 * CRITICAL: All positions must snap to word boundaries to avoid breaking words
 * CRITICAL: Track actual original position to prevent overlapping extractions
 * CRITICAL: Each sentence starts where the previous one ended - no gaps allowed
 *
 * @param {string} text - Source text
 * @param {string[]} endings - AI-identified sentence endings
 * @param {boolean} skipTrailing - If true, don't capture remaining text as a sentence
 */
function extractSentencesFromEndings(text, endings, skipTrailing = false) {
  const sentences = [];
  let searchStart = 0;           // Position in NORMALIZED text for finding endings
  let lastOrigEnd = 0;           // Actual position in ORIGINAL text we've processed (prevents overlap)
  const normalizedText = normalizeArabic(text);

  for (const ending of endings) {
    if (!ending || typeof ending !== 'string') continue;

    const normalizedEnding = normalizeArabic(ending.trim());
    if (!normalizedEnding) continue;

    // Find ending in normalized text
    let pos = normalizedText.indexOf(normalizedEnding, searchStart);
    if (pos === -1) {
      // Try finding with partial match (last 2-3 words)
      const words = normalizedEnding.split(' ');
      if (words.length >= 2) {
        const partialEnding = words.slice(-2).join(' ');
        pos = normalizedText.indexOf(partialEnding, searchStart);
      }
    }

    if (pos !== -1) {
      // The sentence STARTS where the previous one ENDED (or at text start)
      // This ensures no gaps between sentences
      let origStart = lastOrigEnd;

      // Skip any leading whitespace
      while (origStart < text.length && /\s/.test(text[origStart])) {
        origStart++;
      }

      // Convert the ending position to original space and snap to word boundary
      let origEnd = normalizedPosToOriginal(text, pos + normalizedEnding.length);
      origEnd = snapToWordEnd(text, origEnd);

      // Only extract if we have a valid non-empty range
      if (origStart < origEnd) {
        // Extract sentence from original text
        const sentence = text.slice(origStart, origEnd).trim();
        if (sentence) {
          sentences.push(sentence);
          // Track the actual original position we've processed
          lastOrigEnd = origEnd;
          // Update searchStart in normalized space for finding next ending
          // Use the END position in normalized space to ensure we don't re-find the same ending
          searchStart = pos + normalizedEnding.length;
        }
      }
    }
  }

  // Handle any remaining text after last ending
  // Use lastOrigEnd to ensure no overlap with extracted sentences
  let trailingText = '';
  if (lastOrigEnd < text.length) {
    let remainingStart = lastOrigEnd;
    // Skip any whitespace
    while (remainingStart < text.length && /\s/.test(text[remainingStart])) {
      remainingStart++;
    }
    const remaining = text.slice(remainingStart).trim();

    if (remaining.length > 0) {
      if (skipTrailing) {
        // NOT the last chunk - trailing text MUST be carried forward
        trailingText = remaining;
      } else {
        // Last chunk - capture trailing as final sentence
        sentences.push(remaining);
      }
    }
  }

  // Post-processing: merge sentences that end with incomplete words
  const mergedSentences = [];
  const INCOMPLETE_WORDS = /\s(بين|من|الى|إلى|على|في|عن|ب|ل|و|ف|ثم|ان|أن|لا|ما|الا|إلا|حتى|مع|عند|نحو|قبل|بعد|فوق|تحت|دون|غير|الذي|التي|الذين|اللاتي|اللواتي|كما|لان|لأن|لانه|لأنه|اذ|إذ|كي|لكي|بان|بأن)$/;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if (mergedSentences.length > 0 && INCOMPLETE_WORDS.test(mergedSentences[mergedSentences.length - 1])) {
      // Previous sentence ends with incomplete word - merge current sentence into it
      mergedSentences[mergedSentences.length - 1] += ' ' + sentence;
    } else {
      mergedSentences.push(sentence);
    }
  }

  return { sentences: mergedSentences, trailingText };
}

/**
 * Snap a position to the start of the current word
 * Moves backwards to find the previous space or text start
 * @param {string} text - Original text
 * @param {number} pos - Position that might be mid-word
 * @returns {number} - Position at word start
 */
function snapToWordStart(text, pos) {
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;

  // If we're already at a space or just after one, we're at a word start
  if (/\s/.test(text[pos]) || (pos > 0 && /\s/.test(text[pos - 1]))) {
    // Skip any leading whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
      pos++;
    }
    return pos;
  }

  // We're mid-word - go back to find the word start
  let wordStart = pos;
  while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) {
    wordStart--;
  }
  return wordStart;
}

/**
 * Snap a position to the end of the current word
 * Moves forward to find the next space or text end
 * @param {string} text - Original text
 * @param {number} pos - Position that might be mid-word
 * @returns {number} - Position at word end (after the last character of the word)
 */
function snapToWordEnd(text, pos) {
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;

  // If we're at a space, we're already at word end - don't include the space
  if (/\s/.test(text[pos])) {
    return pos;
  }

  // We might be mid-word - go forward to find the word end
  let wordEnd = pos;
  while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
    wordEnd++;
  }
  return wordEnd;
}

/**
 * Split a sentence at phrase boundaries (not at arbitrary character limits)
 * Uses Arabic/Persian phrase markers: conjunctions, prepositions, and natural pause points
 *
 * @param {string} sentence - Sentence that needs splitting
 * @param {number} maxChars - Maximum characters per segment
 * @returns {string[]} - Array of sub-sentences split at phrase boundaries
 */
function splitAtPhraseBoundary(sentence, maxChars) {
  if (sentence.length <= maxChars) {
    return [sentence];
  }

  // Arabic/Persian phrase boundary patterns - places where we can naturally split
  // Priority order: stronger boundaries first
  const phraseBoundaries = [
    // Strong boundaries - conjunctions that start new clauses
    /\s+(و\s+ان|و\s+لکن|و\s+اما|فان|ثم\s+ان)\s+/g,  // "and that", "but", "as for", "then that"
    // Medium boundaries - common conjunctions
    /\s+(و|ف|ثم|أو|او|بل)\s+/g,  // "and", "so", "then", "or", "rather"
    // Weaker boundaries - prepositions that often start phrases
    /\s+(في|من|الى|على|عن|ب|ل|ک)\s+/g,  // "in", "from", "to", "on", "about", "with", "for", "like"
  ];

  const result = [];
  let remaining = sentence;

  while (remaining.length > maxChars) {
    let bestSplit = -1;
    let bestSplitAfterMatch = 0;

    // Find the best phrase boundary within the acceptable range
    // Look in the last 40% of the maxChars range (between 60% and 100%)
    const searchStart = Math.floor(maxChars * 0.4);
    const searchEnd = maxChars;
    const searchWindow = remaining.slice(searchStart, searchEnd);

    // Try each boundary pattern in priority order
    for (const pattern of phraseBoundaries) {
      pattern.lastIndex = 0;  // Reset regex
      let match;
      let lastMatchInWindow = null;

      // Find the last match within the search window
      while ((match = pattern.exec(searchWindow)) !== null) {
        lastMatchInWindow = {
          index: searchStart + match.index,
          fullMatch: match[0],
          conjunctionLength: match[1] ? match[1].length : 0
        };
      }

      if (lastMatchInWindow && lastMatchInWindow.index > bestSplit) {
        // Split BEFORE the conjunction (keep it with the next part)
        bestSplit = lastMatchInWindow.index;
        bestSplitAfterMatch = 0;  // Don't skip the conjunction
        break;  // Use first (highest priority) boundary type found
      }
    }

    // If no phrase boundary found, fall back to word boundary
    if (bestSplit <= 0) {
      // Find last space before maxChars
      const lastSpace = remaining.lastIndexOf(' ', maxChars);
      if (lastSpace > maxChars * 0.3) {
        bestSplit = lastSpace;
        bestSplitAfterMatch = 1;  // Skip the space
      } else {
        // No good split point - find first space after maxChars
        const nextSpace = remaining.indexOf(' ', maxChars);
        if (nextSpace > 0 && nextSpace < maxChars * 1.3) {
          bestSplit = nextSpace;
          bestSplitAfterMatch = 1;
        } else {
          // Absolutely no spaces - take the whole thing (shouldn't happen with Arabic text)
          logger.warn({ length: remaining.length }, 'No phrase or word boundary found for splitting');
          result.push(remaining.trim());
          remaining = '';
          break;
        }
      }
    }

    // Extract the segment
    const segment = remaining.slice(0, bestSplit).trim();
    if (segment) {
      result.push(segment);
    }

    remaining = remaining.slice(bestSplit + bestSplitAfterMatch).trim();
  }

  // Don't forget the last segment
  if (remaining.trim()) {
    result.push(remaining.trim());
  }

  logger.debug({
    originalLength: sentence.length,
    segments: result.length,
    segmentSizes: result.map(s => s.length)
  }, 'Split sentence at phrase boundaries');

  return result;
}

/**
 * Verify suspicious-length sentences by asking AI to re-check for missed boundaries
 * This is a targeted verification - only checks sentences that exceed the suspicious threshold
 * If sentences still exceed MAX after AI verification, force-split at phrase boundaries
 *
 * @param {string[]} sentences - All sentences
 * @param {number} suspiciousThreshold - Sentences longer than this get verified
 * @param {string} languageHint - Language hint for AI
 * @param {number} maxChars - Maximum allowed sentence length (default 500)
 * @returns {Promise<string[]>} - Sentences with suspicious ones potentially split
 */
async function verifySuspiciousSentences(sentences, suspiciousThreshold, languageHint = 'Arabic', maxChars = 500) {
  const result = [];

  for (const sentence of sentences) {
    if (sentence.length <= suspiciousThreshold) {
      result.push(sentence);
      continue;
    }

    // This sentence is suspiciously long - ask AI to verify
    logger.debug({
      sentenceLength: sentence.length,
      preview: sentence.substring(0, 60)
    }, 'Verifying suspicious sentence for missed boundaries');

    try {
      const subSentences = await checkSentenceForMissedBoundaries(sentence, languageHint);

      if (subSentences.length > 1) {
        logger.info({
          originalLength: sentence.length,
          splitInto: subSentences.length,
          newSizes: subSentences.map(s => s.length)
        }, 'AI found missed boundaries in suspicious sentence');

        // Check if any sub-sentences still exceed max - if so, split at phrase boundaries
        for (const subSentence of subSentences) {
          if (subSentence.length > maxChars) {
            const phraseSplit = splitAtPhraseBoundary(subSentence, maxChars);
            result.push(...phraseSplit);
          } else {
            result.push(subSentence);
          }
        }
      } else {
        // AI confirmed it's actually one sentence - but if still over max, force split
        if (sentence.length > maxChars) {
          logger.info({
            length: sentence.length,
            maxChars
          }, 'AI confirmed single sentence but exceeds max - splitting at phrase boundaries');
          const phraseSplit = splitAtPhraseBoundary(sentence, maxChars);
          result.push(...phraseSplit);
        } else {
          result.push(sentence);
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to verify suspicious sentence');
      // If verification failed and sentence exceeds max, still split at phrase boundaries
      if (sentence.length > maxChars) {
        const phraseSplit = splitAtPhraseBoundary(sentence, maxChars);
        result.push(...phraseSplit);
      } else {
        result.push(sentence);
      }
    }
  }

  return result;
}

/**
 * Ask AI to check if a single long sentence has missed boundaries
 * Returns array of sub-sentences if boundaries found, otherwise original
 */
async function checkSentenceForMissedBoundaries(sentence, languageHint = 'Arabic') {
  const prompt = `You are analyzing a classical ${languageHint} religious text sentence that seems unusually long.
Classical ${languageHint} sentences are typically 50-150 characters. This one is ${sentence.length} characters.

TEXT TO ANALYZE:
${sentence}

TASK: Does this text contain MULTIPLE complete sentences that should be separated?
Look for:
- Topic or subject changes
- Verb completions followed by new clauses
- Natural rhetorical pauses
- Lists with distinct items

RESPONSE FORMAT (TOON - one item per line):
If this is ONE sentence: Reply with just the word "SINGLE"
If you find MULTIPLE sentences: Output each sentence ending (last 3-5 words) on its own line

CRITICAL: Only split if you're confident. Classical religious texts sometimes have legitimately long sentences.`;

  const response = await aiService('quality', { forceRemote: true }).chat([
    { role: 'user', content: prompt }
  ], {
    temperature: 0.1,
    max_tokens: 2000,
    caller: 'segmenter'
  });

  // Handle response
  let content = response;
  if (response && typeof response === 'object') {
    content = response.content || response.message?.content || response.text || '';
  }
  content = String(content).trim();

  // Check if AI says it's a single sentence
  if (content.toUpperCase().includes('SINGLE') || content.length < 20) {
    return [sentence];
  }

  // Parse endings from response
  const endings = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (line.length < 5 || line.length > 100) return false;
      if (line.toUpperCase().includes('SINGLE')) return false;
      // Check for Arabic characters
      const arabicChars = (line.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF]/g) || []).length;
      return arabicChars > line.length * 0.3;
    });

  if (endings.length < 2) {
    return [sentence];
  }

  // Extract sub-sentences using the endings (no skipTrailing needed for single sentence)
  const { sentences: subSentences } = extractSentencesFromEndings(sentence, endings, false);

  // Validate we got reasonable splits
  if (subSentences.length > 1 && subSentences.every(s => s.length > 10)) {
    return subSentences;
  }

  return [sentence];
}

/**
 * Build paragraph text with sentence markers
 * Each sentence is wrapped with ⁅s1⁆...⁅/s1⁆ etc.
 */
function buildMarkedParagraphText(sentences) {
  return sentences.map((s, i) => wrapSentence(s, i + 1)).join(' ');
}

/**
 * Arabic/Farsi discourse markers that indicate paragraph breaks
 * These patterns often start new sections in classical religious texts
 */
const PARAGRAPH_BREAK_PATTERNS = [
  /^بسم\s+الله/,           // "In the name of God"
  /^الحمد\s+لله/,           // "Praise be to God"
  /^اللهم/,                 // "O God" (invocation)
  /^يا\s+ايها/,             // "O you" (address)
  /^قل\s/,                  // "Say" (command)
  /^ان\s+اعلموا/,           // "Know that"
  /^الباب\s/,               // "The chapter/gate"
  /^واما\s/,                // "As for"
  /^فاما\s/,                // "As for"
  /^ثم\s+ان/,               // "Then indeed"
];

/**
 * Check if a sentence starts a new paragraph based on discourse markers
 */
function startsNewParagraph(sentence) {
  const normalized = sentence.trim();
  return PARAGRAPH_BREAK_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Group sentences into paragraphs using discourse markers ONLY
 *
 * CRITICAL: NEVER break paragraphs based on sentence count. The AI has already
 * identified sentences semantically. Paragraph boundaries MUST come from:
 * 1. Discourse markers (invocations, addresses, topic shifts)
 * 2. AI-detected semantic boundaries
 *
 * Breaking at arbitrary sentence counts (5, 10, etc.) destroys meaning -
 * sentences like "فلتجمعن بين" (ending with preposition) show mid-phrase cuts.
 */
function groupSentencesByMarkers(sentences) {
  const paragraphs = [];
  let currentPara = [];

  for (const sentence of sentences) {
    // Start new paragraph only when discourse marker detected
    if (currentPara.length > 0 && startsNewParagraph(sentence)) {
      paragraphs.push({
        text: buildMarkedParagraphText(currentPara),
        sentences: currentPara,
        sentenceCount: currentPara.length
      });
      currentPara = [];
    }

    currentPara.push(sentence);
  }

  // Don't forget the last paragraph
  if (currentPara.length > 0) {
    paragraphs.push({
      text: buildMarkedParagraphText(currentPara),
      sentences: currentPara,
      sentenceCount: currentPara.length
    });
  }

  return paragraphs;
}

async function groupSentencesIntoParagraphs(sentences, language) {
  if (sentences.length === 0) {
    return [];
  }

  // Use AI to determine paragraph breaks
  // Show truncated sentences with IDs and ask AI which ones end paragraphs
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  // Format sentences with IDs (truncated for context)
  const markedText = sentences.map((s, i) =>
    `[${i + 1}] ${s.substring(0, 50)}...`
  ).join('\n');

  const prompt = `You are an expert in classical ${languageHint} religious texts.

Below are sentences (shown truncated) from a document.

Your task: Identify which sentences END a paragraph.

Guidelines for paragraph breaks in religious texts:
- A paragraph is typically 2-5 sentences
- Break at natural thought completions
- Break before new addresses (يا ايها, اللهم)
- Break before new topics or instructions
- Break before invocations (بسم الله)

With ${sentences.length} sentences, aim for roughly ${Math.ceil(sentences.length / 4)} paragraphs.

SENTENCES:
${markedText}

Output ONLY the sentence numbers that END paragraphs, one per line.
Example: If sentences 4, 8, and 12 each end a paragraph, output:
4
8
12

Nothing else - just the numbers.`;

  try {
    const response = await aiService('quality', { forceRemote: true }).chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.1, maxTokens: 1000, caller: 'segmenter' });

    const content = response.choices?.[0]?.message?.content || response.content || '';

    // Parse paragraph ending IDs
    const paragraphEndIds = [];
    for (const line of content.trim().split('\n')) {
      const num = parseInt(line.trim());
      if (!isNaN(num) && num >= 1 && num <= sentences.length) {
        paragraphEndIds.push(num);
      }
    }

    // Sort and ensure last sentence is included
    const uniqueIds = [...new Set(paragraphEndIds)].sort((a, b) => a - b);
    if (uniqueIds.length === 0 || uniqueIds[uniqueIds.length - 1] !== sentences.length) {
      uniqueIds.push(sentences.length);
    }

    // Group sentences into paragraphs based on ending IDs
    const paragraphs = [];
    let sentenceStart = 0;

    for (const endId of uniqueIds) {
      const paraSentences = sentences.slice(sentenceStart, endId);
      if (paraSentences.length > 0) {
        paragraphs.push({
          text: buildMarkedParagraphText(paraSentences),
          sentences: paraSentences,
          sentenceCount: paraSentences.length
        });
      }
      sentenceStart = endId;
    }

    logger.debug({
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      avgPerPara: paragraphs.length > 0 ? (sentences.length / paragraphs.length).toFixed(1) : 0
    }, 'Grouped sentences using AI guidance');

    return paragraphs;

  } catch (err) {
    // Fallback to marker-based grouping
    logger.warn({ err: err.message }, 'AI paragraph grouping failed, using marker-based fallback');
    const paragraphs = groupSentencesByMarkers(sentences);
    logger.debug({
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      avgPerPara: paragraphs.length > 0 ? (sentences.length / paragraphs.length).toFixed(1) : 0
    }, 'Grouped sentences using discourse markers');
    return paragraphs;
  }
}


/**
 * STRICT validation: Ensure segmented output matches original text EXACTLY
 *
 * Validates that:
 * 1. All words from original appear in output (no deletions)
 * 2. No words appear more than once (no duplications)
 * 3. Word order is preserved
 *
 * @param {string} originalText - The original unsegmented text
 * @param {Array<{text: string}>} paragraphs - Segmented paragraphs with markers
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSegmentationStrict(originalText, paragraphs) {
  const errors = [];

  // Normalize original text: collapse whitespace, trim
  const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
  const originalWords = normalizedOriginal.split(' ').filter(w => w.length > 0);

  // Extract all words from segmented paragraphs (strip markers first)
  const segmentedWords = [];
  for (const para of paragraphs) {
    // Strip sentence markers: ⁅sN⁆ and ⁅/sN⁆
    const strippedText = para.text.replace(/⁅\/?s\d+⁆/g, '').replace(/\s+/g, ' ').trim();
    const words = strippedText.split(' ').filter(w => w.length > 0);
    segmentedWords.push(...words);
  }

  // Check 1: Word count must match
  if (originalWords.length !== segmentedWords.length) {
    errors.push(`Word count mismatch: original has ${originalWords.length} words, segmented has ${segmentedWords.length} words`);

    // Find which words are duplicated or missing
    const originalCounts = new Map();
    for (const w of originalWords) {
      originalCounts.set(w, (originalCounts.get(w) || 0) + 1);
    }

    const segmentedCounts = new Map();
    for (const w of segmentedWords) {
      segmentedCounts.set(w, (segmentedCounts.get(w) || 0) + 1);
    }

    // Find duplications (words appearing more in segmented than original)
    const duplications = [];
    for (const [word, count] of segmentedCounts) {
      const originalCount = originalCounts.get(word) || 0;
      if (count > originalCount) {
        duplications.push({ word, extra: count - originalCount });
      }
    }
    if (duplications.length > 0) {
      const examples = duplications.slice(0, 5).map(d => `"${d.word}" (+${d.extra})`).join(', ');
      errors.push(`Duplicated words: ${examples}${duplications.length > 5 ? ` and ${duplications.length - 5} more` : ''}`);
    }

    // Find deletions (words appearing less in segmented than original)
    const deletions = [];
    for (const [word, count] of originalCounts) {
      const segmentedCount = segmentedCounts.get(word) || 0;
      if (segmentedCount < count) {
        deletions.push({ word, missing: count - segmentedCount });
      }
    }
    if (deletions.length > 0) {
      const examples = deletions.slice(0, 5).map(d => `"${d.word}" (-${d.missing})`).join(', ');
      errors.push(`Missing words: ${examples}${deletions.length > 5 ? ` and ${deletions.length - 5} more` : ''}`);
    }
  }

  // Check 2: Words must be in the same order
  if (errors.length === 0) {
    // Only check order if counts match
    for (let i = 0; i < originalWords.length; i++) {
      if (originalWords[i] !== segmentedWords[i]) {
        errors.push(`Word order mismatch at position ${i}: expected "${originalWords[i]}", got "${segmentedWords[i]}"`);
        // Show context
        const start = Math.max(0, i - 2);
        const end = Math.min(originalWords.length, i + 3);
        errors.push(`  Original context: ...${originalWords.slice(start, end).join(' ')}...`);
        errors.push(`  Segmented context: ...${segmentedWords.slice(start, end).join(' ')}...`);
        break; // Only report first mismatch
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
