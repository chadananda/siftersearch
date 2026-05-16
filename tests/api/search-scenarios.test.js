// Search merging scenarios — end-to-end stories.
//
// Each scenario tells a complete narrative about how a real search request
// flows through the scope-aware search federation. The file mocks Meili so
// each scenario can assert exactly which indexes were queried and how their
// results merge.
//
// Production registry layout (bahai-library, oceanoflights, bahaiteachings)
// is mirrored here. Adding a new site? Add a scenario.
//
// Read top-down: each `describe` block is one user-facing situation.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Meili mock — returns scenario-specific hits per index name
// ---------------------------------------------------------------------------

const meiliResponses = new Map(); // indexName → hits[] override
const searchCalls = [];           // recorded for assertions

function setIndexHits(name, hits) { meiliResponses.set(name, hits); }
function clearMockState() {
  meiliResponses.clear();
  searchCalls.length = 0;
}

const meiliMock = {
  index: (name) => ({
    search: async (query, params) => {
      searchCalls.push({ name, query, params });
      const hits = meiliResponses.get(name) ?? [];
      return {
        hits,
        processingTimeMs: 1,
        estimatedTotalHits: hits.length,
        query,
      };
    },
    getDocuments: async () => ({ results: [] }),
  }),
  // crossTraditionSearch uses multiSearch (one sub-query per religion)
  multiSearch: async ({ queries }) => ({
    results: queries.map(q => {
      searchCalls.push({ name: q.indexUid, query: q.q, params: q });
      const hits = meiliResponses.get(q.indexUid) ?? [];
      return { hits, processingTimeMs: 1, estimatedTotalHits: hits.length };
    }),
  }),
};

vi.mock('meilisearch', () => ({
  MeiliSearch: function () { return meiliMock; },
}));

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
  createEmbedding: async () => ({ embedding: new Array(512).fill(0.1) }),
  createEmbeddings: async (texts) => ({ embeddings: texts.map(() => new Array(512).fill(0.1)) }),
}));

vi.mock('../../api/lib/db.js', () => ({
  query: async () => ({ rows: [] }),
  queryAll: async () => [],
  queryOne: async () => null,
}));

vi.mock('../../api/lib/authority.js', () => ({
  AUTHOR_AUTHORITY: {},
  // Pass-through rerank for clearer assertions — actual prod rerank is
  // covered by tests/api/search-authority-ranking.test.js.
  rerankByAuthority: (hits) => hits,
  getAuthority: () => 5,
}));

// Production-shape registry
const REGISTRY = {
  'oceanlibrary.com':    { id: 'oceanlibrary.com',    scope: 'supplemental', meili_index_prefix: null }, // shares primary
  'bahai-library.com':   { id: 'bahai-library.com',   scope: 'supplemental', meili_index_prefix: 'balib' },
  'oceanoflights.org':   { id: 'oceanoflights.org',   scope: 'supplemental', meili_index_prefix: 'ool' },
  'bahaiteachings.org':  { id: 'bahaiteachings.org',  scope: 'site-only',    meili_index_prefix: 'bt' },
};

function makeHit(idx, indexName, score) {
  return {
    id: `${indexName}_${idx}`,
    doc_id: idx,
    paragraph_index: 0,
    text: `Hit ${idx} from ${indexName}`,
    title: `Doc ${idx}`,
    author: 'Author',
    religion: "Baha'i",
    authority: 5,
    _rankingScore: score,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Scenario 1 — Default Jafar (no chatbot_location)', () => {
  let multiIndexSearch, setSiteRegistry, getScopeForLocation;

  beforeEach(async () => {
    clearMockState();
    multiIndexSearch = (await import('../../api/lib/search.js')).multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getScopeForLocation = scope.getScopeForLocation;
    setSiteRegistry(REGISTRY);

    // Primary returns 3 hits, supplementals each return 2.
    setIndexHits('paragraphs', [makeHit(1, 'primary', 0.95), makeHit(2, 'primary', 0.85), makeHit(3, 'primary', 0.75)]);
    setIndexHits('siftersearch_balib_paragraphs', [makeHit(4, 'balib', 0.65), makeHit(5, 'balib', 0.55)]);
    setIndexHits('siftersearch_ool_paragraphs', [makeHit(6, 'ool', 0.60), makeHit(7, 'ool', 0.50)]);
    setIndexHits('siftersearch_bt_paragraphs', [makeHit(8, 'bt', 0.99)]); // would dominate if queried
    setIndexHits('hype_questions', []);
  });

  it('default scope queries primary + supplementals, EXCLUDES bahaiteachings', async () => {
    const scope_config = getScopeForLocation(null);
    await multiIndexSearch('what is unity', { scope_config });
    const queried = searchCalls.map(c => c.name).sort();
    expect(queried).toContain('paragraphs');
    expect(queried).toContain('siftersearch_balib_paragraphs');
    expect(queried).toContain('siftersearch_ool_paragraphs');
    expect(queried).toContain('hype_questions');
    // The hard rule:
    expect(queried).not.toContain('siftersearch_bt_paragraphs');
  });

  it('merged hits include primary + supplementals, NO bahaiteachings even though it has the highest score', async () => {
    const scope_config = getScopeForLocation(null);
    const result = await multiIndexSearch('what is unity', { scope_config });
    const ids = result.hits.map(h => h.id);
    // bahaiteachings hit (id 8, score 0.99) would top the list if queried — but it's not.
    expect(ids).not.toContain('bt_8');
    // Primary's top hit IS in there.
    expect(ids).toContain('primary_1');
  });
});

