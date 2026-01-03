/**
 * Sentence & Phrase Marker Utilities
 *
 * Uses Unicode square brackets ⁅ (U+2045) and ⁆ (U+2046) to mark segments.
 * These are rare enough to not conflict with actual text content.
 *
 * Marker format:
 * - Sentence: ⁅s1⁆...⁅/s1⁆
 * - Phrase: ⁅p1⁆...⁅/p1⁆
 *
 * Nesting is supported:
 * ⁅s1⁆⁅p1⁆In the name of God,⁅/p1⁆ ⁅p2⁆the Most Gracious.⁅/p2⁆⁅/s1⁆
 */

// Marker bracket characters
export const MARK_START = '\u2045'; // ⁅
export const MARK_END = '\u2046';   // ⁆

// Regex patterns
const MARKER_PATTERN = /⁅(\/?[sp])(\d+)⁆/g;
const STRIP_PATTERN = /⁅\/?[sp]\d+⁆/g;

/**
 * Create a marker tag
 * @param {'s'|'p'} type - 's' for sentence, 'p' for phrase
 * @param {number} id - Marker ID
 * @param {boolean} closing - Whether this is a closing tag
 * @returns {string} The marker string
 */
export function createMarker(type, id, closing = false) {
  return `${MARK_START}${closing ? '/' : ''}${type}${id}${MARK_END}`;
}

/**
 * Wrap text in sentence markers
 * @param {string} text - Text to wrap
 * @param {number} id - Sentence ID
 * @returns {string} Text wrapped in markers
 */
export function wrapSentence(text, id) {
  return `${createMarker('s', id)}${text}${createMarker('s', id, true)}`;
}

/**
 * Wrap text in phrase markers
 * @param {string} text - Text to wrap
 * @param {number} id - Phrase ID
 * @returns {string} Text wrapped in markers
 */
export function wrapPhrase(text, id) {
  return `${createMarker('p', id)}${text}${createMarker('p', id, true)}`;
}

/**
 * Add sentence markers to text given segment boundaries
 *
 * @param {string} text - Original text
 * @param {Array<{start: number, end: number}>} segments - Segment boundaries (character positions)
 * @returns {string} Text with markers inserted
 */
export function addMarkers(text, segments) {
  if (!text || !segments || segments.length === 0) {
    return text;
  }

  // Sort segments by start position descending so we can insert from end to start
  // This preserves position accuracy as we insert markers
  const sorted = [...segments].sort((a, b) => b.start - a.start);

  let result = text;

  for (let i = sorted.length - 1; i >= 0; i--) {
    const seg = sorted[i];
    const id = segments.indexOf(seg) + 1; // 1-indexed

    // Insert closing marker at end position
    result = result.slice(0, seg.end) + createMarker('s', id, true) + result.slice(seg.end);
    // Insert opening marker at start position
    result = result.slice(0, seg.start) + createMarker('s', id) + result.slice(seg.start);
  }

  return result;
}

/**
 * Strip all markers from text for plain display
 * @param {string} text - Text with markers
 * @returns {string} Clean text without markers
 */
export function stripMarkers(text) {
  if (!text) return text;
  return text.replace(STRIP_PATTERN, '');
}

/**
 * Check if text contains any markers
 * @param {string} text - Text to check
 * @returns {boolean} True if markers present
 */
export function hasMarkers(text) {
  if (!text) return false;
  return STRIP_PATTERN.test(text);
}

/**
 * Parse markers from text into structured segments
 *
 * @param {string} text - Text with markers
 * @returns {Array<{id: number, type: 's'|'p', text: string, start: number, end: number}>}
 */
