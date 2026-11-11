// pipeline/hype-program — budget (month ceiling, month/30 pace, job cap, in-flight), dryRun estimate, the submit→collect loop, billing key,
// quiet budget stop vs quality auto-pause, baseline from ledger, batched quality checks, hype-quality report. Everything injected; no network, no DB.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hypeProgramJob, hypeQualityReport, budgetRoom, monthlyUsd, checksFor, checksEst, EST_USD_PER_REQUEST, EST_USD_PER_CHECK, EST_FORMULA } from '../../api/lib/pipeline/hype-program.js';
import { createStore } from '../../api/lib/pipeline/hype-ledger.js';
import { currentAIContext } from '../../api/lib/ai-context.js';

const V = 'hype-v15-seeker';
let dir, store;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hype-program-')); store = createStore(dir); });

describe('budgetRoom', () => {
  const base = { monthUsd: 1000, spentMonth: 0, spentToday: 0, inflightUsd: 0, jobSpent: 0, maxUsd: 500 };
  it('daily pace is month/30; the tightest limit binds', () => {
    expect(budgetRoom(base)).toMatchObject({ binding: 'day', pace: 1000 / 30 });
    expect(budgetRoom(base).usd).toBeCloseTo(33.33, 2);
    expect(budgetRoom({ ...base, spentToday: 10 }).usd).toBeCloseTo(23.33, 1);
    expect(budgetRoom({ ...base, spentMonth: 990, spentToday: 0 })).toMatchObject({ usd: 10, binding: 'month' });
    expect(budgetRoom({ ...base, maxUsd: 5 })).toMatchObject({ usd: 5, binding: 'job' });
  });
  it('counts what is in flight against every limit, never negative', () => {
    expect(budgetRoom({ ...base, inflightUsd: 30 }).usd).toBeCloseTo(3.33, 1);
    expect(budgetRoom({ ...base, spentToday: 40 }).usd).toBe(0);
  });
  it('monthlyUsd reads HYPE_PROGRAM_USD_MONTH; unset = 1000 (Chad 11-09); 0 or junk = spend nothing', () => {
    expect(monthlyUsd({ HYPE_PROGRAM_USD_MONTH: '500' })).toBe(500);
    expect(monthlyUsd({})).toBe(1000);
    expect(monthlyUsd({ HYPE_PROGRAM_USD_MONTH: '' })).toBe(1000);
    expect(monthlyUsd({ HYPE_PROGRAM_USD_MONTH: 'abc' })).toBe(0);
    expect(monthlyUsd({ HYPE_PROGRAM_USD_MONTH: '0' })).toBe(0);
  });
});

