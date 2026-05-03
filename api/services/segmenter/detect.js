// Language + structure detection for the segmenter pipeline.
// Pure functions, no I/O, no AI.
//
// Exports:
//   detectLanguageFeatures(text) — { isRTL, language, textLength }
//   hasPunctuation(text)         — true if text contains sentence-ending punct
//   getSegmentationStatus(body, meta) — pre-flight: does this need AI segmentation?
//   detectVerseMarkers(text)     — find Arabic verse-end markers + numeric verse refs

import { isAiSegmentedLanguage } from '../../lib/constants/languages.js';

const verseMarkersRe = /[\u06DD\u06DE]|[۱۲۳۴۵۶۷۸۹۰\d]+\s*[.:\u061B]/g;

export function detectLanguageFeatures(text) {
  if (!text || typeof text !== 'string') {
    return { isRTL: false, language: 'en', textLength: 0 };
  }

  // Count characters by script type to determine MAJORITY language
  // Hebrew Unicode range: \u0590-\u05FF (includes vowel marks, cantillation)
  const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
  // Arabic Unicode ranges: \u0600-\u06FF, \u0750-\u077F, \uFB50-\uFDFF, \uFE70-\uFEFF
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  // Latin characters (basic + extended)
  const latinChars = (text.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  // Farsi-specific characters: پ چ ژ گ ی
  const farsiChars = (text.match(/[\u067E\u0686\u0698\u06AF\u06CC]/g) || []).length;

  const totalAlpha = hebrewChars + arabicChars + latinChars;
  if (totalAlpha === 0) {
    return { isRTL: false, language: 'en', textLength: text.length };
  }

  const rtlChars = hebrewChars + arabicChars;
  const rtlRatio = rtlChars / totalAlpha;
  const isRTL = rtlRatio > 0.5;

  let language = 'en';
  if (isRTL) {
    if (hebrewChars > arabicChars) {
      language = 'he';
    } else {
      // Among Arabic-script, check for Farsi-specific chars (پ چ ژ گ ی)
      const farsiRatio = arabicChars > 0 ? farsiChars / arabicChars : 0;
      language = farsiRatio > 0.10 ? 'fa' : 'ar';
    }
  }

  return {
    isRTL,
    language,
    textLength: text.length,
    rtlRatio
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
 * Determine the segmentation status of a document's body text.
 *
 * Classical Arabic/Farsi manuscripts arrive as enormous blocks of unpunctuated
 * text — sometimes entire chapters with no structure at all. Some have artificial
 * page breaks from OCR/PDF extraction, but those don't represent real semantic
 * boundaries. These documents need AI segmentation before import.
 *
 * A document is considered "already segmented" only if it has our segmentation
 * markers (⁅s⁆/⁅p⁆ or ⁅ph⁆/⁅s⁆), which prove it has been through the pipeline.
 * Paragraph breaks alone don't count — they could be artificial page breaks.
 *
 * @param {string} body - Document body text (without frontmatter)
 * @param {object} [meta] - Optional metadata with language hint
 * @param {string} [meta.language] - Language code from frontmatter (e.g. 'ar', 'fa')
 * @returns {{ status: 'segmented'|'needs-segmentation'|'no-segmentation-needed', format?: string, language?: string, wordCount?: number, reason: string }}
 */
export function getSegmentationStatus(body, meta = {}) {
  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return { status: 'no-segmentation-needed', reason: 'Empty or missing body' };
  }

  // Check for our segmentation markers — the only reliable proof of segmentation.
  // Ingester markers (⁅s1⁆/⁅p1⁆) or three-pass markers (⁅ph⁆/⁅s⁆) mean the
  // document has been through the segmentation pipeline.
  if (hasMarkers(body)) {
    return { status: 'segmented', format: 'markers', reason: 'Has sentence/phrase markers (⁅s⁆/⁅p⁆ format)' };
  }
  if (/⁅ph⁆/.test(body) || /⁅s⁆/.test(body)) {
    return { status: 'segmented', format: 'three-pass', reason: 'Has three-pass segmentation markers (⁅ph⁆/⁅s⁆)' };
  }

  // Detect language
  const features = detectLanguageFeatures(body);
  const language = meta.language || features.language;

  // Only Arabic-script languages need AI segmentation — English and other
  // LTR languages come with punctuation and paragraph structure already present
  if (!isAiSegmentedLanguage(language)) {
    return { status: 'no-segmentation-needed', language, reason: `Language "${language}" uses standard punctuation` };
  }

  // It's an Arabic/Farsi/Hebrew/Urdu document without markers → needs segmentation.
  // Even if it has paragraph breaks, those are likely artificial page breaks from
  // OCR/PDF extraction, not real semantic boundaries. The three-pass segmentation
  // will strip these and re-segment properly.
  const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
  return {
    status: 'needs-segmentation',
    language,
    wordCount,
    reason: `Unsegmented ${language.toUpperCase()} text (${wordCount.toLocaleString()} words)`
  };
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
  const pattern = new RegExp(verseMarkersRe.source, 'g');

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
