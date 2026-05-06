// Search-result highlighting + sentence extraction. Pure functions; no DB,
// no Meili. Used by api/lib/search.js to enrich hits with `excerpt` and
// `highlightedText` fields.
//
// Exports:
//   extractMatchingSentences(hit, options)  — sentences containing matches
//   highlightBestSentence(hit, query)       — best single sentence with <mark>
//   enrichHitsWithExcerpts(hits, options)   — annotate hits in bulk
//
// Internal helpers (not exported): applyHighlighting, findSentenceStart,
// findSentenceEnd, extractSentenceAtPosition, isStopWord, escapeRegex,
// splitIntoSentences, calculateProximityScore, containsPhrase,
// findBestPhraseSpan, STOP_WORDS.

export function extractMatchingSentences(hit, options = {}) {
  const { contextSentences = 1, maxLength = 500 } = options;
  const text = hit.text || '';
  const matchesPosition = hit._matchesPosition?.text || [];

  if (!text || matchesPosition.length === 0) {
    // No matches - return truncated text at word boundary
    let truncated = text;
    if (text.length > maxLength) {
      truncated = text.slice(0, maxLength);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.6) {
        truncated = truncated.slice(0, lastSpace);
      }
    }
    return {
      sentences: [truncated],
      highlightedSentences: [truncated],
      matchRanges: [],
      fullText: text
    };
  }

  // Meilisearch returns byte positions, but we need character positions
  // For texts with multi-byte UTF-8 chars, we'll use the match positions as hints
  // and find proper sentence boundaries from there

  // Get approximate match regions - these may be off for UTF-8 but give us areas to look
  const matchRegions = matchesPosition.map(m => ({
    start: m.start,
    length: m.length
  }));

  // Extract sentences containing matches using character-based boundary detection
  const extractedSentences = [];
  const seenRanges = new Set(); // Avoid duplicating overlapping sentences

  for (const region of matchRegions) {
    // Use the byte position as a hint - clamp to text length for safety
    const hintPosition = Math.min(region.start, text.length - 1);

    // Extract the sentence at this position with context
    const sentence = extractSentenceAtPosition(text, hintPosition, contextSentences);

    // Create a key to detect duplicates/overlaps
    const rangeKey = `${sentence.start}-${sentence.end}`;
    if (seenRanges.has(rangeKey)) continue;

    // Check for overlapping ranges (merge nearby)
    let isOverlapping = false;
    for (const existing of extractedSentences) {
      if (sentence.start <= existing.end && sentence.end >= existing.start) {
        // Merge: extend existing range
        existing.start = Math.min(existing.start, sentence.start);
        existing.end = Math.max(existing.end, sentence.end);
        existing.text = text.slice(existing.start, existing.end).trim();
        isOverlapping = true;
        break;
      }
    }

    if (!isOverlapping) {
      extractedSentences.push(sentence);
      seenRanges.add(rangeKey);
    }
  }

  // Sort by position and limit to maxLength
  extractedSentences.sort((a, b) => a.start - b.start);

  const excerptParts = [];
  let totalLength = 0;

  for (const sentence of extractedSentences) {
    const remainingSpace = maxLength - totalLength;

    if (sentence.text.length <= remainingSpace) {
      // Sentence fits entirely
      excerptParts.push(sentence.text);
      totalLength += sentence.text.length + 5; // +5 for " ... " separator
    } else if (excerptParts.length === 0 || remainingSpace > maxLength * 0.3) {
      // First sentence or significant space left - truncate at sentence boundary
      const truncated = sentence.text.slice(0, remainingSpace);
      const sentenceEndMatch = truncated.match(/.*[.!?]["']?\s/s);
      if (sentenceEndMatch && sentenceEndMatch[0].length > remainingSpace * 0.4) {
        excerptParts.push(sentenceEndMatch[0].trim());
        totalLength += sentenceEndMatch[0].length + 5;
      } else if (excerptParts.length === 0) {
        // First sentence with no good boundary - use word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > remainingSpace * 0.5) {
          excerptParts.push(truncated.slice(0, lastSpace));
        } else {
          excerptParts.push(truncated);
        }
        totalLength = maxLength; // Stop here
      }
      break; // Don't add more after truncating
    } else {
      break; // Not enough space for meaningful content
    }
  }

  // If somehow we got nothing, return truncated text at sentence boundary
  if (excerptParts.length === 0) {
    if (text.length <= maxLength) {
      excerptParts.push(text);
    } else {
      // Find the last sentence boundary before maxLength
      const truncated = text.slice(0, maxLength);
      // Look for sentence-ending punctuation followed by space or end
      const sentenceEndMatch = truncated.match(/.*[.!?]["']?\s/s);
      if (sentenceEndMatch && sentenceEndMatch[0].length > maxLength * 0.5) {
        excerptParts.push(sentenceEndMatch[0].trim());
      } else {
        // Fallback: find last space to avoid cutting mid-word
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.6) {
          excerptParts.push(truncated.slice(0, lastSpace));
        } else {
          excerptParts.push(truncated);
        }
      }
    }
  }

  // For now, highlightedSentences = sentences (AI will add phrase highlighting later)
  // We don't apply byte-based highlighting since it can cut words
  return {
    sentences: excerptParts,
    highlightedSentences: excerptParts,  // Same as sentences - AI will highlight
    matchRanges: matchRegions,
    fullText: text
  };
}

/**
 * Apply <mark> highlighting to text based on match positions
 * @param {string} blockText - The text block to highlight
 * @param {number} blockStart - The starting position of this block in the original text
 * @param {Array} matchPositions - Array of {start, end} positions in original text
 * @returns {string} Text with <mark> tags around matches
 */
function applyHighlighting(blockText, blockStart, matchPositions) {
  // Find matches that fall within this block
  const blockEnd = blockStart + blockText.length;
  const relevantMatches = matchPositions
    .filter(m => m.start >= blockStart && m.end <= blockEnd)
    .map(m => ({
      start: m.start - blockStart,  // Convert to block-relative position
      end: m.end - blockStart
    }))
    .sort((a, b) => a.start - b.start);

  if (relevantMatches.length === 0) {
    return blockText;
  }

  // Build highlighted text by inserting <mark> tags
  let result = '';
  let lastEnd = 0;

  for (const match of relevantMatches) {
    // Add text before this match
    result += blockText.slice(lastEnd, match.start);
    // Add highlighted match
    result += '<mark>' + blockText.slice(match.start, match.end) + '</mark>';
    lastEnd = match.end;
  }
  // Add remaining text after last match
  result += blockText.slice(lastEnd);

  return result;
}

/**
 * Find sentence start by scanning backward from position
 * Looks for sentence-ending punctuation (.!?) followed by whitespace
 */
function findSentenceStart(text, position) {
  // Scan backward from position
  for (let i = position - 1; i >= 0; i--) {
    const char = text[i];
    // If we find whitespace after sentence-ending punctuation, sentence starts after whitespace
    if (/\s/.test(char) && i > 0 && /[.!?]/.test(text[i - 1])) {
      return i + 1;
    }
    // Also check for newlines which often start sentences
    if (char === '\n') {
      return i + 1;
    }
  }
  return 0; // Start of text
}

/**
 * Find sentence end by scanning forward from position
 * Looks for sentence-ending punctuation (.!?) followed by whitespace or end
 */
function findSentenceEnd(text, position) {
  // Scan forward from position
  for (let i = position; i < text.length; i++) {
    const char = text[i];
    if (/[.!?]/.test(char)) {
      // Check if followed by whitespace, end, or quote+whitespace
      const next = text[i + 1];
      const nextNext = text[i + 2];
      if (!next || /\s/.test(next) || (next === '"' && (!nextNext || /\s/.test(nextNext)))) {
        // Include the punctuation and any trailing quote
        let end = i + 1;
        if (text[end] === '"' || text[end] === "'") end++;
        return end;
      }
    }
  }
  return text.length; // End of text
}

/**
 * Extract sentence containing the given position
 * Includes context sentences before/after if requested
 */
function extractSentenceAtPosition(text, position, contextSentences = 1) {
  // Find the sentence containing this position
  const sentenceStart = findSentenceStart(text, position);
  const sentenceEnd = findSentenceEnd(text, position);

  // Expand to include context sentences
  let expandedStart = sentenceStart;
  let expandedEnd = sentenceEnd;

  // Add sentences before
  for (let i = 0; i < contextSentences; i++) {
    if (expandedStart > 0) {
      expandedStart = findSentenceStart(text, expandedStart - 1);
    }
  }

  // Add sentences after
  for (let i = 0; i < contextSentences; i++) {
    if (expandedEnd < text.length) {
      expandedEnd = findSentenceEnd(text, expandedEnd + 1);
    }
  }

  return {
    start: expandedStart,
    end: expandedEnd,
    text: text.slice(expandedStart, expandedEnd).trim()
  };
}

// =============================================================================
// SMART HIGHLIGHTING WITH STOP WORDS FILTER
// =============================================================================

/**
 * Common English stop words that should not be highlighted in search results
 */
export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they',
  'them', 'his', 'her', 'their', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there'
]);

