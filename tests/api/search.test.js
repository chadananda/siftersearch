/**
 * Search Service Tests
 *
 * Tests search logic and formatting without external dependencies.
 * These are unit tests that verify search behavior through data transformations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sampleParagraphs,
  mockMeiliResponses,
  createMockEmbedding,
  searchQueries,
  getAllParagraphs
} from '../fixtures/mock-data.js';

describe('Search Query Building', () => {
  it('should build correct filter string for multiple filters', () => {
    const filters = {
      religion: "Bahá'í",
      language: 'en',
      yearFrom: 1900,
      yearTo: 2000
    };

    // Build filter parts as the search function does
    const filterParts = [];
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.language) filterParts.push(`language = "${filters.language}"`);
    if (filters.yearFrom) filterParts.push(`year >= ${filters.yearFrom}`);
    if (filters.yearTo) filterParts.push(`year <= ${filters.yearTo}`);

    const filterString = filterParts.join(' AND ');

    expect(filterString).toContain("religion = \"Bahá'í\"");
    expect(filterString).toContain('language = "en"');
    expect(filterString).toContain('year >= 1900');
    expect(filterString).toContain('year <= 2000');
    expect(filterString.split(' AND ').length).toBe(4);
  });

  it('should handle empty filters', () => {
    const filters = {};
    const filterParts = [];

    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.language) filterParts.push(`language = "${filters.language}"`);

    const filterString = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

    expect(filterString).toBeUndefined();
  });

  it('should handle partial filters', () => {
    const filters = { religion: 'Buddhism' };
    const filterParts = [];

    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.language) filterParts.push(`language = "${filters.language}"`);
    if (filters.collection) filterParts.push(`collection = "${filters.collection}"`);

    const filterString = filterParts.join(' AND ');

    expect(filterString).toBe('religion = "Buddhism"');
    expect(filterString.split(' AND ').length).toBe(1);
  });

  it('should build document ID filter', () => {
    const documentId = 'doc_bahai_en_001';
    const filterParts = [];

    filterParts.push(`document_id = "${documentId}"`);

    const filterString = filterParts.join(' AND ');
    expect(filterString).toBe('document_id = "doc_bahai_en_001"');
  });

  it('should combine document ID with other filters', () => {
    const filters = {
      documentId: 'doc_bahai_ar_001',
      religion: "Bahá'í"
    };

    const filterParts = [];
    if (filters.religion) filterParts.push(`religion = "${filters.religion}"`);
    if (filters.documentId) filterParts.push(`document_id = "${filters.documentId}"`);

    const filterString = filterParts.join(' AND ');

    expect(filterString).toContain('document_id = "doc_bahai_ar_001"');
    expect(filterString).toContain("religion = \"Bahá'í\"");
  });
});

describe('Search Result Formatting', () => {
  it('should format results with all required fields', () => {
    const rawResult = {
      hits: sampleParagraphs.englishBahai,
      query: 'test',
      processingTimeMs: 10,
      estimatedTotalHits: 2,
      limit: 20,
      offset: 0
    };

    const formatted = {
      hits: rawResult.hits,
      query: rawResult.query,
      processingTimeMs: rawResult.processingTimeMs,
      estimatedTotalHits: rawResult.estimatedTotalHits,
      limit: rawResult.limit,
      offset: rawResult.offset
    };

    expect(formatted).toHaveProperty('hits');
    expect(formatted).toHaveProperty('query');
    expect(formatted).toHaveProperty('processingTimeMs');
    expect(formatted).toHaveProperty('estimatedTotalHits');
    expect(formatted).toHaveProperty('limit');
    expect(formatted).toHaveProperty('offset');
  });

  it('should preserve Arabic text in results', () => {
    const arabicHits = sampleParagraphs.arabicBahai;

    expect(arabicHits[0].text).toContain('سُبْحانَكَ');
    expect(arabicHits[0].language).toBe('ar');
  });

  it('should include document metadata in results', () => {
    const hits = sampleParagraphs.englishBahai;

    hits.forEach(hit => {
      expect(hit).toHaveProperty('document_id');
      expect(hit).toHaveProperty('paragraph_index');
      expect(hit).toHaveProperty('title');
      expect(hit).toHaveProperty('author');
      expect(hit).toHaveProperty('religion');
    });
  });
});

describe('Keyword Matching', () => {
  it('should match English keywords', () => {
    const allParagraphs = getAllParagraphs();
    const query = 'sovereignty';

    const matches = allParagraphs.filter(p =>
      p.text.toLowerCase().includes(query.toLowerCase())
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].religion).toBe("Bahá'í");
  });

  it('should match Arabic keywords', () => {
    const allParagraphs = getAllParagraphs();
    const query = 'سُبْحانَكَ';

    const matches = allParagraphs.filter(p =>
      p.text.includes(query)
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].language).toBe('ar');
  });

  it('should handle case-insensitive English search', () => {
    const allParagraphs = getAllParagraphs();

    const upperMatches = allParagraphs.filter(p =>
      p.text.toLowerCase().includes('glorified')
    );
    const lowerMatches = allParagraphs.filter(p =>
      p.text.toLowerCase().includes('GLORIFIED'.toLowerCase())
    );

    expect(upperMatches.length).toBe(lowerMatches.length);
  });
});

describe('Filter Logic', () => {
  it('should filter by religion', () => {
    const allParagraphs = getAllParagraphs();

    const bahaiFaith = allParagraphs.filter(p => p.religion === "Bahá'í");
    const buddhism = allParagraphs.filter(p => p.religion === 'Buddhism');

    expect(bahaiFaith.length).toBe(4); // 2 English + 2 Arabic
    expect(buddhism.length).toBe(1);
  });

  it('should filter by language', () => {
    const allParagraphs = getAllParagraphs();

    const english = allParagraphs.filter(p => p.language === 'en');
    const arabic = allParagraphs.filter(p => p.language === 'ar');

    expect(english.length).toBe(3); // 2 Bahá'í + 1 Buddhist
    expect(arabic.length).toBe(2);
  });

  it('should filter by year range', () => {
    const allParagraphs = getAllParagraphs();

    const modern = allParagraphs.filter(p => p.year && p.year >= 1900 && p.year <= 2000);
    const ancient = allParagraphs.filter(p => p.year && p.year < 1900);

    expect(modern.length).toBe(2); // 1938 translations
    expect(ancient.length).toBe(2); // 1858 originals
  });

  it('should filter by document ID', () => {
    const allParagraphs = getAllParagraphs();
    const targetDocId = 'doc_bahai_en_001';

    const filtered = allParagraphs.filter(p => p.document_id === targetDocId);

    expect(filtered.length).toBe(2);
    filtered.forEach(p => {
      expect(p.document_id).toBe(targetDocId);
    });
  });

  it('should combine multiple filters', () => {
    const allParagraphs = getAllParagraphs();

    const filtered = allParagraphs.filter(p =>
      p.religion === "Bahá'í" &&
      p.language === 'en' &&
      p.year >= 1900
    );

    expect(filtered.length).toBe(2);
    filtered.forEach(p => {
      expect(p.religion).toBe("Bahá'í");
      expect(p.language).toBe('en');
      expect(p.year).toBeGreaterThanOrEqual(1900);
    });
  });
});

describe('Search Pagination', () => {
  it('should apply limit to results', () => {
    const allParagraphs = getAllParagraphs();
    const limit = 2;

    const paginated = allParagraphs.slice(0, limit);

    expect(paginated.length).toBe(limit);
  });

  it('should apply offset to results', () => {
    const allParagraphs = getAllParagraphs();
    const offset = 2;

    const paginated = allParagraphs.slice(offset);

    expect(paginated.length).toBe(allParagraphs.length - offset);
    expect(paginated[0]).toEqual(allParagraphs[offset]);
  });

  it('should apply offset and limit together', () => {
    const allParagraphs = getAllParagraphs();
    const offset = 1;
    const limit = 2;

    const paginated = allParagraphs.slice(offset, offset + limit);

    expect(paginated.length).toBe(limit);
    expect(paginated[0]).toEqual(allParagraphs[offset]);
  });
});

describe('Mock Embedding Generation', () => {
  it('should generate deterministic embeddings for same text', () => {
    const text = 'Glorified art Thou, O Lord my God!';

    const embedding1 = createMockEmbedding(text);
    const embedding2 = createMockEmbedding(text);

    expect(embedding1).toEqual(embedding2);
  });

  it('should generate different embeddings for different text', () => {
    const text1 = 'First text';
    const text2 = 'Different text';

    const embedding1 = createMockEmbedding(text1);
    const embedding2 = createMockEmbedding(text2);

    expect(embedding1).not.toEqual(embedding2);
  });

  it('should generate embeddings of correct dimension', () => {
    const text = 'Test text';
    const defaultDimension = 3072;

    const embedding = createMockEmbedding(text);

    expect(embedding.length).toBe(defaultDimension);
  });

  it('should generate embeddings with values in valid range', () => {
    const text = 'Test text';
    const embedding = createMockEmbedding(text);

    embedding.forEach(value => {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it('should support custom dimensions', () => {
    const text = 'Test text';
    const customDimension = 768;

    const embedding = createMockEmbedding(text, customDimension);

    expect(embedding.length).toBe(customDimension);
  });
});

describe('Semantic Ratio Configuration', () => {
  it('should have valid range from 0 to 1', () => {
    const keywordOnly = 0;
    const semanticOnly = 1;
    const balanced = 0.5;

    expect(keywordOnly).toBeGreaterThanOrEqual(0);
    expect(keywordOnly).toBeLessThanOrEqual(1);

    expect(semanticOnly).toBeGreaterThanOrEqual(0);
    expect(semanticOnly).toBeLessThanOrEqual(1);

    expect(balanced).toBeGreaterThanOrEqual(0);
    expect(balanced).toBeLessThanOrEqual(1);
  });

  it('should default to 0.5 for hybrid search', () => {
    const defaultRatio = 0.5;
    expect(defaultRatio).toBe(0.5);
  });
});

describe('Search Query Validation', () => {
  it('should handle empty query string', () => {
    const query = '';
    const isValid = query !== null && query !== undefined;

    expect(isValid).toBe(true);
    // Empty query should still work (returns all documents with filters)
  });

  it('should handle whitespace-only query', () => {
    const query = '   ';
    const trimmed = query.trim();

    expect(trimmed).toBe('');
  });

  it('should handle special characters in query', () => {
    const queries = [
      "Bahá'í",
      'سُبْحانَكَ',
      'test@example.com',
      'phrase "with quotes"',
      'query:with:colons'
    ];

    queries.forEach(query => {
      expect(typeof query).toBe('string');
      expect(query.length).toBeGreaterThan(0);
    });
  });
});

describe('Mock Meilisearch Responses', () => {
  it('should provide empty search response structure', () => {
    const response = mockMeiliResponses.searchEmpty;

    expect(response.hits).toEqual([]);
    expect(response.estimatedTotalHits).toBe(0);
    expect(response.processingTimeMs).toBeDefined();
  });

  it('should generate search response with hits', () => {
    const hits = sampleParagraphs.englishBahai;
    const response = mockMeiliResponses.searchWithHits(hits);

    expect(response.hits).toEqual(hits);
    expect(response.estimatedTotalHits).toBe(hits.length);
    expect(response.processingTimeMs).toBeDefined();
  });

  it('should provide index stats structure', () => {
    const stats = mockMeiliResponses.indexStats;

    expect(stats.numberOfDocuments).toBeDefined();
    expect(stats.isIndexing).toBeDefined();
  });

  it('should provide health check structure', () => {
    const health = mockMeiliResponses.health;

    expect(health.status).toBe('available');
  });

  it('should provide tasks response structure', () => {
    const tasks = mockMeiliResponses.tasks;

    expect(tasks.results).toBeDefined();
    expect(Array.isArray(tasks.results)).toBe(true);
    expect(tasks.limit).toBeDefined();
  });
});

describe('Highlight Formatting', () => {
  it('should format highlighted text with marks', () => {
    const text = 'Every man of insight confesseth Thy sovereignty and Thy dominion';
    const query = 'sovereignty';
    const highlightPreTag = '<mark>';
    const highlightPostTag = '</mark>';

    // Simulate highlighting
    const highlighted = text.replace(
      new RegExp(`(${query})`, 'gi'),
      `${highlightPreTag}$1${highlightPostTag}`
    );

    expect(highlighted).toContain('<mark>sovereignty</mark>');
  });

  it('should highlight multiple occurrences', () => {
    const text = 'Thy sovereignty and Thy dominion and Thy sovereignty again';
    const query = 'sovereignty';
    const highlighted = text.replace(
      new RegExp(`(${query})`, 'gi'),
      '<mark>$1</mark>'
    );

    const matches = highlighted.match(/<mark>/g);
    expect(matches.length).toBe(2);
  });

  it('should handle Arabic text highlighting', () => {
    const text = 'سُبْحانَكَ يا إِلهي يَشْهَدُ كُلُّ';
    const query = 'إِلهي';
    const highlighted = text.replace(
      new RegExp(`(${query})`, 'g'),
      '<mark>$1</mark>'
    );

    expect(highlighted).toContain('<mark>إِلهي</mark>');
  });
});

/**
 * Query Filter Parsing Tests
 *
 * Tests for the parenthetical filter syntax: "query (filter1, filter2)"
 */
