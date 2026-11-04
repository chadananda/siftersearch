// strategy-stats-repo (strategy graph Phase 2): the step-event log (buffered, one transaction per flush), branch hashing,
// the stats math against a fixture store + injected judge quality, Jev accuracy per decision step, and the logging overhead.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { setStatsDb, logTurnRuns, logToolRun, flushStepRuns, branchOf, branchHash, pct, judgeScore, qualityByTurn,
  strategyStats, branchStats, stepStats, toolStats, activityStats } from '../../api/lib/repos/strategy-stats-repo.js';

let db;
beforeEach(() => { db = openStrategiesDb(':memory:'); resetStrategiesCache({ db }); setStatsDb(db); });
afterAll(() => { setStatsDb(null); resetStrategiesCache(); });

const stepKeys = () => [...catalog().steps.byKey.keys()];
const trace = (edges, ms = 10) => { const k = stepKeys(); return edges.map((edge, i) => ({ node: `n${i}`, step: k[i % k.length], ms, edge })); };

describe('branch', () => {
  it('is the ordered node:edge list; the hash is stable and order-sensitive', () => {
    const b = branchOf([{ node: 'a', edge: 'found' }, { node: 'b', edge: null }]);
    expect(b).toEqual(['a:found', 'b:']);
    expect(branchHash(b)).toBe(branchHash(['a:found', 'b:']));
    expect(branchHash(b)).toMatch(/^[0-9a-f]{12}$/);
    expect(branchHash(['b:', 'a:found'])).not.toBe(branchHash(b));
  });
});

describe('step_runs write + flush', () => {
  it('buffers, then writes step, turn and tool rows in one flush, resolving each step\'s activity', () => {
    const t = trace(['ok', 'found']);
    Object.defineProperty(t[1], 'jevCalls', { value: [{ id: 7 }, { id: 9 }], enumerable: false });
    expect(logTurnRuns({ turnId: 'th1:1', runs: [{ graph: 'respond@1', trace: t }], usd: 0.01 })).toBe(1);
    logToolRun({ tool: 'document_search', ms: 12.345, ok: true, turnId: 'th1:1' });
    expect(db.prepare('SELECT COUNT(*) n FROM step_runs').get().n).toBe(0);   // nothing written on the reply path
    expect(flushStepRuns()).toBe(4);
    const steps = db.prepare('SELECT * FROM step_runs ORDER BY rowid').all();
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ turn_id: 'th1:1', strategy_id: 'respond', strategy_version: 1, node: 'n0', edge: 'ok', ok: 1 });
    expect(steps[0].activity).toBe(catalog().steps.byKey.get(t[0].step).activity);
    expect(steps[1].jev_ids).toBe('7,9');
    const turn = db.prepare('SELECT * FROM turn_runs').get();
    expect(turn).toMatchObject({ turn_id: 'th1:1', branch: 'n0:ok>n1:found', branch_hash: branchHash(['n0:ok', 'n1:found']), ms: 20, usd: 0.01 });
    expect(db.prepare('SELECT tool, ms, ok FROM tool_runs').get()).toEqual({ tool: 'document_search', ms: 12.35, ok: 1 });
    expect(flushStepRuns()).toBe(0);
  });

  it('prunes rows past 90 days on flush', () => {
    const old = Date.now() - 91 * 86400_000;
    logTurnRuns({ turnId: 'old:1', runs: [{ graph: 'respond@1', trace: trace(['ok']) }], at: old });
    flushStepRuns({ now: old });   // first flush prunes relative to its own clock; nothing older than that
    expect(db.prepare('SELECT COUNT(*) n FROM turn_runs').get().n).toBe(1);
    setStatsDb(db);                // a fresh module state would prune again; simulate the 6 h tick with a later clock
    logToolRun({ tool: 'x', ms: 1 });
    flushStepRuns({ now: Date.now() + 7 * 3600_000 });
    expect(db.prepare('SELECT COUNT(*) n FROM turn_runs').get().n).toBe(0);
  });

  it('a store that cannot be written turns logging off instead of throwing', () => {
    logToolRun({ tool: 'x', ms: 1 });
    db.close();
    expect(() => flushStepRuns()).not.toThrow();
    expect(logTurnRuns({ turnId: 'a:1', runs: [{ graph: 'respond@1', trace: trace(['ok']) }] })).toBe(0);
  });
});

