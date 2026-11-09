// A candidate strategy must stay DISTINGUISHABLE for Jev: real labelled calls re-asked with its option added (broken / confidence
// drops reject it), the same confidence rule on miss-fix and strategy-gate theories, and the design's "new task or setting-of?" answer.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, resetStrategiesCache, catalog } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, saveCandidate, listDesigns, listPromotions, openGaps, confusionDigest } from '../../api/lib/repos/strategy-candidates-repo.js';
import { validateCandidate, designCandidate } from '../../api/lib/assistant/strategy-design.js';
import { captureGap, designStage, promoteCandidate } from '../../api/lib/assistant/strategy-improve.js';
import { decidePromotion } from '../../api/lib/assistant/strategy-promote.js';
import { runExperiment } from '../../api/lib/jev-tuning/experiment.js';
import { resolveVariant } from '../../api/lib/jev-tuning/variants.js';
import { decideMissFix } from '../../api/lib/jev-tuning/miss-fix.js';
import { decideTheory, theoryStage } from '../../api/lib/jev-tuning/theories.js';
import { IMPROVE_CFG } from '../../api/lib/assistant/strategy-gaps.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };
const reply = (o) => ({ text: JSON.stringify(o), usd: 0.05 });
const GOOD = {
  difference: 'It tells a development in order, era by era.', name: 'timeline', description: 'The reader wants the HISTORY of a practice or institution told in order, era by era, from the passages.',
  exemplars: ['How did the Nineteen Day Feast develop over time?', 'Trace how the Huqúqu’lláh was introduced, step by step.'],
  templates: [{ id: 'timeline.how', text: 'Tell it as a TIMELINE, oldest first. {{base}}' }],
  steps: [{ id: 'timeline.order', activity: 'strategy.understanding', params: { how: 'timeline.how' } }],
  graph: { entry: 'order', nodes: { order: { step: 'timeline.order' } }, edges: [{ from: 'order', on: '*', to: '$end' }] },
};
// real strategy-gate calls: labelled, stored answers with confidence; options end with 'unmatched'
const SQ = { strategy: { type: 'choice', instructions: 'which?', criteria: { prayer: 'a prayer', understanding: 'explain an idea', unmatched: 'anything else' } } };
const call = (i, gold, conf = 0.9) => ({ id: i, ref: `t${i}`, state: `USER: q${i}`, questions: SQ, gold: { strategy: gold }, answers: { strategy: { choice: gold, confidence: conf } }, ms: 5 });
const sample = [call(1, 'prayer'), call(2, 'understanding'), call(3, 'prayer')];
// stub Jev: with the timeline option present it answers per `rule(state, hadOption)`
const jev = (rule) => async (_t, state, questions) => ({ answers: { strategy: rule(state, 'timeline' in questions.strategy.criteria) }, tokens: 10, ms: 1 });
const replayWith = (rule, rows = sample) => async ({ pin }) => runExperiment({ task: 'anis-strategy', baseline: 'stored', minConfidence: 0.6,
  variant: { id: 'add-option', params: { question: 'strategy', option: pin.row.name, text: pin.row.description } }, rows }, { rerun: jev(rule) });

describe('add-option variant', () => {
  it('adds the option before the last one; replaces an existing one in place', async () => {
    const v = resolveVariant({ id: 'add-option', params: { question: 'strategy', option: 'timeline', text: 'history' } });
    const a = await v.apply({ state: 's', questions: SQ, params: v.params });
    expect(Object.keys(a.questions.strategy.criteria)).toEqual(['prayer', 'understanding', 'timeline', 'unmatched']);
    const r = resolveVariant({ id: 'add-option', params: { question: 'strategy', option: 'prayer', text: 'new text' } });
    expect((await r.apply({ state: 's', questions: SQ, params: r.params })).questions.strategy.criteria.prayer).toBe('new text');
    expect(SQ.strategy.criteria.timeline).toBeUndefined();   // the source is never mutated
  });
});

