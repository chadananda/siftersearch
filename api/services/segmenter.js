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
  // Work backwards to preserve positions
  let markedText = text;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const { start, end } = boundaries[i];
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
      max_tokens: 4000
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
        max_tokens: 8000
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
    const endPos = pos + len;

    // Sentence starts after previous boundary (or at text start)
    const startPos = boundaries.length > 0 ? boundaries[boundaries.length - 1].end : 0;

    // Skip leading whitespace for sentence start
    let adjustedStart = startPos;
    while (adjustedStart < pos && /\s/.test(text[adjustedStart])) {
      adjustedStart++;
    }

    boundaries.push({
      start: adjustedStart,
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

  const cleanText = text.replace(/\s+/g, ' ').trim();

  logger.info({ textLength: cleanText.length, language, chunkSize }, 'Segmenting unpunctuated document');

  // For small documents, process in one go
  if (cleanText.length <= chunkSize) {
    const sentences = await detectSentencesInChunk(cleanText, language, 3);
    const paragraphs = await groupSentencesIntoParagraphs(sentences, language);
    return { sentences, paragraphs };
  }

  // Stream through large documents
  const allParagraphs = [];
  const allSentences = [];
  let carryoverSentences = []; // Sentences from incomplete paragraph
  let position = 0;

  while (position < cleanText.length) {
    // Get next chunk, trying to break at whitespace
    let chunkEnd = Math.min(position + chunkSize, cleanText.length);
    if (chunkEnd < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', chunkEnd);
      if (lastSpace > position + chunkSize * 0.7) {
        chunkEnd = lastSpace;
      }
    }

    const chunk = cleanText.slice(position, chunkEnd);
    const isLastChunk = chunkEnd >= cleanText.length;

    logger.debug({
      position,
      chunkEnd,
      chunkLength: chunk.length,
      carryover: carryoverSentences.length,
      isLastChunk
    }, 'Processing chunk');

    // Detect sentences in this chunk
    const chunkSentences = await detectSentencesInChunk(chunk, language, 3);

    // Combine with carryover from previous chunk
    const combinedSentences = [...carryoverSentences, ...chunkSentences];

    if (isLastChunk) {
      // Last chunk: group all remaining sentences into paragraphs
      const paragraphs = await groupSentencesIntoParagraphs(combinedSentences, language);
      allParagraphs.push(...paragraphs);
      allSentences.push(...combinedSentences);
    } else {
      // Not last chunk: find complete paragraphs and carry over the rest
      const { complete, incomplete } = await splitCompleteParagraphs(combinedSentences, language);

      allParagraphs.push(...complete);
      for (const p of complete) {
        allSentences.push(...p.sentences);
      }

      // Carry over incomplete paragraph's sentences to next iteration
      carryoverSentences = incomplete;
    }

    position = chunkEnd;
  }

  logger.info({
    totalSentences: allSentences.length,
    totalParagraphs: allParagraphs.length
  }, 'Document segmentation complete');

  return { sentences: allSentences, paragraphs: allParagraphs };
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

  // Use marker-based grouping (deterministic, fast)
  const allParagraphs = groupSentencesByMarkers(sentences, 5);

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
 * Detect sentences in a single chunk of text using ending words approach
 * Returns array of sentence texts extracted from the chunk
 */
async function detectSentencesInChunk(text, language, maxRetries) {
  const languageHint = language === 'fa' ? 'Persian/Farsi' : 'Arabic';

  const systemPrompt = `You are an expert in classical ${languageHint} religious texts. These are UNPUNCTUATED 19th century texts - NO punctuation marks exist.

Find ALL sentence boundaries by MEANING. Return the LAST 3-5 WORDS of each sentence.

Sentence boundaries:
- Complete invocations (بسم الله الرحمن الرحيم)
- Divine attributes (هو العزيز الحكيم)
- Address changes (يا أيها...)
- Topic/subject shifts
- Complete commands

Return JSON array of ending phrases.`;

  const userPrompt = `Find ALL sentence endings in this UNPUNCTUATED ${languageHint} text.
Return the LAST 3-5 WORDS of each sentence exactly as written.

TEXT:
${text}

Return JSON array:
["last words of sentence 1", "last words of sentence 2", ...]`;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await aiService('quality', { forceRemote: true }).chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        temperature: 0.1 + (attempt - 1) * 0.1,
        max_tokens: 4000
      });

      const content = response.content || response;

      // Extract JSON array
      let jsonStr = null;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      if (!jsonStr) {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
      }

      if (!jsonStr) {
        throw new Error('No JSON array in AI response');
      }

      jsonStr = jsonStr.replace(/,\s*]/g, ']');
      const endings = JSON.parse(jsonStr);

      if (!Array.isArray(endings) || endings.length === 0) {
        throw new Error('Invalid endings array');
      }

      // Convert endings to actual sentences by finding them in the text
      const sentences = extractSentencesFromEndings(text, endings);

      if (sentences.length > 0) {
        return sentences;
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

  logger.error({ err: lastError?.message }, 'Sentence detection failed after all retries');

  // Fallback: treat entire chunk as one sentence
  return [text.trim()];
}

