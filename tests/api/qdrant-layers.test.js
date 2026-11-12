// Qdrant search layers: filter mapping, request shapes, and hit shapes (fetch mocked — no network).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toQdrantFilter, searchPhrases, searchKeywordQdrant, searchHypeQdrant, searchConceptsQdrant, searchPremisesQdrant, bestPerParagraphQuery, authorKey, resolveQdrantFilters, withQdrantCallLog } from '../../api/lib/search/qdrant-layers.js';

vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: () => {} }));   // hermetic: no telemetry writes
vi.mock('../../api/lib/docs-repo.js', () => ({
  docIdsInYearRange: vi.fn(async ({ yearFrom }) => (yearFrom === 3000 ? [] : [5, 8])),
}));

describe('resolveQdrantFilters', () => {
  it('a year range becomes the doc ids SQLite holds for it; an empty range matches nothing; documentId wins', async () => {
    expect(await resolveQdrantFilters({ religion: 'x', yearFrom: 1900, yearTo: 1950 })).toEqual({ religion: 'x', yearFrom: 1900, yearTo: 1950, documentId: [5, 8] });
    expect((await resolveQdrantFilters({ yearFrom: 3000 })).documentId).toEqual([-1]);
    expect(await resolveQdrantFilters({ yearFrom: 1900, documentId: 3 })).toEqual({ yearFrom: 1900, documentId: 3 });
    const plain = { religion: 'x' };
    expect(await resolveQdrantFilters(plain)).toBe(plain);
  });
});

describe('toQdrantFilter', () => {
  it('maps the search filters the payloads carry; ignores the rest', () => {
    expect(toQdrantFilter({ religion: "Baha'i", collection: 'Makátíb-i-‘Abdu’l-Bahá, vol. 3', yearFrom: 1900 })).toEqual({ must: [
      { key: 'religion', match: { value: "Baha'i" } }, { key: 'collection', match: { value: 'Makátíb-i-‘Abdu’l-Bahá, vol. 3' } }] });
    expect(toQdrantFilter({ documentId: ['7', 9] })).toEqual({ must: [{ key: 'doc_id', match: { any: [7, 9] } }] });
    expect(toQdrantFilter({})).toBeUndefined();
    expect(toQdrantFilter({ notAuthor: ["Bahá'u'lláh", 'abdulbaha'] })).toEqual({ must_not: [{ key: 'author_fold', match: { any: ['bahaullah', 'abdulbaha'] } }] });
  });
  it('library scope = not supplemental (old points carry no scope); supplemental = stamped scraped points', () => {
    expect(toQdrantFilter({ scope: 'primary' })).toEqual({ must_not: [{ key: 'scope', match: { value: 'supplemental' } }] });
    expect(toQdrantFilter({ scope: 'supplemental', religion: "Baha'i" })).toEqual({ must: [
      { key: 'scope', match: { value: 'supplemental' } }, { key: 'religion', match: { value: "Baha'i" } }] });
  });
});

