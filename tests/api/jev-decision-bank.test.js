// Jev decision-gate bank: turn link (ref on every call), bank queries, labels, and the experiment harness with a fake Jev.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: () => {} }));

let dir, so, bank, ctx;
const Q = { strategy: { type: 'choice', criteria: { find_book: 'a book', answer: 'a question' }, instructions: 'which?' } };
const ans = (c) => ({ strategy: { choice: c, confidence: 0.9, distribution: { [c]: 0.9 } } });
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jev-bank-'));
  process.env.SYSTEMONE_DIR = dir; process.env.DEPLOY_SECRET = 'ik'; process.env.TYPESAFE_API_KEY = 'k';
  delete process.env.INTERNAL_API_KEY; delete process.env.SYSTEMONE_EDGE_KEY; process.env.SYSTEMONE_SHADOW = '';
  vi.resetModules();
  so = await import('../../api/lib/systemone.js');
  bank = await import('../../api/lib/repos/jev-calls-repo.js');
  ctx = await import('../../api/lib/ai-context.js');
});
afterEach(() => so._test.reset());
const log = (task, chosen, extra = {}) => so.record(task, extra.state ?? `state of ${chosen}`, Q, { answers: ans(chosen), tokens: extra.tokens ?? 800, ms: extra.ms ?? 30, ...(extra.ref ? { ref: extra.ref } : {}) });

describe('turn link', () => {
  it('calls made before the thread exists get the turn ref when it is linked (queued and already-flushed rows)', async () => {
    await ctx.withAIContext({}, async () => {
      so.openJevTurn();
      log('anis-triage', 'answer');                       // queued, id unknown
      so.flushCalls();
      log('anis-strategy', 'find_book');                  // still queued at link time
      expect(so.linkJevTurn('th1:2')).toBe(2);
      log('anis-format', 'answer');                       // after the link: the ref is read directly
      const calls = so.jevTurnCalls();                    // flushes; ids now exist
      expect(calls.map((c) => c.gate)).toEqual(['anis-triage', 'anis-strategy', 'anis-format']);
      const rows = so._test.db().prepare('SELECT task, ref FROM calls ORDER BY id').all();
      expect(rows).toEqual([{ task: 'anis-triage', ref: 'th1:2' }, { task: 'anis-strategy', ref: 'th1:2' }, { task: 'anis-format', ref: 'th1:2' }]);
    });
  });
  it('no turn scope = no ref, nothing breaks; an explicit ref wins', () => {
    log('anis-triage', 'answer'); log('anis-triage', 'answer', { ref: 'x:1' }); so.flushCalls();
    expect(so._test.db().prepare('SELECT ref FROM calls ORDER BY id').all().map((r) => r.ref)).toEqual([null, 'x:1']);
    expect(so.linkJevTurn('a:1')).toBe(0);
  });
});

describe('bank queries + labels', () => {
  beforeEach(() => {
    log('anis-strategy', 'find_book', { ref: 'a:1', tokens: 1000 }); log('anis-strategy', 'answer', { ref: 'a:2', tokens: 600 }); log('anis-strategy', 'answer', { ref: 'a:3' });
    log('anis-format', 'answer'); so.flushCalls();
  });
  it('gateStats: per gate counts, answer distribution, avg tokens, gold accuracy', () => {
    const [first] = bank.listCalls({ task: 'anis-strategy', limit: 10 }); expect(bank.labelCall(first.id, 'find_book', { basis: 't' }).ok).toBe(true);
    const g = bank.gateStats({ days: 1 });
    const s = g.find((x) => x.task === 'anis-strategy');
    expect(g.map((x) => x.task).sort()).toEqual(['anis-format', 'anis-strategy']);
    expect(s).toMatchObject({ calls: 3, avg_tokens: 800, gold: 1, gold_coverage: 0.333 });
    expect(s.answers.strategy).toEqual({ find_book: 1, answer: 2 });
  });
  it('gateStats: latency percentiles of answered calls (nearest rank) and token percentiles', () => {
    for (const ms of [100, 200, 300, 400, 1000]) log('anis-lat', 'answer', { ms, tokens: ms * 2 }); so.flushCalls();
    expect(bank.gateStats({ days: 1 }).find((x) => x.task === 'anis-lat')).toMatchObject({ calls: 5, ms_p50: 300, ms_p90: 1000, ms_p95: 1000, ms_max: 1000, tokens_p50: 600, tokens_p95: 2000 });
  });
  it('listCalls: by gate, chosen, ref, gold state (right / wrong / none)', () => {
    expect(bank.listCalls({ task: 'anis-strategy', chosen: 'find_book' }).map((c) => c.ref)).toEqual(['a:1']);
    expect(bank.listCalls({ task: 'anis-strategy', ref: 'a:2' })).toHaveLength(1);
    const [x] = bank.listCalls({ task: 'anis-strategy', ref: 'a:2' });
    bank.labelCall(x.id, 'find_book');                                      // Jev said answer → wrong
    expect(bank.listCalls({ task: 'anis-strategy', gold: 'wrong' }).map((c) => c.id)).toEqual([x.id]);
    expect(bank.listCalls({ task: 'anis-strategy', gold: 'right' })).toHaveLength(0);
    expect(bank.listCalls({ task: 'anis-strategy', gold: 'none' })).toHaveLength(2);
    expect(bank.listCalls({ task: 'anis-strategy', limit: 2 })).toHaveLength(2);
  });
  it('labelCall rejects an answer that is not an option; labelByRef labels only where the gate offered it', () => {
    const [x] = bank.listCalls({ task: 'anis-strategy', ref: 'a:3' });
    expect(bank.labelCall(x.id, 'nonsense')).toMatchObject({ ok: false, error: expect.stringMatching(/not an option/) });
    expect(bank.labelCall(999999, 'answer')).toMatchObject({ ok: false });
    expect(bank.labelByRef('anis-strategy', 'a:3', 'find_book', 'opus-judge')).toBe(1);
    expect(bank.labelByRef('anis-strategy', 'a:3', 'not-offered')).toBe(0);
    expect(bank.listCalls({ task: 'anis-strategy', ref: 'a:3' })[0]).toMatchObject({ gold: { strategy: 'find_book' }, gold_basis: 'opus-judge', correct: false });
  });
});

