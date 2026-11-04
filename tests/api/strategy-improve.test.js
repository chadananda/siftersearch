// Strategy graph Phase 3: gap capture + clustering threshold, design validation (bad activity, cycle, dedupe → version), the dry
// run (no thread, billed to improve, pinned candidate runs), the promotion decision (fake Opus + fake judge: win, regress,
// guard-steal), promote/rollback, and Jev's option set read from the DB.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, recordGap, openGaps, listDesigns, listCandidates, listPromotions, pinFor, promote, rollback,
  saveCandidate, strategyRow } from '../../api/lib/repos/strategy-candidates-repo.js';
import { gapOf, clusterGaps } from '../../api/lib/assistant/strategy-gaps.js';
import { validateCandidate, designCandidate } from '../../api/lib/assistant/strategy-design.js';
import { tryStrategy, optionsWith } from '../../api/lib/assistant/strategy-try.js';
import { decidePromotion, runPromotion, scoreOf } from '../../api/lib/assistant/strategy-promote.js';
import { captureGap, designStage, promoteCandidate, promotionStage } from '../../api/lib/assistant/strategy-improve.js';
import { strategyOptions } from '../../api/lib/assistant/strategy-choice.js';
import { graphFor } from '../../api/lib/assistant/activities/graph.js';
import { template } from '../../api/lib/assistant/activities/templates.js';
import { activities as registry } from '../../api/lib/assistant/activities/index.js';
import { currentAIContext } from '../../api/lib/ai-context.js';
import { assertSpendCap, groupOf, _reset as resetSpend } from '../../api/lib/spend-caps.js';

afterEach(() => resetStrategiesCache());

const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const unsure = (choice = 'understanding', p = 0.4) => ({ decisions: [{ point: 'strategy', reason: 'low-confidence', chosen: 'other', probabilities: { [choice]: p, other: 0.35 } }] });
const sure = { decisions: [{ point: 'strategy', reason: 'confident', chosen: 'prayer', probabilities: { prayer: 0.95 } }] };

// a valid design: a param variant of strategy.understanding + its new template, one node
const GOOD = {
  name: 'timeline', description: 'The reader wants the HISTORY of a practice or institution told in order, era by era, from the passages.',
  exemplars: ['How did the Nineteen Day Feast develop over time?', 'Trace how the Huqúqu’lláh was introduced, step by step.'],
  templates: [{ id: 'timeline.how', text: 'Tell it as a TIMELINE, oldest first. {{base}}' }],
  steps: [{ id: 'timeline.order', activity: 'strategy.understanding', params: { how: 'timeline.how' } }],
  graph: { entry: 'order', nodes: { order: { step: 'timeline.order' } }, edges: [{ from: 'order', on: '*', to: '$end' }] },
};
const reply = (o) => ({ text: JSON.stringify(o), usd: 0.05 });

