// Qdrant search layers: filter mapping, request shapes, and hit shapes (fetch mocked — no network).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toQdrantFilter, searchPhrases, searchKeywordQdrant } from '../../api/lib/search/qdrant-layers.js';

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

  it('phrases: query prefix, rescoring, one hit per paragraph with its span', async () => {
    const r = await searchPhrases('the light of justice', { limit: 5, filters: { religion: "Baha'i" } });
    expect(calls[0].body.content.parts[0].text).toBe('task: search result | query: the light of justice');
    const q = calls[1].body;
    expect(q).toMatchObject({ using: 'literal', group_by: 'paragraph_id', group_size: 1, limit: 5, params: { quantization: { rescore: true } } });
    expect(r.hits).toEqual([{ paragraph_id: 11, doc_id: 2, score: 0.8, span: { start: 5, end: 40 } }]);
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
    expect(qdrantOption(true)).toEqual({ phrase: true, keyword: true, only: false });
    expect(qdrantOption('only')).toEqual({ phrase: true, keyword: true, only: true });
    expect(qdrantOption({ phrase: true })).toEqual({ phrase: true, keyword: false, only: false });
    expect(qdrantOption(false)).toEqual({ phrase: false, keyword: false, only: false });
  });
  it('falls back to SEARCH_QDRANT', () => {
    expect(qdrantDefault('')).toEqual({ phrase: false, keyword: false, only: false });
    expect(qdrantDefault('phrase,keyword')).toEqual({ phrase: true, keyword: true, only: false });
    expect(qdrantDefault('only')).toEqual({ phrase: true, keyword: true, only: true });
  });
});
