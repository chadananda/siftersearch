// Fuzzy text matching primitives — Levenshtein distance + Arabic-aware
// term containment + phrase scoring. Used by api/lib/search.js's keyword
// path to filter Meilisearch hits down to those that contain all query
// terms (with Meili-style typo tolerance) and rank by phrase proximity.
//
// Pure functions; no I/O, no DB. Safe to import everywhere.

/** Strip Arabic diacritics (tashkeel) for normalization. U+064B–U+065F + U+0670 covers fathah, dammah, kasrah, shadda, sukun, etc. */
export function stripTashkeel(text) {
  return text.replace(/[\u064B-\u065F\u0670]/g, '');
}

/** Simple Levenshtein distance for short strings. Quadratic; not for use on long text. */
export function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Check if text contains a fuzzy match for a term.
 * Mirrors Meilisearch's typo budget: 1 typo for 5–8 chars, 2 typos for 9+ chars,
 * exact match required for shorter terms. Uses Unicode-aware word splitting
 * so it handles Arabic, Persian, Hebrew, etc.
 */
export function textContainsFuzzy(text, term) {
  const lowerText = stripTashkeel(text.toLowerCase());
  const lowerTerm = stripTashkeel(term.toLowerCase());

  if (lowerText.includes(lowerTerm)) return true;

  const maxTypos = lowerTerm.length >= 9 ? 2 : (lowerTerm.length >= 5 ? 1 : 0);
  if (maxTypos === 0) return false;

  const words = lowerText.match(/[\p{L}\p{N}]+/gu) || [];
  return words.some(word => {
    if (Math.abs(word.length - lowerTerm.length) > 2) return false;
    return levenshtein(word, lowerTerm) <= maxTypos;
  });
}

/** Check if every term has a fuzzy match somewhere in `hit.text`. */
export function hasAllTermMatches(hit, terms) {
  const text = hit.text || '';
  return terms.every(term => textContainsFuzzy(text, term));
}

/**
 * Phrase-match score for ranking. 100 = exact phrase; 50–80 close proximity;
 * 30–50 medium proximity; 10 scattered. Used post-filter to bring tighter
 * matches to the top.
 */
export function calculatePhraseScore(text, query, terms) {
  const lowerText = stripTashkeel(text.toLowerCase());
  const lowerQuery = stripTashkeel(query.toLowerCase());

  if (lowerText.includes(lowerQuery)) return 100;

  if (terms.length >= 2) {
    const positions = terms
      .map(term => lowerText.indexOf(stripTashkeel(term)))
      .filter(p => p >= 0);

    if (positions.length === terms.length) {
      const minPos = Math.min(...positions);
      const maxPos = Math.max(...positions);
      const spread = maxPos - minPos;

      if (spread < 100) return 80 - Math.floor(spread / 5);
      if (spread < 300) return 50 - Math.floor((spread - 100) / 10);
    }
  }

  return 10;
}
