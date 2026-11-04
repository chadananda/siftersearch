// Anís tools registry (tools.js): one name = one function; each search tool calls only its own layer; filters pass through;
// researcher/agent list only registry tools; old names are input-only aliases. All layers mocked (ctx.deps).
import { describe, it, expect, vi } from 'vitest';
import * as tools from '../../api/lib/assistant/tools.js';
import { TOOLS, RESEARCH_TOOL_NAMES, research, libraryTools } from '../../api/lib/assistant/researcher.js';
import { AGENT_TOOLS, AGENT_TOOL_NAMES } from '../../api/lib/assistant/agent.js';

const LAYERS = ['searchKeywordQdrant', 'searchPhrases', 'searchHypeQdrant'];
const layerDeps = () => {
  const d = Object.fromEntries(LAYERS.map((n) => [n, vi.fn(async () => ({ hits: [{ paragraph_id: 7, score: 0.9 }] }))]));
  return { ...d, resolveQdrantFilters: vi.fn(async (f) => f), paragraphsByIds: vi.fn(async () => [{ id: 7, doc_id: 3, paragraph_index: 2, text: 'the earth is but one country', title: 'Gleanings', author: "Bahá'u'lláh" }]),
    withLinks: vi.fn(async (h) => h.map((x) => ({ ...x, url: 'https://oceanlibrary.com/g#p2' }))) };
};

describe('registry', () => {
  it('names are unique and every alias resolves to a registered canonical tool', () => {
    const names = Object.keys(tools.REGISTRY);
    expect(new Set(names).size).toBe(names.length);
    for (const [alias, name] of Object.entries(tools.ALIASES)) {
      expect(tools.REGISTRY[name], alias).toBeTruthy();
      expect(tools.REGISTRY[alias], `${alias} must not also be a canonical name`).toBeUndefined();
      expect(tools.resolve(alias).name).toBe(name);
    }
    expect(tools.resolve('search_library').name).toBe('combined_search');
    expect(tools.resolve('source_of').name).toBe('quotation_trace');
    expect(tools.resolve('nope')).toBeNull();
  });
  it('naming rule: _search tools take words (query), _lookup tools take one known item', () => {
    for (const n of tools.publicNames()) {
      const e = tools.REGISTRY[n];
      if (n.endsWith('_search')) expect(['query', 'title'], n).toContain(e.input.required[0]);
      if (n.endsWith('_lookup')) expect(e.input.required, n).not.toContain('query');
    }
  });
  it('every public tool has a label, purpose, input, output and example', () => {
    for (const n of tools.publicNames()) {
      const e = tools.REGISTRY[n];
      for (const k of ['label', 'purpose', 'input', 'output', 'example', 'outputName']) expect(e[k], `${n}.${k}`).toBeTruthy();
    }
  });
  it('run() rejects an unknown name with code unknown_tool', async () => {
    await expect(tools.run('nope', {})).rejects.toMatchObject({ code: 'unknown_tool' });
  });
});

describe('each search tool calls only its own layer', () => {
  for (const [name, fn] of [['literal_search', 'searchKeywordQdrant'], ['phrase_search', 'searchPhrases'], ['hype_search', 'searchHypeQdrant']]) {
    it(`${name} → ${fn}`, async () => {
      const deps = layerDeps();
      const r = await tools.run(name, { query: 'one country', limit: 5 }, { deps });
      expect(deps[fn]).toHaveBeenCalledTimes(1);
      for (const other of LAYERS.filter((x) => x !== fn)) expect(deps[other]).not.toHaveBeenCalled();
      expect(r.passages[0]).toMatchObject({ id: 7, document_id: 3, paragraph_index: 2, title: 'Gleanings', source_url: 'https://oceanlibrary.com/g#p2', score: 0.9 });
    });
  }
  it('filters pass through to the layer in search.js keys', async () => {
    const deps = layerDeps();
    const filters = { tradition: "Baha'i", collection: 'Core', author: 'Shoghi Effendi', writerOnly: true, language: 'en', documentId: 3, yearFrom: 1920, yearTo: 1957 };
    await tools.run('literal_search', { query: 'x', filters }, { deps });
    const want = { religion: "Baha'i", collection: 'Core', author: 'Shoghi Effendi', writerOnly: true, language: 'en', documentId: 3, yearFrom: 1920, yearTo: 1957 };
    expect(deps.resolveQdrantFilters).toHaveBeenCalledWith(want);
    expect(deps.searchKeywordQdrant).toHaveBeenCalledWith('x', expect.objectContaining({ filters: want, limit: 8 }));
  });
  it('combined_search calls the planned search with the filters; fused_search the fast engine', async () => {
    const search = vi.fn(async () => ({ passages: [{ id: 1, text: 't' }] })), fastSearch = vi.fn(async () => [{ id: 2, text: 'u' }]);
    const r = await tools.run('combined_search', { query: 'q', filters: { author: 'X', documentId: 9, yearFrom: 1900 } }, { search, fastSearch });
    expect(fastSearch).not.toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'q', mode: 'passages', limit: 8, author: 'X', document_id: 9, yearFrom: 1900 }));
    expect(r.passages).toEqual([{ id: 1, text: 't' }]);
    const f = await tools.run('fused_search', { query: 'q', tradition: 'Islam', filters: { language: 'ar' } }, { search, fastSearch });
    expect(fastSearch).toHaveBeenCalledWith('q', 'Islam', 8, { language: 'ar' });
    expect(search).toHaveBeenCalledTimes(1);
    expect(f.passages[0].id).toBe(2);
  });
  it('originals_search is the fast engine held to the doctrinal writers in the ar-fa group (11-04)', async () => {
    const fastSearch = vi.fn(async () => [{ id: 5, text: 'يا معشر الملوك', language: 'ar' }]);
    const r = await tools.run('originals_search', { query: 'kings burden their subjects' }, { fastSearch });
    expect(fastSearch).toHaveBeenCalledWith('kings burden their subjects', "Baha'i", 6, { author: ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'], writerOnly: true, language: 'fa' });
    expect(r.passages[0].language).toBe('ar');
  });
  it('quotation_trace hands sourceHunt the phrase_search and literal_search layers', async () => {
    const deps = layerDeps();
    const sourceHunt = vi.fn(async (q, d) => { await d.phrases('a', {}); await d.keyword('b', {}); return null; });
    expect(await tools.run('quotation_trace', { quotation: 'q' }, { deps, sourceHunt })).toEqual({ passages: [] });
    expect(deps.searchPhrases).toHaveBeenCalledWith('a', {});
    expect(deps.searchKeywordQdrant).toHaveBeenCalledWith('b', {});
    expect(deps.searchHypeQdrant).not.toHaveBeenCalled();
  });
});

