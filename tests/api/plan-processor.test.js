// Grounding processor modes — the plan-follower that makes the app follow the history plan on its own.
// Pure logic on injected fakes (no DB/network): the resume-stage classifier + the ordered refill + mode switch.
import { describe, it, expect, beforeEach } from 'vitest';
import { resumeStageFor, followPlanTick, getMode, setMode } from '../../api/lib/pipeline/plan.js';

// canned grounding snapshot; defaults = fully-grounded (→ null). Override fields per case.
const snap = (o) => ({ queryOne: async () => ({ prose: 100, disamb: 100, hyped: 100, hypeable: 100, claimsBound: 10, clusters: 10, decisions: 10, ...o }) });

describe('resumeStageFor — the stage a book must resume from (inverse of reachedBound)', () => {
  it('empty doc (no prose) → null (ungroundable, skip)', async () => {
    expect(await resumeStageFor(1, snap({ prose: 0 }))).toBeNull();
  });
  it('disambiguation incomplete → {} (full run)', async () => {
    expect(await resumeStageFor(1, snap({ disamb: 50 }))).toEqual({});      // 50/100 < 0.98
  });
  it('reconcile incomplete → {} (full run)', async () => {
    expect(await resumeStageFor(1, snap({ decisions: 5, clusters: 100 }))).toEqual({}); // 5 < 0.85*100
  });
  it('read-half done but NO entity bindings → {from:project} (graph tail + HyPE)', async () => {
    expect(await resumeStageFor(1, snap({ claimsBound: 0 }))).toEqual({ from: 'project' });
  });
  it('everything but HyPE done → {from:hype} (only the retrieval index)', async () => {
    expect(await resumeStageFor(1, snap({ hyped: 50, hypeable: 100 }))).toEqual({ from: 'hype' }); // 50 < 0.9*100
  });
  it('fully grounded → null (done, nothing to do — this is the 13433 case AFTER HyPE)', async () => {
    expect(await resumeStageFor(1, snap({}))).toBeNull();
  });
});

describe('followPlanTick — keeps the next N incomplete plan books queued, in order, resuming from real stage', () => {
  it('enqueues the next incomplete books in plan order, position=plan index, correct opts; skips done; honors lookahead', async () => {
    const calls = [];
    const books = [{ id: 1, done: true }, { id: 2, done: false }, { id: 3, done: false }, { id: 4, done: false }];
    const deps = {
      getProgress: async () => ({ phases: [{ books }] }),
      list: async () => [],                                            // empty queue
      resumeStageFor: async (id) => (id === 2 ? { from: 'hype' } : id === 3 ? { from: 'project' } : {}),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    const r = await followPlanTick({ lookahead: 2, deps });
    expect(calls).toEqual([                                            // id1 skipped (done); stops after 2
      { docId: 2, position: 1, from: 'hype' },
      { docId: 3, position: 2, from: 'project' },
    ]);
    expect(r.added).toHaveLength(2);
  });

  it('an already-queued book is NOT duplicated but counts toward lookahead', async () => {
    const calls = [];
    const books = [{ id: 2, done: false }, { id: 3, done: false }];
    const deps = {
      getProgress: async () => ({ phases: [{ books }] }),
      list: async () => [{ doc_id: 2, status: 'running' }],           // id2 already in flight
      resumeStageFor: async () => ({ from: 'hype' }),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    await followPlanTick({ lookahead: 2, deps });
    expect(calls).toEqual([{ docId: 3, position: 1, from: 'hype' }]); // id2 skipped (active), id3 enqueued
  });

  it('includes phase GROUPS (pilgrim primary sources) in plan order, after that phase\'s books', async () => {
    const calls = [];
    const deps = {
      getProgress: async () => ({ phases: [
        { books: [{ id: 1, done: false }], groups: [{ books: [{ id: 2, done: false }, { id: 3, done: false }] }] },
        { books: [{ id: 9, done: false }] },   // next phase (e.g. biographies) — must come AFTER the groups
      ] }),
      list: async () => [],
      resumeStageFor: async () => ({}),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    await followPlanTick({ lookahead: 4, deps });
    expect(calls.map((c) => c.docId)).toEqual([1, 2, 3, 9]);   // book, then its group docs, then next phase
  });

  it('does nothing when the queue already holds >= lookahead active books (cheap early-exit)', async () => {
    const calls = [];
    const deps = {
      getProgress: async () => ({ phases: [{ books: [{ id: 5, done: false }] }] }),
      list: async () => [{ doc_id: 8, status: 'running' }, { doc_id: 9, status: 'queued' }, { doc_id: 10, status: 'queued' }],
      resumeStageFor: async () => ({}),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    const r = await followPlanTick({ lookahead: 2, deps });
    expect(calls).toEqual([]);
    expect(r.active).toBe(3);
  });
});

describe('processor mode', () => {
  beforeEach(() => setMode('plan'));
  it('defaults to plan and switches validly', () => {
    expect(getMode()).toBe('plan');
    expect(setMode('override')).toBe('override');
    expect(getMode()).toBe('override');
    expect(setMode('general')).toBe('general');
  });
  it('rejects an invalid mode', () => {
    expect(() => setMode('bogus')).toThrow(/invalid grounding mode/);
  });
});