describe('Scenario 2 — Site-scoped chatbot at bahaiteachings.org', () => {
  let multiIndexSearch, setSiteRegistry, getScopeForLocation;

  beforeEach(async () => {
    clearMockState();
    multiIndexSearch = (await import('../../api/lib/search.js')).multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getScopeForLocation = scope.getScopeForLocation;
    setSiteRegistry(REGISTRY);

    setIndexHits('paragraphs', [makeHit(1, 'primary', 0.95)]);
    setIndexHits('siftersearch_balib_paragraphs', [makeHit(4, 'balib', 0.85)]);
    setIndexHits('siftersearch_bt_paragraphs', [makeHit(8, 'bt', 0.70), makeHit(9, 'bt', 0.65)]);
    setIndexHits('hype_questions', []);
  });

  it('queries ONLY siftersearch_bt_paragraphs — primary, balib, hype all skipped', async () => {
    const scope_config = getScopeForLocation('bahaiteachings.org');
    expect(scope_config).toEqual({ primary: false, sites: ['bt'] });

    await multiIndexSearch('opinion essay topic', { scope_config });
    const queried = [...new Set(searchCalls.map(c => c.name))];
    expect(queried).toEqual(['siftersearch_bt_paragraphs']);
    expect(queried).not.toContain('paragraphs');
    expect(queried).not.toContain('hype_questions');
  });

  it('returns ONLY bahaiteachings hits', async () => {
    const scope_config = getScopeForLocation('bahaiteachings.org');
    const result = await multiIndexSearch('opinion essay topic', { scope_config });
    const ids = result.hits.map(h => h.id);
    expect(ids.every(id => id.startsWith('bt_'))).toBe(true);
    expect(result.hits.length).toBe(2);
  });
});

describe('Scenario 3 — Site-scoped chatbot at bahai-library.com', () => {
  let multiIndexSearch, setSiteRegistry, getScopeForLocation;

  beforeEach(async () => {
    clearMockState();
    multiIndexSearch = (await import('../../api/lib/search.js')).multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getScopeForLocation = scope.getScopeForLocation;
    setSiteRegistry(REGISTRY);

    setIndexHits('paragraphs', [makeHit(1, 'primary', 0.95)]);
    setIndexHits('siftersearch_balib_paragraphs', [makeHit(4, 'balib', 0.85)]);
    setIndexHits('siftersearch_ool_paragraphs', [makeHit(6, 'ool', 0.75)]);
    setIndexHits('siftersearch_bt_paragraphs', [makeHit(8, 'bt', 0.99)]); // walled off
    setIndexHits('hype_questions', []);
  });

  it('chatbot at supplemental site = default scope (primary + sibling supplementals)', async () => {
    const scope_config = getScopeForLocation('bahai-library.com');
    // For supplemental locations the scope is the default — chatbot identity
    // matters for ranking-boost (v2), not exclusion.
    expect(scope_config.primary).toBe(true);
    expect(scope_config.sites.sort()).toEqual(['balib', 'ool']);
  });

  it('queries primary + balib + ool, EXCLUDES bahaiteachings even from a supplemental chatbot', async () => {
    const scope_config = getScopeForLocation('bahai-library.com');
    await multiIndexSearch('Aqdas', { scope_config });
    const queried = searchCalls.map(c => c.name);
    expect(queried).toContain('paragraphs');
    expect(queried).toContain('siftersearch_balib_paragraphs');
    expect(queried).toContain('siftersearch_ool_paragraphs');
    expect(queried).not.toContain('siftersearch_bt_paragraphs');
  });
});