describe('layers', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      if (url.includes('/query/groups')) return { ok: true, json: async () => ({ result: { groups: [
        { hits: [{ score: 0.8, payload: { paragraph_id: 11, doc_id: 2, start: 5, end: 40 } }] }] } }) };
      return { ok: true, json: async () => ({ result: { points: [{ score: 7.1, payload: { paragraph_id: 12, doc_id: 3 } }] } }) };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('phrases: a plain top-(limit×2) query, best phrase per paragraph kept in score order (no /query/groups)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      return { ok: true, json: async () => ({ result: { points: [
        { score: 0.9, payload: { paragraph_id: 11, doc_id: 2, start: 5, end: 40 } },
        { score: 0.8, payload: { paragraph_id: 11, doc_id: 2, start: 50, end: 90 } },   // same paragraph, weaker phrase
        { score: 0.7, payload: { paragraph_id: 12, doc_id: 3, start: 0, end: 30 } },
      ] } }) };
    }));
    const r = await searchPhrases('the light of justice', { limit: 5, filters: { religion: "Baha'i" } });
    expect(calls[0].body.content.parts[0].text).toBe('task: search result | query: the light of justice');
    expect(calls[1].url).toContain('/collections/phrases/points/query');
    expect(calls[1].url).not.toContain('/groups');
    expect(calls[1].body).toMatchObject({ using: 'literal', limit: 10, params: { quantization: { rescore: true } } });
    expect(calls[1].body.group_by).toBeUndefined();
    expect(r.hits).toEqual([
      { paragraph_id: 11, doc_id: 2, score: 0.9, span: { start: 5, end: 40 } },
      { paragraph_id: 12, doc_id: 3, score: 0.7, span: { start: 0, end: 30 } },
    ]);
    expect(calls).toHaveLength(2);   // a short result (fewer points than asked for) needs no fallback
  });

  it('phrases: a FULL page with fewer distinct paragraphs than the limit falls back to the grouped query', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      if (url.includes('/query/groups')) return { ok: true, json: async () => ({ result: { groups: [
        { hits: [{ score: 0.8, payload: { paragraph_id: 11, doc_id: 2, start: 5, end: 40 } }] },
        { hits: [{ score: 0.6, payload: { paragraph_id: 13, doc_id: 4, start: 1, end: 9 } }] }] } }) };
      return { ok: true, json: async () => ({ result: { points: Array.from({ length: 8 }, () => ({ score: 0.8, payload: { paragraph_id: 11, doc_id: 2, start: 5, end: 40 } })) } }) };
    }));
    const r = await searchPhrases('one paragraph dominates', { limit: 2 });
    // ×2 full but short of paragraphs → ×4 plain, still short → grouped (11-03: escalate, never pay ×4 up front)
    expect(calls.slice(1).map((c) => [c.url.endsWith('/groups') ? 'groups' : 'plain', c.body.limit])).toEqual([['plain', 4], ['plain', 8], ['groups', 2]]);
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([11, 13]);
  });

  it('phrases: ×2 short of distinct paragraphs, ×4 enough → the ×4 plain answer, no grouped query', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      const pts = Array.from({ length: body.limit }, (_, i) => ({ score: 1 - i / 100, payload: { paragraph_id: body.limit === 4 ? 11 : 11 + i, doc_id: 2, start: 0, end: 9 } }));
      return { ok: true, json: async () => ({ result: { points: pts } }) };
    }));
    const r = await searchPhrases('mostly one paragraph', { limit: 2 });
    expect(calls.slice(1).map((c) => c.body.limit)).toEqual([4, 8]);
    expect(calls.some((c) => c.url.endsWith('/groups'))).toBe(false);
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([11, 12]);
  });

  it('every call logs wall ms AND Qdrant\'s own server time, so the trace separates our overhead from Qdrant work', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      return { ok: true, json: async () => ({ result: { groups: [] }, time: 0.0042 }) };
    }));
    const log = [];
    await withQdrantCallLog(log, () => searchHypeQdrant('server time please', { limit: 3 }));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ collection: 'hype', server_ms: 4.2 });
    expect(typeof log[0].ms).toBe('number');
  });

  it('hype: the hype collection, same query vector model, a plain top-(limit×2) query, best per paragraph, thesis from k=999', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      return { ok: true, json: async () => ({ result: { points: [
        { score: 0.9, payload: { paragraph_id: 11, doc_id: 2, k: 999 } },
        { score: 0.85, payload: { paragraph_id: 11, doc_id: 2, k: 3 } },   // same paragraph, weaker question
        { score: 0.8, payload: { paragraph_id: 12, doc_id: 3, k: 1 } },
      ] } }) };
    }));
    const r = await searchHypeQdrant('what is the soul?', { limit: 4 });
    expect(calls[0].body.content.parts[0].text).toBe('task: search result | query: what is the soul?');
    expect(calls[1].url).toMatch(/\/collections\/hype\/points\/query$/);
    expect(calls[1].body).toMatchObject({ using: 'literal', limit: 8, params: { quantization: { rescore: true } } });
    expect(calls[1].body.group_by).toBeUndefined();
    expect(calls[1].body.with_payload).toContain('k');
    expect(r.hits).toEqual([{ paragraph_id: 11, doc_id: 2, score: 0.9, thesis: true }, { paragraph_id: 12, doc_id: 3, score: 0.8, thesis: false }]);
    expect(calls).toHaveLength(2);
  });

  it('concepts: plain ×2, escalates to ×4, and only a full ×4 page still short of paragraphs uses /query/groups', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      if (url.endsWith('/query/groups')) return { ok: true, json: async () => ({ result: { groups: [
        { hits: [{ score: 0.8, payload: { paragraph_id: 11, doc_id: 2 } }] }, { hits: [{ score: 0.6, payload: { paragraph_id: 13, doc_id: 4 } }] }] } }) };
      return { ok: true, json: async () => ({ result: { points: Array.from({ length: body.limit }, () => ({ score: 0.8, payload: { paragraph_id: 11, doc_id: 2 } })) } }) };
    }));
    const r = await searchConceptsQdrant('clouds as human limitations', { limit: 2 });
    expect(calls.slice(1).map((c) => [c.url.split('/collections/')[1], c.body.limit])).toEqual([
      ['concepts/points/query', 4], ['concepts/points/query', 8], ['concepts/points/query/groups', 2]]);
    expect(calls[3].body).toMatchObject({ group_by: 'paragraph_id', group_size: 1 });
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([11, 13]);
  });

  it('premises: own collection, hits flagged implied with the question position k; a collection not built yet is an empty layer', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      return { ok: true, json: async () => ({ result: { points: [{ score: 0.9, payload: { paragraph_id: 21, doc_id: 2, k: 1 } }, { score: 0.8, payload: { paragraph_id: 21, doc_id: 2, k: 0 } }] } }) };
    }));
    const r = await searchPremisesQdrant('do the unborn have rights?', { limit: 3 });
    expect(calls[1].url).toMatch(/\/collections\/premises\/points\/query$/);
    expect(r.hits).toEqual([{ paragraph_id: 21, doc_id: 2, score: 0.9, k: 1, implied: true }]);
    vi.stubGlobal('fetch', vi.fn(async (url) => url.includes('generativelanguage') ? { ok: true, json: async () => ({ embedding: { values: [0.3] } }) } : { ok: false, status: 404, text: async () => 'Collection `premises` doesn\'t exist' }));
    expect(await searchPremisesQdrant('another question entirely', { limit: 3 })).toEqual({ hits: [] });
  });

  it('bestPerParagraphQuery: a short page (fewer points than asked) is final — no escalation', async () => {
    const asked = [];
    const best = await bestPerParagraphQuery(async (n) => { asked.push(n); return { points: [{ payload: { paragraph_id: 1 } }] }; },
      async () => { throw new Error('no grouped call'); }, 5);
    expect(asked).toEqual([10]);
    expect(best).toHaveLength(1);
  });

  it('keyword: sparse query from our tokenizer; empty query → no call', async () => {
    const r = await searchKeywordQdrant('قل یا قوم', { limit: 3 });
    expect(calls[0].body.using).toBe('bm25');
    expect(calls[0].body.query.indices).toHaveLength(3);
    expect(r.hits).toEqual([{ paragraph_id: 12, doc_id: 3, score: 7.1 }]);
    calls = [];
    expect(await searchKeywordQdrant('  ', {})).toEqual({ hits: [] });
    expect(calls).toHaveLength(0);
  });
});