describe('callers list tools only from the registry', () => {
  it('researcher and agent tool definitions are the registry’s, under canonical names', () => {
    expect(TOOLS).toEqual(tools.llmTools(RESEARCH_TOOL_NAMES));
    expect(AGENT_TOOLS).toEqual(tools.llmTools(AGENT_TOOL_NAMES));
    for (const t of [...TOOLS, ...AGENT_TOOLS]) {
      expect(tools.REGISTRY[t.function.name], t.function.name).toBeTruthy();
      expect(tools.ALIASES[t.function.name]).toBeUndefined();
    }
    expect(RESEARCH_TOOL_NAMES).toContain('combined_search');
    expect(AGENT_TOOL_NAMES).toContain('fused_search');
    expect(AGENT_TOOL_NAMES).not.toContain('combined_search');
  });
  it('a model calling an old name still reaches the tool', async () => {
    const search = vi.fn(async () => [{ id: 1, text: 'love is light', title: 'T', author: 'A', document_id: 1 }]);
    let n = 0;
    const create = vi.fn(async () => (n++ === 0
      ? { choices: [{ message: { tool_calls: [{ id: 'a', function: { name: 'search_library', arguments: '{"query":"love"}' } }] } }] }
      : { choices: [{ message: { content: 'BRIEF:\nReaching for: love\n- x P1\nKEEP: P1' } }] }));
    const r = await research({ messages: [{ role: 'user', content: 'love?' }], create, tools: { search } });
    expect(search).toHaveBeenCalledWith('love', undefined);
    expect(r.steps[0]).toMatchObject({ tool: 'search_library', found: 1 });
  });
  it('libraryTools runs through the registry (combined_search → the planned search)', async () => {
    const search = vi.fn(async () => ({ passages: [{ id: 1, text: 'x', title: 'T' }] }));
    const out = await libraryTools({ search }).search('what is love', "Baha'i");
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'what is love', plan: { messages: [{ role: 'user', content: 'what is love' }], defaults: { religion: "Baha'i" } } }));
    expect(out[0]).toMatchObject({ id: 1, text: 'x', title: 'T' });
  });
});

describe('turn labels', () => {
  it('label() names canonical and alias alike', () => {
    expect(tools.label('rendering_lookup')).toBe('Rendering Lookup (CTAI)');
    expect(tools.label('word_study')).toBe('Rendering Lookup (CTAI)');
    expect(tools.label('literal_search')).toBe('Literal Search (BM25)');
  });
});

describe('context_lookup reads by paragraph_index, not a row offset (11-03: a read at 455 returned 542–554)', () => {
  it('asks the repo for the paragraphs around the index itself; a copyrighted book is not read', async () => {
    const around = vi.fn(async (doc, at, { before, after }) => Array.from({ length: before + after + 1 }, (_, k) => ({ id: at - before + k, paragraph_index: at - before + k, text: `p${at - before + k}` })));
    const deps = { encumberedAmong: async () => new Set(), getParagraphsAround: around, getLinkMeta: async () => new Map([[9, { title: 'Dawn-Breakers' }]]), withLinks: async (r) => r.map(() => ({ url: null })) };
    const r = await tools.run('context_lookup', { document_id: 9, paragraph_index: 455, before: 2, after: 3 }, { deps });
    expect(around).toHaveBeenCalledWith(9, 455, { before: 2, after: 3 });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([453, 454, 455, 456, 457, 458]);
    const enc = await tools.run('context_lookup', { document_id: 9, paragraph_index: 455 }, { deps: { ...deps, encumberedAmong: async () => new Set([9]) } });
    expect(enc).toEqual({ passages: [], copyright: true });
  });
});