describe('gap capture (free) + clustering', () => {
  it('Jev unsure or a STRATEGY judge verdict is a gap; a confident pick and a non-strategy weak verdict are not', () => {
    expect(gapOf({ turnId: 't1', threadId: 'a', question: 'q', path: unsure() })).toMatchObject({ label: 'understanding', source: 'jev', reason: 'low-confidence' });
    expect(gapOf({ turnId: 't2', question: 'q', path: sure })).toBeNull();
    expect(gapOf({ turnId: 't3', question: 'q', path: sure, judge: { verdict: 'weak', stage: 'WRITER' } })).toBeNull();
    expect(gapOf({ turnId: 't4', question: 'q', path: sure, judge: { verdict: 'weak', stage: 'STRATEGY', gate: 'anis-strategy', right: 'comparison', why: 'w' } }))
      .toMatchObject({ label: 'comparison', source: 'judge', judge_why: 'w' });
  });

  it('a later judge verdict merges into the Jev gap of the same turn', () => {
    const db = fresh();
    expect(captureGap(db, { turnId: 't1', threadId: 'a', question: 'How did the Feast develop over the decades?', path: unsure() })).toBe(1);
    captureGap(db, { turnId: 't1', threadId: 'a', question: 'How did the Feast develop over the decades?', judge: { verdict: 'weak', stage: 'STRATEGY', gate: 'anis-strategy', right: 'history', why: 'needs order' } });
    expect(openGaps(db)).toHaveLength(1);
    expect(openGaps(db)[0]).toMatchObject({ source: 'jev+judge', label: 'history', judge_why: 'needs order' });
  });

  it('ready at ≥3 distinct questions from ≥2 threads; a repeated question or one thread is not enough', () => {
    const g = (turn, thread, question) => ({ turn_id: turn, thread_id: thread, label: 'understanding', question });
    const qs = ['How did the Nineteen Day Feast develop over time?', 'How did the Feast develop over the decades since 1844?', 'How did the Nineteen Day Feast develop through its history?'];
    expect(clusterGaps([g('1', 'a', qs[0]), g('2', 'b', qs[1]), g('3', 'b', qs[2])])[0]).toMatchObject({ ready: true, threads: 2 });
    expect(clusterGaps([g('1', 'a', qs[0]), g('2', 'a', qs[1]), g('3', 'a', qs[2])])[0].ready).toBe(false);          // one thread
    expect(clusterGaps([g('1', 'a', qs[0]), g('2', 'b', qs[0]), g('3', 'c', qs[1])])[0].ready).toBe(false);          // 2 distinct
    const split = clusterGaps([g('1', 'a', qs[0]), g('2', 'b', 'Which prayer is said for the departed loved ones?')]);
    expect(split).toHaveLength(2);                                                                                 // unlike questions never join
  });
});

describe('design validation (fake Opus)', () => {
  it('a valid design normalizes to new steps/templates and a graph that ends at $end', () => {
    fresh();
    const v = validateCandidate(GOOD, { cat: catalog() });
    expect(v.ok).toBe(true);
    expect(v.normalized.strategy).toMatchObject({ id: 'timeline', name: 'timeline' });
    expect(v.normalized.steps[0]).toMatchObject({ id: 'timeline.order', version: 1, template_id: 'timeline.how', template_version: 1 });
  });

  it('rejects an unknown activity, a respond.* activity, a cycle, an unrouted edge and a reused step id', () => {
    fresh();
    const cat = catalog();
    const bad = (patch) => validateCandidate({ ...GOOD, ...patch }, { cat });
    expect(bad({ steps: [{ id: 'timeline.order', activity: 'strategy.nonexistent', params: {} }] }).errors.join()).toMatch(/unknown activity/);
    const respondAct = Object.entries(registry()).find(([, a]) => a.scope !== 'strategy')[0];          // needs the respond gather state
    expect(bad({ steps: [{ id: 'timeline.order', activity: respondAct, params: {} }] }).errors.join()).toMatch(/not an executor/);
    const cyc = bad({ steps: [...GOOD.steps, { id: 'timeline.second', activity: 'strategy.comparison', params: {} }],
      graph: { entry: 'order', nodes: { order: { step: 'timeline.order' }, second: { step: 'timeline.second' } },
        edges: [{ from: 'order', on: '*', to: 'second' }, { from: 'second', on: '*', to: 'order' }] } });
    expect(cyc.ok).toBe(false);
    expect(cyc.errors.join()).toMatch(/cycle|reach|end/i);
    expect(bad({ graph: { ...GOOD.graph, edges: [{ from: 'order', on: 'found', to: '$end' }] } }).ok).toBe(false);   // 'empty' unrouted
    expect(bad({ steps: [{ id: 'strategy.prayer', activity: 'strategy.prayer', params: {} }], graph: { entry: 'n', nodes: { n: { step: 'strategy.prayer' } }, edges: [] } }).ok).toBe(false);
  });

  it('an invalid first answer gets ONE retry with the errors; two invalid → dropped', async () => {
    fresh();
    const cluster = { key: 'understanding#1', label: 'understanding', questions: ['a b c'], reasons: [] };
    const seen = [];
    const call = vi.fn(async (role, sys, user) => { seen.push(user); return seen.length === 1 ? reply({ ...GOOD, graph: { entry: 'x', nodes: {}, edges: [] } }) : reply(GOOD); });
    const ok = await designCandidate(cluster, { cat: catalog(), call });
    expect(ok).toMatchObject({ ok: true, attempts: 2, usd: 0.1 });
    expect(seen[1]).toMatch(/PREVIOUS ANSWER WAS INVALID/);
    const never = await designCandidate(cluster, { cat: catalog(), call: async () => ({ text: 'no json', usd: 0.01 }) });
    expect(never).toMatchObject({ ok: false, attempts: 2 });
  });

  it('dedupe: a design near an active strategy becomes a new candidate VERSION of it (parent = the active one)', async () => {
    const db = fresh();
    const und = catalog().strategies.find((s) => s.name === 'understanding');
    const near = { ...GOOD, name: 'understanding_deep', description: und.description };
    const qs = ['How did the Nineteen Day Feast develop over time?', 'How did the Feast develop over the decades since 1844?', 'How did the Nineteen Day Feast develop through its history?'];
    qs.forEach((q, i) => captureGap(db, { turnId: `t${i}`, threadId: `th${i % 2}`, question: q, path: unsure() }));
    const r = await designStage(db, { call: async () => reply(near) });
    expect(r).toMatchObject({ status: 'version', id: 'understanding', version: 2 });
    expect(strategyRow(db, 'understanding', 2)).toMatchObject({ status: 'candidate', parent_version: 1, name: 'understanding' });
    expect(openGaps(db)).toHaveLength(0);                                   // the cluster's gaps are closed by the design
    expect(listDesigns(db)[0]).toMatchObject({ status: 'version', strategy_id: 'understanding', version: 2 });
    expect(await designStage(db, { call: async () => { throw new Error('not called'); } })).toBe('idle');
  });
});