// ---- the loop's fakes
const row = (id, qs) => ({ id, doc_id: 1, text: 'The soul of man is a sign of God and returns to Him after the passing of the body.', hyp_model: V, hyp_questions: JSON.stringify(qs) });
const GOOD = ['What is the soul?', 'Where does the soul go after death?'];
// A fake batch layer: submit records a batch; collect settles it by calling the job's measure + onBatchDone hooks like the real one.
const okJudge = async (a) => ({ questions: a.questions.map((_, i) => ({ i, searchable: true, answered: true, distinct: true })), missed: [] });
function fakeWorld({ batchStats = () => ({}), questions = GOOD, select, spend = {}, judge, rowsFor, checkCreate } = {}) {
  const w = { submits: [], billTo: [], judged: [], logs: [], pending: [], n: 0, selects: [], checkBatches: new Map(), metered: [] };
  const queue = select || [];
  const env = { HYPE_PROGRAM_USD_MONTH: '1000' };
  const deps = {
    env, store, sleep: async () => {}, rand: () => 0, draining: async () => false,
    log: async (k, t) => { w.logs.push(`${k}: ${t}`); },
    spend: { month: async () => spend.month ?? 0, today: async () => spend.today ?? 0 },
    select: async (a) => { w.selects.push(a); return queue.shift() || { docs: [], paragraphs: 0, cursor: a.after, exhausted: true }; },
    rows: async (ids) => (rowsFor ? rowsFor(ids) : ids.map((id) => row(id, questions))),
    // the check batch: create records the requests; it has ended by the next look; results run the fake judge on each
    checks: async () => ({
      create: async (reqs, o) => { if (checkCreate) await checkCreate(reqs, o); const id = `c${w.checkBatches.size + 1}`; w.checkBatches.set(id, reqs); w.judged.push(...reqs); return id; },
      status: async () => ({ ended: true }),
      results: async function* (id) {
        for (const q of w.checkBatches.get(id)) {
          const qs = q.user.split('QUESTIONS:\n')[1].split('\n').map((l) => l.replace(/^\d+\. /, ''));
          try { yield { custom_id: q.custom_id, ok: true, text: JSON.stringify(await (judge || okJudge)({ questions: qs })), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } }; }
          catch (e) { yield { custom_id: q.custom_id, ok: false, error: `errored: ${e.message}`, text: null, usage: null }; }
        }
      },
      meter: async (m) => { w.metered.push(m); },
    }),
    makeHb: async (o) => ({
      status: () => ({ batches: w.pending.map((b) => ({ id: b.id, requests: b.requests })) }),
      submit: async (docIds, opts) => {
        w.billTo.push(currentAIContext().billTo);
        const ids = Object.values(opts.idsByDoc).flat(), id = `b${++w.n}`;
        w.submits.push({ docIds, opts });
        w.pending.push({ id, requests: ids.length, tag: opts.tag, idsByDoc: opts.idsByDoc });
        return { batches: [id], paragraphs: ids.length, requests: ids.length, gated: [], spendRefused: [], over_budget: false, docs: docIds.length };
      },
      collect: async () => {
        const sum = { written: 0, failed: 0, exhausted: 0, pending: 0, errors: [] };
        for (const b of w.pending.splice(0)) {
          const acc = {};
          for (const [docId, ids] of Object.entries(b.idsByDoc)) {
            const outcomes = ids.map((id) => ({ id, replies: ['{}'] })), result = { written: ids.length, failed: [], exhausted: 0, alreadyDone: 0, stats: batchStats(b) };
            acc[docId] = await o.measure({ batchId: b.id, docId: Number(docId), outcomes, result, truncated: new Set() }); sum.written += ids.length;
          }
          await o.onBatchDone({ id: b.id, at: Date.now(), model: 'haiku', version: V, requests: b.requests, tag: b.tag, acc });
        }
        return sum;
      },
    }),
  };
  return { w, deps };
}
const docsOf = (n, start = 1) => ({ docs: [{ docId: 1, ids: Array.from({ length: n }, (_, i) => start + i) }], paragraphs: n, cursor: 0, exhausted: false });

describe('hypeProgramJob: guards', () => {
  it('tier and maxUsd are required for a real run; a bad tier is refused', async () => {
    const { deps } = fakeWorld();
    expect((await hypeProgramJob({}, deps)).status).toBe('error');
    expect((await hypeProgramJob({ tier: 'core' }, deps)).error).toMatch(/maxUsd/);
    expect((await hypeProgramJob({ tier: 'nope', maxUsd: 5 }, deps)).error).toMatch(/tier must be/);
  });
  it('with HYPE_PROGRAM_USD_MONTH=0 it spends nothing and says why (no phase stopped); unset runs on the 1000 default', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(5)] });
    deps.env = { HYPE_PROGRAM_USD_MONTH: '0' };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps);
    expect(r).toMatchObject({ status: 'budget' });
    expect(r.phase).toBeUndefined();
    expect(w.submits).toHaveLength(0);
    const u = fakeWorld({ select: [docsOf(2)] }); u.deps.env = {};
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5 }, u.deps)).status).toBe('complete');
  });
});