describe('experiment harness (fake Jev)', () => {
  it('re-asks baseline and variant over the labelled bank: accuracy, fixed/broken, flip matrix, cost', async () => {
    const { runExperiment: run, estimateUsd: est } = await import('../../api/lib/jev-tuning/experiment.js');
    // 6 labelled calls whose true answer is find_book
    for (let i = 0; i < 6; i++) { log('anis-strategy', 'answer', { ref: `e:${i}`, state: `book question ${i}` }); }
    so.flushCalls();
    for (const c of bank.listCalls({ task: 'anis-strategy' })) bank.labelCall(c.id, 'find_book');
    // fake Jev: baseline always says answer; the variant (a note in the instructions) flips questions 0-3 to find_book, and 4 stays
    const rerun = async (_t, state, questions) => ({ answers: ans(/NOTE/.test(questions.strategy.instructions) && !/ 4$/.test(state) ? 'find_book' : 'answer'), tokens: 1000, ms: 20 });
    const r = await run({ task: 'anis-strategy', variant: { id: 'question-note', params: { text: 'NOTE: a title means find_book' } }, n: 10 }, { sample: async (t, o) => bank.sampleBank(t, o), rerun });
    expect(r).toMatchObject({ sampled: 6, done: 6, labelled: 6, fixed: 5, broken: 0, changed: 5, errors: 0 });
    expect(r.accuracy).toEqual({ baseline: 0, variant: 0.833, delta: 0.833 });
    expect(r.flips).toEqual({ 'answer -> find_book': 5 });
    expect(r.usd).toBeCloseTo(12 * 1000 * 0.000042 / 1000, 6);
    expect(est(1000, 200)).toBeCloseTo(400 * 1000 * 0.000042 / 1000, 4);
  });
  it('stops at the spend cap or maxUsd, reports truncation; unknown variants name the registry', async () => {
    const { runExperiment: run } = await import('../../api/lib/jev-tuning/experiment.js');
    for (let i = 0; i < 4; i++) log('anis-strategy', 'answer', { ref: `f:${i}` });
    so.flushCalls();
    for (const c of bank.listCalls({ task: 'anis-strategy' })) bank.labelCall(c.id, 'answer');
    const capped = async () => { throw Object.assign(new Error('cap'), { code: 'SPEND_CAP' }); };
    const r = await run({ task: 'anis-strategy', n: 4, concurrency: 1 }, { sample: async (t, o) => bank.sampleBank(t, o), rerun: capped });
    expect(r.truncated).toMatch(/spend cap/); expect(r.done).toBe(0);
    const pricey = async () => ({ answers: ans('answer'), tokens: 100000000, ms: 1 });
    const r2 = await run({ task: 'anis-strategy', n: 4, concurrency: 1, maxUsd: 1 }, { sample: async (t, o) => bank.sampleBank(t, o), rerun: pricey });
    expect(r2.truncated).toMatch(/maxUsd/); expect(r2.done).toBeLessThan(4);
    await expect(run({ task: 'x', variant: 'nope' }, { sample: async () => [] })).rejects.toThrow(/unknown variant "nope".*baseline/);
  });
  it('backend variant re-asks the same call on another model and reports latency percentiles', async () => {
    const { runExperiment: run } = await import('../../api/lib/jev-tuning/experiment.js');
    for (let i = 0; i < 4; i++) log('anis-strategy', 'answer', { ref: `b:${i}` });
    so.flushCalls();
    for (const c of bank.listCalls({ task: 'anis-strategy' })) bank.labelCall(c.id, 'answer');
    const seen = [];
    const rerun = async (t, st, q, opts) => { seen.push(opts?.backend ?? 'jev'); return { answers: ans(opts?.backend ? 'find_book' : 'answer'), tokens: 10, ms: opts?.backend ? 50 : 300 }; };
    const r = await run({ task: 'anis-strategy', n: 4, concurrency: 1, variant: { id: 'backend', params: { model: 'clef-flash' } } }, { sample: async (t, o) => bank.sampleBank(t, o), rerun });
    expect(seen.filter((b) => b === 'clef-flash')).toHaveLength(4);
    expect(seen.filter((b) => b === 'jev')).toHaveLength(4);
    expect(r.ms_pct).toEqual({ baseline: { p50: 300, p90: 300, p95: 300, max: 300 }, variant: { p50: 50, p90: 50, p95: 50, max: 50 } });
    expect(r.changed).toBe(4);
  });
  it('thread-history variant adds earlier turns; skipped when the call has none', async () => {
    const { resolveVariant } = await import('../../api/lib/jev-tuning/variants.js');
    const v = resolveVariant({ id: 'thread-history', params: { turns: 2 } });
    expect((await v.apply({ state: 'S', questions: Q, row: {}, params: v.params, deps: { history: async () => 'User: hi' } })).state).toBe('S\n\nEARLIER IN THIS CONVERSATION:\nUser: hi');
    expect((await v.apply({ state: 'S', questions: Q, row: {}, params: v.params, deps: { history: async () => null } })).skipped).toBe(true);
    const o = resolveVariant({ id: 'option-text', params: { option: 'find_book', text: 'NEW' } });
    expect((await o.apply({ state: 'S', questions: Q, params: o.params })).questions.strategy.criteria.find_book).toBe('NEW');
    expect(Q.strategy.criteria.find_book).toBe('a book');   // the logged call is never mutated
  });
});

