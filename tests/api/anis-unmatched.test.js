// Unmatched runtime (unmatched.js: reuse / recheck / design a strategy for a turn Jev could not match) and the spoken progress lines
// (narrate.js: live channels only). Fake recheck + fake Opus; a real in-memory strategies store.
import { describe, it, expect, afterEach, vi } from 'vitest';
vi.mock('../../api/lib/repos/ai-usage-repo.js', () => ({ dailySpendByCaller: vi.fn(async () => ({})) }));
import { openStrategiesDb, catalog, resetStrategiesCache } from '../../api/lib/repos/strategies-repo.js';
import { ensureCandidatesSchema, openGaps, listCandidates, listDesigns, heldQuestions } from '../../api/lib/repos/strategy-candidates-repo.js';
import { resolveUnmatched, isUnmatched, withStrategyPin } from '../../api/lib/assistant/unmatched.js';
import { narrate } from '../../api/lib/assistant/narrate.js';
import { channelFor } from '../../api/lib/assistant/channels.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { currentAIContext } from '../../api/lib/ai-context.js';

afterEach(() => resetStrategiesCache());
const fresh = () => { const db = ensureCandidatesSchema(openStrategiesDb(':memory:')); resetStrategiesCache({ db }); return db; };

const GOOD = {
  name: 'timeline', description: 'The reader wants the HISTORY of a practice or institution told in order, era by era, from the passages.',
  exemplars: ['How did the Nineteen Day Feast develop over time?', 'Trace how the Huqúqu’lláh was introduced, step by step.'],
  templates: [{ id: 'timeline.how', text: 'Tell it as a TIMELINE, oldest first. {{base}}' }],
  steps: [{ id: 'timeline.order', activity: 'strategy.understanding', params: { how: 'timeline.how' } }],
  graph: { entry: 'order', nodes: { order: { step: 'timeline.order' } }, edges: [{ from: 'order', on: '*', to: '$end' }] },
};
const opus = (o) => vi.fn(async () => ({ text: JSON.stringify(o), usd: 0.06 }));
const OUT = { passages: [{ text: 'p' }], plan: { shape: 'x' }, format: { id: 'x', by: 'test' } };
const turn = (channel = 'site-chat', choice = 'other') => {
  const events = [], decisions = decisionLog();
  const direction = { channel: channelFor(channel, { trusted: true }), decisions, turnId: `c1:${Math.random()}`, strategy: { strategy: { choice, confidence: 0.3 }, sides: [] } };
  return { direction, decisions, events, onEvent: (e) => events.push(e) };
};
const Q = 'How did the Nineteen Day Feast develop over the decades?';
const points = (t) => t.decisions.list().map((d) => d.point);
const rand0 = () => 0;

describe('isUnmatched', () => {
  it("'other' today and 'unmatched' after the rename; a real strategy, and no Jev answer, are not", () => {
    expect(isUnmatched({ strategy: { choice: 'other' } })).toBe(true);
    expect(isUnmatched({ strategy: { choice: 'unmatched' } })).toBe(true);
    expect(isUnmatched({ strategy: { choice: 'understanding' } })).toBe(false);
    expect(isUnmatched(null)).toBe(false);
  });
});