describe('hypeProgramJob: dryRun', () => {
  const counts = { core: { primary: { docs: 3, total: 1000, done: 200, pending: 800, requests: 1000 }, copy: { docs: 1, total: 100, done: 0, pending: 100, requests: 100 } },
    gray: { primary: { docs: 1, total: 10, done: 0, pending: 10, requests: 10 }, copy: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 } },
    history: { primary: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 }, copy: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 } },
    rest: { primary: { docs: 9, total: 1e6, done: 0, pending: 1e6, requests: 1.2e6 }, copy: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 } } };
  it('estimates generation (requests x $0.18/1000) + checks per tier, reports the formula, days at pace and months at the ceiling; spends nothing', async () => {
    const { w, deps } = fakeWorld(); deps.count = async () => counts;
    const r = await hypeProgramJob({ dryRun: true }, deps);
    expect(r.dryRun).toBe(true);
    expect(r.formula).toBe(EST_FORMULA);
    expect(r.estUsdPerRequest).toBe(0.00018);
    const chk = (n) => Math.round(n * EST_USD_PER_CHECK * 100) / 100;
    expect(r.tiers.core.primary).toMatchObject({ pending: 800, requests: 1000, generationUsd: 0.18, checks: 303, checkUsd: chk(303), estUsd: Math.round((0.18 + chk(303)) * 100) / 100 });
    expect(r.tiers.core.copy.checks).toBe(3);                    // the tier's baseline sample is counted once
    expect(r.tiers.history.primary.checks).toBe(0);              // nothing pending, nothing to check
    expect(r.tiers.rest.primary).toMatchObject({ generationUsd: 216, checks: 300 + 3 * 100 });
    expect(r.total).toMatchObject({ requests: 1000 + 100 + 10 + 1.2e6, checks: 303 + 3 + 303 + 600 });
    expect(r.total.usd).toBeCloseTo(r.total.generationUsd + r.total.checkUsd, 2);
    expect(r.budget.monthsAtCeiling).toBeCloseTo(r.total.usd / 1000, 2);
    expect(r.budget).toMatchObject({ monthUsd: 1000, paceUsdPerDay: 33.33, envSet: true });
    expect(r.budget.daysAtPace).toBe(Math.ceil(r.total.usd / (1000 / 30)));
    expect(w.submits).toHaveLength(0);
  });
  it('one tier only when asked', async () => {
    const { deps } = fakeWorld(); deps.count = async () => counts;
    const r = await hypeProgramJob({ dryRun: true, tier: 'gray' }, deps);
    expect(Object.keys(r.tiers)).toEqual(['gray']);
    expect(r.total.requests).toBe(10);
  });
});