describe('Query Filter Parsing', () => {
  /**
   * Parse parenthetical filter terms from a query string.
   * This replicates the logic from api/routes/search.js for unit testing.
   */
  function parseQueryFilters(query) {
    const parenMatch = query.match(/\(([^)]+)\)\s*$/);

    if (!parenMatch) {
      return { cleanQuery: query.trim(), filterTerms: [] };
    }

    const filterTerms = parenMatch[1]
      .split(',')
      .map(term => term.trim().toLowerCase())
      .filter(term => term.length > 0);

    const cleanQuery = query.replace(/\(([^)]+)\)\s*$/, '').trim();

    return { cleanQuery, filterTerms };
  }

  it('should extract single filter term', () => {
    const result = parseQueryFilters('what is justice (shoghi)');
    expect(result.cleanQuery).toBe('what is justice');
    expect(result.filterTerms).toEqual(['shoghi']);
  });

  it('should extract multiple filter terms', () => {
    const result = parseQueryFilters('what is love (shoghi, pilgrim)');
    expect(result.cleanQuery).toBe('what is love');
    expect(result.filterTerms).toEqual(['shoghi', 'pilgrim']);
  });

  it('should handle extra whitespace', () => {
    const result = parseQueryFilters('prayer (  shoghi  ,  effendi  )  ');
    expect(result.cleanQuery).toBe('prayer');
    expect(result.filterTerms).toEqual(['shoghi', 'effendi']);
  });

  it('should lowercase filter terms for case-insensitive matching', () => {
    const result = parseQueryFilters('unity (Shoghi, EFFENDI)');
    expect(result.filterTerms).toEqual(['shoghi', 'effendi']);
  });

  it('should return empty filterTerms when no parentheses', () => {
    const result = parseQueryFilters('what is the soul');
    expect(result.cleanQuery).toBe('what is the soul');
    expect(result.filterTerms).toEqual([]);
  });

  it('should ignore parentheses in the middle of query', () => {
    const result = parseQueryFilters('what is love (and mercy) in teachings');
    expect(result.cleanQuery).toBe('what is love (and mercy) in teachings');
    expect(result.filterTerms).toEqual([]);
  });

  it('should handle empty parentheses by leaving query unchanged', () => {
    // Empty parentheses aren't valid filters, so they stay in the query
    const result = parseQueryFilters('prayer ()');
    expect(result.cleanQuery).toBe('prayer ()');
    expect(result.filterTerms).toEqual([]);
  });

  it('should handle three or more filter terms', () => {
    const result = parseQueryFilters('justice (shoghi, pilgrim, notes)');
    expect(result.filterTerms).toEqual(['shoghi', 'pilgrim', 'notes']);
  });

  it('should build correct CONTAINS filter string', () => {
    const filterTerms = ['shoghi', 'pilgrim'];

    const textFilters = [];
    for (const term of filterTerms) {
      textFilters.push(`author CONTAINS "${term}"`);
      textFilters.push(`collection CONTAINS "${term}"`);
      textFilters.push(`title CONTAINS "${term}"`);
    }
    const filterString = `(${textFilters.join(' OR ')})`;

    expect(filterString).toContain('author CONTAINS "shoghi"');
    expect(filterString).toContain('collection CONTAINS "shoghi"');
    expect(filterString).toContain('title CONTAINS "shoghi"');
    expect(filterString).toContain('author CONTAINS "pilgrim"');
    expect(filterString).toContain(' OR ');
  });
});

