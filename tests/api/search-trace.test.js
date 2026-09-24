/**
 * SEARCH TRACE: one row per search, detailed enough to reconstruct WHY it returned what it did.
 *
 * Chad: "search quality is vitally important so we need to be able to iterate and improve and we can only do
 * that if we have very good metrics and paths of search strategy and timings."
 *
 * What existed before: search_log with (query, result_count, duration_ms, search_type, filters). No layer
 * breakdown, no per-stage timings, no cache status, no engine version. And SOURCE_STATS — which DOES track
 * whether HyPE or the main index led — lived only in process memory, so it was lost on every restart and
 * could never be queried. That is why a day was spent guessing whether HyPE contributed to a given search.
 *
 * A trace must answer, for any single search: which layers ran, which one FOUND the top hit, what the filters
 * were and where they came from, where the milliseconds went, whether it was served from cache, and at which
 * engine version — so a quality change can be attributed instead of argued about.
 */
import { describe, it, expect } from 'vitest';
import { buildTrace, summarizeTraces } from '../../api/lib/search-trace.js';

const base = {
  endpoint: 'public.search',
  query: 'the nature of the soul',
  searchVersion: '2026-09-24.1',
  timings: { total: 940, main: 210, hype: 180, entity: 0, rerank: 12, llm: 520 },
  layers: { main: 20, hype: 14, entity: 0 },
  hits: [{ doc_id: 21308, title: 'The Dawn-Breakers', authority: 9, _layerRanks: { main: 4, hype: 0, entity: null } }],
};

describe('buildTrace', () => {
  it('records which layer FOUND the top hit — the question SOURCE_STATS could not answer after a restart', () => {
    const t = buildTrace(base);
    expect(t.top1_layer).toBe('hype');       // hype rank 0 beat main rank 4
    expect(t.hype_led).toBe(1);
  });

  it('credits main when it led', () => {
    const t = buildTrace({ ...base, hits: [{ doc_id: 1, _layerRanks: { main: 0, hype: 3, entity: null } }] });
    expect(t.top1_layer).toBe('main');
    expect(t.hype_led).toBe(0);
  });

  it('keeps per-stage timings, not just a total — "where did the 940ms go"', () => {
    const t = JSON.parse(buildTrace(base).timings_json);
    expect(t.main).toBe(210);
    expect(t.hype).toBe(180);
    expect(t.llm).toBe(520);
    expect(t.total).toBe(940);
  });

  it('records WHERE the filters came from, so inferred scope can be audited separately', () => {
    const t = buildTrace({ ...base, filters: { religion: "Baha'i" }, filtersSource: 'inferred' });
    expect(t.filters_source).toBe('inferred');
    expect(JSON.parse(t.filters_json)).toEqual({ religion: "Baha'i" });
  });

  it('records cache status and engine version — a fix is invisible if answers come from cache', () => {
    const t = buildTrace({ ...base, cacheStatus: 'hit-stale' });
    expect(t.cache_status).toBe('hit-stale');
    expect(t.search_version).toBe('2026-09-24.1');
  });

  it('flags a ZERO-RESULT search — the failure mode that reads as "the corpus does not have it"', () => {
    const t = buildTrace({ ...base, hits: [], layers: { main: 0, hype: 0, entity: 0 } });
    expect(t.result_count).toBe(0);
    expect(t.top1_layer).toBe('none');
  });

  it('records relaxation, so a widened answer can be explained after the fact', () => {
    const t = buildTrace({ ...base, relaxed: ['documentId'] });
    expect(t.widened).toBe(1);
    expect(JSON.parse(t.relaxed_json)).toEqual(['documentId']);
  });

  it('never throws on a partial input — tracing must not be able to break a search', () => {
    expect(() => buildTrace({})).not.toThrow();
    expect(buildTrace({}).result_count).toBe(0);
  });
});

describe('summarizeTraces — the aggregate a dev agent reads', () => {
  const rows = [
    { total_ms: 900, result_count: 5, top1_layer: 'hype', cache_status: 'miss', endpoint: 'public.search' },
    { total_ms: 7300, result_count: 5, top1_layer: 'main', cache_status: 'miss', endpoint: 'public.search' },
    { total_ms: 300, result_count: 0, top1_layer: 'none', cache_status: 'hit-fresh', endpoint: 'public.search' },
  ];
  const s = summarizeTraces(rows);

  it('reports p50 and p95 latency', () => {
    expect(s.latency.p50).toBe(900);
    expect(s.latency.p95).toBeGreaterThanOrEqual(900);
  });

  it('reports the ZERO-RESULT rate — the single most important quality number', () => {
    expect(s.zero_result_rate).toBeCloseTo(1 / 3, 2);
  });

  it('reports which layer leads, so HyPE value is measured not assumed', () => {
    expect(s.top1_layer.hype).toBe(1);
    expect(s.top1_layer.main).toBe(1);
  });

  it('reports cache hit rate', () => {
    expect(s.cache_hit_rate).toBeCloseTo(1 / 3, 2);
  });
});
