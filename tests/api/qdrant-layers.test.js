// Qdrant search layers: filter mapping, request shapes, and hit shapes (fetch mocked — no network).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toQdrantFilter, searchPhrases, searchKeywordQdrant, searchHypeQdrant, authorKey, resolveQdrantFilters } from '../../api/lib/search/qdrant-layers.js';

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

  it('phrases: a plain top-(limit×4) query, best phrase per paragraph kept in score order (no /query/groups)', async () => {
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
    expect(calls[1].body).toMatchObject({ using: 'literal', limit: 20, params: { quantization: { rescore: true } } });
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
    expect(calls.at(-1).url).toContain('/collections/phrases/points/query/groups');
    expect(r.hits.map((h) => h.paragraph_id)).toEqual([11, 13]);
  });

  it('hype: the hype collection, same query vector model, one hit per paragraph', async () => {
    const r = await searchHypeQdrant('what is the soul?', { limit: 4 });
    expect(calls[0].body.content.parts[0].text).toBe('task: search result | query: what is the soul?');
    expect(calls[1].url).toContain('/collections/hype/points/query/groups');
    expect(calls[1].body).toMatchObject({ group_by: 'paragraph_id', group_size: 1, limit: 4 });
    expect(r.hits).toEqual([{ paragraph_id: 11, doc_id: 2, score: 0.8, thesis: false }]);
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
  it('filters on author_fold', () => {
    expect(toQdrantFilter({ author: "'Abdu'l-Bahá" })).toEqual({ must: [{ key: 'author_fold', match: { value: 'abdulbaha' } }] });
    expect(toQdrantFilter({ author: ['Shoghi Effendi', 'Shoghi Rabbani'] })).toEqual({ must: [{ key: 'author_fold', match: { any: ['shoghieffendi', 'shoghirabbani'] } }] });
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