describe('the dry run (POST /anis/try)', () => {
  it('no thread opened, billed to improve-replay, the pinned candidate forced and runnable although not active', async () => {
    const db = fresh();
    const saved = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const pin = pinFor(db, saved.id, saved.version);
    expect(catalog({ now: Date.now() + 60_000 }).strategies.some((s) => s.id === 'timeline')).toBe(false);   // a candidate is never served
    resetSpend();
    const base = { open: vi.fn(async () => 'thread-1'), save: vi.fn() };
    let seen = null;
    const turn = async ({ deps }) => {
      const ctx = currentAIContext();
      await deps.open(); await deps.close();
      const s = await deps.strategy([{ role: 'user', content: 'q' }], {});
      // anis spend far over its cap, improve under: passes only because the scope bills improve-replay
      await assertSpendCap('anis-turn', { deps: { byCaller: async () => ({ 'anis-turn': 999, 'improve-judge': 1 }) } });
      seen = { billTo: ctx.billTo, choice: s.strategy.choice, forced: s.strategy.forced, graph: graphFor('timeline'), how: template('timeline.how') };
      ctx.meter?.push({ usd: 0.02 });
      return { reply: 'R', status: 'ok', path: { steps: ['order'] } };
    };
    const r = await tryStrategy({ question: 'q', pin, deps: { base, turn, choose: async (m, o) => ({ strategy: { choice: Object.keys(o.options).includes('timeline') ? 'timeline' : 'other' } }) } });
    expect(base.open).not.toHaveBeenCalled();
    expect(seen.billTo).toBe('improve-replay');
    expect(seen.choice).toBe('timeline');
    expect(seen.forced).toBe(true);
    expect(seen.how).toBe('Tell it as a TIMELINE, oldest first. {{base}}');
    expect(groupOf(seen.billTo)).toBe('improve');
    expect(seen.graph).toBeTruthy();
    expect(r).toMatchObject({ reply: 'R', jev_pick: 'timeline', usd: 0.02, steps: ['order'] });
    await expect(tryStrategy({ question: 'q', caller: 'anis-turn', deps: { base, turn } })).rejects.toThrow(/improve/);
  });
});

