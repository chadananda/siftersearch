// Jev miss → fix loop (jev-tuning/miss-fix.js): gold label on the gate call, one diagnosis per gold group → candidate option text →
// replay (fixed ≥ 1, broken 0 promotes; a regression is logged, not promoted) → grouping skips attempted groups; the digest block.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
vi.mock('../../api/lib/ai-services.js', () => ({ logAIUsage: () => {} }));
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, recordGap, strategyRow, listPromotions, listDesigns } from '../../api/lib/repos/strategy-candidates-repo.js';
import { pendingGroups, listFixes, syncMisses } from '../../api/lib/repos/jev-misses-repo.js';
import { missFixStage, decideMissFix, parseDiagnosis, missDigest, MISS_GATES } from '../../api/lib/jev-tuning/miss-fix.js';
import { resolveUnmatched } from '../../api/lib/assistant/unmatched.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { channelFor } from '../../api/lib/assistant/channels.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const GATE = 'anis-strategy';
const names = () => catalog().strategies.filter((s) => !['other', 'unmatched'].includes(s.name)).map((s) => s.name);
const criteria = () => Object.fromEntries(catalog().strategies.filter((s) => s.description).map((s) => [s.name, s.description]));
// a shaped bank row (jev-calls-repo shape): wrong = Jev chose `chose` where gold is `gold`
const row = (id, { gold, chose, state }) => ({ id, ref: `t${id}`, state, questions: { strategy: { type: 'choice', criteria: criteria() } },
  answers: { strategy: { choice: chose, confidence: 0.9 } }, chosen: { strategy: chose }, gold: { strategy: gold }, correct: chose === gold, ms: 10 });
const miss = (db, id, gold, q = `question ${id}`) => recordGap(db, { turn_id: `t${id}`, thread_id: null, question: q, label: gold, source: 'recheck', jev_choice: 'other', jev_confidence: 0.3, reason: 'unmatched:recheck' });
const DX = (gold, extra = {}) => ({ text: JSON.stringify({ cause: 'gold-wording', why: 'the description never names this class of request', gold_exemplars: ['a class phrasing one', 'a class phrasing two'], gold_description: `REVISED ${catalog().strategies.find((s) => s.name === gold).description}`.slice(0, 590), ...extra }), usd: 0.05 });
// fake Jev: a MISS-state row goes to its gold once that option's text was revised; a WANT:x row answers x unless `breakRight`
const rerunFor = (gold, { breakRight = false } = {}) => vi.fn(async (task, state, questions) => {
  const c = questions.strategy.criteria, revised = String(c[gold]).startsWith('REVISED');
  const choice = state.startsWith('MISS') ? (revised ? gold : 'other') : (breakRight && revised ? 'other' : state.slice(5));
  return { answers: { strategy: { choice, confidence: 0.9 } }, tokens: 100, ms: 5 };
});
const depsFor = (gold, { targets, right, breakRight = false, call } = {}) => {
  const all = [...targets, ...right];
  return { label: vi.fn(() => 1), calls: vi.fn(async (_g, ref) => all.filter((c) => c.ref === ref)), wrong: vi.fn(async () => targets), right: vi.fn(async () => right),
    call: call || vi.fn(async () => DX(gold)), rerun: rerunFor(gold, { breakRight }), catalog: () => catalog() };
};
const fixture = (db, gold, n = 2) => {
  const targets = Array.from({ length: n }, (_, i) => row(i + 1, { gold, chose: 'other', state: `MISS ${i}` }));
  const right = [row(50, { gold: names()[1], chose: names()[1], state: `WANT:${names()[1]}` }), row(51, { gold: 'other', chose: 'other', state: 'WANT:other' })];
  targets.forEach((t) => miss(db, t.id, gold));
  return { targets, right };
};

