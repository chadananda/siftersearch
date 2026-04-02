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
  // Standard smart quotes: opening = after whitespace/start, closing = after non-space
  // Process character-by-character for correct context-aware quoting
  let result = '';
  let prevChar = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isStartOrSpace = i === 0 || /\s/.test(prevChar) || /[(\[{\u2014-]/.test(prevChar);
    if (ch === '"') {
      result += isStartOrSpace ? '\u201C' : '\u201D';
    } else if (ch === "'") {
      // Apostrophe between letters = always right quote (contractions, transliteration)
      const prevIsLetter = /\p{L}/u.test(prevChar);
      const nextIsLetter = i + 1 < text.length && /\p{L}/u.test(text[i + 1]);
      if (prevIsLetter && nextIsLetter) {
        result += '\u2019'; // mid-word apostrophe
      } else {
        result += isStartOrSpace ? '\u2018' : '\u2019';
      }
    } else {
      result += ch;
    }
    prevChar = ch;
  }
  return result;
}