describe('hypeProgramJob: run', () => {
  it('runs tier rounds until the tier is done, tags batches, bills the hype-program key, writes a ledger entry per batch', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(3), docsOf(2, 10)] });
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0 }, deps);
    expect(r).toMatchObject({ status: 'complete', tier: 'core', paragraphs: 5, batches: 2, written: 5 });
    expect(w.billTo).toEqual(['hype-program', 'hype-program']);
    expect(w.submits[0].opts).toMatchObject({ tag: { tier: 'core', pass: 'primary' }, idsByDoc: { 1: [1, 2, 3] } });
    const led = store.ledger();
    expect(led.map((e) => [e.id, e.tier, e.requests])).toEqual([['b1', 'core', 3], ['b2', 'core', 2]]);
    expect(led[0].rates).toMatchObject({ sent: 3, questionsPerPara: 2 });
    expect(w.logs.some((l) => /core\/bahai\/primary · 3 ¶/.test(l))).toBe(true);
  });
  it('never exceeds the round size implied by the budget room', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(2)] });
    await hypeProgramJob({ tier: 'core', maxUsd: 5 * EST_USD_PER_REQUEST * 1.5 }, deps);   // room for 7 requests
    expect(w.selects[0].limit).toBe(Math.floor((5 * 1.5 * EST_USD_PER_REQUEST) / EST_USD_PER_REQUEST));
  });
  it('stops quietly when the month is spent (status budget, no phase stopped, nothing submitted)', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(5)], spend: { month: 1000, today: 0 } });
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 50 }, deps);
    expect(r).toMatchObject({ status: 'budget', binding: 'month' });
    expect(JSON.stringify(r)).not.toContain('"phase":"stopped"');
    expect(w.submits).toHaveLength(0);
  });
  it('the day\'s pace spent: waits for the next UTC day (logs once, sleeps toward midnight) and continues when today resets', async () => {
    let today = 34;
    const { w, deps } = fakeWorld({ select: [docsOf(5)], spend: { month: 100 } });
    deps.spend = { month: async () => 100, today: async () => today };
    const sleeps = []; deps.sleep = async (ms) => { sleeps.push(ms); if (sleeps.length === 2) today = 0; };   // the UTC day turns during the second wait
    deps.now = () => Date.parse('2026-11-09T23:50:00Z');
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 500 }, deps);
    expect(r.status).toBe('complete');
    expect(sleeps.slice(0, 2)).toEqual([601000, 601000]);   // 10 min + 1 s to midnight, under the 15 min look-again chunk
    expect(w.logs.filter((l) => /waiting for the next UTC day/.test(l))).toHaveLength(1);
    expect(w.submits).toHaveLength(1);
  });
  it('waiting for the day yields (resumable) when the service drains, and still stops at the month ceiling or a pause', async () => {
    const a = fakeWorld({ select: [docsOf(5)] }); a.deps.spend = { month: async () => 100, today: async () => 34 }; a.deps.draining = async () => true;
    expect(await hypeProgramJob({ tier: 'core', maxUsd: 500 }, a.deps)).toMatchObject({ yielded: true });
    const b = fakeWorld({ select: [docsOf(5)] }); b.deps.spend = { month: async () => 1000, today: async () => 10 };
    expect(await hypeProgramJob({ tier: 'core', maxUsd: 500 }, b.deps)).toMatchObject({ status: 'budget', binding: 'month' });
  });
  it('a gate refusal is a wait, not a verdict: refused docs are not skipped and are re-sent when the gate opens', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(3), docsOf(3)] });
    const sub = deps.makeHb; let first = true;
    deps.makeHb = async (o) => { const hb = await sub(o); const s0 = hb.submit; hb.submit = async (...a) => { if (first) { first = false; return { batches: [], paragraphs: 0, requests: 0, gated: [], spendRefused: [1], over_budget: false, docs: 0 }; } return s0(...a); }; return hb; };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps);
    expect(r.status).toBe('complete');
    expect(w.submits).toHaveLength(1);
    expect(store.cursors()['core:bahai:primary:dis'].skip).not.toContain(1);
  });
  it('the job maxUsd caps what this run may spend (spend since the run began)', async () => {
    let month = 100;
    const { w, deps } = fakeWorld({ select: [docsOf(100), docsOf(100, 200), docsOf(100, 400)] });
    deps.spend = { month: async () => month, today: async () => 0 };
    const sub = deps.makeHb; deps.makeHb = async (o) => { const hb = await sub(o); const c = hb.collect; hb.collect = async () => { month += 0.02; return c(); }; return hb; };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 0.03 }, deps);
    expect(r).toMatchObject({ status: 'budget', binding: 'job' });
    expect(w.submits.length).toBeGreaterThan(0);
    expect(w.submits.length).toBeLessThan(3);
  });
  it('a docs-only no-op round (the planner sends nothing) skips those docs instead of spinning', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(3), docsOf(3)] });
    const sub = deps.makeHb; deps.makeHb = async (o) => { const hb = await sub(o); hb.submit = async () => ({ batches: [], paragraphs: 0, requests: 0, gated: [], spendRefused: [], over_budget: false, docs: 0 }); return hb; };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps);
    expect(r.status).toBe('complete');
    expect(r.unplannable).toBeGreaterThan(0);
    expect(store.cursors()['core:bahai:primary:dis'].skip).toContain(1);
  });
  it('yields (resumable) when the service drains while batches are pending', async () => {
    const { deps } = fakeWorld({ select: [docsOf(3)] });
    const sub = deps.makeHb; deps.makeHb = async (o) => { const hb = await sub(o); hb.collect = async () => ({ written: 0, failed: 0, exhausted: 0, pending: 1, errors: [] }); return hb; };
    deps.draining = async () => true;
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps);
    expect(r).toMatchObject({ yielded: true, resume: { tier: 'core', maxUsd: 5 } });
  });
});

