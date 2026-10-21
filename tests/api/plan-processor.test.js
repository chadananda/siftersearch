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
    // HyPE must be INCOMPLETE for the book to have remaining work — HyPE is the last stage, so a fully
    // hyped book is done even with zero bound claims (a legitimately entity-sparse book). The fixture used
    // to leave hyped=hypeable=100 and still expect a re-run, which is the old claimsBound-first order that
    // re-ground sparse books forever.
    expect(await resumeStageFor(1, snap({ claimsBound: 0, hyped: 0 }))).toEqual({ from: 'project' });
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

  it('parks docs whose language has no capable extraction model — never enqueued (no token churn)', async () => {
    const calls = [];
    const books = [{ id: 1, done: false }, { id: 2, done: false }, { id: 3, done: false }];
    const deps = {
      getProgress: async () => ({ phases: [{ books }] }),
      list: async () => [],
      // The language-gate query is the one mentioning `language`; id2 is unsupported (e.g. German).
      queryAll: async (sql) => (sql.includes('language') ? [{ id: 2 }] : []),
      resumeStageFor: async () => ({}),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    const r = await followPlanTick({ lookahead: 5, deps });
    expect(calls.map((c) => c.docId)).toEqual([1, 3]);   // id2 parked, never enqueued
    expect(r.parked).toEqual([2]);
  });

  it('quarantines docs that repeatedly hit the terminal "did not reach verify" failure (storm guard)', async () => {
    const calls = [];
    const books = [{ id: 1, done: false }, { id: 2, done: false }];
    const deps = {
      getProgress: async () => ({ phases: [{ books }] }),
      list: async () => [],
      // The quarantine query is the one mentioning the terminal error; id1 has failed too many times.
      queryAll: async (sql) => (sql.includes('did not reach verify') ? [{ doc_id: 1 }] : []),
      resumeStageFor: async () => ({}),
      enqueue: async (a) => calls.push(a),
      tick: async () => {},
    };
    const r = await followPlanTick({ lookahead: 5, deps });
    expect(calls.map((c) => c.docId)).toEqual([2]);      // id1 quarantined, not re-enqueued
    expect(r.quarantined).toEqual([1]);
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

// ── planExhaustion ───────────────────────────────────────────────────────────
// The 2026-08-23 permanent-CRITICAL bug. The roadmap graded 11 plan books "not done" while the
// follower could enqueue NONE of them (9 husks with zero prose, 2 non-English parked by the
// language gate). Queue stayed empty → system-checks read "0 live / 0 queued / 0 done in 24h" and
// fired `Grounding progress` CRITICAL on every status update, forever. The alarm could not tell
// "the plan is EXHAUSTED" from "the pipeline is STALLED".
//
// planExhaustion answers that question using the SAME skip predicates refill() enqueues by, so the
// two can never drift into disagreeing about what counts as remaining work (the five-definitions
// trap that already bit `disambiguated`).
describe('planExhaustion — is remaining plan work actually enqueueable, or only nominally remaining?', () => {
  const base = {
    list: async () => [],
    queryAll: async (sql) => (/FROM docs WHERE language/.test(sql) ? [] : []),
    resumeStageFor: async () => ({}),
  };

  it('all remaining books groundable → exhausted:false, alarm is a REAL stall', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [{ id: 1, done: false }, { id: 2, done: false }] }] }),
    } });
    expect(r.enqueueable).toBe(2);
    expect(r.exhausted).toBe(false);
  });

  it('husks only (resumeStageFor → null) → exhausted:true, counted as husks not enqueueable', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [{ id: 420, done: false }, { id: 2647, done: false }] }] }),
      resumeStageFor: async () => null,                       // zero prose → nothing to ground
    } });
    expect(r.husks).toBe(2);
    expect(r.enqueueable).toBe(0);
    expect(r.exhausted).toBe(true);
  });

  it('language-parked books are NOT enqueueable work (11323 de / 16551 fr)', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [{ id: 11323, done: false }, { id: 16551, done: false }] }] }),
      queryAll: async (sql) => (/FROM docs WHERE language/.test(sql) ? [{ id: 11323 }, { id: 16551 }] : []),
    } });
    expect(r.parked).toBe(2);
    expect(r.enqueueable).toBe(0);
    expect(r.exhausted).toBe(true);
  });

  it('quarantined books are NOT enqueueable work (storm guard)', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [{ id: 21307, done: false }] }] }),
      queryAll: async (sql) => (/grounding_queue/.test(sql) ? [{ doc_id: 21307 }] : []),
    } });
    expect(r.quarantined).toBe(1);
    expect(r.enqueueable).toBe(0);
    expect(r.exhausted).toBe(true);
  });

  it('counts GROUPED plan books too, not just phase.books (600+ primary sources live in groups)', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [], groups: [{ books: [{ id: 2446, done: false }] }] }] }),
      resumeStageFor: async () => null,
    } });
    expect(r.husks).toBe(1);
    expect(r.exhausted).toBe(true);
  });

  it('books the roadmap already grades done are not re-examined', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    let probed = 0;
    const r = await planExhaustion({ deps: {
      ...base,
      getProgress: async () => ({ phases: [{ books: [{ id: 1, done: true }, { id: 2, done: true }] }] }),
      resumeStageFor: async () => { probed++; return {}; },
    } });
    expect(probed).toBe(0);
    expect(r.enqueueable).toBe(0);
    expect(r.exhausted).toBe(true);
  });
});

