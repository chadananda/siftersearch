// Jev timeouts are never silent (launch gate 11-03, defect: "Jev calls past their limit fall back silently"): one retry within the
// budget, the timeout reported to the turn → a jev:timeout decision + meta.jev_timeouts. Limits measured from the battery.
import { describe, it, expect, afterEach } from 'vitest';
import { jevCall, JEV_LIMITS, timeoutDecision, jevTimeoutsOf } from '../../api/lib/assistant/jev-call.js';
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
  it('any other error ends the call without a retry or a timeout report', async () => {
    const seen = []; let n = 0;
    const r = await jevCall('x', async () => { n++; throw new Error('500'); }, { timeoutMs: 10, budgetMs: 1000, onJev: (i) => seen.push(i) });
    expect(n).toBe(1); expect(r.error).toBe('500'); expect(seen).toEqual([]);
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
    const deps = { findTitled: async () => ({ doc: { id: 20762, title: 'Bahá’í Prayers' } }), findDocuments: async () => ({ docs: [{ id: 20762, title: 'Bahá’í Prayers', religion: "Baha'i", collection: 'Bahá’u’lláh', paragraph_count: 900 }] }),
      sectionsOfDoc: async () => [{ title: 'For The Departed', level: 2, start_index: 106, end_index: 126, paragraphs: 21 }],
      fetchImpl: flaky(1, { occasion: { choice: 'For The Departed', confidence: 0.9 } }),
      paragraphsInRange: async () => [{ id: 1, paragraph_index: 107, text: 'O my God! This is Thy servant…' }, { id: 2, paragraph_index: 108, text: '_—Bahá’u’lláh_' }],
      withLinks: async (h) => h, searchPhrases: async () => ({ hits: [] }), searchKeywordQdrant: async () => ({ hits: [] }),
      resolveQdrantFilters: async (f) => f, paragraphsByIds: async () => [] };
    const out = await prayerShelf({ messages: msgs, query: 'q', scope: { religion: "Baha'i" }, search: async () => ({ passages: [] }), decisions, deps });
    expect(out.plan.occasion).toBe('For The Departed');
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