describe('gold label', () => {
  let dir, so, bank;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'miss-fix-'));
    process.env.SYSTEMONE_DIR = dir; process.env.DEPLOY_SECRET = 'ik'; process.env.TYPESAFE_API_KEY = 'k';
    delete process.env.INTERNAL_API_KEY; delete process.env.SYSTEMONE_EDGE_KEY; process.env.SYSTEMONE_SHADOW = '';
    vi.resetModules();
    so = await import('../../api/lib/systemone.js'); bank = await import('../../api/lib/repos/jev-calls-repo.js');
  });
  afterEach(() => so._test.reset());
  it("the recheck's answer becomes gold on the gate call of that turn (basis unmatched-recheck), tracked on the miss", async () => {
    const gold = names()[0], db = fresh();
    so.record(GATE, 'thread', { strategy: { type: 'choice', instructions: 'x', criteria: criteria() } }, { answers: { strategy: { choice: 'other', confidence: 0.3 } }, tokens: 100, ms: 5, ref: 'c1:2' });
    so.record(GATE, 'other turn', { strategy: { type: 'choice', instructions: 'x', criteria: criteria() } }, { answers: { strategy: { choice: 'other', confidence: 0.3 } }, tokens: 100, ms: 5, ref: 'c9:1' });
    so.flushCalls();
    recordGap(db, { turn_id: 'c1:2', question: 'q', label: gold, source: 'recheck', jev_choice: 'other', jev_confidence: 0.3 });
    const deps = { label: (g, r, o) => bank.labelByRef(g, r, o, 'unmatched-recheck'), calls: async (g, r) => bank.listCalls({ task: g, ref: r }),
      wrong: async () => [], right: async () => [], call: vi.fn(), rerun: vi.fn(), catalog: () => catalog() };
    const r = await missFixStage(db, { deps });
    expect(r).toMatchObject({ gate: GATE, gold, status: 'no-target' });          // labelled, but no wrong labelled call to replay in this stub
    const [c] = bank.listCalls({ task: GATE, ref: 'c1:2' });
    expect(c).toMatchObject({ gold: { strategy: gold }, gold_basis: 'unmatched-recheck', correct: false });
    expect(bank.listCalls({ task: GATE, ref: 'c9:1' })[0].gold).toBeNull();      // another turn untouched
    expect(bank.isAutoBasis('unmatched-recheck')).toBe(true);                    // a later judge may relabel it; human gold is never overwritten
  });
});

describe('diagnosis → candidate version → replay → promote', () => {
  it('fixed ≥ 1 and broken 0: the revised text is a candidate version of the gold strategy, promoted, misses closed', async () => {
    const db = fresh(), gold = names()[0], { targets, right } = fixture(db, gold), deps = depsFor(gold, { targets, right });
    const r = await missFixStage(db, { deps });
    expect(deps.call).toHaveBeenCalledTimes(1);                                  // ONE diagnosis for the group
    expect(deps.call.mock.calls[0][2]).toMatch(new RegExp(`GOLD OPTION: ${gold}`));
    expect(deps.call.mock.calls[0][2]).toMatch(/MISS 0/);                        // the thread Jev saw
    expect(r).toMatchObject({ gate: GATE, gold, status: 'promoted', strategies: [`${strategyRow(db, gold, 2).id}@2`] });
    expect(strategyRow(db, gold, 2)).toMatchObject({ status: 'active', parent_version: 1, created_by: 'opus-miss-fix' });
    expect(strategyRow(db, gold, 2).description).toMatch(/^REVISED/);
    expect(strategyRow(db, gold, 1).status).toBe('retired');
    expect(listPromotions(db)[0]).toMatchObject({ action: 'promote', created_by: 'improve-miss-fix', decision: { numbers: { fixed: 2, broken: 0, n_regress: 2 } } });
    expect(listDesigns(db)[0]).toMatchObject({ cluster_key: `miss:${GATE}:${gold}`, status: 'miss-fix', version: 2 });
    expect(pendingGroups(db, GATE)).toEqual([]);
    expect(listFixes(db)[0]).toMatchObject({ status: 'promoted', misses: 2, targets: 2 });
  });

  it('a regression on the labelled-right sample: not promoted, version stays a rejected candidate, attempt logged with the numbers', async () => {
    const db = fresh(), gold = names()[0], { targets, right } = fixture(db, gold), deps = depsFor(gold, { targets, right, breakRight: true });
    const r = await missFixStage(db, { deps });
    expect(r.status).toBe('rejected');
    expect(strategyRow(db, gold, 2).status).toBe('candidate');
    expect(strategyRow(db, gold, 1).status).toBe('active');
    expect(listPromotions(db)[0]).toMatchObject({ action: 'reject', decision: { failed: [expect.stringMatching(/broke/)], numbers: { fixed: 2, broken: 1 } } });
    expect(listFixes(db)[0].result).toMatchObject({ why: expect.stringMatching(/class of request/), failed: [expect.stringMatching(/broke 1/)] });
    expect(pendingGroups(db, GATE)).toEqual([]);                                 // attempted: not retried on the same evidence
  });

  it('the confusable option text is revised in the same replay and both versions follow the decision', async () => {
    const db = fresh(), [gold, conf] = names(), { targets, right } = fixture(db, gold);
    const call = vi.fn(async () => DX(gold, { confusable: { name: conf, exemplars: ['conf phrasing one', 'conf phrasing two'], description: `REVISED-CONF ${catalog().strategies.find((s) => s.name === conf).description}`.slice(0, 590) } }));
    const r = await missFixStage(db, { deps: depsFor(gold, { targets, right, call }) });
    expect(r.strategies).toHaveLength(2);
    expect(strategyRow(db, conf, 2)).toMatchObject({ status: 'active', created_by: 'opus-miss-fix' });
  });

  it('an invalid revision (description too short) is dropped and logged; nothing saved or promoted', async () => {
    const db = fresh(), gold = names()[0], { targets, right } = fixture(db, gold);
    const call = vi.fn(async () => ({ text: JSON.stringify({ gold_description: 'too short' }), usd: 0.04 }));
    const r = await missFixStage(db, { deps: depsFor(gold, { targets, right, call }) });
    expect(r.status).toBe('dropped');
    expect(strategyRow(db, gold, 2)).toBeNull();
    expect(listFixes(db)[0].result.errors[0]).toMatch(/description/);
  });

  it('a spend cap while diagnosing propagates and leaves the misses open', async () => {
    const db = fresh(), gold = names()[0], { targets, right } = fixture(db, gold);
    const call = vi.fn(async () => { throw Object.assign(new Error('cap'), { code: 'SPEND_CAP' }); });
    await expect(missFixStage(db, { deps: depsFor(gold, { targets, right, call }) })).rejects.toThrow('cap');
    expect(pendingGroups(db, GATE)[0].misses).toHaveLength(2);
  });
});