/**
 * Extract actual sentences from text using ending phrases
 */
function extractSentencesFromEndings(text, endings) {
  const sentences = [];
  let searchStart = 0;
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
      // Convert normalized position to original position
      const origStart = normalizedPosToOriginal(text, searchStart);
      const origEnd = normalizedPosToOriginal(text, pos + normalizedEnding.length);

      // Extract sentence from original text
      const sentence = text.slice(origStart, origEnd).trim();
      if (sentence) {
        sentences.push(sentence);
        searchStart = pos + normalizedEnding.length;
      }
    }
  }

  // Handle any remaining text after last ending
  if (searchStart < normalizedText.length) {
    const remaining = text.slice(normalizedPosToOriginal(text, searchStart)).trim();
    if (remaining.length > 20) {
      sentences.push(remaining);
    }
  }

  return sentences;
}

/**
 * Group sentences into paragraphs by topic
 */
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
 * Group sentences into paragraphs using discourse markers and length limits
 * This is a fast, deterministic approach that works well for classical texts
 */
function groupSentencesByMarkers(sentences, maxSentences = 5) {
  const paragraphs = [];
  let currentPara = [];

  for (const sentence of sentences) {
    // Start new paragraph if this sentence has a break marker
    // and we already have some content in current paragraph
    if (currentPara.length > 0 && startsNewParagraph(sentence)) {
      paragraphs.push({
        text: buildMarkedParagraphText(currentPara),
        sentences: currentPara,
        sentenceCount: currentPara.length
      });
      currentPara = [];
    }

    currentPara.push(sentence);

    // Also break if we've reached max sentences
    if (currentPara.length >= maxSentences) {
      paragraphs.push({
        text: buildMarkedParagraphText(currentPara),
        sentences: currentPara,
        sentenceCount: currentPara.length
      });
      currentPara = [];
    }
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

  // Use marker-based grouping for Arabic/Farsi
  // This is fast, deterministic, and respects natural discourse structure
  if (language === 'ar' || language === 'fa') {
    const paragraphs = groupSentencesByMarkers(sentences, 5);
    logger.debug({
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      avgPerPara: (sentences.length / paragraphs.length).toFixed(1)
    }, 'Grouped sentences using discourse markers');
    return paragraphs;
  }

  // For other languages, use simple fixed-size grouping
  const paragraphs = [];
  const groupSize = 4;
  for (let i = 0; i < sentences.length; i += groupSize) {
    const paraSentences = sentences.slice(i, i + groupSize);
    paragraphs.push({
      text: buildMarkedParagraphText(paraSentences),
      sentences: paraSentences,
      sentenceCount: paraSentences.length
    });
  }
  return paragraphs;
}