describe('hypeProgramJob: Anthropic out of credit is a wait, never a failure (11-11)', () => {
  const NOCREDIT = { batches: [], paragraphs: 0, requests: 0, gated: [], spendRefused: [], over_budget: false, docs: 0, creditOut: { retryAfterMs: 5000 } };
  it('a no-credit submit marks nothing failed/exhausted, leaves the cursor alone, waits (sleep) and sends the same docs once credit returns', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(3), docsOf(3)] });
    const sleeps = []; deps.sleep = async (ms) => { sleeps.push(ms); };
    const sub = deps.makeHb; let calls = 0, cursorAtRetry = 'unset';
    deps.makeHb = async (o) => { const hb = await sub(o); const s0 = hb.submit; hb.submit = async (...a) => { if (calls++ === 0) return NOCREDIT; cursorAtRetry = store.cursors()['core:bahai:primary:dis']; return s0(...a); }; return hb; };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0 }, deps);
    expect(r).toMatchObject({ status: 'complete', paragraphs: 3, written: 3, failed: 0, exhausted: 0, errors: [] });
    expect(cursorAtRetry).toBeUndefined();
    expect(sleeps).toContain(5000);
    expect(w.submits).toHaveLength(1);
    expect(r.creditWait).toMatchObject({ probes: 1 });
    expect(r.creditWait.since).toBeTruthy(); expect(r.creditWait.resolvedAt).toBeTruthy();
    expect(w.logs.some((l) => /no credit/.test(l))).toBe(true);
  });
  it('a partly-sent round keeps what went out and still does not move the cursor past the unsent', async () => {
    const { deps } = fakeWorld({ select: [docsOf(3), docsOf(3)] });
    const sub = deps.makeHb; let calls = 0, cursorAtRetry = 'unset';
    deps.makeHb = async (o) => { const hb = await sub(o); const s0 = hb.submit; hb.submit = async (...a) => { if (calls++ === 0) { const s = await s0(...a); return { ...s, creditOut: { retryAfterMs: 1000 } }; } cursorAtRetry = store.cursors()['core:bahai:primary:dis']; return s0(...a); }; return hb; };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0 }, deps);
    expect(r).toMatchObject({ status: 'complete', failed: 0, exhausted: 0 });
    expect(cursorAtRetry).toBeUndefined();
  });
  it('a refused grading check is deferred (not counted as an error) and sent when credit returns', async () => {
    let n = 0;
    const { w, deps } = fakeWorld({ select: [docsOf(4)], checkCreate: async () => { if (n++ === 0) throw new Error('400 Your credit balance is too low to access the Anthropic API'); } });
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, deps);
    expect(r.status).toBe('complete');
    expect(w.checkBatches.size).toBe(1);
    const g = store.ledger()[0].grade;
    expect(g.errors).toBeFalsy(); expect(g.deferred).toBeUndefined(); expect(g.checkBatch).toBeTruthy();
    expect(r.creditWait).toMatchObject({ probes: 1 }); expect(r.creditWait.resolvedAt).toBeTruthy();
  });
  it('a non-credit submit error keeps today\'s behaviour (the job throws)', async () => {
    const { deps } = fakeWorld({ select: [docsOf(3)] });
    const sub = deps.makeHb; deps.makeHb = async (o) => { const hb = await sub(o); hb.submit = async () => { throw new Error('boom'); }; return hb; };
    await expect(hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps)).rejects.toThrow('boom');
  });
});

