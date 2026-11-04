// The engine's own CPU after the layers return (hydrate + rank) at production hit counts, against the latency contract
// (api/lib/search/latency-budget.js). Layers and SQLite are mocked to answer instantly, so `_timings.hydrate` and `_timings.rank`
// here are pure CPU (highlighting, RRF, rerank, diversify) — an O(n²) merge or a per-hit scan creeping in fails this.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/lib/config.js', () => ({ config: { search: { enabled: true, host: 'http://localhost', authorityRankPosition: 4 }, ai: { embeddings: { model: 'x', dimensions: 8 } } } }));
vi.mock('../../api/lib/logger.js', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock('../../api/lib/ai.js', () => ({ createEmbedding: vi.fn(async () => ({ embedding: [0] })), createEmbeddings: vi.fn(async (t) => ({ embeddings: t.map(() => [0]) })) }));
vi.mock('../../api/lib/authority.js', () => ({ AUTHOR_AUTHORITY: {}, rerankByAuthority: (h) => h, getAuthority: () => 5 }));
vi.mock('meilisearch', () => ({ MeiliSearch: function () { return { index: () => ({ search: async () => ({ hits: [] }), getDocuments: async () => ({ results: [] }) }), multiSearch: async () => ({ results: [] }) }; } }));

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const WORDS = ('the of and to in that is for his he it with as was on be by this which are not from god soul spirit light world love unity '
  + 'faith truth justice divine heaven earth knowledge revelation covenant prophet manifestation station glory peace humanity').split(' ');
const r = rng(11);
const DOCS = 400;
const text = () => Array.from({ length: 180 }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
const hits = (n, kind) => Array.from({ length: n }, (_, i) => ({ paragraph_id: 1000 + Math.floor(r() * 600), doc_id: 1 + Math.floor(r() * DOCS), score: 1 - i / n,
  ...(kind === 'phrase' ? { span: { start: 3, end: 40 } } : {}) }));
const DOC = (id) => ({ id, title: `Doc ${id}`, author: `Author ${id % 37}`, religion: id % 3 ? "Baha'i" : 'Islam', collection: 'c', language: 'en', slug: `d${id}` });

vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ rows: [] })),
  queryAll: vi.fn(async (sql) => (/from\s+docs/i.test(String(sql)) ? Array.from({ length: DOCS }, (_, i) => DOC(i + 1)) : [])),
  queryOne: vi.fn(async () => null),
}));
vi.mock('../../api/lib/search/qdrant-layers.js', () => ({
  searchPhrases: vi.fn(async (q, o) => ({ hits: hits(o?.limit === 12 ? 12 : 120, 'phrase') })),
  searchKeywordQdrant: vi.fn(async () => ({ hits: hits(30) })),
  searchHypeQdrant: vi.fn(async () => ({ hits: hits(30) })),
  searchConceptsQdrant: vi.fn(async () => ({ hits: hits(30) })),
  resolveQdrantFilters: vi.fn(async (f) => f),
  geminiQueryVector: vi.fn(async () => [0]),
  withQdrantCallLog: (log, fn) => fn(),
}));
const PARA = new Map();
vi.mock('../../api/lib/paragraphs-repo.js', () => ({
  paragraphsByIds: vi.fn(async (ids) => ids.map(Number).map((id) => {
    if (!PARA.has(id)) PARA.set(id, { id, doc_id: 1 + (id % DOCS), paragraph_index: id % 50, text: text(), ...DOC(1 + (id % DOCS)), id_: id });
    const p = PARA.get(id); return { ...p, id };
  })),
}));

describe('engine CPU at production hit counts', () => {
  it('hydrate (highlighting ~150 paragraphs) ≤ 80 ms and rank (RRF + rerank + diversify) ≤ 50 ms', async () => {
    const { multiIndexSearch } = await import('../../api/lib/search.js');
    const opts = { limit: 10, scope_config: { primary: true, sites: [] }, phraseLayer: true, qdrantKeyword: true, qdrantHype: true, meili: false, noTrace: true };
    await multiIndexSearch('the unity of revelation and the station of the prophet', opts);   // warm (JIT, module init)
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push((await multiIndexSearch(`the unity of revelation and the station of the prophet ${i}`, opts))._timings);
    const med = (k) => runs.map((t) => t[k]).sort((a, b) => a - b)[2];
    expect(runs[0].hydrate).toBeTypeOf('number');
    expect(med('hydrate')).toBeLessThan(80);
    expect(med('rank')).toBeLessThan(50);
  });
});
