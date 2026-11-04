// The planner tail (11-03): Jev is 104-434 ms; the 1.5-2 s tail of plan_ms was the name lookup — synchronous entityLookups
// run as a Promise.all (blocking the event loop for their sum, beyond the reach of the 1.2 s timer race). Locks:
// sequential lookups with early exit (same answer), a deadline no lookup starts after, event-loop yields, the
// entityLookup memo, and the jev/lookup stamps that split plan_ms in the budget table.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveNamed, resolveNamedAll, objectPhrases, nameSpans } from '../../api/lib/named-object.js';
import { planSearch } from '../../api/lib/search-plan.js';
import { plannedStages, PLANNED_BUDGETS } from '../../api/lib/search/latency-budget.js';

const ROOT = join(import.meta.dirname, '..', '..');
const spin = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* a sync query */ } };
const person = (name, id = name) => ({ id, name, type: 'person', surfaces: [] });

describe('name resolution: one synchronous lookup at a time', () => {
  it('stops at the first phrase that decides — later phrases are never looked up, the answer is the same', async () => {
    const text = 'text of the Hidden Words by Shoghi Effendi';
    const phrases = objectPhrases(text).map((o) => o.phrase);
    expect(phrases.length).toBeGreaterThan(2);
    // the first phrase decides → one lookup (was one per phrase, all synchronous, before the answer was read)
    const seen = [];
    const hit = await resolveNamed(text, { lookup: async (p) => { seen.push(p); return [person(p, 7)]; } });
    expect(hit).toMatchObject({ type: 'person', id: 7, matched: phrases[0] });
    expect(seen).toEqual([phrases[0]]);
    // only the last (the work, workOnly) decides → every phrase looked up, in priority order, same answer as before
    const work = phrases.at(-1), seen2 = [];
    const hit2 = await resolveNamed(text, { lookup: async (p) => { seen2.push(p); return p === work ? [{ id: 9, name: work, type: 'work', surfaces: [] }] : []; } });
    expect(seen2).toEqual(phrases);
    expect(hit2).toMatchObject({ type: 'work', id: 9 });
  });

  it('no lookup starts after the deadline (a sync query cannot be cut off by a timer, so it must not be begun)', async () => {
    const seen = [];
    const lookup = (p) => { seen.push(p); spin(30); return []; };
    const text = 'In the Kitab-i-Iqan Bahaullah explains the Day; how do Abdul-Baha in Some Answered Questions and Shoghi Effendi in God Passes By treat it, compared with Augustine in the City of God?';
    const t = Date.now();
    await resolveNamedAll(text, { lookup, deadline: Date.now() + 50 });
    expect(Date.now() - t).toBeLessThan(150);
    expect(seen.length).toBeLessThanOrEqual(3);
    const full = [];
    await resolveNamedAll(text, { lookup: (p) => { full.push(p); return []; } });
    expect(full.length).toBeGreaterThan(seen.length);
  });

  it('yields to the event loop between lookups: a timer due meanwhile fires before the next lookup', async () => {
    const order = [];
    setTimeout(() => order.push('timer'), 0);
    const lookup = (p) => { order.push('lookup'); spin(5); return []; };
    await resolveNamedAll('Abdul-Baha, Shoghi Effendi, Augustine and Plato', { lookup });
    expect(order.indexOf('timer')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('timer')).toBeLessThan(order.length - 1);
  });

  it('resolveNamedAll keeps span order, distinct ids, at most max', async () => {
    const lookup = async (p) => [person(p, p.length > 6 ? 'long' : p)];
    expect(nameSpans('Abdul-Baha, Shoghi Effendi, Augustine, Plato, Aristotle')).toHaveLength(5);
    const out = await resolveNamedAll('Abdul-Baha, Shoghi Effendi, Augustine, Plato, Aristotle', { lookup, max: 2 });
    // three spans share id 'long' → the first keeps it; Plato is next distinct; max 2 stops there
    expect(out.map((h) => h.matched)).toEqual(['Abdul-Baha', 'Plato']);
  });

  it('a throwing lookup is a miss for that phrase, never an error', async () => {
    expect(await resolveNamed('Shoghi Effendi', { lookup: () => { throw new Error('db'); } })).toBeNull();
    expect(await resolveNamedAll('Abdul-Baha and Augustine', { lookup: () => { throw new Error('db'); } })).toEqual([]);
  });
});

describe('planSearch: the deadline reaches the resolver; the wait after Jev is stamped', () => {
  const jev = async () => new Response(JSON.stringify({ answers: null }));
  it('resolver gets { deadline } ≈ now + 1.2 s and plan.lookup_ms is the wait after Jev', async () => {
    let got = null;
    const resolveName = async (text, opts) => { got = opts; await new Promise((r) => setTimeout(r, 40)); return null; };
    const plan = await planSearch(`Shoghi Effendi ${Math.random()}`, { resolveName, resolveMentions: null, cache: false, fetchImpl: jev });
    expect(got.deadline - Date.now()).toBeGreaterThan(1000);
    expect(got.deadline - Date.now()).toBeLessThanOrEqual(1200);
    expect(plan.lookup_ms).toBeGreaterThanOrEqual(0);
    expect(plan.lookup_ms).toBeLessThan(200);
  });
  it('no resolver → no lookup_ms stamp', async () => {
    const plan = await planSearch('mercy', { resolveName: null, resolveMentions: null, cache: false, fetchImpl: jev });
    expect(plan.lookup_ms).toBeUndefined();
  });
});

describe('plan_ms split into budgeted parts', () => {
  it('planned-search stamps jev_ms (plan.ms) and lookup_ms into stages; both have budgets and are summarised', () => {
    const s = readFileSync(join(ROOT, 'api/lib/planned-search.js'), 'utf8');
    expect(s).toMatch(/jev_ms: plan\.ms/);
    expect(s).toMatch(/lookup_ms: plan\.lookup_ms/);
    expect(PLANNED_BUDGETS.jev.ms).toBeGreaterThan(0);
    expect(PLANNED_BUDGETS.lookup.ms).toBeLessThan(PLANNED_BUDGETS.jev.ms);
    expect(plannedStages({ plan_ms: 300, jev_ms: 250, lookup_ms: 4 })).toMatchObject({ plan: 300, jev: 250, lookup: 4 });
  });
});

describe('entityLookup memo', () => {
  beforeEach(() => vi.resetModules());
  it('the same name within 10 min is one query; callers get copies they may mutate', async () => {
    const queryAll = vi.fn(async () => [{ id: 1, name: 'Shoghi Effendi', type: 'person', importance: 9, shared: 2, canon: 1, exact: 1, surfaces: '["Guardian"]' }]);
    vi.doMock('../../api/lib/db.js', () => ({ queryAll, queryOne: vi.fn(async () => null) }));
    const { entityLookup, _resetLookupMemo } = await import('../../api/lib/entity-api.js');
    _resetLookupMemo();
    const a = await entityLookup('Shoghi Effendi');
    a[0].surfaces.push('x'); a[0].name = 'changed';
    const b = await entityLookup('Shoghi Effendi');
    expect(queryAll).toHaveBeenCalledTimes(1);
    expect(b[0]).toMatchObject({ name: 'Shoghi Effendi', surfaces: ['Guardian'] });
    expect(queryAll.mock.calls[0][2]).toBe('entity:lookup');   // named → visible in query_stats
    await entityLookup('Shoghi Effendi', { type: 'person' });
    expect(queryAll).toHaveBeenCalledTimes(2);   // type is part of the key
    vi.doUnmock('../../api/lib/db.js');
  });
});