describe('promotion decision (fake Opus + fake judge, score 0-10)', () => {
  const cls = (cand, cur, pick = 'timeline', o = {}) => ({ set: 'fresh', question: `q${cand}${cur}`, cand: { score: cand, ms: 1000, usd: 0.02, jev_pick: pick, ...o }, cur: { score: cur, ms: 1000, usd: 0.02 } });
  it('win: better by the margin, no regression, Jev picks it for its class and not for guards', () => {
    const d = decidePromotion([cls(9, 7), cls(8, 7), cls(8, 8), { set: 'guard', jev_pick: 'prayer' }], { name: 'timeline' });
    expect(d.promote).toBe(true);
    expect(d.numbers).toMatchObject({ n_class: 3, jev_guard_steals: 0 });
  });
  it('regress: one question worse by more than max_regress blocks it even when the mean wins', () => {
    const d = decidePromotion([cls(10, 5), cls(10, 5), cls(4, 8)], { name: 'timeline' });
    expect(d.promote).toBe(false);
    expect(d.failed.join()).toMatch(/regression of 4/);
  });
  it('guard-steal: Jev picking it for another strategy\'s question blocks it', () => {
    const d = decidePromotion([cls(9, 6), cls(9, 6), { set: 'guard', of: 'prayer', jev_pick: 'timeline' }], { name: 'timeline' });
    expect(d.promote).toBe(false);
    expect(d.failed.join()).toMatch(/guard/);
  });
  it('slower or dearer beyond the ratio, or Jev not picking it, blocks it', () => {
    expect(decidePromotion([cls(9, 6, 'timeline', { ms: 5000 })], { name: 'timeline' }).failed.join()).toMatch(/p50/);
    expect(decidePromotion([cls(9, 6, 'timeline', { usd: 0.5 })], { name: 'timeline' }).failed.join()).toMatch(/\$\/turn/);
    expect(decidePromotion([cls(9, 6, 'other')], { name: 'timeline' }).failed.join()).toMatch(/Jev picks it for 0/);
  });
  it('scoreOf: the judge score when given, else pass 10 / weak by severity', () => {
    expect(scoreOf({ verdict: 'weak', score: 6 })).toBe(6);
    expect(scoreOf({ verdict: 'pass' })).toBe(10);
    expect(scoreOf({ verdict: 'weak', severity: 3 })).toBe(1);
  });

  it('end to end: questions (held gap questions kept out of the writer\'s set), both routes judged, promoted, ledger, rollback', async () => {
    const db = fresh();
    const saved = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const writeQuestions = vi.fn(async ({ nGuard }) => ({ class: ['c1', 'c2', 'c3'], guard: Array.from({ length: nGuard }, (_, i) => ({ strategy: 'prayer', question: `g${i}` })), usd: 0.04 }));
    const deps = { writeQuestions,
      tryTurn: async ({ question, pin }) => ({ reply: pin ? `cand ${question}` : `cur ${question}`, path: {}, ms: 900, usd: 0.02, jev_pick: pin ? 'timeline' : null }),
      judge: async ({ reply: text }) => ({ verdict: text.startsWith('cand') ? 'pass' : 'weak', score: text.startsWith('cand') ? 9 : 6, usd: 0.01 }),
      jevPick: async () => 'prayer' };
    const r = await promoteCandidate(db, { id: saved.id, version: saved.version, deps, by: 'test' });
    expect(r).toMatchObject({ promoted: true, rows: 3 + 6 });
    expect(r.usd).toBeCloseTo(0.04 + 3 * (0.02 * 2 + 0.01 * 2), 6);
    expect(strategyRow(db, 'timeline', 1).status).toBe('active');
    expect(listPromotions(db)[0]).toMatchObject({ action: 'promote', strategy_id: 'timeline', version: 1 });
    expect(JSON.stringify(listPromotions(db)[0].decision)).not.toMatch(/"c1"/);   // the ledger holds numbers, never question text
    expect(await promotionStage(db, { deps })).toBe('idle');                         // nothing left untried
    expect(rollback(db, 'timeline')).toMatchObject({ rolled_back: 1, restored: null });
  });

  it('the per-candidate $ cap stops the run (over-budget, never promoted)', async () => {
    const db = fresh();
    const saved = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const deps = { writeQuestions: async () => ({ class: ['c1', 'c2', 'c3'], guard: [], usd: 0 }),
      tryTurn: async () => ({ reply: 'x', path: {}, ms: 1, usd: 1 }), judge: async () => ({ verdict: 'pass', score: 10, usd: 0 }), jevPick: async () => null };
    const r = await runPromotion({ pin: pinFor(db, saved.id, saved.version), cat: catalog(), deps, capUsd: 3 });
    expect(r.stopped).toBe('over-budget');
    expect(r.decision.promote).toBe(false);
    expect(r.rows).toHaveLength(2);
  });
});