describe('real-call replay at promotion', () => {
  const run = async (rule, extra = {}) => {
    const db = fresh();
    const saved = saveCandidate(db, validateCandidate(GOOD, { cat: catalog() }).normalized);
    const deps = { writeQuestions: async () => ({ class: ['c1', 'c2', 'c3'], guard: [], usd: 0 }),
      tryTurn: async ({ pin }) => ({ reply: pin ? 'cand' : 'cur', path: {}, ms: 900, usd: 0.02, jev_pick: pin ? 'timeline' : null }),
      judge: async ({ reply: t }) => ({ verdict: 'pass', score: t === 'cand' ? 9 : 6, usd: 0 }), jevPick: async () => 'prayer', replay: replayWith(rule), ...extra };
    return { db, saved, r: await promoteCandidate(db, { id: saved.id, version: saved.version, deps, by: 'test' }) };
  };
  it('a clean candidate (every real call keeps its label and its confidence) is promoted; numbers reported', async () => {
    const { r } = await run((s) => ({ choice: /q2/.test(s) ? 'understanding' : 'prayer', confidence: 0.9 }));
    expect(r.promoted).toBe(true);
    expect(r.decision.numbers).toMatchObject({ replay_n: 3, replay_broken: 0, replay_confidence_drops: 0 });
  });
  it('a candidate that STEALS a real labelled call is not promoted', async () => {
    const { r, db } = await run((s, has) => ({ choice: has && /q1/.test(s) ? 'timeline' : /q2/.test(s) ? 'understanding' : 'prayer', confidence: 0.9 }));
    expect(r.promoted).toBe(false);
    expect(r.decision.numbers.replay_broken).toBe(1);
    expect(r.decision.failed.join()).toMatch(/1 now go to another option/);
    expect(listPromotions(db)[0]).toMatchObject({ action: 'reject' });
    expect(confusionDigest(db, { since: '2000-01-01 00:00:00' }).rejected[0]).toMatchObject({ strategy: 'timeline', broken: 1 });
  });
  it('a candidate that drops a confident call below MIN_CONFIDENCE (0.6) is not promoted, though the choice is unchanged', async () => {
    const { r } = await run((s, has) => ({ choice: /q2/.test(s) ? 'understanding' : 'prayer', confidence: has && /q3/.test(s) ? 0.45 : 0.9 }));
    expect(r.promoted).toBe(false);
    expect(r.decision.numbers).toMatchObject({ replay_broken: 0, replay_confidence_drops: 1 });
    expect(r.decision.failed.join()).toMatch(/fall from confident/);
  });
  it('a call that was already below the floor is not counted as a drop', async () => {
    const rows = [call(1, 'prayer', 0.4)];
    const res = await replayWith(() => ({ choice: 'prayer', confidence: 0.3 }), rows)({ pin: { row: { name: 'timeline', description: 'd' } } });
    expect(res.confidence_drops).toBe(0);
  });
  it('decidePromotion reads the replay numbers (pure)', () => {
    expect(decidePromotion([], { name: 'x', replay: { broken: 0, confidence_drops: 0, labelled: 5 } }).numbers).toMatchObject({ replay_n: 5 });
    expect(decidePromotion([], { name: 'x', replay: { broken: 2, confidence_drops: 1, labelled: 5 } }).failed.join()).toMatch(/2 now go.*1 real call/s);
  });
});