describe('Scenario 4 — Cross-index merging by relevance score', () => {
  let hybridSearch, setSiteRegistry, INDEXES;

  beforeEach(async () => {
    clearMockState();
    const search = await import('../../api/lib/search.js');
    hybridSearch = search.hybridSearch;
    INDEXES = search.INDEXES;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    setSiteRegistry(REGISTRY);
  });

  it('merges hits across indexes and sorts by Meili _rankingScore', async () => {
    setIndexHits('paragraphs', [
      makeHit(1, 'primary', 0.50),
      makeHit(2, 'primary', 0.40),
    ]);
    setIndexHits('siftersearch_balib_paragraphs', [
      makeHit(10, 'balib', 0.95),  // highest score, from a supplemental
      makeHit(11, 'balib', 0.30),
    ]);

    const result = await hybridSearch('test', {
      scope_config: { primary: true, sites: ['balib'] },
    });
    const ordered = result.hits.map(h => h.id);
    expect(ordered[0]).toBe('balib_10');     // 0.95 wins
    expect(ordered[1]).toBe('primary_1');    // 0.50
    expect(ordered[2]).toBe('primary_2');    // 0.40
    expect(ordered[3]).toBe('balib_11');     // 0.30
  });

  it('the result includes _scopeIndexes for telemetry', async () => {
    const result = await hybridSearch('test', {
      scope_config: { primary: true, sites: ['balib', 'ool'] },
    });
    expect(result._scopeIndexes).toEqual([
      'paragraphs',
      'siftersearch_balib_paragraphs',
      'siftersearch_ool_paragraphs',
    ]);
  });
});

describe('Scenario 5 — Resilience: per-index Meili failure', () => {
  let hybridSearch, setSiteRegistry;

  beforeEach(async () => {
    clearMockState();
    hybridSearch = (await import('../../api/lib/search.js')).hybridSearch;
    setSiteRegistry = (await import('../../api/lib/search/scope.js')).setSiteRegistry;
    setSiteRegistry(REGISTRY);
  });

  it('one index throws — the others still return their hits', async () => {
    // Cross-tradition path uses meili.multiSearch (one call per index).
    // Override multiSearch: balib throws, primary returns one hit.
    const origMultiSearch = meiliMock.multiSearch;
    meiliMock.multiSearch = async ({ queries }) => {
      const indexUid = queries[0]?.indexUid;
      if (indexUid === 'siftersearch_balib_paragraphs') {
        throw new Error('Connection reset by peer');
      }
      searchCalls.push({ name: indexUid, query: queries[0]?.q });
      const hit = indexUid === 'paragraphs' ? [makeHit(1, 'primary', 0.9)] : [];
      return { results: queries.map(() => ({ hits: hit, processingTimeMs: 1, estimatedTotalHits: hit.length })) };
    };

    try {
      const result = await hybridSearch('resilience', {
        scope_config: { primary: true, sites: ['balib'] },
      });
      expect(result.hits.length).toBe(1);
      expect(result.hits[0].id).toBe('primary_1');
    } finally {
      meiliMock.multiSearch = origMultiSearch;
    }
  });
});

describe('Scenario 6 — New site goes live: registry hot-swap', () => {
  let multiIndexSearch, setSiteRegistry, getScopeForLocation;

  beforeEach(async () => {
    clearMockState();
    multiIndexSearch = (await import('../../api/lib/search.js')).multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getScopeForLocation = scope.getScopeForLocation;
    setIndexHits('paragraphs', [makeHit(1, 'primary', 0.9)]);
    setIndexHits('siftersearch_newsite_paragraphs', [makeHit(99, 'newsite', 0.85)]);
    setIndexHits('hype_questions', []);
  });

  it('before adding newsite to registry, only primary is queried', async () => {
    setSiteRegistry({});
    const scope_config = getScopeForLocation(null);
    await multiIndexSearch('test', { scope_config });
    const queried = searchCalls.map(c => c.name);
    expect(queried).not.toContain('siftersearch_newsite_paragraphs');
  });

  it('after adding newsite as supplemental, default scope picks it up automatically', async () => {
    setSiteRegistry({
      ...REGISTRY,
      'newsite.example': { id: 'newsite.example', scope: 'supplemental', meili_index_prefix: 'newsite' },
    });
    const scope_config = getScopeForLocation(null);
    await multiIndexSearch('test', { scope_config });
    const queried = searchCalls.map(c => c.name);
    expect(queried).toContain('siftersearch_newsite_paragraphs');
  });
});