describe('grouping', () => {
  it('one group per run (biggest first); an attempted group is skipped until it has a new miss; then idle', async () => {
    const db = fresh(), [a, b] = names();
    const ta = [1, 2].map((i) => row(i, { gold: a, chose: 'other', state: `MISS a${i}` })), tb = [3].map((i) => row(i, { gold: b, chose: 'other', state: `MISS b${i}` }));
    [...ta, ...tb].forEach((t) => miss(db, t.id, t.gold.strategy));
    const call = vi.fn(async (_r, _s, user) => DX(/GOLD OPTION: (\S+)/.exec(user)[1]));
    const deps = depsFor(a, { targets: [...ta, ...tb], right: [], call });
    deps.rerun = vi.fn(async (t, state, q) => ({ answers: { strategy: { choice: state.startsWith('MISS') ? Object.keys(q.strategy.criteria).find((k) => String(q.strategy.criteria[k]).startsWith('REVISED')) : 'other', confidence: 0.9 } }, tokens: 1, ms: 1 }));
    deps.wrong = vi.fn(async () => [...ta, ...tb]);
    expect((await missFixStage(db, { deps })).gold).toBe(a);                    // 2 misses beat 1
    expect((await missFixStage(db, { deps })).gold).toBe(b);
    expect(await missFixStage(db, { deps })).toBe('idle');
    expect(call).toHaveBeenCalledTimes(2);
    const t4 = row(4, { gold: a, chose: 'other', state: 'MISS a4' }); miss(db, 4, a); deps.wrong = vi.fn(async () => [t4]); deps.calls = vi.fn(async () => [t4]);
    expect((await missFixStage(db, { deps })).gold).toBe(a);                    // a new miss reopens the group
    expect(call).toHaveBeenCalledTimes(3);
  });
});

describe('the reply path feeds the loop and gains nothing', () => {
  it('a recheck hit records exactly one gap row (as before); the ledger picks it up from there', async () => {
    const db = fresh(), gold = names()[0], Q = 'How did the Nineteen Day Feast develop over the decades?';
    const direction = { channel: channelFor('site-chat', { trusted: true }), decisions: decisionLog(), turnId: 'c1:3', strategy: { strategy: { choice: 'other', confidence: 0.3 }, sides: [] } };
    await resolveUnmatched({ direction, messages: [], question: Q, run: async () => ({ passages: [] }) }, { db, recheck: async () => ({ strategy: gold, confidence: 0.9 }) });
    expect(db.prepare('SELECT COUNT(*) AS n FROM strategy_gaps').get().n).toBe(1);
    expect(syncMisses(db, GATE)).toBe(1);
    expect(db.prepare('SELECT turn_id, gold, jev_choice FROM jev_misses').get()).toEqual({ turn_id: 'c1:3', gold, jev_choice: 'other' });
    expect(syncMisses(db, GATE)).toBe(0);                                         // idempotent
  });
});