describe('stats math', () => {
  const at = Date.now() - 3600_000;
  const seed = () => {
    // respond@1: 3 turns on branch A (10/20/30 ms per step×2), 1 on branch B; prayer@1: 1 turn (shared turn id with respond)
    logTurnRuns({ turnId: 't:1', runs: [{ graph: 'respond@1', trace: trace(['ok', 'found'], 10) }], usd: 0.02, at });
    logTurnRuns({ turnId: 't:2', runs: [{ graph: 'respond@1', trace: trace(['ok', 'found'], 20) }], usd: 0.04, at });
    logTurnRuns({ turnId: 't:3', runs: [{ graph: 'respond@1', trace: trace(['ok', 'found'], 30) }], usd: null, at });
    logTurnRuns({ turnId: 't:4', runs: [{ graph: 'respond@1', trace: trace(['ok', 'empty'], 50) }, { graph: 'prayer@2', trace: trace(['found'], 5) }], usd: 0.1, at });
    flushStepRuns();
  };
  const quality = new Map([
    ['t:1', { verdict: 'pass', weak: false, score: 9, classes: [] }],
    ['t:2', { verdict: 'weak', weak: true, score: 4, classes: ['missed_source'] }],
    ['t:3', { verdict: 'pass', weak: false, score: null, classes: [] }],   // judged before scores existed
    ['t:4', { verdict: 'weak', weak: true, score: 3, classes: ['missed_source', 'format'] }],
  ]);

  it('per strategy: share of distinct turns, p50/p95, $/turn, judged, n_scored, mean score, weak %, top defects', () => {
    seed();
    const s = strategyStats({ days: 7, quality });
    const r = s.find((x) => x.key === 'respond@1'), p = s.find((x) => x.key === 'prayer@2');
    expect(r).toMatchObject({ turns: 4, share: 1, p50_ms: 40, p95_ms: 100, judged: 4, n_scored: 3, score: 5.33, weak_pct: 50 });
    expect(r.usd_per_turn).toBeCloseTo((0.02 + 0.04 + 0.1) / 3, 5);
    expect(r.top_defects[0]).toEqual({ class: 'missed_source', n: 2 });
    expect(p).toMatchObject({ turns: 1, share: 0.25, n_scored: 1, score: 3, weak_pct: 100 });
  });

  it('per branch: grouped by hash, share of the strategy\'s turns', () => {
    seed();
    const b = branchStats('respond', { days: 7, quality });
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ branch: ['n0:ok', 'n1:found'], turns: 3, share: 0.75, n_scored: 2, score: 6.5, versions: [1] });
    expect(b[1]).toMatchObject({ branch: ['n0:ok', 'n1:empty'], turns: 1, share: 0.25 });
    expect(branchStats('respond', { days: 7, version: 9, quality })).toEqual([]);
  });

  it('per step: runs, edges, and Jev accuracy against gold for decision steps', () => {
    const t = trace(['yes']);
    Object.defineProperty(t[0], 'jevCalls', { value: [{ id: 1 }, { id: 2 }, { id: 3 }], enumerable: false });
    logTurnRuns({ turnId: 'j:1', runs: [{ graph: 'respond@1', trace: t }], at });
    flushStepRuns();
    const gold = { 1: { correct: 1 }, 2: { correct: 0 }, 3: { correct: null } };
    const [st] = stepStats({ days: 7, callById: (id) => gold[id] });
    expect(st).toMatchObject({ runs: 1, errors: 0, edges: { yes: 1 }, jev: { calls: 3, labelled: 2, accuracy: 0.5 } });
  });

  it('tools and activities', () => {
    seed();
    for (const ms of [5, 10, 100]) logToolRun({ tool: 'document_search', ms, ok: ms !== 100, at });
    flushStepRuns();
    expect(toolStats({ days: 7 }).document_search).toEqual({ calls: 3, errors: 1, p50_ms: 10, p95_ms: 100 });
    const acts = activityStats({ days: 7 });
    expect(Object.values(acts).reduce((a, x) => a + x.runs, 0)).toBe(9);
  });

  it('percentile, judge score and the quality join', () => {
    expect(pct([], 50)).toBeNull();
    expect(pct([1, 2, 3, 4], 50)).toBe(2);
    expect(judgeScore({ score: 7 })).toBe(7);
    expect(judgeScore({ verdict: 'pass' })).toBeNull();
    const q = qualityByTurn(7, { forensics: () => [
      { turn_id: 'a:1', at: '2026-11-01 00:00:00', defects: [{ class: 'format' }], judge: { verdict: 'weak', classes: ['missed_source'], score: 5 } },
      { turn_id: 'b:1', at: '2026-11-01 00:00:00', defects: [], judge: { verdict: 'pass' } },
    ] });
    expect(q.get('a:1')).toMatchObject({ score: 5, verdict: 'weak', weak: true });
    expect(q.get('a:1').classes.sort()).toEqual(['format', 'missed_source']);
    expect(q.get('b:1')).toMatchObject({ score: null, verdict: 'pass', weak: false });
  });
});

describe('overhead on the reply path', () => {
  it('logTurnRuns for a 21-node turn costs well under a millisecond (writes happen later)', () => {
    const runs = [{ graph: 'respond@1', trace: trace(Array.from({ length: 21 }, () => 'ok')) }];
    for (let i = 0; i < 200; i++) logTurnRuns({ turnId: `w:${i}`, runs });   // warm
    flushStepRuns();
    const N = 2000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) { logTurnRuns({ turnId: `b:${i}`, runs }); if (i % 20 === 19) flushStepRuns(); }
    const logPlusFlushUs = Number(process.hrtime.bigint() - t0) / 1000 / N;
    flushStepRuns();
    const t1 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) logTurnRuns({ turnId: `c:${i}`, runs });
    const logOnlyUs = Number(process.hrtime.bigint() - t1) / 1000 / N;
    flushStepRuns();
    process.stderr.write(`[bench] logTurnRuns (21 steps): ${logOnlyUs.toFixed(1)} µs/turn on the reply path; with amortised flush ${logPlusFlushUs.toFixed(1)} µs/turn\n`);
    expect(logOnlyUs).toBeLessThan(1000);
  });
});
