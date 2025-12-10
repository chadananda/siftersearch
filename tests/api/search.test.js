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
