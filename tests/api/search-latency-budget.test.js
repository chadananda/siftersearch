// Search latency contract (api/lib/search/latency-budget.js; Chad 11-03 "we keep fixing it then it keeps being slow again").
// 1. Every stage the engine or the planned search stamps has a budget — a new stamp without one fails here.
// 2. The pure summaries / alarm verdicts.
// 3. Pure-CPU hot-path stages on production-sized synthetic input stay inside generous budgets (catches an O(n) per-query
//    scan creeping back: the concept layer's 29k-symbol scan cost ~300 ms of blocked event loop per engine call, 11-03).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENGINE_BUDGETS, PLANNED_BUDGETS, CLAIMS_BUDGETS, QDRANT_CALL_MS, QDRANT_WRONG_MS, engineStages, plannedStages, summarizeStages, summarizeTraceRows,
  latencyBreaches, latencyChecks, budgetFor, slowTraces } from '../../api/lib/search/latency-budget.js';

const ROOT = join(import.meta.dirname, '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

describe('every stamped stage has a budget', () => {
  it('engine: each timed(...) layer and each _timings key in multiIndexSearch', () => {
    const s = src('api/lib/search.js');
    const timed = [...s.matchAll(/timed\('([a-z_]+)'/g)].map((m) => m[1]);
    const line = s.slice(s.indexOf('const timings = { ...(_stamp)'), s.indexOf('const layerCounts'));
    const keys = [...line.matchAll(/\b([a-z_]+):/g)].map((m) => m[1]).filter((k) => !['qdrant_calls', 'qdrant_by', 'qdrant_server_by', 'hydrate_by', 'embed_by'].includes(k));
    // the retired Meili layers (main/hype/entity/keyword) only run with Meili on; they are not budgeted stages
    const retired = new Set(['main', 'hype', 'entity', 'keyword']);
    const stages = [...new Set([...timed, ...keys])].filter((k) => !retired.has(k));
    expect(stages.length).toBeGreaterThan(12);
    expect(stages.filter((k) => !ENGINE_BUDGETS[k])).toEqual([]);
  });
  it('planned: each stages.<x>_ms and the returned timings', () => {
    const s = src('api/lib/planned-search.js');
    const stamped = [...s.matchAll(/stages\.([a-z]+)_ms\b/g), ...s.matchAll(/\b([a-z]+)_ms:/g)].map((m) => m[1]);
    const stages = [...new Set(stamped)];
    expect(stages).toEqual(expect.arrayContaining(['plan', 'jev', 'lookup', 'search', 'total', 'passages', 'resolve']));
    expect(stages.filter((k) => !PLANNED_BUDGETS[k])).toEqual([]);
  });
  it('Qdrant lookup: < 10 ms working, > 100 ms wrong (Qdrant\'s own time, qsrv); wall rows carry no budget; every budget is a positive number with a note', () => {
    expect(QDRANT_CALL_MS).toBe(10);
    expect(QDRANT_WRONG_MS).toBe(100);
    for (const b of [...Object.values(ENGINE_BUDGETS), ...Object.values(PLANNED_BUDGETS)]) { expect(b.ms).toBeGreaterThan(0); expect(b.note).toBeTruthy(); }
    expect(PLANNED_BUDGETS.total.ms).toBe(1000);
    expect(budgetFor('engine', 'qsrv:phrases_f16')).toBe(100);
    expect(budgetFor('engine', 'qdrant:phrases_f16')).toBeNull();
    expect(budgetFor('engine', 'qdrant')).toBeNull();
  });
});

describe('summaries', () => {
  it('engineStages reports Qdrant server time per collection as qsrv:<c>, judged only past 100 ms; wall qdrant:<c> is not judged', () => {
    expect(engineStages({ qdrant_by: { phrases: 30 }, qdrant_server_by: { phrases: 21.5 } })).toEqual({ 'qdrant:phrases': 30, 'qsrv:phrases': 21.5 });
    expect(summarizeStages('engine', [{ 'qsrv:phrases': 99 }])[0]).toMatchObject({ stage: 'qsrv:phrases', budget: 100, over: false });
    expect(summarizeStages('engine', [{ 'qsrv:phrases': 140 }])[0]).toMatchObject({ stage: 'qsrv:phrases', budget: 100, over: true });
    expect(summarizeStages('engine', [{ 'qdrant:phrases': 99 }])[0]).toMatchObject({ stage: 'qdrant:phrases', budget: null, over: false });
  });
  it('engineStages reports hydrate\'s split as informational hydrate:<k> rows (ids/cached counts, read/wait ms; digest #167)', () => {
    expect(engineStages({ hydrate: 90, hydrate_by: { ids: 90, cached: 60, read: 12, wait: 70 } }))
      .toEqual({ hydrate: 90, 'hydrate:ids': 90, 'hydrate:cached': 60, 'hydrate:read': 12, 'hydrate:wait': 70 });
    expect(summarizeStages('engine', [{ 'hydrate:wait': 70 }])[0]).toMatchObject({ stage: 'hydrate:wait', budget: null, over: false });
    expect(readFileSync(new URL('../../api/lib/search.js', import.meta.url), 'utf8')).toMatch(/hydrate_by: hydrateBy/);
  });
  it('engineStages reports the embed split as informational embed:<k> rows (memo hit vs real call ms / hedged / twin)', () => {
    expect(engineStages({ embed: 900, embed_by: { memo: 0, call: 880, hedged: 1, twin: 1 } }))
      .toEqual({ embed: 900, 'embed:memo': 0, 'embed:call': 880, 'embed:hedged': 1, 'embed:twin': 1 });
    expect(summarizeStages('engine', [{ 'embed:call': 880 }])[0]).toMatchObject({ stage: 'embed:call', budget: null, over: false });
  });
  it('search.js stamps qdrant_server_by from the call log', () => {
    expect(readFileSync(new URL('../../api/lib/search.js', import.meta.url), 'utf8')).toMatch(/qdrant_server_by: qdrantServerBy/);
  });
  it('engineStages keeps budgeted numbers and splits qdrant_by per collection; plannedStages drops _ms', () => {
    expect(engineStages({ embed: 300, merge: 50, total: 500, qdrant: 12, qdrant_calls: 5, qdrant_by: { phrases: 12, hype: 7 }, junk: 3 }))
      .toEqual({ embed: 300, merge: 50, total: 500, qdrant: 12, 'qdrant:phrases': 12, 'qdrant:hype': 7 });
    expect(plannedStages({ plan_ms: 200, total_ms: 900, named_timeout: true, engine: [] })).toEqual({ plan: 200, total: 900 });
  });
  it('claims sub-stages: every peopleSearch timings key has a CLAIMS_BUDGETS row; trace (flat) and live (object) forms both read', () => {
    const ps = src('api/lib/people-search.js');
    const keys = [...ps.matchAll(/\b(?:lap|timed)\('([a-z]+)'/g)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(new Set(['group', 'bio', 'entity', 'dossiers', 'total']));
    expect(keys.filter((k) => !CLAIMS_BUDGETS[k])).toEqual([]);
    expect(CLAIMS_BUDGETS.total.ms).toBe(PLANNED_BUDGETS.claims.ms);
    expect(plannedStages({ claims_ms: 90, claims_bio: 40, claims_entity: 70 })).toEqual({ claims: 90, 'claims:bio': 40, 'claims:entity': 70 });
    expect(plannedStages({ claims_timings: { group: 3, dossiers: 9, cached: true } })).toEqual({ 'claims:group': 3, 'claims:dossiers': 9 });
    expect(budgetFor('planned', 'claims:entity')).toBe(CLAIMS_BUDGETS.entity.ms);
    expect(src('api/lib/planned-search.js')).toMatch(/flat\[`claims_\$\{k\}`\]/);
  });
  it('summarizeStages: p50/p95/max per stage, worst ratio to budget first', () => {
    const rows = summarizeStages('engine', Array.from({ length: 20 }, (_, i) => ({ total: 100 + i * 10, 'qsrv:phrases': 95 + i })));
    expect(rows[0].stage).toBe('qsrv:phrases');   // p95 113 / 100 beats total 290 / 600
    expect(rows[0]).toMatchObject({ n: 20, p95: 113, max: 114, budget: 100, over: true });
    expect(rows[1]).toMatchObject({ stage: 'total', p50: 190, over: false });
  });
  it('summarizeTraceRows: planned rows by endpoint, every other endpoint is an engine call; bad JSON skipped', () => {
    const s = summarizeTraceRows([
      { endpoint: 'planned', timings_json: JSON.stringify({ plan_ms: 300, total_ms: 1200, total: 1200 }) },
      { endpoint: 'planned:topic', timings_json: JSON.stringify({ embed: 200, total: 400 }) },
      { endpoint: 'multi-index', timings_json: '{bad' },
    ]);
    expect(s.samples).toEqual({ engine: 1, planned: 1 });
    expect(s.planned.find((r) => r.stage === 'total')).toMatchObject({ p95: 1200, budget: 1000, over: true });
  });
  it('a breach is a user-visible TOTAL over budget × 1.5 with enough samples; stage overruns are its causes', () => {
    const many = (t) => Array.from({ length: 25 }, () => t);
    const sum = { engine: summarizeStages('engine', many({ total: 1000, embed: 700, 'qsrv:phrases': 130 })), planned: summarizeStages('planned', many({ total: 1200 })) };
    const b = latencyBreaches(sum);
    expect(b.map((x) => x.kind)).toEqual(['engine']);   // planned 1200 ≤ 1500
    expect(b[0].detail).toMatch(/engine search p95 1000 ms vs 600/);
    expect(b[0].causes.join()).toMatch(/qsrv:phrases p95 130\/100/);
    expect(latencyBreaches({ engine: summarizeStages('engine', [{ total: 5000 }]) })).toEqual([]);   // 1 sample: no verdict
  });
  it('system-check verdict: first sighting = warn (weekly), two checks running = critical; quiet = one info line', () => {
    const many = (t) => Array.from({ length: 25 }, () => t);
    const slow = { engine: summarizeStages('engine', many({ total: 1000 })), planned: [] };
    expect(latencyChecks(slow, []).checks[0]).toMatchObject({ name: 'Search latency (engine)', ok: false, level: 'warn' });
    const v = latencyChecks(slow, ['engine']);
    expect(v.checks[0].level).toBe('critical');
    expect(v.slow).toEqual(['engine']);
    const stageOnly = latencyChecks({ engine: summarizeStages('engine', many({ total: 400, 'qsrv:phrases': 120 })), planned: [] }, []);
    expect(stageOnly.checks).toEqual([expect.objectContaining({ name: 'Search stage budgets', level: 'warn' })]);
    const fine = latencyChecks({ engine: summarizeStages('engine', many({ total: 400, 'qsrv:phrases': 8, qdrant: 400 })), planned: [] }, ['engine']);
    expect(fine).toMatchObject({ slow: [], checks: [{ ok: true, level: 'info' }] });
  });
});

// ── pure-CPU hot-path stages on production-sized input (generous: ~5-10x the local measurement) ──────────────────────
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const WORDS = ('the of and to in that is for his he it with as was on be by this which are not from have or at all but they their '
  + 'god soul spirit light world love unity faith truth justice divine heaven earth knowledge revelation covenant prophet manifestation '
  + 'servant lord mercy grace bounty station glory peace humanity nations century cause religion teachings prayer worship detachment').split(' ');
const para = (r, n) => Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
const timeIt = (fn, reps = 5) => { fn(); const t = performance.now(); for (let i = 0; i < reps; i++) fn(); return (performance.now() - t) / reps; };

describe('CPU stages stay inside budget at production size', () => {
  it('hydrate highlighting: 150 paragraphs × ~180 words (one engine call\'s stubs) ≤ 60 ms (15 ms measured)', async () => {
    const { highlightText } = await import('../../api/lib/search/highlighting.js');
    const r = rng(3); const texts = Array.from({ length: 150 }, () => para(r, 180));
    const ms = timeIt(() => { for (const t of texts) highlightText(t, 'the unity of revelation and the station of the prophet'); });
    expect(ms).toBeLessThan(60);
  });
  it('spelling correction of known / 1-edit words against a 300k-word vocabulary ≤ 5 ms per query', async () => {
    const { correctQuery } = await import('../../api/lib/search/spell.js');
    const r = rng(5); const vocab = new Map();
    for (let i = 0; i < 300000; i++) vocab.set(Array.from({ length: 4 + Math.floor(r() * 8) }, () => String.fromCharCode(97 + Math.floor(r() * 26))).join(''), 1 + Math.floor(r() * 1000));
    for (const w of WORDS) vocab.set(w, 100000);
    const ms = timeIt(() => correctQuery('the stastion of the manifestaton and the unitty of relgion', vocab), 20);
    expect(ms).toBeLessThan(5);
  });
  it('main + hot phrase merge of 2 × 120 points and 2 × 30 groups ≤ 2 ms', async () => {
    const { mergePoints, mergeGroups } = await import('../../api/lib/search/qdrant-layers.js');
    const r = rng(9);
    const pts = (n) => Array.from({ length: n }, () => ({ id: Math.floor(r() * 5000), score: r() }));
    const grp = (n) => Array.from({ length: n }, () => ({ id: Math.floor(r() * 5000), hits: [{ score: r() }] }));
    const a = pts(120), b = pts(120), g1 = grp(30), g2 = grp(30);
    expect(timeIt(() => { mergePoints(a, b); mergeGroups(g1, g2, 30); }, 50)).toBeLessThan(2);
  });
});

describe('slowTraces: the trace ids behind a stage tail', () => {
  const row = (id, srv, endpoint = 'search') => ({ trace_id: id, endpoint, created_at: id, timings_json: JSON.stringify({ qdrant_server_by: { concepts: srv } }) });
  it('lists only rows past the judging line, slowest first', () => {
    const rows = [row(1, 8), row(2, 333), row(3, 120), row(4, 99), { trace_id: 5, endpoint: 'search', timings_json: 'bad' }];
    expect(slowTraces(rows, 'qsrv:concepts').map((r) => r.trace_id)).toEqual([2, 3]);
  });
  it('an explicit --over line and a limit', () => {
    const rows = [row(1, 8), row(2, 333), row(3, 120), row(4, 99)];
    expect(slowTraces(rows, 'qsrv:concepts', { overMs: 50, limit: 2 }).map((r) => r.ms)).toEqual([333, 120]);
  });
  it('an unjudged stage with no --over lists nothing', () => {
    const rows = [{ trace_id: 1, endpoint: 'search', created_at: 1, timings_json: JSON.stringify({ qdrant_by: { concepts: 900 } }) }];
    expect(slowTraces(rows, 'qdrant:concepts')).toEqual([]);
    expect(slowTraces(rows, 'qdrant:concepts', { overMs: 100 })[0].ms).toBe(900);
  });
});