describe('language filter → lang_group', () => {
  it('maps Arabic and Persian to the shared script group, other languages as given', () => {
    expect(toQdrantFilter({ language: 'fa' })).toEqual({ must: [{ key: 'lang_group', match: { value: 'ar-fa' } }] });
    expect(toQdrantFilter({ language: 'Ar' })).toEqual({ must: [{ key: 'lang_group', match: { value: 'ar-fa' } }] });
    expect(toQdrantFilter({ language: 'EN' })).toEqual({ must: [{ key: 'lang_group', match: { value: 'en' } }] });
    expect(toQdrantFilter({ language: 'fa', langGroup: 'en' })).toEqual({ must: [{ key: 'lang_group', match: { value: 'en' } }] });
  });
});

describe('qdrantOption (per-request A/B switch)', async () => {
  const { qdrantOption, qdrantDefault } = await import('../../api/lib/planned-search.js');
  it('reads true / only / object / false', () => {
    expect(qdrantOption(true)).toEqual({ phrase: true, keyword: true, hype: false, only: false });
    expect(qdrantOption('only')).toEqual({ phrase: true, keyword: true, hype: true, only: true });
    expect(qdrantOption({ phrase: true })).toEqual({ phrase: true, keyword: false, hype: false, only: false });
    expect(qdrantOption(false)).toEqual({ phrase: false, keyword: false, hype: false, only: false });
  });
  it('falls back to SEARCH_QDRANT', () => {
    expect(qdrantDefault('')).toEqual({ phrase: false, keyword: false, hype: false, only: false });
    expect(qdrantDefault('phrase,keyword')).toEqual({ phrase: true, keyword: true, hype: false, only: false });
    expect(qdrantDefault('only')).toEqual({ phrase: true, keyword: true, hype: true, only: true });
  });
});

