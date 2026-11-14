// Anís tools registry (tools.js): one name = one function; each search tool calls only its own layer; filters pass through;
// researcher/agent list only registry tools; old names are input-only aliases. All layers mocked (ctx.deps).
import { describe, it, expect, vi } from 'vitest';
import * as tools from '../../api/lib/assistant/tools.js';
import { TOOLS, RESEARCH_TOOL_NAMES, research, libraryTools } from '../../api/lib/assistant/researcher.js';
import { combinedSearch } from '../../api/lib/assistant/combined-search.js';
import { AGENT_TOOLS, AGENT_TOOL_NAMES } from '../../api/lib/assistant/agent.js';

const LAYERS = ['searchKeywordQdrant', 'searchPhrases', 'searchHypeQdrant'];
const layerDeps = () => {
  const d = Object.fromEntries(LAYERS.map((n) => [n, vi.fn(async () => ({ hits: [{ paragraph_id: 7, score: 0.9 }] }))]));
  return { ...d, resolveQdrantFilters: vi.fn(async (f) => f), paragraphsByIds: vi.fn(async () => [{ id: 7, doc_id: 3, paragraph_index: 2, text: 'the earth is but one country', title: 'Gleanings', author: "Bahá'u'lláh" }]),
    withLinks: vi.fn(async (h) => h.map((x) => ({ ...x, url: 'https://oceanlibrary.com/g#p2' }))) };
};

describe('registry', () => {
  it('names are unique, every one is a contract tool, and the retired names are gone', () => {
    const names = Object.keys(tools.REGISTRY);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(tools.REGISTRY[n].cost, n).toMatchObject({ llm: false });
    for (const gone of ['combined_search', 'search_library', 'planned_search', 'quotation_trace', 'web_search', 'comparison', 'understanding']) { expect(tools.REGISTRY[gone], gone).toBeUndefined(); }
    expect(tools.resolve('nope')).toBeNull();
  });
  it('naming rule: _search tools take words (query), _lookup tools take one known item', () => {
    for (const n of tools.publicNames()) {
      const e = tools.REGISTRY[n];
      if (n === 'talk_search') { expect(Object.keys(e.input.properties), n).toEqual(['speaker', 'topic', 'title']); continue; }   // named fields, at least one (checked in run)
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
  it('fused_search takes its filters inside filters and calls the fast engine; the rollback combined_search is its own module', async () => {
    const fastSearch = vi.fn(async () => [{ id: 2, text: 'u' }]);
    const f = await tools.run('fused_search', { query: 'q', filters: { tradition: 'Islam', language: 'ar' } }, { fastSearch });
    expect(fastSearch).toHaveBeenCalledWith('q', 'Islam', 8, expect.objectContaining({ language: 'ar' }));
    expect(f.passages[0].id).toBe(2);
    const search = vi.fn(async () => ({ passages: [{ id: 1, text: 't' }] }));
    const r = await combinedSearch({ query: 'q', filters: { author: 'X', documentId: 9, yearFrom: 1900 } }, { search });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ query: 'q', mode: 'passages', limit: 8, author: 'X', document_id: 9, yearFrom: 1900 }));
    expect(r.passages).toEqual([{ id: 1, text: 't' }]);
  });
  it('an authority shelf without scripture excludes the Writings IN the engine, before ranking (history shelf, 11-10)', async () => {
    const fastSearch = vi.fn(async () => [{ id: 3, text: 'Mullá Ḥusayn', title: 'The Dawn-Breakers', author: 'Nabil Zarandi', religion: "Baha'i", document_id: 21308 }]);
    const f = await tools.run('fused_search', { query: 'death of Mullá Ḥusayn', filters: { tradition: "Baha'i", authority: ['history', 'scholarship', 'interpretation'] } }, { fastSearch });
    const extra = fastSearch.mock.calls[0][3];
    expect(extra.notAuthor).toEqual(expect.arrayContaining(['bahaullah', 'thebab', 'abdulbaha']));
    expect(extra.notAuthor).not.toContain('shoghieffendi');   // interpretation asked: God Passes By stays
    expect(f.passages.map((p) => p.document_id)).toEqual([21308]);
    fastSearch.mockClear();
    await tools.run('fused_search', { query: 'q', filters: { tradition: "Baha'i", authority: ['scripture'] } }, { fastSearch });
    expect(fastSearch.mock.calls[0][3]?.notAuthor).toEqual(['shoghieffendi']);
    fastSearch.mockClear();
    await tools.run('fused_search', { query: 'q', filters: { tradition: "Baha'i" } }, { fastSearch });
    expect(fastSearch.mock.calls[0][3]?.notAuthor).toBeUndefined();
  });
  it('one work holds at most a third of a shelf no work was asked for; the overflow refills the tail; a work search is uncapped (11-10 Star of the West)', async () => {
    const sotw = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, text: `periodical ${i}`, title: 'Star of the West', document_id: 15199 + i }));
    const fastSearch = vi.fn(async () => [...sotw, { id: 9, text: 'The martyrdom of the Báb took place at noon', title: 'The Dawn-Breakers', document_id: 21308 }]);
    let f = await tools.run('fused_search', { query: 'q', limit: 6, filters: { tradition: "Baha'i" } }, { fastSearch });
    expect(f.passages.map((p) => p.id)).toEqual([100, 101, 9, 102, 103, 104]);
    f = await tools.run('fused_search', { query: 'q', limit: 6, filters: { tradition: "Baha'i", documentId: 15199 } }, { fastSearch });
    expect(f.passages.map((p) => p.id)).toEqual([100, 101, 102, 103, 104, 105]);
  });
  it('originals_search is the fast engine held to the doctrinal writers in the ar-fa group (11-04)', async () => {
    const fastSearch = vi.fn(async () => [{ id: 5, text: 'يا معشر الملوك', language: 'ar' }]);
    const r = await tools.run('originals_search', { query: 'kings burden their subjects' }, { fastSearch });
    expect(fastSearch).toHaveBeenCalledWith('kings burden their subjects', "Baha'i", 6, { author: ['bahaullah', 'thebab', 'abdulbaha', 'shoghieffendi'], writerOnly: true, language: 'fa' });
    expect(r.passages[0].language).toBe('ar');
  });
  it('quotation_candidates hands sourceHunt the phrase_search and literal_search layers', async () => {
    const deps = layerDeps();
    const sourceHunt = vi.fn(async (q, d) => { await d.phrases('a', {}); await d.keyword('b', {}); return null; });
    expect(await tools.run('quotation_candidates', { quotation: 'q' }, { deps, sourceHunt })).toEqual({ passages: [] });
    expect(deps.searchPhrases).toHaveBeenCalledWith('a', {});
    expect(deps.searchKeywordQdrant).toHaveBeenCalledWith('b', {});
    expect(deps.searchHypeQdrant).not.toHaveBeenCalled();
  });
  // round 5: the source passage is credited to its OWN writer — the quote's voice (quoteAuthor) names only the original tablet's writer
  it('quotation_candidates: the source keeps its own writer and place; the quoted voice is the tablet\'s writer only', async () => {
    const sourceHunt = async () => ({ quoteAuthor: 'Bahá’u’lláh', citedBy: [],
      origin: { id: 9, documentId: 90, title: 'A Study', author: 'Christopher George Buck', text: 'q', url: 'https://x/s#p1', religion: 'Christian', locator: '#117.2' },
      tablet: { certain: true, documentId: 77, title: 'Lawḥ-i-Maqṣúd', text: 'ع', url: 'https://oceanoflights.org/m#p4' } });
    const deps = { ...layerDeps(), getLinkMeta: async () => new Map() };
    const r = await tools.run('quotation_candidates', { quotation: 'q' }, { deps, sourceHunt, sourceHuntMod: null });
    const src = r.passages.find((p) => p.role === 'source'), orig = r.passages.find((p) => p.role === 'original');
    expect(src.author).toBe('Christopher George Buck');
    expect(src.place).toBe('#117.2');
    expect(orig.author).toBe('Bahá’u’lláh');
  });
});

