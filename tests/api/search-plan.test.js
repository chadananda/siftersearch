// Search planning: ONE fast Jev classification decides scope and which layers run, so LLM calls are
// reserved for summarising — never for routing. Rules pinned here are the ones measured or learned the hard way.
import { describe, it, expect } from 'vitest';
import { buildPlan, layersFor, planSearch } from '../../api/lib/search-plan.js';

const ans = (o) => ({
  tradition: { choice: o.tradition ?? 'none', confidence: o.tc ?? 0.95 },
  comparative: { noul: o.comparative ?? 0 },
  author: { choice: o.author ?? 'none', confidence: o.ac ?? 0.95 },
  shape: { choice: o.shape ?? 'topic', confidence: o.sc ?? 0.9 },
});

describe('buildPlan — scope', () => {
  it('narrows to the tradition the question names', () => {
    expect(buildPlan(ans({ tradition: 'Buddhist' })).filters).toEqual({ religion: 'Buddhist' });
  });

  it('never narrows a comparative, whatever the tradition answer says', () => {
    const p = buildPlan(ans({ tradition: 'Buddhist', comparative: 0.9 }));
    expect(p.filters).toEqual({});
    expect(p.comparative).toBe(true);
  });

  it('fails open below the confidence floor', () => {
    expect(buildPlan(ans({ tradition: 'Islam', tc: 0.4 })).filters).toEqual({});
  });

  // Chad: authors have many spellings and titles, and "a tablet from 'Abdu'l-Bahá" is often quoted in someone
  // else's book or a compilation. So an inferred author is a PREFERENCE (rank first), never a filter (hide rest).
  it('turns an inferred author into a preference with aliases — never a hard filter', () => {
    const p = buildPlan(ans({ tradition: "Baha'i", author: '‘Abdu’l-Bahá' }));
    expect(p.filters).toEqual({ religion: "Baha'i" });
    expect(p.prefer.author).toBe('‘Abdu’l-Bahá');
    expect(p.prefer.aliases).toEqual(expect.arrayContaining(['Abdu', 'Abbas Effendi']));
  });

  it('demands MORE confidence for an author than a tradition', () => {
    expect(buildPlan(ans({ author: 'Shoghi Effendi', ac: 0.7 })).prefer).toBeNull();
  });

  it('an author the CALLER passes explicitly is still honoured as a filter', () => {
    expect(buildPlan(ans({}), { given: { author: 'Balyuzi' } }).filters.author).toBe('Balyuzi');
  });

  it('lets caller-given filters win over the plan', () => {
    const p = buildPlan(ans({ tradition: 'Buddhist' }), { given: { religion: 'Hindu' } });
    expect(p.filters.religion).toBe('Hindu');
    expect(p.source.religion).toBe('caller');
  });

  it('with no answers at all (Jev down) plans an unconstrained topic search', () => {
    const p = buildPlan(null);
    expect(p.filters).toEqual({});
    expect(p.shape).toBe('topic');
  });
});

describe('layersFor — which indexes a shape uses', () => {
  it('a remembered QUOTE gets the keyword layer and no tradition-diversity cap', () => {
    const l = layersFor(buildPlan(ans({ shape: 'quote' })));
    expect(l.keyword).toBe(true);
    expect(l.diversify).toBe(false);
  });

  it('a FACT question consults the claim graph and HyPE', () => {
    const l = layersFor(buildPlan(ans({ shape: 'fact' })));
    expect(l.claims).toBe(true);
    expect(l.hype).toBe(true);
  });

  it('diversifies across traditions ONLY when nothing scoped the question', () => {
    expect(layersFor(buildPlan(ans({ shape: 'topic' }))).diversify).toBe(true);
    expect(layersFor(buildPlan(ans({ shape: 'topic', tradition: 'Islam' }))).diversify).toBe(false);
  });
});

describe('planSearch — the one network call', () => {
  it('asks Jev once and returns a plan with timing', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ answers: ans({ tradition: 'Islam', shape: 'define' }) }) }; };
    const p = await planSearch('what is zakat', { apiKey: 'k', fetchImpl, cache: false });
    expect(calls).toBe(1);
    expect(p.filters).toEqual({ religion: 'Islam' });
    expect(p.shape).toBe('define');
    expect(typeof p.ms).toBe('number');
  });

  it('when Jev fails, a tradition NAMED in the query still scopes it (deterministic backstop)', async () => {
    const fetchImpl = async () => { throw new Error('timeout'); };
    const p = await planSearch('What does the Quran say about patience?', { apiKey: 'k', fetchImpl, cache: false });
    expect(p.filters).toEqual({ religion: 'Islam' });
    expect(p.source.religion).toBe('keyword-backstop');
  });

  it('caches a plan so a repeat costs no Jev call', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ answers: ans({ tradition: 'Hindu' }) }) }; };
    await planSearch('karma in the Gita — cache probe', { apiKey: 'k', fetchImpl });
    const p = await planSearch('karma in the Gita — cache probe', { apiKey: 'k', fetchImpl });
    expect(calls).toBe(1);
    expect(p.cached).toBe(true);
  });

  it('fails open when Jev errors — a plan is an optimisation, never a blocker', async () => {
    const fetchImpl = async () => { throw new Error('boom'); };
    const p = await planSearch('anything', { apiKey: 'k', fetchImpl, cache: false });
    expect(p.filters).toEqual({});
    expect(p.error).toMatch(/boom/);
  });

  it('skips the call entirely with no API key', async () => {
    let calls = 0;
    const p = await planSearch('x', { apiKey: '', fetchImpl: async () => { calls++; } });
    expect(calls).toBe(0);
    expect(p.filters).toEqual({});
  });
});