describe('author filter folds spelling variants', () => {
  it('one key for every apostrophe/accent spelling', () => {
    expect(authorKey('‘Abdu’l-Bahá')).toBe('abdulbaha');
    expect(authorKey("Abdu'l-Baha")).toBe('abdulbaha');
    expect(authorKey("Bahá'u'lláh")).toBe(authorKey('Bahá’u’lláh'));
  });
  // the writer OR a quoted voice (Chad 10-19: the Báb quoted by a scholar answers "what did the Báb say")
  it('filters on author_fold or voices_fold', () => {
    const either = (keys) => ({ must: [{ should: [{ key: 'author_fold', match: { any: keys } }, { key: 'voices_fold', match: { any: keys } }] }] });
    expect(toQdrantFilter({ author: "'Abdu'l-Bahá" })).toEqual(either(['abdulbaha']));
    expect(toQdrantFilter({ author: ['Shoghi Effendi', 'Shoghi Rabbani'] })).toEqual(either(['shoghieffendi', 'shoghirabbani']));
  });
});

describe('metadata documents are not passages', async () => {
  const { _setExcluded, meiliExclusion } = await import('../../api/lib/search/excluded-docs.js');
  it('both engines exclude them unless a document is asked for by id', () => {
    _setExcluded([8746]);
    expect(meiliExclusion()).toBe('doc_id NOT IN [8746]');
    expect(toQdrantFilter({})).toEqual({ must_not: [{ key: 'doc_id', match: { any: [8746] } }] });
    expect(toQdrantFilter({ documentId: 8746 })).toEqual({ must: [{ key: 'doc_id', match: { value: 8746 } }] });
    _setExcluded([]);
  });
  it('bahai-library tag index pages are excluded, a book that mentions tags is not (11-01)', async () => {
    const { isTagIndex } = await import('../../api/lib/search/excluded-docs.js');
    const bl = (title) => ({ title, source_site: 'bahai-library.com' });
    expect(isTagIndex(bl('Tag: Ahmad of Yazd'))).toBe(true);
    expect(isTagIndex(bl('All Tags'))).toBe(true);
    expect(isTagIndex(bl('All tags: Institute process'))).toBe(true);
    expect(isTagIndex(bl("Lights of Guidance: A Baha'i Reference File"))).toBe(false);
    expect(isTagIndex(bl('The Price Tag: a story'))).toBe(false);
    expect(isTagIndex({ title: 'Tag: x', source_site: 'oceanlibrary.com' })).toBe(false);
  });
});

describe('SEARCH_PARAMS', async () => {
  const { SEARCH_PARAMS } = await import('../../api/lib/search/qdrant-layers.js');
  // 11-03 (tower, 60 fresh real vectors, vs oversampling 4 at limit×4): phrase ×2 os1 top-30 28.4/30 (current ×4 os2 29.3),
  // top-10 9.4/10; hype grouped os1 29.7/30 (os2 29.8). Cold cost: phrases 43 → 17 ms, hype 33 → 23 ms. No rescore: 20.8/30.
  it('phrase and hype rescore at oversampling 1 (measured 11-03); never without rescore', () => {
    expect(SEARCH_PARAMS.phrase).toMatchObject({ rescore: true, oversampling: 1 });
    expect(SEARCH_PARAMS.hype).toMatchObject({ rescore: true, oversampling: 1 });
    expect(SEARCH_PARAMS.concept.rescore).toBe(true);
  });
  // 11-04 (tower, 30 fresh vectors, scripts/search/qdrant-knobs.mjs): ef 64 top-30 overlap vs os4/ef512 phrases 0.983
  // (default 0.990), hype 0.998, filtered shapes unchanged; concept os2 vs EXACT 0.991 (os4 0.997). Re-measure before changing.
  it('phrase and hype search at hnsw_ef 64, concepts at oversampling 2 (measured 11-04)', () => {
    expect(SEARCH_PARAMS.phrase.hnsw_ef).toBe(64);
    expect(SEARCH_PARAMS.hype.hnsw_ef).toBe(64);
    expect(SEARCH_PARAMS.concept).toMatchObject({ rescore: true, oversampling: 2 });
  });
});

