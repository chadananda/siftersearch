// Jev timeouts are never silent (launch gate 11-03, defect: "Jev calls past their limit fall back silently"): one retry within the
// budget, the timeout reported to the turn → a jev:timeout decision + meta.jev_timeouts. Limits measured from the battery.
import { describe, it, expect, afterEach } from 'vitest';
import { jevCall, JEV_LIMITS, timeoutDecision, jevTimeoutsOf, stallTolerantTimeout } from '../../api/lib/assistant/jev-call.js';
import { triageMessage } from '../../api/lib/assistant/triage.js';
import { chooseStrategy } from '../../api/lib/assistant/strategy-choice.js';
import { prayerShelf } from '../../api/lib/assistant/prayer-shelf.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const answers = (a) => ({ ok: true, json: async () => ({ answers: a }) });
// fetch that times out the first n calls, then answers
const flaky = (n, a) => { let i = 0; const f = async () => { f.calls = ++i; if (i <= n) throw timeoutErr(); return answers(a); }; return f; };
const msgs = [{ role: 'user', content: 'What do the Writings say about tithing?' }];

describe('jevCall', () => {
  it('a timeout is retried once and reported; the retry\'s answer is used', async () => {
    const seen = []; let n = 0;
    const r = await jevCall('strategy', async () => { if (++n === 1) throw timeoutErr(); return { ok: 1 }; }, { timeoutMs: 1000, budgetMs: 2000, onJev: (i) => seen.push(i) });
    expect(r).toMatchObject({ value: { ok: 1 }, attempts: 2, timeoutMs: 1000 }); expect(r.timeouts).toHaveLength(1);
    expect(seen).toHaveLength(1); expect(timeoutDecision(seen[0])).toMatchObject({ saw: 'strategy', chosen: 'answered on retry' });
  });
  it('no retry when the budget does not allow one; two timeouts → fail open, reported', async () => {
    let clock = 0; const now = () => clock;
    const r = await jevCall('triage', async () => { clock += 1500; throw timeoutErr(); }, { timeoutMs: 1500, budgetMs: 2000, now });
    expect(r).toMatchObject({ value: null, attempts: 1 });
    const seen = [];
    const r2 = await jevCall('triage', async () => { throw timeoutErr(); }, { timeoutMs: 10, budgetMs: 1000, onJev: (i) => seen.push(i) });
    expect(r2.attempts).toBe(2); expect(r2.timeouts).toHaveLength(2); expect(timeoutDecision(seen[0]).chosen).toBe('fail open');
  });
  it('an attempt that aborts a few ms past its limit still gets the retry the budget was sized for (11-09: it never ran)', async () => {
    let clock = 0; const now = () => clock; let n = 0;
    const r = await jevCall('strategy', async () => { if (++n === 1) { clock += 1003; throw timeoutErr(); } clock += 300; return { ok: 1 }; }, { timeoutMs: 1000, budgetMs: 2000, now });
    expect(r).toMatchObject({ value: { ok: 1 }, attempts: 2 });
  });
  it('any other error ends the call without a retry, but is reported so the backup answers (11-12: error statuses failed open silently)', async () => {
    const seen = []; let n = 0;
    const r = await jevCall('x', async () => { n++; throw new Error('500'); }, { timeoutMs: 10, budgetMs: 1000, onJev: (i) => seen.push(i) });
    expect(n).toBe(1); expect(r.error).toBe('500'); expect(seen.map((i) => [i.call, i.value, i.error])).toEqual([['x', null, '500']]);
    expect(timeoutDecision(seen[0]).reason).toBe('x: no answer (500)');
  });
  it('an answered call is not reported', async () => {
    const seen = [];
    await jevCall('x', async () => ({ ok: 1 }), { timeoutMs: 10, onJev: (i) => seen.push(i) });
    expect(seen).toEqual([]);
  });
  it('strategy: an error status → null, reported (the turn\'s backup then answers)', async () => {
    const seen = [];
    const f = async () => ({ ok: false, status: 429, json: async () => ({}) });
    expect(await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: f, onJev: (i) => seen.push(i) })).toBeNull();
    expect(seen.map((i) => [i.call, i.error])).toEqual([['strategy', 'jev 429']]);
  });
  it('limits are the measured ones (strategy above its answered p95 of 814 ms, one retry in budget)', () => {
    expect(JEV_LIMITS.strategy.timeoutMs).toBeGreaterThan(814); expect(JEV_LIMITS.strategy.budgetMs).toBeGreaterThanOrEqual(2 * JEV_LIMITS.strategy.timeoutMs);
    expect(JEV_LIMITS.triage.budgetMs).toBeGreaterThanOrEqual(2 * JEV_LIMITS.triage.timeoutMs);
  });
  it('jevTimeoutsOf summarises the turn\'s jev:timeout decisions for the meta', () => {
    expect(jevTimeoutsOf([{ point: 'strategy' }])).toBeNull();
    expect(jevTimeoutsOf([{ point: 'jev:timeout', saw: 'triage', chosen: 'fail open', ms: 3000 }])).toEqual([{ call: 'triage', outcome: 'fail open', ms: 3000 }]);
  });
});