describe('hypeProgramJob: quality auto-pause', () => {
  const baseline = { questionsPerPara: 2, faultRate: 0.05, emptyRate: 0, exhaustedRate: 0, truncationRate: 0, failedRate: 0, dupRate: 0, langMismatchRate: 0, at: 'pilot' };
  it('a batch worse than the stored baseline pauses the program with the reason, in the ledger, the activity log and the result', async () => {
    store.setBaseline('core', baseline);
    const { w, deps } = fakeWorld({ select: [docsOf(200), docsOf(200, 300)], batchStats: () => ({ yesNo: 400 }) });   // 400 dropped of 400 asked + 400 kept
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps);
    expect(r.phase).toBe('stopped');
    expect(r.reason).toMatch(/quality: batch b1 \(core\) worse than baseline: faultRate/);
    expect(w.submits).toHaveLength(1);   // stopped after ONE batch
    expect(store.pause()).toMatchObject({ batch: 'b1', tier: 'core' });
    expect(store.ledger()[0].violations[0]).toMatchObject({ metric: 'faultRate' });
    expect(w.logs.some((l) => /paused/.test(l))).toBe(true);
    // a rerun stays stopped until resumed
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps)).phase).toBe('stopped');
  });
  it('resume clears the pause', async () => {
    store.setPause({ at: 'x', reason: 'old', batch: 'b0', tier: 'core' });
    const { w, deps } = fakeWorld({ select: [docsOf(3)] });
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, resume: true }, deps);
    expect(r.status).toBe('complete');
    expect(w.submits).toHaveLength(1);
  });
  it('no baseline set → nothing to pause on (never guessed)', async () => {
    const { deps } = fakeWorld({ select: [docsOf(200)], batchStats: () => ({ yesNo: 400 }) });
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps)).status).toBe('complete');
    expect(store.pause()).toBeNull();
  });
  it('a batch inside the margin continues', async () => {
    store.setBaseline('*', baseline);
    const { deps } = fakeWorld({ select: [docsOf(200)], batchStats: () => ({ yesNo: 5 }) });   // 5/405 ~ 1%
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5 }, deps)).status).toBe('complete');
  });
});