describe('qdrantHealth', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports each collection with its unindexed count; any unreachable collection makes it an error', async () => {
    const { qdrantHealth } = await import('../../api/lib/search/qdrant-layers.js');
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.includes('hype') ? { ok: false, status: 404 }
      : { ok: true, json: async () => ({ result: { status: url.includes('phrases') ? 'yellow' : 'green', points_count: 10, indexed_vectors_count: url.includes('phrases') ? 4 : 10 } }) })));
    const h = await qdrantHealth();
    expect(h.status).toBe('error');
    expect(h.collections.phrases).toEqual({ status: 'yellow', points: 10, unindexed: 6 });
    expect(h.collections.hype).toEqual({ status: 'http 404' });
  });
});

// 11-03 (search-budget): Node fetch asks for gzip by default; Qdrant then gzips + chunks every reply and the call stalls
// ~40 ms once the body passes ~1-2 KB (measured on tower: 49-53 ms wall vs 7-11 ms with identity, same query).
describe('qdrant transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('every Qdrant request (search + health) asks for an uncompressed reply; Gemini is not touched', async () => {
    const { qdrantHealth } = await import('../../api/lib/search/qdrant-layers.js');
    const seen = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      seen.push({ url, headers: init.headers || {} });
      if (url.includes('generativelanguage')) return { ok: true, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
      if (init.method !== 'POST') return { ok: true, json: async () => ({ result: { status: 'green', points_count: 1, indexed_vectors_count: 1 } }) };
      return { ok: true, json: async () => ({ result: { points: [{ score: 1, payload: { paragraph_id: 1, doc_id: 1 } }] } }) };
    }));
    await searchKeywordQdrant('transport check one', { limit: 3 });
    await searchPhrases('transport check two', { limit: 3 });
    await qdrantHealth();
    const qd = seen.filter((s) => !s.url.includes('generativelanguage'));
    expect(qd.length).toBeGreaterThanOrEqual(5);
    for (const s of qd) expect(s.headers['Accept-Encoding']).toBe('identity');
  });

  it('each Qdrant call inside withQdrantCallLog is logged with its collection and wall ms', async () => {
    const { withQdrantCallLog } = await import('../../api/lib/search/qdrant-layers.js');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ result: { points: [] } }) })));
    const log = [];
    await withQdrantCallLog(log, () => searchKeywordQdrant('logged call words', { limit: 3 }));
    expect(log).toHaveLength(1);
    expect(log[0].collection).toBe('paragraphs_kw');
    expect(typeof log[0].ms).toBe('number');
    await searchKeywordQdrant('outside any log', { limit: 3 });
    expect(log).toHaveLength(1);
  });
});

describe('query-embedding memo is a true LRU (11-03: a repeated query skips the 300-900 ms Gemini call)', async () => {
  const { memoGet, memoSet, EMBED_MEMO } = await import('../../api/lib/search/qdrant-layers.js');
  it('a hit moves the entry to the newest end, so eviction drops the least RECENTLY used, not the oldest inserted', () => {
    const m = new Map();
    memoSet(m, 'a', 1, 2, 0); memoSet(m, 'b', 2, 2, 0);
    expect(memoGet(m, 'a', 1, 1000)).toBe(1);   // touch a
    memoSet(m, 'c', 3, 2, 2);                    // evicts b, not a
    expect([...m.keys()]).toEqual(['a', 'c']);
  });
  it('an entry past its TTL is a miss and is dropped', () => {
    const m = new Map();
    memoSet(m, 'a', 1, 5, 0);
    expect(memoGet(m, 'a', 1001, 1000)).toBe(undefined);
    expect(m.size).toBe(0);
  });
  it('holds hours, not minutes (a query vector never changes for the same model) and ~2k queries (~50 MB/instance)', () => {
    expect(EMBED_MEMO.ttlMs).toBeGreaterThanOrEqual(6 * 3600_000);
    expect(EMBED_MEMO.max).toBeGreaterThanOrEqual(2000);
  });
});
