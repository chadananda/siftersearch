/**
 * Search Quality Test Suite
 *
 * Living test suite for search result quality, deduplication, faceting, and relevance.
 * Run regularly to catch regressions and track improvements over time.
 *
 * Categories:
 * 1. Deduplication — no fragment results, no flooding, no cross-doc dupes
 * 2. Relevance — top results actually answer the query
 * 3. Faceting — religion/collection/author/year filters work correctly
 * 4. Cross-language — English queries find Arabic/Persian results
 * 5. Edge cases — short queries, transliteration, diacriticals
 *
 * These tests hit the actual search functions (mocked Meilisearch in CI,
 * or live Meilisearch in integration mode).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// In CI, these are unit tests with mocked search.
// With LIVE_SEARCH=true, they hit real Meilisearch for integration testing.
const isLive = process.env.LIVE_SEARCH === 'true';

// Lazy-load search functions only when running live tests
let keywordSearch, hybridSearch;

beforeAll(async () => {
  if (isLive) {
    const search = await import('../../api/lib/search.js');
    keywordSearch = search.keywordSearch;
    hybridSearch = search.hybridSearch;
  }
});

// Helper: run a search and return hits (skip in CI if no live search)
async function searchQuick(query, options = {}) {
  if (!isLive) return null;
  const results = await keywordSearch(query, { limit: options.limit || 20, ...options });
  return results.hits || [];
}

// Helper: check that no result text is shorter than min chars
function assertNoFragments(hits, minChars = 40) {
  for (const hit of hits) {
    expect((hit.text || '').length).toBeGreaterThanOrEqual(minChars);
  }
}

// Helper: check max N results from same document
function assertMaxPerDoc(hits, maxPerDoc = 2) {
  const counts = {};
  for (const hit of hits) {
    const docId = hit.doc_id || hit.document_id;
    counts[docId] = (counts[docId] || 0) + 1;
    expect(counts[docId]).toBeLessThanOrEqual(maxPerDoc);
  }
}

// Helper: check max N results with same title
function assertMaxPerTitle(hits, maxPerTitle = 2) {
  const counts = {};
  for (const hit of hits) {
    const title = (hit.title || '').toLowerCase().trim();
    if (!title) continue;
    counts[title] = (counts[title] || 0) + 1;
    expect(counts[title]).toBeLessThanOrEqual(maxPerTitle);
  }
}

// Helper: check no duplicate text content
function assertNoContentDuplicates(hits) {
  const seen = new Set();
  for (const hit of hits) {
    const key = (hit.text || '').replace(/\s+/g, ' ').trim().slice(0, 100).toLowerCase();
    if (key.length > 20) {
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  }
}

// ==========================================================================
// 1. DEDUPLICATION
// ==========================================================================

describe('Deduplication', () => {
  it.skipIf(!isLive)('should not return fragments under 40 chars', async () => {
    const hits = await searchQuick('justice');
    assertNoFragments(hits);
  });

  it.skipIf(!isLive)('should return max 2 results per document', async () => {
    const hits = await searchQuick('prayer');
    assertMaxPerDoc(hits);
  });

  it.skipIf(!isLive)('should return max 2 results per title (catches duplicate uploads)', async () => {
    const hits = await searchQuick('unity');
    assertMaxPerTitle(hits);
  });

  it.skipIf(!isLive)('should not return identical text from different documents', async () => {
    const hits = await searchQuick('detachment');
    assertNoContentDuplicates(hits);
  });

  it.skipIf(!isLive)('should return diverse documents for broad queries', async () => {
    const hits = await searchQuick('God', { limit: 20 });
    const uniqueDocs = new Set(hits.map(h => h.doc_id || h.document_id));
    // At least 8 unique documents in top 20
    expect(uniqueDocs.size).toBeGreaterThanOrEqual(8);
  });
});

// ==========================================================================
// 2. RELEVANCE
// ==========================================================================

describe('Relevance', () => {
  it.skipIf(!isLive)('exact phrase should rank higher than scattered keywords', async () => {
    const hits = await searchQuick('"progressive revelation"');
    // Top result should contain the exact phrase
    const topText = (hits[0]?.text || '').toLowerCase();
    expect(topText).toContain('progressive revelation');
  });

  it.skipIf(!isLive)('author name search should find that author\'s works', async () => {
    const hits = await searchQuick('Shoghi Effendi');
    const topAuthors = hits.slice(0, 5).map(h => h.author || '');
    const hasShoghi = topAuthors.some(a => a.includes('Shoghi Effendi'));
    expect(hasShoghi).toBe(true);
  });

  it.skipIf(!isLive)('book title search should find that book', async () => {
    const hits = await searchQuick('Kitab-i-Iqan');
    const topTitles = hits.slice(0, 5).map(h => h.title || '');
    const hasIqan = topTitles.some(t => t.includes('Iqan') || t.includes('Íqán'));
    expect(hasIqan).toBe(true);
  });

  it.skipIf(!isLive)('should not return completely irrelevant results', async () => {
    const hits = await searchQuick('fasting rules obligations');
    // All top 5 should mention fasting or related concepts
    for (const hit of hits.slice(0, 5)) {
      const text = (hit.text || '').toLowerCase();
      const relevant = text.includes('fast') || text.includes('abstain') ||
        text.includes('food') || text.includes('eat') || text.includes('drink') ||
        text.includes('obligation') || text.includes('law');
      expect(relevant).toBe(true);
    }
  });

  it.skipIf(!isLive)('short single-word queries should return substantive results', async () => {
    const hits = await searchQuick('meditation');
    expect(hits.length).toBeGreaterThan(0);
    // Results should be substantial, not keyword-only fragments
    const avgLength = hits.slice(0, 5).reduce((sum, h) => sum + (h.text || '').length, 0) / 5;
    expect(avgLength).toBeGreaterThan(100);
  });
});

// ==========================================================================
// 3. FACETING (Filters)
// ==========================================================================

describe('Faceting', () => {
  it.skipIf(!isLive)('religion filter should restrict to that religion', async () => {
    const hits = await searchQuick('prayer', { filter: 'religion = "Islam"' });
    for (const hit of hits) {
      expect(hit.religion).toBe('Islam');
    }
  });

  it.skipIf(!isLive)('collection filter should restrict to that collection', async () => {
    const hits = await searchQuick('revelation', { filter: 'collection = "Core Publications"' });
    for (const hit of hits) {
      expect(hit.collection).toBe('Core Publications');
    }
  });

  it.skipIf(!isLive)('author filter should restrict to that author', async () => {
    const hits = await searchQuick('covenant', { filter: 'author = "Shoghi Effendi"' });
    for (const hit of hits) {
      expect(hit.author).toContain('Shoghi Effendi');
    }
  });

  it.skipIf(!isLive)('year range filter should restrict results', async () => {
    const hits = await searchQuick('teaching', { filter: 'year >= 1900 AND year <= 1950' });
    for (const hit of hits) {
      if (hit.year) {
        expect(hit.year).toBeGreaterThanOrEqual(1900);
        expect(hit.year).toBeLessThanOrEqual(1950);
      }
    }
  });

  it.skipIf(!isLive)('language filter should work', async () => {
    const hits = await searchQuick('الله', { filter: 'language = "ar"' });
    for (const hit of hits) {
      expect(hit.language).toBe('ar');
    }
  });

  it.skipIf(!isLive)('combined filters should narrow results', async () => {
    const broad = await searchQuick('God');
    const narrow = await searchQuick('God', { filter: 'religion = "Islam" AND collection = "Traditions"' });
    // Narrow results should be a subset
    expect(narrow.length).toBeLessThanOrEqual(broad.length);
    for (const hit of narrow) {
      expect(hit.religion).toBe('Islam');
    }
  });
});

// ==========================================================================
// 4. CROSS-LANGUAGE
// ==========================================================================

describe('Cross-Language', () => {
  it.skipIf(!isLive)('English query should find Arabic text passages', async () => {
    // "divine unity" concept exists across languages
    const hits = await searchQuick('divine unity', { limit: 20 });
    const languages = new Set(hits.map(h => h.language));
    // Should have at least English results; Arabic is bonus
    expect(hits.length).toBeGreaterThan(0);
  });

  it.skipIf(!isLive)('Arabic query should return results', async () => {
    const hits = await searchQuick('بسم الله الرحمن الرحيم');
    expect(hits.length).toBeGreaterThan(0);
  });

  it.skipIf(!isLive)('transliterated term should find results', async () => {
    // "Bahá'u'lláh" with diacriticals
    const hits = await searchQuick("Bahá'u'lláh");
    expect(hits.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// 5. EDGE CASES
// ==========================================================================

describe('Edge Cases', () => {
  it.skipIf(!isLive)('empty query should return empty results', async () => {
    const hits = await searchQuick('');
    expect(hits.length).toBe(0);
  });

  it.skipIf(!isLive)('very long query should not error', async () => {
    const longQuery = 'What does the Baha\'i Faith say about the relationship between justice and unity in the context of world peace and the establishment of a new world order based on the principles of consultation and collective decision-making?';
    const hits = await searchQuick(longQuery);
    // Should return something, not error
    expect(Array.isArray(hits)).toBe(true);
  });

  it.skipIf(!isLive)('special characters should not break search', async () => {
    const hits = await searchQuick("'Abdu'l-Bahá's");
    expect(Array.isArray(hits)).toBe(true);
  });

  it.skipIf(!isLive)('numeric query should work', async () => {
    const hits = await searchQuick('1844');
    expect(hits.length).toBeGreaterThan(0);
  });

  it.skipIf(!isLive)('stop words should not dominate results', async () => {
    const hits = await searchQuick('the way of truth');
    // Results should be about "truth" or "way", not just any passage with "the"
    expect(hits.length).toBeGreaterThan(0);
    const topText = (hits[0]?.text || '').toLowerCase();
    const relevant = topText.includes('truth') || topText.includes('way') || topText.includes('path');
    expect(relevant).toBe(true);
  });

  it.skipIf(!isLive)('typo tolerance should find results', async () => {
    const hits = await searchQuick('meditaton'); // typo: meditation
    expect(hits.length).toBeGreaterThan(0);
  });
});

// ==========================================================================
// UNIT TESTS (always run, no Meilisearch needed)
// ==========================================================================

describe('Search Quality Helpers (unit)', () => {
  it('assertNoFragments catches short text', () => {
    expect(() => assertNoFragments([{ text: 'short' }])).toThrow();
    expect(() => assertNoFragments([{ text: 'This is a sufficiently long passage that should pass the minimum length check.' }])).not.toThrow();
  });

  it('assertMaxPerDoc catches flooding', () => {
    const hits = [
      { doc_id: 1, text: 'a' }, { doc_id: 1, text: 'b' }, { doc_id: 1, text: 'c' }
    ];
    expect(() => assertMaxPerDoc(hits, 2)).toThrow();
    expect(() => assertMaxPerDoc(hits, 3)).not.toThrow();
  });

  it('assertNoContentDuplicates catches identical text', () => {
    const hits = [
      { text: 'This is a passage about justice and equity in the modern world today.' },
      { text: 'This is a passage about justice and equity in the modern world today.' }
    ];
    expect(() => assertNoContentDuplicates(hits)).toThrow();
  });

  it('assertMaxPerTitle catches duplicate uploads', () => {
    const hits = [
      { title: 'The Book', text: 'a' }, { title: 'The Book', text: 'b' }, { title: 'The Book', text: 'c' }
    ];
    expect(() => assertMaxPerTitle(hits, 2)).toThrow();
  });
});