// 10-20: once the plan was finished, refill() (every 3 min) and planExhaustion() re-probed all ~600 settled books on
// the API main thread each time — 5–8 s 'grounding:resume-stage' spikes in front of search. A settled (null) answer
// is remembered; work-remaining answers are always re-checked.
describe('settled books are not re-probed', () => {
  it('a finished book is probed once across ticks; a book with work is probed every tick', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const probes = [];
    const resumeStageFor = async (id) => { probes.push(id); return id === 1 ? null : { from: 'hype' }; };
    const deps = {
      list: async () => [], queryAll: async () => [], resumeStageFor,
      getProgress: async () => ({ phases: [{ books: [{ id: 1, done: false }, { id: 2, done: false }] }] }),
    };
    await planExhaustion({ deps });
    await planExhaustion({ deps });
    await followPlanTick({ lookahead: 5, deps: { ...deps, enqueue: async () => {}, tick: async () => {} } });
    expect(probes.filter((id) => id === 1)).toHaveLength(1);
    expect(probes.filter((id) => id === 2)).toHaveLength(3);
  });
});

describe('planExhaustion prose check', () => {
  it('asks EXISTS per book (stops at the first prose row) — never aggregates every paragraph', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const sqls = [];
    await planExhaustion({ deps: {
      list: async () => [], resumeStageFor: async () => null,
      queryAll: async (sql) => { sqls.push(sql); return []; },
      getProgress: async () => ({ phases: [{ books: [{ id: 91001, done: false }] }] }),
    } });
    const prose = sqls.find((s) => /FROM content|content c/.test(s));
    expect(prose).toMatch(/EXISTS/);
    expect(prose).not.toMatch(/GROUP BY/);
  });
});

describe('settled memo outlives the health probe interval', () => {
  it('a finished book is still remembered 31 minutes later (the probe runs every 30 min)', async () => {
    const { planExhaustion } = await import('../../api/lib/pipeline/plan.js');
    const real = Date.now; let t = real();
    Date.now = () => t;
    try {
      const probes = [];
      const resumeStageFor = async (id) => { probes.push(id); return null; };
      const deps = { list: async () => [], queryAll: async () => [], resumeStageFor,
        getProgress: async () => ({ phases: [{ books: [{ id: 7, done: false }] }] }) };
      await planExhaustion({ deps });
      t += 31 * 60 * 1000;
      await planExhaustion({ deps });
      expect(probes).toEqual([7]);
    } finally { Date.now = real; }
  });
});

describe('exhaustion snapshot (monitors never wait for the cold walk)', () => {
  it('first call is pending and starts the walk; the next call serves its result instantly', async () => {
    const { planExhaustionSnapshot, _resetExhaustionSnapshot } = await import('../../api/lib/pipeline/plan.js');
    _resetExhaustionSnapshot();
    let walks = 0;
    const walk = async () => { walks++; return { exhausted: true, husks: 1 }; };
    expect(planExhaustionSnapshot({ walk })).toEqual({ pending: true });
    await new Promise((r) => setTimeout(r, 0));
    const r = planExhaustionSnapshot({ walk });
    expect(r).toMatchObject({ exhausted: true, husks: 1, refreshing: false });
    expect(walks).toBe(1);
  });
});