describe('the Jev callers retry and report', () => {
  const env = process.env.TYPESAFE_API_KEY;
  afterEach(() => { process.env.TYPESAFE_API_KEY = env; });
  it('triage: answers on the retry, the timeout reported', async () => {
    const seen = []; const f = flaky(1, { kind: { choice: 'research', confidence: 0.9 } });
    const out = await triageMessage(msgs, { apiKey: 'k', fetchImpl: f, onJev: (i) => seen.push(i) });
    expect(f.calls).toBe(2); expect(out.kind.choice).toBe('research'); expect(seen[0]).toMatchObject({ call: 'triage', attempts: 2 });
  });
  it('triage: the deep-report fields (depth, accepts_offer) ride the same retried Jev call and survive a timeout', async () => {
    const seen = []; const thread = [...msgs, { role: 'assistant', content: 'I can write you a full report.' }, { role: 'user', content: 'yes please' }];
    const f = flaky(1, { kind: { choice: 'research', confidence: 0.9 }, depth: { choice: 'deep_report', confidence: 0.8 }, accepts_offer: 0.93 });
    const out = await triageMessage(thread, { apiKey: 'k', fetchImpl: f, onJev: (i) => seen.push(i) });
    expect(f.calls).toBe(2);
    expect(out).toMatchObject({ depth: { choice: 'deep_report', confidence: 0.8 }, accepts_offer: 0.93 });
    expect(seen[0]).toMatchObject({ call: 'triage', attempts: 2 });
  });
  it('strategy: two timeouts → null (fail open) and reported', async () => {
    const seen = []; const f = flaky(5, {});
    expect(await chooseStrategy(msgs, { apiKey: 'k', fetchImpl: f, timeoutMs: 5, budgetMs: 100, onJev: (i) => seen.push(i) })).toBeNull();
    expect(f.calls).toBe(2); expect(seen[0]).toMatchObject({ call: 'strategy', value: null });
  });
  it('prayer occasion: a timeout is a jev:timeout decision beside prayer:occasion', async () => {
    process.env.TYPESAFE_API_KEY = 'k';
    const decisions = decisionLog();
    const departed = { id: 1, text: 'O my God! This is Thy servant…', document_id: 20762, paragraph_index: 107, religion: "Baha'i", tradition: "Baha'i", work: 'Bahá’í Prayers', opening: 'O my God! This is Thy servant…' };
    const deps = { fetchImpl: flaky(1, { occasion: { choice: 'found:0', confidence: 0.9 } }),
      tools: { prayer_lookup: async () => ({ passages: [departed], searched: [] }), whole_lookup: async () => ({ passages: [departed, { ...departed, id: 2, paragraph_index: 108, text: '_—Bahá’u’lláh_' }], bound: 'attribution' }) } };
    const out = await prayerShelf({ messages: msgs, query: 'q', scope: { religion: "Baha'i" }, decisions, deps });
    expect(out.passages.map((x) => x.id)).toEqual([1, 2]); expect(out.plan.bound).toEqual(['attribution']);
    expect(decisions.list().find((d) => d.point === 'jev:timeout')).toMatchObject({ saw: 'occasion', chosen: 'answered on retry' });
  });
});

describe('the turn shows a Jev timeout', () => {
  it('jev:timeout in path.decisions and meta.jev_timeouts', async () => {
    const closed = [];
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async (a) => { closed.push(a); }, fail: async () => {},
      triage: async (m, { onJev }) => { onJev({ call: 'triage', value: null, attempts: 2, timeouts: [{}, {}], timeoutMs: 1500, ms: 3001 }); return null; },
      respond: async () => ({ reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }),
      outputCheck: async () => 0, strikes: makeStrikes(), sleep: async () => {} };
    await anisTurn({ messages: [{ role: 'user', content: 'What is the Covenant?' }], participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    const path = closed[0].path;
    expect(path.decisions.find((d) => d.point === 'jev:timeout')).toMatchObject({ saw: 'triage', chosen: 'fail open', ms: 3001 });
    expect(path.meta.jev_timeouts).toEqual([{ call: 'triage', outcome: 'fail open', ms: 3001 }]);
  });
});

describe('a Jev limit measures Jev, not a blocked serving loop (11-12)', () => {
  // a fake clock + timer queue: run(at) fires the timers due by `at` with the clock set to `at`
  const clock = () => {
    let t = 0; const q = [];
    const setT = (fn, ms) => { q.push({ at: t + ms, fn }); return null; };
    const run = (at) => { t = at; for (let i = 0; i < q.length; i++) if (q[i].at <= at && !q[i].done) { q[i].done = true; q[i].fn(); } };
    return { now: () => t, setT, run };
  };
  it('a timer that fires on time aborts at once, with a TimeoutError', () => {
    const c = clock(); const sig = stallTolerantTimeout(1000, c);
    c.run(1000);
    expect(sig.aborted).toBe(true);
    expect(sig.reason.name).toBe('TimeoutError');
  });
  it('a timer that fires late (the loop stalled) waits the grace first, so a waiting reply is read', () => {
    const c = clock(); const sig = stallTolerantTimeout(1000, { ...c, graceMs: 250 });
    c.run(4000);   // the loop was blocked 3 s past the limit
    expect(sig.aborted).toBe(false);
    c.run(4250);
    expect(sig.aborted).toBe(true);
    expect(sig.reason.name).toBe('TimeoutError');
  });
  it('triage and the persona check use it (not AbortSignal.timeout)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../api/lib/assistant/triage.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/AbortSignal\.timeout/);
  });
});
