/**
 * Text utility functions for display formatting.
 */

/**
 * Convert straight quotes to typographic (curly) smart quotes.
 *
 * Rules:
 *   " after whitespace / start-of-string / opening punctuation → \u201C (left double ")
 *   " elsewhere (after a non-whitespace char)                  → \u201D (right double ")
 *   ' after whitespace / start-of-string                       → \u2018 (left single ')
 *   ' elsewhere (contractions, possessives, closing)            → \u2019 (right single ')
 *
 * Idempotent: already-curly quotes are not re-processed.
 *
 * @param {string} text
 * @returns {string}
 */
export function toCurlyQuotes(text) {
  if (!text) return text;
  return text
    // Double quotes: opening — after start-of-string, whitespace, or opening punctuation
    .replace(/(^|[\s\u2014\-([{])"(?=\S)/g, '$1\u201C')
    // Double quotes: closing — all remaining straight double quotes
    .replace(/"/g, '\u201D')
    // Single quotes: opening — after start-of-string or whitespace, before a non-whitespace char
    .replace(/(^|\s)'(?=\S)/g, '$1\u2018')
    // Single quotes: closing/apostrophe — all remaining straight single quotes
    .replace(/'/g, '\u2019');
}