describe('callers list tools only from the registry', () => {
  it('researcher and agent tool definitions are the registry’s, under canonical names', () => {
    expect(TOOLS.map((x) => x.function.name)).toEqual(RESEARCH_TOOL_NAMES);
    expect(TOOLS.filter((x) => x.function.name !== 'combined_search')).toEqual(tools.llmTools(RESEARCH_TOOL_NAMES.filter((n) => n !== 'combined_search')));   // combined_search = the respond@3 rollback planner only
    expect(AGENT_TOOLS).toEqual(tools.llmTools(AGENT_TOOL_NAMES));
    for (const t of [...TOOLS, ...AGENT_TOOLS]) {
      if (t.function.name !== 'combined_search') expect(tools.REGISTRY[t.function.name] || tools.PROCESS[t.function.name], t.function.name).toBeTruthy();
    }
    expect(RESEARCH_TOOL_NAMES).toContain('combined_search');
    expect(AGENT_TOOL_NAMES).toContain('fused_search');
    expect(AGENT_TOOL_NAMES).not.toContain('combined_search');
  });
  it('libraryTools.search runs fused_search with the tradition as a filter', async () => {
    const fastSearch = vi.fn(async () => [{ id: 1, text: 'x', title: 'T' }]);
    const out = await libraryTools({ fastSearch }).search('what is love', "Baha'i");
    expect(fastSearch).toHaveBeenCalled();
    expect(fastSearch.mock.calls[0][0]).toBe('what is love');
    expect(out[0]).toMatchObject({ id: 1, text: 'x', title: 'T' });
  });
});

describe('turn labels', () => {
  it('label() names the canonical tool', () => {
    expect(tools.label('rendering_lookup')).toBeTruthy();
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