describe('Jev options come from the DB', () => {
  it('a promoted version appears in strategyOptions after the rev moves; rollback restores the old option text', () => {
    const db = fresh();
    const t = Date.now();
    const before = strategyOptions();
    expect(Object.keys(before).at(-1)).toBe('other');
    const und = catalog({ now: t }).strategies.find((s) => s.name === 'understanding');
    const v2 = saveCandidate(db, { strategy: { ...und, description: 'UNDERSTANDING v2: the reader wants a teaching explained, scripture first.' }, steps: [], templates: [] });
    expect(catalog({ now: t + 60_000 }) && strategyOptions().understanding).toBe(und.description);   // a candidate is not offered
    promote(db, 'understanding', v2.version);
    catalog({ now: t + 120_000 });
    expect(strategyOptions().understanding).toMatch(/^UNDERSTANDING v2/);
    expect(Object.keys(strategyOptions()).at(-1)).toBe('other');
    rollback(db, 'understanding');
    catalog({ now: t + 180_000 });
    expect(strategyOptions().understanding).toBe(und.description);
    expect(listCandidates(db, { status: 'rolled_back' }).map((c) => `${c.id}@${c.version}`)).toEqual(['understanding@2']);
  });

  it('optionsWith adds a candidate (or replaces its version\'s text), other stays last', () => {
    fresh();
    const o = optionsWith({ name: 'timeline', description: 'T' });
    expect(Object.keys(o).slice(-2)).toEqual(['timeline', 'other']);
  });
});

