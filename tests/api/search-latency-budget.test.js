// Search latency contract (api/lib/search/latency-budget.js; Chad 11-03 "we keep fixing it then it keeps being slow again").
// 1. Every stage the engine or the planned search stamps has a budget — a new stamp without one fails here.
// 2. The pure summaries / alarm verdicts.
// 3. Pure-CPU hot-path stages on production-sized synthetic input stay inside generous budgets (catches an O(n) per-query
//    scan creeping back: the concept layer's 29k-symbol scan cost ~300 ms of blocked event loop per engine call, 11-03).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENGINE_BUDGETS, PLANNED_BUDGETS, QDRANT_CALL_MS, engineStages, plannedStages, summarizeStages, summarizeTraceRows,
  latencyBreaches, latencyChecks, budgetFor } from '../../api/lib/search/latency-budget.js';

const ROOT = join(import.meta.dirname, '..', '..');
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

describe('every stamped stage has a budget', () => {
  it('engine: each timed(...) layer and each _timings key in multiIndexSearch', () => {
    const s = src('api/lib/search.js');
    const timed = [...s.matchAll(/timed\('([a-z_]+)'/g)].map((m) => m[1]);
    const line = s.slice(s.indexOf('const timings = { ...(_stamp)'), s.indexOf('const layerCounts'));
    const keys = [...line.matchAll(/\b([a-z_]+):/g)].map((m) => m[1]).filter((k) => !['qdrant_calls', 'qdrant_by'].includes(k));
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
    expect(stages).toEqual(expect.arrayContaining(['plan', 'search', 'total', 'passages', 'resolve']));
    expect(stages.filter((k) => !PLANNED_BUDGETS[k])).toEqual([]);
  });
  it('any one Qdrant call: 10 ms (Chad, fixed); every budget is a positive number with a note', () => {
    expect(QDRANT_CALL_MS).toBe(10);
    for (const b of [...Object.values(ENGINE_BUDGETS), ...Object.values(PLANNED_BUDGETS)]) { expect(b.ms).toBeGreaterThan(0); expect(b.note).toBeTruthy(); }
    expect(PLANNED_BUDGETS.total.ms).toBe(1000);
    expect(budgetFor('engine', 'qdrant:phrases_f16')).toBe(10);
  });
});

describe('summaries', () => {
  it('engineStages keeps budgeted numbers and splits qdrant_by per collection; plannedStages drops _ms', () => {
    expect(engineStages({ embed: 300, merge: 50, total: 500, qdrant: 12, qdrant_calls: 5, qdrant_by: { phrases: 12, hype: 7 }, junk: 3 }))
      .toEqual({ embed: 300, merge: 50, total: 500, qdrant: 12, 'qdrant:phrases': 12, 'qdrant:hype': 7 });
    expect(plannedStages({ plan_ms: 200, total_ms: 900, named_timeout: true, engine: [] })).toEqual({ plan: 200, total: 900 });
  });
  it('summarizeStages: p50/p95/max per stage, worst ratio to budget first', () => {
    const rows = summarizeStages('engine', Array.from({ length: 20 }, (_, i) => ({ total: 100 + i * 10, qdrant: 5 + i })));
    expect(rows[0].stage).toBe('qdrant');   // p95 24 / 10 beats total 290 / 600
    expect(rows[0]).toMatchObject({ n: 20, p95: 23, max: 24, budget: 10, over: true });
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
    const sum = { engine: summarizeStages('engine', many({ total: 1000, embed: 700, qdrant: 30 })), planned: summarizeStages('planned', many({ total: 1200 })) };
    const b = latencyBreaches(sum);
    expect(b.map((x) => x.kind)).toEqual(['engine']);   // planned 1200 ≤ 1500
    expect(b[0].detail).toMatch(/engine search p95 1000 ms vs 600/);
    expect(b[0].causes.join()).toMatch(/qdrant p95 30\/10/);
    expect(latencyBreaches({ engine: summarizeStages('engine', [{ total: 5000 }]) })).toEqual([]);   // 1 sample: no verdict
  });
  it('system-check verdict: first sighting = warn (weekly), two checks running = critical; quiet = one info line', () => {
    const many = (t) => Array.from({ length: 25 }, () => t);
    const slow = { engine: summarizeStages('engine', many({ total: 1000 })), planned: [] };
    expect(latencyChecks(slow, []).checks[0]).toMatchObject({ name: 'Search latency (engine)', ok: false, level: 'warn' });
    const v = latencyChecks(slow, ['engine']);
    expect(v.checks[0].level).toBe('critical');
    expect(v.slow).toEqual(['engine']);
    const stageOnly = latencyChecks({ engine: summarizeStages('engine', many({ total: 400, qdrant: 20 })), planned: [] }, []);
    expect(stageOnly.checks).toEqual([expect.objectContaining({ name: 'Search stage budgets', level: 'warn' })]);
    const fine = latencyChecks({ engine: summarizeStages('engine', many({ total: 400, qdrant: 8 })), planned: [] }, ['engine']);
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