export function parseMarkers(text) {
  if (!text) return [];

  const segments = [];
  const stack = []; // Track open markers

  // Reset regex
  MARKER_PATTERN.lastIndex = 0;

  let match;
  let plainTextOffset = 0; // Track position in clean text
  let lastMatchEnd = 0;

  while ((match = MARKER_PATTERN.exec(text)) !== null) {
    const [fullMatch, typeWithSlash, idStr] = match;
    const isClosing = typeWithSlash.startsWith('/');
    const type = isClosing ? typeWithSlash.slice(1) : typeWithSlash;
    const id = parseInt(idStr, 10);

    // Update plain text offset with text between markers
    plainTextOffset += stripMarkers(text.slice(lastMatchEnd, match.index)).length;
    lastMatchEnd = match.index + fullMatch.length;

    if (isClosing) {
      // Find matching open marker
      const openIdx = stack.findIndex(s => s.type === type && s.id === id);
      if (openIdx !== -1) {
        const open = stack.splice(openIdx, 1)[0];
        const innerText = stripMarkers(text.slice(open.rawEnd, match.index));

        segments.push({
          id,
          type,
          text: innerText,
          start: open.start,
          end: plainTextOffset
        });
      }
    } else {
      // Opening marker
      stack.push({
        type,
        id,
        start: plainTextOffset,
        rawEnd: match.index + fullMatch.length
      });
    }
  }

  // Sort by ID for consistent ordering
  return segments.sort((a, b) => {
    if (a.type !== b.type) return a.type === 's' ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Extract a specific segment by ID
 *
 * @param {string} text - Text with markers
 * @param {'s'|'p'} type - Segment type
 * @param {number} id - Segment ID
 * @returns {string|null} Segment text or null if not found
 */
export function getSegment(text, type, id) {
  const segments = parseMarkers(text);
  const segment = segments.find(s => s.type === type && s.id === id);
  return segment ? segment.text : null;
}

/**
 * Get all sentences from marked text
 * @param {string} text - Text with markers
 * @returns {Array<{id: number, text: string}>}
 */
export function getSentences(text) {
  return parseMarkers(text)
    .filter(s => s.type === 's')
    .map(s => ({ id: s.id, text: s.text }));
}

/**
 * Get all phrases from marked text
 * @param {string} text - Text with markers
 * @returns {Array<{id: number, text: string}>}
 */
export function getPhrases(text) {
  return parseMarkers(text)
    .filter(s => s.type === 'p')
    .map(s => ({ id: s.id, text: s.text }));
}

/**
 * Count sentences in marked text
 * @param {string} text - Text with markers
 * @returns {number}
 */
export function countSentences(text) {
  if (!text) return 0;
  // Count opening sentence markers
  const matches = text.match(/⁅s\d+⁆/g);
  return matches ? matches.length : 0;
}

/**
 * Count phrases in marked text
 * @param {string} text - Text with markers
 * @returns {number}
 */
export function countPhrases(text) {
  if (!text) return 0;
  const matches = text.match(/⁅p\d+⁆/g);
  return matches ? matches.length : 0;
}

/**
 * Validate marker integrity (all markers properly closed)
 * @param {string} text - Text with markers
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateMarkers(text) {
  if (!text) return { valid: true, errors: [] };

  const errors = [];
  const openMarkers = new Map(); // type+id -> count

  MARKER_PATTERN.lastIndex = 0;
  let match;

  while ((match = MARKER_PATTERN.exec(text)) !== null) {
    const [, typeWithSlash, idStr] = match;
    const isClosing = typeWithSlash.startsWith('/');
    const type = isClosing ? typeWithSlash.slice(1) : typeWithSlash;
    const key = `${type}${idStr}`;

    if (isClosing) {
      const count = openMarkers.get(key) || 0;
      if (count <= 0) {
        errors.push(`Closing marker ${type}${idStr} without matching open`);
      } else {
        openMarkers.set(key, count - 1);
      }
    } else {
      openMarkers.set(key, (openMarkers.get(key) || 0) + 1);
    }
  }

  // Check for unclosed markers
  for (const [key, count] of openMarkers) {
    if (count > 0) {
      errors.push(`Unclosed marker ${key} (${count} instances)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Verify that marked text preserves original content exactly
 * STRICT validation - no character differences allowed
 *
 * @param {string} original - Original text before marking
 * @param {string} marked - Text with markers added
 * @returns {{valid: boolean, error: string|null}}
 */
export function verifyMarkedText(original, marked) {
  if (!original || !marked) {
    return { valid: false, error: 'Missing original or marked text' };
  }

  const stripped = stripMarkers(marked);

  // Exact character-by-character comparison
  if (original !== stripped) {
    // Find first difference for debugging
    let diffPos = 0;
    while (diffPos < original.length && diffPos < stripped.length &&
           original[diffPos] === stripped[diffPos]) {
      diffPos++;
    }

    const context = 20;
    const originalAround = original.substring(Math.max(0, diffPos - context), diffPos + context);
    const strippedAround = stripped.substring(Math.max(0, diffPos - context), diffPos + context);

    return {
      valid: false,
      error: `Text mismatch at position ${diffPos}. ` +
             `Original[${original.length}]: "...${originalAround}..." vs ` +
             `Stripped[${stripped.length}]: "...${strippedAround}..."`
    };
  }

  return { valid: true, error: null };
}

/**
 * Build translation segments object from marked text
 * Used when creating translation_segments field
 *
 * @param {string} markedText - Text with markers
 * @returns {{sentences: Object, phrases: Object}}
 */
export function buildSegmentMap(markedText) {
  const parsed = parseMarkers(markedText);

  const sentences = {};
  const phrases = {};

  for (const seg of parsed) {
    const target = seg.type === 's' ? sentences : phrases;
    target[`${seg.type}${seg.id}`] = {
      original: seg.text,
      text: null, // Translation to be filled
      start: seg.start,
      end: seg.end
    };
  }

  return { sentences, phrases };
}