describe('admin routes (requireInternal)', () => {
  it('gaps, candidates, try (improve-* caller only), promote job, rollback', async () => {
    const saved = { d: process.env.DEPLOY_SECRET, i: process.env.INTERNAL_API_KEY };
    process.env.DEPLOY_SECRET = 'ik'; delete process.env.INTERNAL_API_KEY;
    const db = fresh();
    const cand = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const started = [];
    const jobs = { start: (key, fn, meta) => { started.push({ key, meta }); return { key, status: 'running' }; }, get: (key) => (key === 'k' ? { key, status: 'done' } : null) };
    const tryFake = vi.fn(async (a) => ({ reply: 'R', pinned: a.pin ? `${a.pin.id}@${a.pin.version}` : null, caller: a.caller }));
    const { default: Fastify } = await import('fastify');
    const app = Fastify();
    await app.register((await import('../../api/routes/strategies-admin.js')).default, { prefix: '/api/admin', deps: { db, jobs, tryStrategy: tryFake } });
    const h = { 'x-internal-key': 'ik' };
    expect((await app.inject({ method: 'GET', url: '/api/admin/anis/gaps' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/anis/gaps', headers: h })).json()).toMatchObject({ gaps: [], clusters: [] });
    expect((await app.inject({ method: 'GET', url: '/api/admin/anis/candidates', headers: h })).json().candidates.map((c) => c.id)).toEqual(['timeline']);
    const tried = await app.inject({ method: 'POST', url: '/api/admin/anis/try', headers: h, payload: { question: 'q', strategy: { id: 'timeline', version: cand.version } } });
    expect(tried.json()).toEqual({ reply: 'R', pinned: 'timeline@1', caller: 'improve-replay' });
    expect((await app.inject({ method: 'POST', url: '/api/admin/anis/try', headers: h, payload: { question: 'q', caller: 'anis-turn' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/admin/anis/try', headers: h, payload: { question: 'q', strategy: { id: 'nope' } } })).statusCode).toBe(404);
    const job = (await app.inject({ method: 'POST', url: '/api/admin/anis/promote', headers: h, payload: { id: 'timeline', version: 1, dry: true } })).json();
    expect(job.status).toBe('running');
    expect(started[0].meta).toMatchObject({ kind: 'strategy_promote', spec: { id: 'timeline', version: 1, dry: true } });
    expect((await app.inject({ method: 'GET', url: '/api/admin/anis/promote/k', headers: h })).json().status).toBe('done');
    expect((await app.inject({ method: 'POST', url: '/api/admin/anis/rollback', headers: h, payload: { id: 'timeline' } })).statusCode).toBe(409);   // never active
    await app.close();
    if (saved.d === undefined) delete process.env.DEPLOY_SECRET; else process.env.DEPLOY_SECRET = saved.d;
    if (saved.i !== undefined) process.env.INTERNAL_API_KEY = saved.i;
  });
});

describe('improve worker: the strategy unit runs only when judge work is idle', () => {
  it('design first, then promotion, idle when neither has work; never throws', async () => {
    const { strategyWork } = await import('../../api/workers/improve-worker.js');
    const calls = [];
    const deps = { db: {}, designStage: async () => { calls.push('design'); return 'idle'; }, promotionStage: async () => { calls.push('promote'); return { id: 'x', version: 2, promoted: false }; } };
    expect(await strategyWork({ deps })).toBe('done');
    expect(calls).toEqual(['design', 'promote']);
    expect(await strategyWork({ deps: { db: {}, designStage: async () => 'idle', promotionStage: async () => 'idle' } })).toBe('idle');
    expect(await strategyWork({ deps: { db: {}, designStage: async () => { throw new Error('boom'); } } })).toBe('idle');
    const cap = Object.assign(new Error('cap'), { code: 'SPEND_CAP', retryAfterMs: 5 });
    expect(await strategyWork({ deps: { db: {}, designStage: async () => { throw cap; } } })).toEqual({ wait: 5 });
  });
  it('a decision theory runs after edit, before promotion; idle/capped falls through; a spend cap waits', async () => {
    const { strategyWork } = await import('../../api/workers/improve-worker.js');
    const calls = [];
    const base = { db: {}, designStage: async () => 'idle', promotionStage: async () => { calls.push('promote'); return 'idle'; }, liveTheoryDeps: async () => ({}) };
    expect(await strategyWork({ deps: { ...base, theoryStage: async () => { calls.push('theory'); return { gate: 'search-plan', item_key: 'k', theories: [{ kind: 'enrich', verdict: 'won' }], usd: 0.2 }; } } })).toBe('done');
    expect(calls).toEqual(['theory']);
    calls.length = 0;
    expect(await strategyWork({ deps: { ...base, theoryStage: async () => { calls.push('theory'); return 'capped'; } } })).toBe('idle');
    expect(calls).toEqual(['theory', 'promote']);
    const cap = Object.assign(new Error('cap'), { code: 'SPEND_CAP', retryAfterMs: 7 });
    expect(await strategyWork({ deps: { ...base, theoryStage: async () => { throw cap; } } })).toEqual({ wait: 7 });
  });
});