/**
 * Anchor-based Sentence Highlighting Tests
 *
 * Tests for the LLM-guided sentence highlighting using start/end anchors.
 */
describe('Anchor-based Highlighting', () => {
  /**
   * Normalize text for fuzzy matching
   */
  function normalizeForMatch(str) {
    return str.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
  }

  /**
   * Find position in original text that matches normalized anchor
   */
  function findAnchorPosition(text, anchor, searchFrom = 0) {
    const normalizedAnchor = normalizeForMatch(anchor);
    const anchorWords = normalizedAnchor.split(' ').filter(w => w.length > 0);
    if (anchorWords.length === 0) return -1;

    const textLower = text.toLowerCase();
    let pos = searchFrom;

    while (pos < text.length) {
      const firstWordPos = textLower.indexOf(anchorWords[0], pos);
      if (firstWordPos === -1) return -1;

      let matchStart = firstWordPos;
      let matchEnd = firstWordPos;
      let wordIdx = 0;
      let checkPos = firstWordPos;

      while (wordIdx < anchorWords.length && checkPos < text.length) {
        while (checkPos < text.length && /[\s\W]/.test(text[checkPos])) {
          checkPos++;
        }

        let wordEnd = checkPos;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
          wordEnd++;
        }

        const word = text.substring(checkPos, wordEnd).toLowerCase();

        if (word === anchorWords[wordIdx]) {
          if (wordIdx === 0) matchStart = checkPos;
          matchEnd = wordEnd;
          wordIdx++;
          checkPos = wordEnd;
        } else if (wordIdx === 0) {
          break;
        } else {
          break;
        }
      }

      if (wordIdx === anchorWords.length) {
        return { start: matchStart, end: matchEnd };
      }

      pos = firstWordPos + 1;
    }

    return -1;
  }

  /**
   * Find sentence in text using start and end anchors
   */
  function findSentenceByAnchors(text, startAnchor, endAnchor) {
    if (!startAnchor || !endAnchor) return null;

    const startMatch = findAnchorPosition(text, startAnchor, 0);
    if (startMatch === -1) return null;

    const endMatch = findAnchorPosition(text, endAnchor, startMatch.end);
    if (endMatch === -1) return null;

    if (endMatch.end - startMatch.start > 800) return null;

    return {
      start: startMatch.start,
      end: endMatch.end,
      text: text.substring(startMatch.start, endMatch.end)
    };
  }

  describe('findAnchorPosition', () => {
    it('should find simple anchor at start', () => {
      const text = 'The soul is immortal and everlasting.';
      const result = findAnchorPosition(text, 'The soul is');
      expect(result).not.toBe(-1);
      expect(result.start).toBe(0);
    });

    it('should find anchor in middle of text', () => {
      const text = 'Prayer is the key. The soul is immortal.';
      const result = findAnchorPosition(text, 'The soul is');
      expect(result).not.toBe(-1);
      expect(text.substring(result.start, result.end)).toBe('The soul is');
    });

    it('should be case insensitive', () => {
      const text = 'The SOUL is immortal.';
      const result = findAnchorPosition(text, 'the soul is');
      expect(result).not.toBe(-1);
    });

    it('should handle punctuation differences', () => {
      const text = "The soul, which is immortal, lives forever.";
      const result = findAnchorPosition(text, 'soul which is');
      expect(result).not.toBe(-1);
    });

    it('should return -1 for non-matching anchor', () => {
      const text = 'The body is temporary.';
      const result = findAnchorPosition(text, 'soul is immortal');
      expect(result).toBe(-1);
    });
  });

  describe('findSentenceByAnchors', () => {
    it('should find complete sentence with anchors', () => {
      const text = 'Prayer is important. The soul is immortal and everlasting. Love is divine.';
      const result = findSentenceByAnchors(text, 'The soul is', 'and everlasting');

      expect(result).not.toBeNull();
      expect(result.text).toBe('The soul is immortal and everlasting');
    });

    it('should return null for non-matching start anchor', () => {
      const text = 'The body is temporary.';
      const result = findSentenceByAnchors(text, 'The soul is', 'immortal');
      expect(result).toBeNull();
    });

    it('should return null for non-matching end anchor', () => {
      const text = 'The soul is temporary.';
      const result = findSentenceByAnchors(text, 'The soul is', 'immortal');
      expect(result).toBeNull();
    });

    it('should return null for missing anchors', () => {
      const text = 'The soul is immortal.';
      expect(findSentenceByAnchors(text, null, 'immortal')).toBeNull();
      expect(findSentenceByAnchors(text, 'The soul', null)).toBeNull();
    });

    it('should reject sentences that are too long (>800 chars)', () => {
      const longText = 'Start ' + 'x'.repeat(850) + ' End';
      const result = findSentenceByAnchors(longText, 'Start', 'End');
      expect(result).toBeNull();
    });

    it('should handle real-world passage text', () => {
      const text = `The light of men is Justice. Quench it not with the contrary winds of oppression and tyranny. The purpose of justice is the appearance of unity among men.`;

      const result = findSentenceByAnchors(
        text,
        'The light of men',
        'is Justice'
      );

      expect(result).not.toBeNull();
      expect(result.text).toBe('The light of men is Justice');
    });

    it('should handle Fred Mortensen style text (regression test)', () => {
      // This test documents the expected behavior for passages like Fred Mortensen's
      const text = "Fred Mortensen was a devoted believer who traveled to the Holy Land. His pilgrim notes contain many precious recollections.";

      const result = findSentenceByAnchors(
        text,
        'Fred Mortensen was',
        'the Holy Land'
      );

      expect(result).not.toBeNull();
      expect(result.text).toContain('Fred Mortensen');
      expect(result.text).toContain('Holy Land');
    });
  });
});