describe('hypeProgramJob: batched quality checks', () => {
  it('sends the sampled paragraphs as one check batch, meters each result, and patches the grade into the ledger', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(4)] });
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, deps)).status).toBe('complete');
    expect(w.checkBatches.size).toBe(1);
    expect(w.judged).toHaveLength(4);
    expect(w.judged[0]).toMatchObject({ custom_id: 'd1_p1', maxTokens: 4000 });
    expect(w.judged[0].user).toContain(GOOD[1]);
    expect(w.metered).toHaveLength(4);
    expect(w.metered[0]).toMatchObject({ docId: 1, ok: true });
    expect(store.ledger()[0].grade).toMatchObject({ sampled: 4, paragraphs: 4, questions: 8, searchablePct: 100, answeredPct: 100, distinctPct: 100, errors: 0 });
    expect(store.ledger()[0].grade.pending).toBeUndefined();
  });
  it('a refused check batch is recorded with its reason and never stops the program', async () => {
    const { deps } = fakeWorld({ select: [docsOf(3)], checkCreate: async () => { throw new Error('Anthropic not allowed for stage hype-judge'); } });
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, deps)).status).toBe('complete');
    expect(store.ledger()[0].grade).toMatchObject({ requests: 3, errors: 3, firstError: expect.stringMatching(/not allowed/) });
  });
  it('fills the tier sample first, then a few per batch', async () => {
    const one = fakeWorld({ select: [docsOf(4)] });
    expect(checksFor('core', store, 200)).toBe(200);
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, one.deps);
    expect(checksFor('core', store, 1000)).toBe(296);
    store.updateLedger(store.ledger()[0].id, { grade: { paragraphs: 400 } });
    expect(checksFor('core', store)).toBe(3);
    expect(checksFor('gray', store)).toBe(200);
  });
  it('sampleRate 0 grades nothing; maxGrade caps a batch', async () => {
    const a = fakeWorld({ select: [docsOf(4)] });
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0 }, a.deps);
    expect(a.w.judged).toHaveLength(0);
    const b = fakeWorld({ select: [docsOf(4)] });
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1, maxGrade: 2 }, b.deps);
    expect(b.w.judged).toHaveLength(2);
  });
  it('a failing judge never stops the program; poor grades against the baseline pause it', async () => {
    const a = fakeWorld({ select: [docsOf(3)], judge: async () => { throw new Error('boom'); } });
    expect((await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, a.deps)).status).toBe('complete');
    expect(store.ledger()[0].grade).toMatchObject({ errors: 3, firstError: expect.stringMatching(/boom/) });
    store.setBaseline('core', { questionsPerPara: 2, searchablePct: 95, answeredPct: 95, distinctPct: 95, at: 'pilot' });
    const bad = fakeWorld({ select: [docsOf(200, 1000)], judge: async (x) => ({ questions: x.questions.map((_, i) => ({ i, searchable: false, answered: true, distinct: true })), missed: [] }) });
    bad.w.n = 10;   // batch ids are unique in life (the ledger keeps one entry per id)
    bad.w.checkBatches.set('c1', []);
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0.2, maxGrade: 40, resume: true }, { ...bad.deps, rand: () => 0.1 });
    expect(r.phase).toBe('stopped');
    expect(r.reason).toMatch(/searchablePct/);
  });
});

describe('hypeProgramJob: setBaseline', () => {
  it('builds the baseline from the last ledger batches of the tier and stores it', async () => {
    const { deps } = fakeWorld({ select: [docsOf(10), docsOf(10, 50)], batchStats: () => ({ yesNo: 2 }) });
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, deps);
    const r = await hypeProgramJob({ tier: 'core', setBaseline: true }, deps);
    expect(r).toMatchObject({ status: 'baseline-set', tier: 'core' });
    expect(r.baseline).toMatchObject({ questionsPerPara: 2, searchablePct: 100, sent: 20, from: ['b1', 'b2'] });
    expect(r.baseline.faultRate).toBeCloseTo(4 / 44, 3);
    expect(store.baselineFor('core')).toMatchObject({ questionsPerPara: 2 });
  });
  it('refuses when there is nothing in the ledger to build from', async () => {
    const { deps } = fakeWorld();
    expect((await hypeProgramJob({ tier: 'core', setBaseline: true }, deps)).error).toMatch(/run a pilot first/);
  });
  it('last / batches narrow the basis; no tier sets the * fallback', async () => {
    const { deps } = fakeWorld({ select: [docsOf(10), docsOf(10, 50)] });
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 0 }, deps);
    const r = await hypeProgramJob({ setBaseline: { last: 1 } }, deps);
    expect(r).toMatchObject({ tier: '*' });
    expect(r.baseline.from).toEqual(['b2']);
    expect((await hypeProgramJob({ setBaseline: { batches: ['b1'] } }, deps)).baseline.from).toEqual(['b1']);
  });
});