/**
 * Check if a word is a stop word
 */
function isStopWord(word) {
  return STOP_WORDS.has(word.toLowerCase());
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split text into sentences
 * @param {string} text - Text to split
 * @returns {Array<{text: string, start: number, end: number}>} Array of sentence objects
 */
function splitIntoSentences(text) {
  const sentences = [];
  let start = 0;

  // Match sentence-ending punctuation followed by space or end
  const sentenceEndPattern = /[.!?](?:\s|$|["'])/g;
  let match;

  while ((match = sentenceEndPattern.exec(text)) !== null) {
    const end = match.index + 1; // Include the punctuation
    const sentenceText = text.slice(start, end).trim();
    if (sentenceText.length > 0) {
      sentences.push({
        text: sentenceText,
        start,
        end
      });
    }
    start = match.index + match[0].length;
  }

  // Handle remaining text (no ending punctuation)
  if (start < text.length) {
    const remaining = text.slice(start).trim();
    if (remaining.length > 0) {
      sentences.push({
        text: remaining,
        start,
        end: text.length
      });
    }
  }

  return sentences;
}

/**
 * Calculate proximity score for how close search terms appear in text
 * Higher score = words appear closer together
 * @param {string} text - Text to analyze
 * @param {string[]} terms - Search terms to find
 * @returns {number} Proximity score (higher is better)
 */
function calculateProximityScore(text, terms) {
  if (terms.length < 2) return 0;

  const lowerText = text.toLowerCase();
  const positions = [];

  // Find first occurrence of each term
  for (const term of terms) {
    const pos = lowerText.indexOf(term.toLowerCase());
    if (pos >= 0) {
      positions.push({ term, pos });
    }
  }

  if (positions.length < 2) return 0;

  // Sort by position
  positions.sort((a, b) => a.pos - b.pos);

  // Calculate total distance between consecutive terms
  let totalDistance = 0;
  for (let i = 1; i < positions.length; i++) {
    totalDistance += positions[i].pos - positions[i - 1].pos;
  }

  // Average distance per gap (lower is better, so invert)
  const avgDistance = totalDistance / (positions.length - 1);

  // Return inverse score (closer = higher score)
  // Score of 1000 for adjacent words, decreasing as distance increases
  return Math.max(0, 1000 - avgDistance);
}

/**
 * Check if text contains the exact phrase (words in order, allowing some flexibility)
 * @param {string} text - Text to search
 * @param {string[]} terms - Ordered terms to find as phrase
 * @returns {boolean} True if phrase found
 */
function containsPhrase(text, terms) {
  if (terms.length === 0) return false;
  if (terms.length === 1) return text.toLowerCase().includes(terms[0].toLowerCase());

  // Build regex that matches terms in order with optional words between
  // Allow 0-3 words between each term
  const pattern = terms
    .map(t => escapeRegex(t))
    .join('\\W+(?:\\w+\\W+){0,3}');

  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

/**
 * Extract best sentence and apply smart highlighting
 * Scoring priority:
 * 1. Exact phrase match (all words in order) - highest
 * 2. All terms present with high proximity - high
 * 3. All terms present (scattered) - medium
 * 4. Most terms present - low (fallback)
 *
 * @param {Object} hit - Meilisearch hit with text
 * @param {string} query - Original search query
 * @returns {Object} { excerpt, highlightedExcerpt }
 */
export function highlightBestSentence(hit, query) {
  const text = hit.text || '';

  if (!text) {
    return { excerpt: '', highlightedExcerpt: '' };
  }

  // Extract query terms (non-stop-words, min 2 chars)
  const queryTerms = query.toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1 && !isStopWord(t));

  // If all terms are stop words, use full query terms
  const termsToMatch = queryTerms.length > 0
    ? queryTerms
    : query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

  // Split into sentences
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) {
    // No sentences found, return truncated text
    const truncated = text.slice(0, 300);
    return { excerpt: truncated, highlightedExcerpt: truncated };
  }

  // Score each sentence
  let bestSentence = null;
  let bestScore = -1;

  for (const sentence of sentences) {
    const lowerSentence = sentence.text.toLowerCase();

    // Count how many terms are present
    let termsFound = 0;
    for (const term of termsToMatch) {
      if (lowerSentence.includes(term)) termsFound++;
    }

    // Calculate score with priority:
    // - Base: number of terms found * 100
    // - Bonus: +10000 if ALL terms present
    // - Bonus: +50000 if exact phrase found
    // - Bonus: proximity score (0-1000) for close terms

    let score = termsFound * 100;

    // All terms present bonus
    if (termsFound === termsToMatch.length) {
      score += 10000;

      // Exact phrase bonus (words in query order)
      if (containsPhrase(sentence.text, termsToMatch)) {
        score += 50000;
      }

      // Proximity bonus
      score += calculateProximityScore(sentence.text, termsToMatch);
    }

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // If no sentence matched any term, use the first sentence
  if (!bestSentence) {
    bestSentence = sentences[0];
  }

  // Find the best phrase span - where query terms cluster together
  const phraseSpan = findBestPhraseSpan(bestSentence.text, termsToMatch);

  let highlighted = bestSentence.text;

  if (phraseSpan) {
    // Extract before, phrase, and after parts
    const before = highlighted.slice(0, phraseSpan.start);
    const phrase = highlighted.slice(phraseSpan.start, phraseSpan.end);
    const after = highlighted.slice(phraseSpan.end);

    // Bold keywords within the phrase
    let boldedPhrase = phrase;
    for (const term of termsToMatch) {
      const regex = new RegExp(`\\b(${escapeRegex(term)}\\w*)`, 'gi');
      boldedPhrase = boldedPhrase.replace(regex, '<strong>$1</strong>');
    }

    // Wrap phrase in highlight span
    highlighted = `${before}<span class="phrase-hit">${boldedPhrase}</span>${after}`;
  } else {
    // No phrase span found, just bold keywords
    for (const term of termsToMatch) {
      const regex = new RegExp(`\\b(${escapeRegex(term)}\\w*)`, 'gi');
      highlighted = highlighted.replace(regex, '<strong>$1</strong>');
    }
  }

  return {
    excerpt: bestSentence.text,
    highlightedExcerpt: highlighted
  };
}

/**
 * Find the best phrase span where query terms cluster together
 * Returns { start, end } character positions or null
 */
function findBestPhraseSpan(text, terms) {
  if (!terms || terms.length === 0) return null;

  const lowerText = text.toLowerCase();

  // Find all positions of each term
  const termPositions = [];
  for (const term of terms) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\w*`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      termPositions.push({
        term,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
    }
  }

  if (termPositions.length === 0) return null;

  // Sort by position
  termPositions.sort((a, b) => a.start - b.start);

  // If only one term match, return it with some context
  if (termPositions.length === 1) {
    const pos = termPositions[0];
    // Expand to word boundaries on either side (up to ~30 chars each side)
    let start = Math.max(0, pos.start - 30);
    let end = Math.min(text.length, pos.end + 30);

    // Snap to word boundaries
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;

    return { start, end };
  }

  // Find the tightest cluster containing the most unique terms
  let bestSpan = null;
  let bestScore = -1;

  for (let i = 0; i < termPositions.length; i++) {
    for (let j = i; j < termPositions.length; j++) {
      const spanStart = termPositions[i].start;
      const spanEnd = termPositions[j].end;
      const spanLength = spanEnd - spanStart;

      // Get unique terms in this span
      const uniqueTerms = new Set();
      for (let k = i; k <= j; k++) {
        uniqueTerms.add(termPositions[k].term.toLowerCase());
      }

      // Score: prefer more unique terms, then shorter spans
      // More terms = higher priority, so weight heavily
      const score = (uniqueTerms.size * 10000) - spanLength;

      if (score > bestScore) {
        bestScore = score;
        bestSpan = { start: spanStart, end: spanEnd, uniqueTerms: uniqueTerms.size };
      }
    }
  }

  if (!bestSpan) return null;

  // Expand slightly to include surrounding words for context
  let { start, end } = bestSpan;

  // Expand to include partial words at boundaries
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;

  return { start, end };
}

export function enrichHitsWithExcerpts(hits, options = {}) {
  return hits.map(hit => {
    const extracted = extractMatchingSentences(hit, options);
    return {
      ...hit,
      // Join contiguous blocks with ellipsis separator
      excerpt: extracted.sentences.join(' ... '),
      excerptBlocks: extracted.sentences,  // Array of contiguous text blocks (plain)
      // Highlighted version with <mark> tags around search matches
      highlightedText: extracted.highlightedSentences.join(' ... '),
      highlightedBlocks: extracted.highlightedSentences,  // Array with highlighting
      matchRanges: extracted.matchRanges
    };
  });
}