describe('admin routes', () => {
  let app;
  beforeEach(async () => {
    const { default: routes } = await import('../../api/routes/jev-admin.js');
    const { jobStore } = await import('../../api/lib/jobs/async-jobs.js');
    app = Fastify();
    const rerun = async (_t, _s, q) => ({ answers: ans(/NOTE/.test(q.strategy.instructions) ? 'find_book' : 'answer'), tokens: 500, ms: 5 });
    await app.register(routes, { prefix: '/api/admin', deps: { jobs: jobStore(), rerun, messages: async () => [{ round_index: 1, role: 'user', content: 'Where is the Kitab-i-Iqan?' }] } });
    log('anis-strategy', 'answer', { ref: 'th:1' }); so.flushCalls();
  });
  const req = (method, url, payload, key = 'ik') => app.inject({ method, url: `/api/admin${url}`, headers: { 'x-internal-key': key }, ...(payload ? { payload } : {}) });
  it('needs the internal key; gates carries the cost of a 200-call experiment', async () => {
    expect((await req('GET', '/jev/gates', null, 'no')).statusCode).toBe(401);
    const g = (await req('GET', '/jev/gates')).json().gates[0];
    expect(g).toMatchObject({ task: 'anis-strategy', calls: 1, avg_tokens: 800 }); expect(g.cost_200_usd).toBeCloseTo(400 * 800 * 0.000042 / 1000, 4);
  });
  it('calls: needs a gate; returns state, answers and the turn\'s question; label sets gold', async () => {
    expect((await req('GET', '/jev/calls')).statusCode).toBe(400);
    const b = (await req('GET', '/jev/calls?task=anis-strategy&chosen=answer&since=7d')).json();
    expect(b.calls[0]).toMatchObject({ ref: 'th:1', chosen: { strategy: 'answer' }, question: 'Where is the Kitab-i-Iqan?' });
    expect((await req('POST', '/jev/label', { id: b.calls[0].id, answer: 'find_book', basis: 'chad' })).json().gold).toEqual({ strategy: 'find_book' });
    expect((await req('POST', '/jev/label', { id: b.calls[0].id, answer: 'zzz' })).statusCode).toBe(400);
    expect((await req('GET', '/jev/calls?task=anis-strategy&gold=wrong')).json().count).toBe(1);
  });
  it('experiment runs as a job and the poll returns the report', async () => {
    const id = (await req('GET', '/jev/calls?task=anis-strategy')).json().calls[0].id;
    await req('POST', '/jev/label', { id, answer: 'find_book' });
    expect((await req('POST', '/jev/experiment', { task: 'anis-strategy', variant: 'nope' })).statusCode).toBe(400);
    const started = (await req('POST', '/jev/experiment', { task: 'anis-strategy', variant: { id: 'question-note', params: { text: 'NOTE' } }, n: 5 })).json();
    expect(started.status).toBe('running');
    let rec; for (let i = 0; i < 50 && (rec = (await req('GET', `/jev/experiment/${started.key}`)).json()).status === 'running'; i++) await new Promise((r) => setTimeout(r, 20));
    expect(rec.status).toBe('done'); expect(rec.result).toMatchObject({ done: 1, fixed: 1, accuracy: { baseline: 0, variant: 1 } });
    expect((await req('GET', '/jev/experiment/none')).statusCode).toBe(404);
    expect((await req('GET', '/jev/variants')).json().variants.map((v) => v.id)).toContain('thread-history');
  });
});