describe('miss-fix and the strategy-gate theory share the confidence rule', () => {
  it('decideMissFix rejects a confidence drop; the config keys exist', () => {
    const res = { labelled: 5, broken: 0, confidence_drops: 1, by_src: { target: { fixed: 1, n: 1 } }, accuracy: {} };
    expect(decideMissFix(res).failed.join()).toMatch(/fall below the Jev confidence floor/);
    expect(decideMissFix({ ...res, confidence_drops: 0 }).promote).toBe(true);
    expect(IMPROVE_CFG.miss_fix.max_confidence_drops).toBe(0);
    expect(IMPROVE_CFG.promote).toMatchObject({ regress_n: 60, max_replay_broken: 0, max_confidence_drops: 0 });
    expect(IMPROVE_CFG.theory.gates['anis-strategy']).toMatchObject({ max_broken: 0, max_confidence_drops: 0, promote: { jev_guard_max: 0 } });
  });
  it('decideTheory with max_confidence_drops', () => {
    const res = { labelled: 5, broken: 0, confidence_drops: 2, accuracy: { baseline: 0.2, variant: 0.8 }, avg_tokens: { baseline: 10, variant: 10 } };
    const c = { margin: 0.05, max_broken: 0, token_ratio: 1.5 };
    expect(decideTheory(res, c).win).toBe(true);                                   // other gates: no rule
    expect(decideTheory(res, { ...c, max_confidence_drops: 0 }).failed.join()).toMatch(/confidence floor/);
  });
  it('a theory on the strategy gate that breaks 1 call is rejected; the same theory on another gate keeps max_broken 2', async () => {
    const Q = { strategy: { type: 'choice', instructions: 'i', criteria: { book: 'b', topic: 't' } } };
    const bank = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, ref: `t${i}`, state: `USER: ${i}`, questions: Q, gold: { strategy: i === 0 ? 'topic' : 'book' } }));
    const rerun = async (_t, state) => ({ answers: { strategy: { choice: /HINT/.test(state) ? (/USER: 0/.test(state) ? 'book' : 'book') : 'topic', confidence: 0.9 } }, tokens: 10, ms: 1 });
    const cfg = { synthetic_n: 1, historic_n: 6, margin: 0.05, max_broken: 2, token_ratio: 1.5, max_usd: 1, per_day: 6, promote: { margin: -0.3, jev_guard_max: 999 },
      gates: { 'anis-strategy': { max_broken: 0, max_confidence_drops: 0, promote: { jev_guard_max: 0 } } } };
    const stage = async (gate) => {
      const db = fresh(); const sug = [];
      const deps = { call: vi.fn(async (_r, system) => (/SYNTHETIC/.test(system) ? reply({ cases: [{ state: 'USER: s', gold: { strategy: 'book' } }] })
        : reply({ theories: [{ kind: 'enrich', variant: 'state-append', params: { text: 'HINT' }, why: 'w' }] }))),
        weak: async () => [{ item_key: `reply:${gate}`, gate, right: 'book', why: 'w' }], sample: async () => bank, rerun,
        applySuggestions: (ins) => { sug.push(...ins); return ins.map((_, i) => i); }, saveCandidate: () => ({ id: 'x', version: 2 }), logDesign: () => 1, promote: vi.fn() };
      return theoryStage(db, { deps, cat: catalog(), cfg });
    };
    const strat = await stage('anis-strategy');
    expect(strat.theories[0].verdict).toBe('lost');
    expect(strat.theories[0].failed.join()).toMatch(/broke 1 \(max 0\)/);
    expect((await stage('anis-triage')).theories[0].verdict).toBe('code');         // another gate: broke 1 ≤ 2 → a win
  });
});

describe('design: a new task, or a setting of an existing strategy?', () => {
  const qs = ['How did the Nineteen Day Feast develop over time?', 'How did the Feast develop over the decades since 1844?', 'How did the Nineteen Day Feast develop through its history?'];
  const gaps = (db) => qs.forEach((q, i) => captureGap(db, { turnId: `t${i}`, threadId: `th${i % 2}`, question: q,
    path: { decisions: [{ point: 'strategy', reason: 'low-confidence', chosen: 'other', probabilities: { understanding: 0.4, other: 0.35 } }] } }));
  it('setting_of an active strategy: no candidate saved, logged as setting-of:<X>, the gaps closed', async () => {
    const db = fresh(); gaps(db);
    const r = await designStage(db, { call: async () => reply({ setting_of: 'understanding', difference: null, why: 'the same explanation with a historical topic' }) });
    expect(r).toMatchObject({ status: 'setting-of:understanding' });
    expect(listDesigns(db)[0]).toMatchObject({ status: 'setting-of:understanding', strategy_id: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM strategies WHERE status = 'candidate'").get().n).toBe(0);
    expect(openGaps(db)).toHaveLength(0);
    expect(confusionDigest(db, { since: '2000-01-01 00:00:00' }).setting_of[0]).toMatchObject({ setting_of: 'understanding' });
  });
  it('a new task must state the one-sentence difference (else one retry with the error); setting_of must name an active strategy', async () => {
    fresh();
    const cluster = { key: 'k', label: 'understanding', questions: ['a b c'], reasons: [] };
    const seen = [];
    const c = vi.fn(async (_r, _s, user) => { seen.push(user); return seen.length === 1 ? reply({ ...GOOD, difference: '' }) : seen.length === 2 ? reply({ setting_of: 'nonsense' }) : reply(GOOD); });
    expect(await designCandidate(cluster, { cat: catalog(), call: c })).toMatchObject({ ok: false, attempts: 2 });
    expect(seen[1]).toMatch(/difference/);
    expect(await designCandidate(cluster, { cat: catalog(), call: async () => reply(GOOD) })).toMatchObject({ ok: true });
  });
});