describe('pure pieces + digest', () => {
  it('decideMissFix and parseDiagnosis', () => {
    expect(decideMissFix({ labelled: 4, broken: 0, by_src: { target: { fixed: 1, n: 2 } } }).promote).toBe(true);
    expect(decideMissFix({ labelled: 4, broken: 1, by_src: { target: { fixed: 1 } } }).failed[0]).toMatch(/broke 1/);
    expect(decideMissFix({ labelled: 4, broken: 0, by_src: { target: { fixed: 0 } } }).promote).toBe(false);
    expect(decideMissFix({ labelled: 4, broken: 0, truncated: 'x', by_src: { target: { fixed: 1 } } }).promote).toBe(false);
    expect(parseDiagnosis('nope')).toBeNull();
    expect(parseDiagnosis('{"gold_description":"d","confusable":{"name":"a","description":"b"}}')).toMatchObject({ gold_description: 'd', confusable: { name: 'a' } });
    expect(Object.keys(MISS_GATES)).toEqual([GATE]);
  });
  it('digest: misses vs the previous period per 100 gate calls, fixes tried/promoted; a rate that does not fall is a defect', async () => {
    const db = fresh(), gold = names()[0], now = Date.parse('2026-11-08T12:00:00Z'), { targets, right } = fixture(db, gold);
    await missFixStage(db, { deps: depsFor(gold, { targets, right }) });
    const stamp = (id, at) => db.prepare('UPDATE jev_misses SET created_at = ? WHERE turn_id = ?').run(at, `t${id}`);
    stamp(1, '2026-11-08 06:00:00'); stamp(2, '2026-11-07 18:00:00');                // one this period, one in the previous
    const fixAt = db.prepare('UPDATE jev_miss_fixes SET created_at = ?').run('2026-11-08 08:00:00');
    const d = missDigest(db, { since: '2026-11-08T00:00:00Z', now, countCalls: (g, { from }) => (from >= Date.parse('2026-11-08T00:00:00Z') ? 50 : 100) });
    expect(d).toMatchObject({ misses: 1, calls: 50, rate: 2, prev_rate: 1, trend: 'rising', defect: true, fixes_tried: 1, promoted: 1, by_gold: { [gold]: 1 } });
    expect(fixAt.changes).toBe(1);
  });
  it('digest text prints the block', async () => {
    const { digestText } = await import('../../api/lib/audit/improve-digest-text.js');
    const t = digestText({ since: 's', assessment: {}, code: [], data: [], proposals: [], jev_misses: { gate: GATE, misses: 3, calls: 100, rate: 3, prev_rate: 2, trend: 'rising', defect: true, fixes_tried: 1, promoted: 0, rejected: 1, by_gold: { x: 3 }, fixes: [{ status: 'rejected', gold: 'x', misses: 3, strategies: ['x@2'], why: 'w', failed: ['broke 1'] }] } });
    expect(t).toMatch(/JEV MISSES[\s\S]*DEFECT[\s\S]*rejected x \(3 miss\(es\)\) x@2 — w \[broke 1\]/);
  });
});

describe('improve worker wiring', () => {
  it('the miss-fix unit runs after edit and before theory/promotion; idle falls through; a spend cap waits', async () => {
    const { strategyWork } = await import('../../api/workers/improve-worker.js');
    const calls = [];
    const base = { db: {}, designStage: async () => 'idle', promotionStage: async () => { calls.push('promote'); return 'idle'; }, liveMissDeps: async () => ({}) };
    expect(await strategyWork({ deps: { ...base, missFixStage: async () => { calls.push('miss'); return { gate: GATE, gold: 'x', status: 'promoted', usd: 0.1 }; } } })).toBe('done');
    expect(calls).toEqual(['miss']);
    calls.length = 0;
    expect(await strategyWork({ deps: { ...base, missFixStage: async () => 'idle' } })).toBe('idle');
    expect(calls).toEqual(['promote']);
    const cap = Object.assign(new Error('cap'), { code: 'SPEND_CAP', retryAfterMs: 9 });
    expect(await strategyWork({ deps: { ...base, missFixStage: async () => { throw cap; } } })).toEqual({ wait: 9 });
  });
});