describe('Unmatched: recheck', () => {
  it('a confident fit runs that strategy as if Jev had chosen it, and records the miss', async () => {
    const db = fresh(), t = turn(), run = vi.fn(async () => OUT), call = opus(GOOD);
    const recheck = vi.fn(async () => ({ strategy: 'understanding', confidence: 0.9 }));
    const r = await resolveUnmatched({ direction: t.direction, messages: [{ role: 'user', content: Q }], question: Q, onEvent: t.onEvent, run }, { db, recheck, call, rand: rand0 });
    expect(r).toMatchObject({ via: 'recheck', name: 'understanding', out: OUT });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ strategy: expect.objectContaining({ choice: 'understanding', was: 'other', via: 'recheck' }) }));
    expect(t.direction.strategy.strategy.choice).toBe('understanding');
    expect(call).not.toHaveBeenCalled();                                     // no Opus when a fast model finds the fit
    expect(openGaps(db)).toMatchObject([{ question: Q, label: 'understanding', source: 'recheck', jev_choice: 'other' }]);
    expect(points(t)).toEqual(['unmatched:recheck']);
    expect(t.decisions.list()[0]).toMatchObject({ chosen: 'understanding', probabilities: { understanding: 0.9 } });
    expect(t.events).toEqual([{ type: 'status', text: expect.stringMatching(/know/) }]);   // narrated (live channel): recheck_fit
  });

  it('a low-confidence or unknown name is no fit → design', async () => {
    const db = fresh(), t = turn(), run = vi.fn(async () => OUT);
    for (const re of [{ strategy: 'understanding', confidence: 0.3 }, { strategy: 'no_such', confidence: 0.99 }, { strategy: null, confidence: 0 }]) {
      const call = opus(GOOD);
      const dir = turn().direction;
      await resolveUnmatched({ direction: dir, messages: [], question: `${Q} ${Math.random()}`, onEvent: t.onEvent, run }, { db: fresh(), recheck: async () => re, call });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Unmatched: design and reuse', () => {
  it('designs a candidate (saved as a candidate, tied to the question), pins it and runs it for this turn', async () => {
    const db = fresh(), t = turn(), run = vi.fn(async () => OUT), call = opus(GOOD);
    const r = await resolveUnmatched({ direction: t.direction, messages: [{ role: 'user', content: Q }], question: Q, onEvent: t.onEvent, run }, { db, recheck: async () => null, call, rand: rand0 });
    expect(r).toMatchObject({ via: 'design', name: 'timeline', out: OUT });
    expect(call).toHaveBeenCalledTimes(1);
    expect(listCandidates(db).map((c) => `${c.id}@${c.version}:${c.created_by}`)).toEqual(['timeline@1:unmatched-live']);   // a CANDIDATE: promotion decides
    expect(catalog().strategies.some((s) => s.name === 'timeline')).toBe(false);        // not active
    expect(listDesigns(db)).toMatchObject([{ status: 'new', strategy_id: 'timeline', version: 1, usd: 0.06 }]);
    expect(heldQuestions(db, 'timeline', 1)).toEqual([Q]);
    expect(t.direction.strategy.strategy).toMatchObject({ choice: 'timeline', was: 'other', via: 'design' });
    expect(t.direction.strategyPin.row.id).toBe('timeline');
    expect(points(t)).toEqual(['unmatched:recheck', 'unmatched:design']);
    expect(t.events.map((e) => e.type)).toEqual(['status', 'status', 'status']);        // new, planning, planned
    // the pin is what lets the not-yet-active graph and its template run
    await withStrategyPin(t.direction, async () => expect(currentAIContext().strategyPin).toBe(t.direction.strategyPin));
    await withStrategyPin({}, async () => expect(currentAIContext().strategyPin).toBeUndefined());
  });

  it('a like question later re-runs the pending candidate with no model call', async () => {
    const db = fresh(), run = vi.fn(async () => OUT), call = opus(GOOD), recheck = vi.fn(async () => null);
    const first = turn();
    await resolveUnmatched({ direction: first.direction, messages: [], question: Q, onEvent: first.onEvent, run }, { db, recheck, call });
    recheck.mockClear();
    const t = turn();
    const r = await resolveUnmatched({ direction: t.direction, messages: [], question: 'How did the Nineteen Day Feast develop across the decades?', onEvent: t.onEvent, run }, { db, recheck, call });
    expect(r).toMatchObject({ via: 'reuse', name: 'timeline' });
    expect(call).toHaveBeenCalledTimes(1);                                              // only the first design
    expect(recheck).not.toHaveBeenCalled();
    expect(points(t)).toEqual(['unmatched:reuse']);
    expect(t.direction.strategyPin.row.id).toBe('timeline');
  });

  it('a pending candidate named by the recheck runs too (pinned)', async () => {
    const db = fresh(), run = vi.fn(async () => OUT);
    await resolveUnmatched({ direction: turn().direction, messages: [], question: Q, onEvent: () => {}, run }, { db, recheck: async () => null, call: opus(GOOD) });
    const t = turn(), seen = [];
    const r = await resolveUnmatched({ direction: t.direction, messages: [], question: 'Explain the sequence of the Huqúqu’lláh law', onEvent: t.onEvent, run },
      { db, recheck: async ({ options }) => { seen.push(options.map((o) => o.name)); return { strategy: 'timeline', confidence: 0.8 }; }, call: opus(GOOD) });
    expect(seen[0]).toContain('timeline');
    expect(seen[0]).toContain('understanding');
    expect(r).toMatchObject({ via: 'recheck', name: 'timeline' });
    expect(t.direction.strategyPin.row.id).toBe('timeline');
  });
});

describe('Unmatched: any failure falls back (null → the researcher / general reply)', () => {
  const go = (t, io, run = vi.fn(async () => OUT)) => resolveUnmatched({ direction: t.direction, messages: [], question: Q, onEvent: t.onEvent, run }, { recheck: async () => null, ...io });
  it('Opus throws', async () => {
    const t = turn(), before = t.direction.strategy;
    expect(await go(t, { db: fresh(), call: vi.fn(async () => { throw new Error('spend cap'); }) })).toBeNull();
    expect(t.direction.strategy).toBe(before);
    expect(t.direction.strategyPin).toBeUndefined();
    expect(points(t)).toContain('unmatched:fallback');
  });
  it('an invalid design twice is dropped and logged, never retried on the same evidence', async () => {
    const db = fresh(), t = turn(), call = opus({ name: 'x' });
    expect(await go(t, { db, call })).toBeNull();
    expect(call).toHaveBeenCalledTimes(2);
    expect(listDesigns(db)).toMatchObject([{ status: 'dropped', attempts: 2 }]);
    expect(listCandidates(db)).toEqual([]);
    expect(points(t)).toContain('unmatched:design');
  });
  it('the recheck throws → still designs', async () => {
    const t = turn(), r = await go(t, { db: fresh(), recheck: async () => { throw new Error('down'); }, call: opus(GOOD) });
    expect(r.via).toBe('design');
  });
  it('the chosen strategy finds nothing to execute → direction restored, null', async () => {
    const t = turn(), before = t.direction.strategy;
    expect(await go(t, { db: fresh(), call: opus(GOOD) }, vi.fn(async () => null))).toBeNull();
    expect(t.direction.strategy).toBe(before);
    expect(t.direction.strategyPin).toBeUndefined();
    expect(points(t).at(-1)).toBe('unmatched:fallback');
  });
  it('no store at all → null', async () => {
    const t = turn();
    expect(await go(t, { db: { prepare() { throw new Error('no db'); }, exec() { throw new Error('no db'); } }, call: opus(GOOD) })).toBeNull();
  });
});

describe('narrate: spoken progress, live channels only', () => {
  const live = channelFor('site-chat'), widget = channelFor('widget-chat'), email = channelFor('email', { trusted: true });
  it('only channels with the progress capability speak; email never', () => {
    expect(live.progress && widget.progress).toBe(true);
    expect(email.progress).toBeUndefined();
    const ev = [];
    expect(narrate((e) => ev.push(e), email, 'unmatched.new')).toBeNull();
    expect(narrate((e) => ev.push(e), null, 'unmatched.new')).toBeNull();
    expect(ev).toEqual([]);
    expect(narrate((e) => ev.push(e), live, 'unmatched.new')).toMatch(/question/);
    expect(ev).toEqual([{ type: 'status', text: expect.stringMatching(/question/) }]);
  });
  it('several variants per key, chosen at random; slots fill; no machinery words', () => {
    const keys = ['unmatched.new', 'unmatched.planning', 'unmatched.planned', 'unmatched.recheck_fit', 'research.round', 'research.reading', 'research.reading_more',
      'strategy.compilation.start', 'strategy.understanding.start', 'strategy.comparison.start', 'deep_report.queued'];
    for (const k of keys) {
      const seen = new Set();
      for (const r of [0, 0.4, 0.99]) seen.add(narrate(() => {}, live, k, { book: 'Gleanings' }, { rand: () => r }));
      expect(seen.size, k).toBeGreaterThanOrEqual(2);
      for (const text of seen) { expect(text).toBeTruthy(); expect(text).not.toMatch(/qdrant|index|embedding|query|\{\{/i); }
    }
    expect(narrate(() => {}, live, 'research.reading', { book: 'Gleanings' }, { rand: () => 0 })).toContain('Gleanings');
  });
  it('a key with no words (a strategy that is fast) is silent; a throwing sink never breaks the turn', () => {
    expect(narrate(() => { throw new Error('x'); }, live, 'strategy.prayer.start')).toBeNull();
    expect(narrate(() => { throw new Error('x'); }, live, 'unmatched.new')).toBeNull();
  });
});