describe('Scenario 7 — Site-only registration is opt-in for default scope', () => {
  let setSiteRegistry, getDefaultScope;

  beforeEach(async () => {
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getDefaultScope = scope.getDefaultScope;
  });

  it('adding a site-only entry does NOT change default scope', () => {
    setSiteRegistry({});
    const before = getDefaultScope();
    setSiteRegistry({ 'opinion.example': { id: 'opinion.example', scope: 'site-only', meili_index_prefix: 'op' } });
    const after = getDefaultScope();
    expect(after).toEqual(before);
    expect(after.sites).not.toContain('op');
  });

  it('adding a supplemental entry DOES change default scope', () => {
    setSiteRegistry({});
    setSiteRegistry({ 'good.example': { id: 'good.example', scope: 'supplemental', meili_index_prefix: 'good' } });
    expect(getDefaultScope().sites).toContain('good');
  });
});

describe('Scenario 8 — OL preservation: shared primary index', () => {
  let multiIndexSearch, setSiteRegistry, getScopeForLocation;

  beforeEach(async () => {
    clearMockState();
    multiIndexSearch = (await import('../../api/lib/search.js')).multiIndexSearch;
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getScopeForLocation = scope.getScopeForLocation;
    setSiteRegistry(REGISTRY);
    setIndexHits('paragraphs', [makeHit(1, 'primary-or-ol', 0.9)]);
    setIndexHits('hype_questions', []);
  });

  it('OL has null prefix — its docs share the primary `paragraphs` index, NOT a separate per-site index', async () => {
    const scope_config = getScopeForLocation(null);
    await multiIndexSearch('Ocean', { scope_config });
    const queried = searchCalls.map(c => c.name);
    // No siftersearch_oceanlibrarycom_paragraphs in calls
    expect(queried.find(n => n.startsWith('siftersearch_oceanlibrary'))).toBeUndefined();
    // Primary IS queried — that's where OL data lives
    expect(queried).toContain('paragraphs');
  });
});

describe('Scenario 9 — Future site at oceanoflights with v2 HyPE policy', () => {
  let getScopeForLocation, setSiteRegistry;

  beforeEach(async () => {
    const scope = await import('../../api/lib/search/scope.js');
    getScopeForLocation = scope.getScopeForLocation;
    setSiteRegistry = scope.setSiteRegistry;
  });

  it('v2 will be a config flip — scope resolution is unchanged', () => {
    // v1: hype_policy=never (current). v2 will set hype_policy='central-figures'
    // for oceanoflights. The chatbot routing is independent of HyPE policy —
    // both versions resolve to the same scope_config.
    setSiteRegistry({
      'oceanoflights.org': { id: 'oceanoflights.org', scope: 'supplemental', meili_index_prefix: 'ool', hype_policy: 'never' },
    });
    const v1Scope = getScopeForLocation('oceanoflights.org');

    setSiteRegistry({
      'oceanoflights.org': { id: 'oceanoflights.org', scope: 'supplemental', meili_index_prefix: 'ool', hype_policy: 'central-figures' },
    });
    const v2Scope = getScopeForLocation('oceanoflights.org');

    expect(v1Scope).toEqual(v2Scope);
  });
});

describe('Scenario 10 — Full production registry: snapshot of all scopes', () => {
  let setSiteRegistry, getDefaultScope, getScopeForLocation, getScopeIndexes;

  beforeEach(async () => {
    const scope = await import('../../api/lib/search/scope.js');
    setSiteRegistry = scope.setSiteRegistry;
    getDefaultScope = scope.getDefaultScope;
    getScopeForLocation = scope.getScopeForLocation;
    getScopeIndexes = scope.getScopeIndexes;
    setSiteRegistry(REGISTRY);
  });

  it('default scope = primary + balib + ool (NOT bt)', () => {
    expect(getScopeIndexes(getDefaultScope())).toEqual(
      expect.arrayContaining(['paragraphs', 'siftersearch_balib_paragraphs', 'siftersearch_ool_paragraphs'])
    );
    expect(getScopeIndexes(getDefaultScope())).not.toContain('siftersearch_bt_paragraphs');
  });

  it('chatbot at oceanoflights.org → 3 indexes (primary + balib + ool)', () => {
    const idxs = getScopeIndexes(getScopeForLocation('oceanoflights.org'));
    expect(idxs).toHaveLength(3);
  });

  it('chatbot at bahaiteachings.org → 1 index (bt only)', () => {
    expect(getScopeIndexes(getScopeForLocation('bahaiteachings.org'))).toEqual(['siftersearch_bt_paragraphs']);
  });

  it('unknown chatbot location falls back to default scope', () => {
    expect(getScopeIndexes(getScopeForLocation('unknown.example')))
      .toEqual(getScopeIndexes(getDefaultScope()));
  });
});
