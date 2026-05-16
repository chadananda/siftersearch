// Search fan-out tests (Phase E2).
//
// hybridSearch resolves scope_config → list of Meili paragraph indexes and
// queries them in parallel. These tests pin the fan-out by mocking the Meili
// client and asserting which index NAMES were searched for given scope_config
// values. Catches accidental leaks (e.g. a refactor that drops the
// scope_config parameter and reverts to single-index search).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Track every meili.index(name).search() call across tests
const searchCalls = [];
const meiliMock = {
  index: vi.fn((name) => ({
    search: vi.fn(async (query, params) => {
      searchCalls.push({ name, query, params });
      return {
        hits: [{ id: `${name}_hit_1`, _rankingScore: 0.5, doc_id: 1, religion: 'test' }],
        processingTimeMs: 1,
        estimatedTotalHits: 1,
        query,
      };
    }),
    getDocuments: vi.fn(async () => ({ results: [] })),
  })),
  // multiSearch is used by crossTraditionSearch (unfiltered queries)
  multiSearch: vi.fn(async ({ queries }) => ({
    results: queries.map(q => {
      searchCalls.push({ name: q.indexUid, query: q.q, params: q });
      return {
        hits: [{ id: `${q.indexUid}_hit_1`, _rankingScore: 0.5, doc_id: 1, religion: q.filter?.match(/religion = "([^"]+)"/)?.[1] || 'test' }],
        processingTimeMs: 1,
        estimatedTotalHits: 1,
      };
    }),
  })),
};

vi.mock('../../api/lib/config.js', () => ({
  config: {
    search: { enabled: true, host: 'http://localhost', authorityRankPosition: 4 },
    ai: { embeddings: { model: 'text-embedding-3-large', dimensions: 512 } },
  },
}));

vi.mock('../../api/lib/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

vi.mock('../../api/lib/ai.js', () => ({
  createEmbedding: vi.fn(async () => ({ embedding: new Array(512).fill(0.1) })),
  createEmbeddings: vi.fn(async (texts) => ({ embeddings: texts.map(() => new Array(512).fill(0.1)) })),
}));

vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryAll: vi.fn(async () => []),
  queryOne: vi.fn(async () => null),
}));

// MUST mock authority before search.js imports it, else search.js calls real
// rerankByAuthority which expects DB rows.
vi.mock('../../api/lib/authority.js', () => ({
  AUTHOR_AUTHORITY: {},
  rerankByAuthority: (hits) => hits,
  getAuthority: () => 5,
}));

// Mock the meilisearch package — search.js's getMeili() does
// `new MeiliSearch(...)` so this captures every search call. Constructor
// ignores args and returns the shared meiliMock instance.
vi.mock('meilisearch', () => ({
  MeiliSearch: function () { return meiliMock; },
}));

describe('hybridSearch fan-out (Phase E2)', () => {
  let hybridSearch;
  let setSiteRegistry;

  beforeEach(async () => {
    searchCalls.length = 0;
    meiliMock.index.mockClear();
    const search = await import('../../api/lib/search.js');
    hybridSearch = search.hybridSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    setSiteRegistry({});  // empty registry — default scope = primary only
  });

  it('default scope (no scope_config) → only `paragraphs` index queried', async () => {
    await hybridSearch('test query');
    // cross-tradition queries paragraphs multiple times (once per religion), check unique set
    const uniqueNames = [...new Set(searchCalls.map(c => c.name))];
    expect(uniqueNames).toEqual(['paragraphs']);
  });

  it('scope with primary + site → fans out to both indexes', async () => {
    await hybridSearch('test query', {
      scope_config: { primary: true, sites: ['balib'] },
    });
    const uniqueNames = [...new Set(searchCalls.map(c => c.name))].sort();
    expect(uniqueNames).toEqual(['paragraphs', 'siftersearch_balib_paragraphs']);
  });

  it('site-only scope → ONLY the site index queried, primary NEVER touched', async () => {
    await hybridSearch('test query', {
      scope_config: { primary: false, sites: ['bt'] },
    });
    const uniqueNames = [...new Set(searchCalls.map(c => c.name))];
    expect(uniqueNames).toEqual(['siftersearch_bt_paragraphs']);
    // CRITICAL: primary must NOT have been queried
    expect(uniqueNames).not.toContain('paragraphs');
  });

  it('empty scope (no primary, no sites) → no Meili calls, empty result', async () => {
    const result = await hybridSearch('test query', {
      scope_config: { primary: false, sites: [] },
    });
    expect(searchCalls).toEqual([]);
    expect(result.hits).toEqual([]);
  });

  it('multi-site scope → all named indexes queried in parallel', async () => {
    await hybridSearch('test query', {
      scope_config: { primary: true, sites: ['balib', 'ool'] },
    });
    const uniqueNames = [...new Set(searchCalls.map(c => c.name))].sort();
    expect(uniqueNames).toEqual([
      'paragraphs',
      'siftersearch_balib_paragraphs',
      'siftersearch_ool_paragraphs',
    ]);
  });

  it('per-index search failure does NOT fail the whole query', async () => {
    // Make the second index throw
    meiliMock.index.mockImplementation((name) => ({
      search: vi.fn(async (q) => {
        if (name === 'siftersearch_balib_paragraphs') throw new Error('index missing');
        searchCalls.push({ name, query: q });
        return { hits: [{ id: 'h', _rankingScore: 0.5, doc_id: 1 }], processingTimeMs: 1 };
      }),
      getDocuments: vi.fn(async () => ({ results: [] })),
    }));

    const result = await hybridSearch('test query', {
      scope_config: { primary: true, sites: ['balib'] },
    });
    // Primary still returned hits even though balib failed
    expect(result.hits.length).toBeGreaterThan(0);
  });
});

describe('multiIndexSearch propagates scope_config', () => {
  let multiIndexSearch;

  beforeEach(async () => {
    searchCalls.length = 0;
    meiliMock.index.mockClear();
    // Reset to working mock
    meiliMock.index.mockImplementation((name) => ({
      search: vi.fn(async (q, params) => {
        searchCalls.push({ name, query: q, params });
        return {
          hits: [{ id: `${name}_hit_1`, _rankingScore: 0.5, paragraph_id: 1, doc_id: 1, religion: 'test' }],
          processingTimeMs: 1,
        };
      }),
      getDocuments: vi.fn(async () => ({ results: [] })),
    }));
    const search = await import('../../api/lib/search.js');
    multiIndexSearch = search.multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    scope.setSiteRegistry({});
  });

  it('site-only scope → no HyPE call (HyPE only on primary in v1)', async () => {
    await multiIndexSearch('test', {
      scope_config: { primary: false, sites: ['bt'] },
    });
    // HyPE index name must NOT appear in call list
    expect(searchCalls.map(c => c.name)).not.toContain('hype_questions');
    expect(searchCalls.map(c => c.name)).toContain('siftersearch_bt_paragraphs');
  });

  it('default scope → primary paragraphs AND hype_questions queried', async () => {
    await multiIndexSearch('test', {
      scope_config: { primary: true, sites: [] },
    });
    const names = searchCalls.map(c => c.name);
    expect(names).toContain('paragraphs');
    expect(names).toContain('hype_questions');
  });
});