describe('hype-quality report', () => {
  it('spend, progress per tier, ledger vs baseline, per-batch rows, pause', async () => {
    const { deps } = fakeWorld({ select: [docsOf(10)], spend: { month: 123.456, today: 7.891 } });
    await hypeProgramJob({ tier: 'core', maxUsd: 5, sampleRate: 1 }, deps);
    store.setBaseline('core', { questionsPerPara: 2, at: 'pilot' });
    const none = { done: 0, pending: 0, total: 0, requests: 0 };
    deps.count = async () => ({ core: { primary: { done: 10, pending: 990, total: 1000, requests: 1000 }, copy: none }, gray: { primary: none, copy: none }, history: { primary: none, copy: none }, rest: { primary: none, copy: none } });
    const r = await hypeQualityReport({}, deps);
    expect(r.budget).toEqual({ monthUsd: 1000, spentMonth: 123.46, spentToday: 7.89, paceUsdPerDay: 33.33, remainingMonth: 876.54 });
    expect(r.progress.core.primary).toEqual({ done: 10, remaining: 990, total: 1000, estUsdRemaining: 0.18 });
    expect(r.tiers.core).toMatchObject({ batches: 1, requests: 10, baseline: { at: 'pilot' }, rates: { questionsPerPara: 2 }, grade: { searchablePct: 100 } });
    expect(r.batches[0]).toMatchObject({ id: 'b1', tier: 'core', grade: { sampled: 10 } });
    expect(r.paused).toBeNull();
  });
  it('counts:false skips the library scan', async () => {
    const { deps } = fakeWorld(); deps.count = async () => { throw new Error('should not scan'); };
    expect((await hypeQualityReport({ counts: false }, deps)).progress).toBeNull();
  });
});

describe('hypeProgramJob: tradition — bank seeding first, seeds re-merged after the tier', () => {
  it('runs hype-bank-seed for the tradition before the tier, then reapplies after complete; later resumes skip seeding', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(2)] });
    const order = [];
    deps.seed = async (p) => { order.push(['seed', p.tradition, p.maxUsd]); return { status: 'complete', pairs: 4, seeded: 3, rejected: 1 }; };
    deps.reapply = async (t) => { order.push(['reapply', t]); return { merged: 1 }; };
    const origSelect = deps.select; deps.select = async (a) => { order.push(['select']); return origSelect(a); };
    const r = await hypeProgramJob({ tier: 'core', maxUsd: 5, tradition: 'bahai' }, deps);
    expect(r.status).toBe('complete');
    expect(order[0]).toEqual(['seed', 'bahai', 5]);
    expect(order.at(-1)).toEqual(['reapply', 'bahai']);
    expect(r.seed).toMatchObject({ seeded: 3, rejected: 1 });
    expect(r.reapplied).toEqual({ merged: 1 });
    expect(w.submits).toHaveLength(1);
    order.length = 0;
    await hypeProgramJob({ tier: 'core', maxUsd: 5, tradition: 'bahai', seedDone: true }, fakeWorld().deps);
    expect(order).toEqual([]);
  });
  it('a seeding yield (drain) yields the program with the seed resume; no tradition → no seeding', async () => {
    const { w, deps } = fakeWorld({ select: [docsOf(2)] });
    deps.seed = async () => ({ yielded: true, resume: { tradition: 'bahai', checkBatch: 'cb1', pairs: [] } });
    const y = await hypeProgramJob({ tier: 'core', maxUsd: 5, tradition: 'bahai' }, deps);
    expect(y).toMatchObject({ yielded: true, resume: { tier: 'core', tradition: 'bahai', seedResume: { checkBatch: 'cb1' } } });
    expect(w.submits).toHaveLength(0);
    let seeded = false; const u = fakeWorld({ select: [docsOf(1)] }); u.deps.seed = async () => { seeded = true; };
    await hypeProgramJob({ tier: 'core', maxUsd: 5 }, u.deps);
    expect(seeded).toBe(false);
  });
  it('dryRun with a tradition adds the seeding plan', async () => {
    const { deps } = fakeWorld();
    deps.count = async () => Object.fromEntries(['core', 'gray', 'history', 'rest'].map((t) => [t, { primary: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 }, copy: { docs: 0, total: 0, done: 0, pending: 0, requests: 0 } }]));
    deps.seed = async (p) => ({ dryRun: p.dry, pairs: 160, estUsd: 1.2 });
    const r = await hypeProgramJob({ dryRun: true, tradition: 'bahai' }, deps);
    expect(r.seed).toEqual({ dryRun: true, pairs: 160, estUsd: 1.2 });
  });
});
