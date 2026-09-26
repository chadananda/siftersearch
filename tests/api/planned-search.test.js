// plannedSearch: plan (one Jev call) → cache → narrow-then-relax over the multi-index engine with the plan's layers.
import { describe, it, expect, beforeEach } from 'vitest';
import { plannedSearch, clearPlannedCache } from '../../api/lib/planned-search.js';
import { buildPlan } from '../../api/lib/search-plan.js';

const planOf = (o) => async (_input, { given } = {}) => ({ ...buildPlan({
  tradition: { choice: o.tradition ?? 'none', confidence: 0.95 }, comparative: { noul: 0 },
  author: { choice: 'none', confidence: 0.95 }, shape: { choice: o.shape ?? 'topic', confidence: 0.9 },
}, { given }), ms: 5 });

function engine(hitsFor) {
  const calls = [];
  const fn = async (query, opts) => { calls.push(opts); return { hits: hitsFor(opts.filters) }; };
  return { calls, fn };
}
const many = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('plannedSearch', () => {
  beforeEach(() => clearPlannedCache());

  it('runs the engine with the plan’s scope and layers', async () => {
    const e = engine(() => many(10));
    const r = await plannedSearch('the earth is but one country', { planner: planOf({ tradition: "Baha'i", shape: 'quote' }), engine: e.fn });
    expect(e.calls[0].filters).toEqual({ religion: "Baha'i" });
    expect(e.calls[0].keywordLayer).toBe(true);
    expect(e.calls[0].diversify).toBe(false);
    expect(r.hits).toHaveLength(10);
    expect(r.plan.shape).toBe('quote');
  });

  it('widens when the narrow scope is too thin, and says so', async () => {
    const e = engine((f) => (f.religion ? many(1) : many(10)));
    const r = await plannedSearch('x', { planner: planOf({ tradition: 'Buddhist' }), engine: e.fn });
    expect(r.widened).toBe(true);
    expect(r.relaxed).toEqual(['religion']);
    expect(r.narrowCount).toBe(1);
    expect(r.hits).toHaveLength(10);
  });

  it('serves a repeat from cache without re-running the engine', async () => {
    const e = engine(() => many(5));
    const p = planOf({ tradition: 'Islam' });
    await plannedSearch('what is zakat', { planner: p, engine: e.fn });
    const r = await plannedSearch('What is zakat ', { planner: p, engine: e.fn });
    expect(e.calls).toHaveLength(1);
    expect(r.cached).toBe(true);
  });

  it('never shares a cache entry across different scopes', async () => {
    const e = engine(() => many(5));
    await plannedSearch('patience', { planner: planOf({ tradition: 'Islam' }), engine: e.fn });
    await plannedSearch('patience', { planner: planOf({ tradition: 'Buddhist' }), engine: e.fn });
    expect(e.calls).toHaveLength(2);
  });

  it('puts the preferred author first but KEEPS books that quote them', async () => {
    const pref = async (_i, { given } = {}) => ({ ...buildPlan({
      tradition: { choice: "Baha'i", confidence: 0.95 }, comparative: { noul: 0 },
      author: { choice: '‘Abdu’l-Bahá', confidence: 0.95 }, shape: { choice: 'quote', confidence: 0.9 },
    }, { given }), ms: 5 });
    const calls = [];
    const fn = async (_q, opts) => {
      calls.push(opts.filters);
      return { hits: opts.filters.author
        ? [{ id: 2, author: '‘Abdu’l-Bahá', text: 'In this Tablet He writes…' }]
        : [{ id: 1, author: 'H. M. Balyuzi', text: 'the Tablet quoted in full' }, { id: 2, author: '‘Abdu’l-Bahá', text: 'In this Tablet He writes…' }, { id: 3, author: "'Abdu'l-Bahá, Universal House of Justice", text: 'a tablet to the believers' }] };
    };
    const r = await plannedSearch('tablet from Abdul Baha', { planner: pref, engine: fn });
    expect(calls.some((f) => f.author) && calls.some((f) => !f.author)).toBe(true);
    expect(r.hits.map((h) => h.id)).toEqual([2, 3, 1]);   // his words first, compilation next, Balyuzi kept
    expect(r.hits[2]._authorMatch).toBe(false);
  });

  // Dozens of sites embed Anis; each may declare a home tradition. It fills in ONLY when the question names none.
  it('applies a site default tradition when the question names none', async () => {
    const e = engine(() => many(5));
    const r = await plannedSearch('what is the purpose of life', { defaults: { religion: "Baha'i" }, planner: planOf({}), engine: e.fn });
    expect(e.calls[0].filters.religion).toBe("Baha'i");
    expect(r.plan.source.religion).toBe('site-default');
  });

  it('never lets a site default override the tradition the user asked about', async () => {
    const e = engine(() => many(5));
    await plannedSearch('what does the Quran say about patience', { defaults: { religion: "Baha'i" }, planner: planOf({ tradition: 'Islam' }), engine: e.fn });
    expect(e.calls[0].filters.religion).toBe('Islam');
  });

  // Live 2026-09-24, "What does Bahá’u’lláh say about justice?": the author-filtered search kept "Bahá’u’lláh" in the
  // query (redundant under the filter; partial matching then dropped "justice"), returned 8 passages none of which
  // mention justice, and the merge put all 8 ahead of the broad results that DID (Gleanings, God Passes By).
  it('searches the author half WITHOUT the author’s name, and promotes only author hits on the subject', async () => {
    const pref = async (_i, { given } = {}) => ({ ...buildPlan({
      tradition: { choice: "Baha'i", confidence: 0.95 }, comparative: { noul: 0 },
      author: { choice: 'Bahá’u’lláh', confidence: 0.95 }, shape: { choice: 'topic', confidence: 0.9 },
    }, { given }), ms: 5 });
    const queries = [];
    const fn = async (q, opts) => {
      queries.push({ q, author: opts.filters.author });
      return { hits: opts.filters.author
        ? [{ id: 10, author: 'Bahá’u’lláh', text: 'a personal God is a God Who is conscious' }, { id: 11, author: 'Bahá’u’lláh', text: 'The best beloved of all things in My sight is Justice' }]
        : [{ id: 20, author: 'Shoghi Effendi', text: 'Justice He extols as the light of men' }, { id: 21, author: 'H. Balyuzi', text: 'the essence of justice is' }] };
    };
    const r = await plannedSearch('What does Bahá’u’lláh say about justice?', { planner: pref, engine: fn, limit: 3 });
    const authorQ = queries.find((x) => x.author).q;
    expect(authorQ).not.toMatch(/bah/i);
    expect(authorQ).toMatch(/justice/i);
    expect(r.hits.map((h) => h.id)).toEqual([11, 20, 21]);   // his words ON justice first; off-topic author hit not promoted
  });

  // Raw search owns correct sources: the resolver runs on the final hits (not for conversation turns).
  it('runs source resolution on the final hits and reports it', async () => {
    const e = engine(() => many(4));
    const calls = [];
    const resolver = async (hits) => { calls.push(hits.length); return { hits: hits.map((h) => ({ ...h, _source: { kind: 'original' } })), resolved: 0 }; };
    const r = await plannedSearch('x', { planner: planOf({}), engine: e.fn, resolver });
    expect(calls).toEqual([4]);
    expect(r.hits[0]._source.kind).toBe('original');
    expect(r.resolution).toMatchObject({ resolved: 0 });
  });

  // "Who were the Letters of the Living who met Bahá'u'lláh, and when?" — Anis answered from passages only and
  // got it wrong. The plan picks the people pattern; raw search must deliver the graph's answer.
  it('runs the people/claims layer when the plan calls for it: entities + their cited paragraphs first', async () => {
    const planPeople = async (_i, { given } = {}) => ({ ...buildPlan({
      tradition: { choice: "Baha'i", confidence: 0.95 }, comparative: { noul: 0 }, author: { choice: 'none', confidence: 0.9 },
      shape: { choice: 'enumerate', confidence: 0.9 }, about: { choice: 'people', confidence: 0.95 },
    }, { given }), ms: 5 });
    const people = async () => ({ people: [
      { id: 1, name: 'Quddús', evidence: [{ statement: 'Quddús — met Bahá’u’lláh', relation: 'met', source: 'The Dawn-Breakers', url: 'https://oceanlibrary.com/db?paraId=para_526', paraId: 'para_526', doc_id: 21308, when: '1848' }] },
    ] });
    const paragraphs = async (refs) => refs.map((r) => ({ id: 777, doc_id: r.doc_id, paragraph_index: 526, text: 'Quddús was admitted into the presence of Bahá’u’lláh…', title: 'The Dawn-Breakers', author: 'Nabil', external_para_id: r.paraId }));
    const e = engine(() => many(5));
    const r = await plannedSearch('who were the letters of the living who met Bahá’u’lláh and when', { planner: planPeople, engine: e.fn, people, paragraphs });
    expect(r.entities[0]).toMatchObject({ name: 'Quddús' });
    expect(r.entities[0].evidence[0]).toMatchObject({ when: '1848', url: 'https://oceanlibrary.com/db?paraId=para_526' });
    expect(r.hits[0]).toMatchObject({ id: 777, _source: { kind: 'evidence', person: 'Quddús' } });
  });

  it('does not run the people layer for a question about what a text says', async () => {
    let called = false;
    await plannedSearch('x', { planner: planOf({}), engine: engine(() => many(3)).fn, people: async () => { called = true; return { people: [] }; } });
    expect(called).toBe(false);
  });

  // Jev timed out (700ms) and the keyword backstop called "Which Letters of the Living ever met Bahá’u’lláh?" a topic
  // question — so the people answer vanished. Who-met-whom is detected deterministically on every query.
  it('answers who-met-whom even when the plan is not a people plan', async () => {
    const encounters = async () => ({ pattern: 'group-target', ms: 3, people: [{ id: 3, name: 'Quddús', evidence: [{ statement: 'Quddús — met Bahá’u’lláh', relation: 'met', doc_id: 1, paraId: 'para_2', when: '1848', via: 'typed' }] }] });
    const r = await plannedSearch('which letters of the living ever met Bahá’u’lláh', { planner: planOf({}), engine: engine(() => many(3)).fn, encounters, paragraphs: async () => [] });
    expect(r.entities[0]).toMatchObject({ name: 'Quddús' });
    expect(r.entities[0].evidence[0].via).toBe('typed');
    expect(r.entities.pattern).toBe('group-target');
  });

  it('a recognised who-met-whom question pays for no query embedding', async () => {
    const e = engine(() => many(3));
    const r = await plannedSearch('did Quddús meet Ṭáhirih', { planner: planOf({}), engine: e.fn, encounterProbe: () => true, encounters: async () => null });
    expect(r.layers).toMatchObject({ semantic: false, hype: false, encounter: true });
    expect(e.calls[0].semantic).toBe(false);
  });

  it('a who-met-whom probe that finds nothing leaves a non-people answer without entities', async () => {
    const r = await plannedSearch('what is justice', { planner: planOf({}), engine: engine(() => many(3)).fn, encounters: async () => null });
    expect(r.entities).toBeNull();
  });

  it('caller filters beat the plan', async () => {
    const e = engine(() => many(5));
    await plannedSearch('x', { given: { religion: 'Hindu' }, planner: planOf({ tradition: 'Buddhist' }), engine: e.fn });
    expect(e.calls[0].filters.religion).toBe('Hindu');
  });
});