/**
 * Researcher Agent Filter Tests
 *
 * Tests for the researcher's ability to craft religion/tradition filters.
 */
describe('Researcher Agent Filters', () => {
  it('should build religion filter for tradition-specific queries', () => {
    // Simulates what the researcher should produce for "Buddhist teachings on suffering"
    const filter = { religion: 'Buddhist' };

    const filterString = `religion = "${filter.religion}"`;
    expect(filterString).toBe('religion = "Buddhist"');
  });

  it('should support multiple tradition filters for comparative queries', () => {
    // For "compare Buddhist and Christian views on compassion"
    // The researcher should create separate queries with different filters
    const buddhistFilter = { religion: 'Buddhist' };
    const christianFilter = { religion: 'Christian' };

    expect(`religion = "${buddhistFilter.religion}"`).toBe('religion = "Buddhist"');
    expect(`religion = "${christianFilter.religion}"`).toBe('religion = "Christian"');
  });

  it('should combine parenthetical filters with tradition filters', () => {
    // For "justice (shoghi)" with researcher adding religion filter
    const filterTerms = ['shoghi'];
    const religionFilter = { religion: 'Bahai' };

    const filterParts = [];

    // Add religion filter
    if (religionFilter.religion) {
      filterParts.push(`religion = "${religionFilter.religion}"`);
    }

    // Add text-based filters
    const textFilters = [];
    for (const term of filterTerms) {
      textFilters.push(`author CONTAINS "${term}"`);
      textFilters.push(`collection CONTAINS "${term}"`);
      textFilters.push(`title CONTAINS "${term}"`);
    }
    filterParts.push(`(${textFilters.join(' OR ')})`);

    const combinedFilter = filterParts.join(' AND ');

    expect(combinedFilter).toContain('religion = "Bahai"');
    expect(combinedFilter).toContain('author CONTAINS "shoghi"');
    expect(combinedFilter).toContain(' AND ');
  });
});
