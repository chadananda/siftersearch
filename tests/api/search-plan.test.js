// Search planning: ONE fast Jev classification decides scope and which layers run, so LLM calls are
// reserved for summarising — never for routing. Rules pinned here are the ones measured or learned the hard way.
import { describe, it, expect } from 'vitest';
import { buildPlan, layersFor, planSearch } from '../../api/lib/search-plan.js';

const ans = (o) => ({
  tradition: { choice: o.tradition ?? 'none', confidence: o.tc ?? 0.95 },
  comparative: { noul: o.comparative ?? 0 },
  author: { choice: o.author ?? 'none', confidence: o.ac ?? 0.95 },
  shape: { choice: o.shape ?? 'topic', confidence: o.sc ?? 0.9 },
  about: { choice: o.about ?? 'texts', confidence: o.abc ?? 0.9 },
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
  it('the concept lexicon serves every shape but a remembered quote', () => {
    expect(layersFor(buildPlan(ans({ shape: 'topic', about: 'texts' }))).concept).toBe(true);
    expect(layersFor(buildPlan(ans({ shape: 'quote', about: 'texts' }))).concept).toBe(false);
  });
  // Chad: "JEV should be selecting a search pattern that provides the Anis LLM with the information it needs".
  // "Who were the Letters of the Living who met Bahá'u'lláh, and when?" is about PEOPLE: the cited-claim graph
  // answers it (who, with evidence and dates); passages alone could not.
  it('a question about PEOPLE selects the people/claims pattern', () => {
    const l = layersFor(buildPlan(ans({ shape: 'enumerate', about: 'people' })));
    expect(l.claims).toBe(true);
    expect(layersFor(buildPlan(ans({ shape: 'lookup', about: 'people' }))).claims).toBe(true);
    expect(buildPlan(ans({ about: 'people' })).about).toBe('people');
  });

  it('a question about what a text says does not', () => {
    expect(layersFor(buildPlan(ans({ shape: 'topic', about: 'texts' }))).claims).toBe(false);
  });

  it('a remembered QUOTE gets the keyword layer and no tradition-diversity cap', () => {
    const l = layersFor(buildPlan(ans({ shape: 'quote' })));
    expect(l.keyword).toBe(true);
    expect(l.diversify).toBe(false);
  });

  // "When was the Báb martyred?": passages + HyPE hold the date; the claim scan cost 5-12s and buried them.
  it('a plain FACT question is answered by passages + HyPE, not the claim scan', () => {
    const l = layersFor(buildPlan(ans({ shape: 'fact', about: 'people' })));
    expect(l.claims).toBe(false);
    expect(l.hype).toBe(true);
  });

  // Chad 2026-09-26: raw search = Jev picks the strategy, then only the index lookups that strategy needs. The query
  // embedding (0.5–0.75s from tower-nas) is paid only by strategies that need meaning-match.
  it('pays for the query embedding only when the strategy needs meaning-match', () => {
    const sem = (a) => layersFor(buildPlan(ans(a))).semantic;
    expect(sem({ shape: 'lookup' })).toBe(false);
    // Battery regressions when these went keyword-only: lay paraphrases are classed as quotes, and history
    // facts ("When was the Báb martyred?") are answered by HyPE.
    expect(sem({ shape: 'quote' })).toBe(true);
    expect(sem({ shape: 'fact', about: 'people' })).toBe(true);
    expect(layersFor(buildPlan(ans({ shape: 'fact', about: 'people' }))).hype).toBe(true);
    expect(sem({ shape: 'topic', about: 'texts' })).toBe(true);
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

  it('when Jev fails, an author NAMED in the query still becomes a preference (and implies the tradition)', async () => {
    const fetchImpl = async () => { throw new Error('timeout'); };
    const p = await planSearch('Shoghi Effendi on the Administrative Order', { apiKey: 'k', fetchImpl, cache: false });
    expect(p.prefer?.author).toBe('Shoghi Effendi');
    expect(p.filters).toEqual({ religion: "Baha'i" });
  });

  it('the backstop reads spellings without diacritics or apostrophes (Abdul Baha)', async () => {
    const fetchImpl = async () => { throw new Error('timeout'); };
    const p = await planSearch('what did Abdul Baha say about war', { apiKey: 'k', fetchImpl, cache: false });
    expect(p.prefer?.author).toBe('‘Abdu’l-Bahá');
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

describe('planSearch — quotation rule and provenance', () => {
  const Q = 'can you find the quote including  "but it will always be present as a necessary element"';
  it('Jev timeout → backstop plan is shape quote, with provenance and reason', async () => {
    const fetchImpl = async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; };
    const p = await planSearch(Q, { apiKey: 'k', fetchImpl, cache: false });
    expect(p.shape).toBe('quote');
    expect(p.about).toBe('texts');
    expect(p.source.shape).toBe('quote-rule');
    expect(p.provenance).toBe('backstop');
    expect(p.reason).toBe('timeout');
    expect(p.quote.phrase).toBe('but it will always be present as a necessary element');
    expect(layersFor(p).keyword).toBe(true);
  });
  it('overrides a Jev "topic" answer when the rule fires', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ answers: ans({ shape: 'topic', about: 'people' }) }) });
    const p = await planSearch(Q, { apiKey: 'k', fetchImpl, cache: false });
    expect(p.shape).toBe('quote');
    expect(p.about).toBe('texts');
    expect(p.provenance).toBe('jev');
    expect(p.overridden).toEqual({ shape: 'topic', about: 'people', by: 'quote-rule' });
  });
  it('a cached plan reports jev:cached and the rule still applies', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ answers: ans({ shape: 'topic' }) }) });
    const q = Q + ' cache probe';
    await planSearch(q, { apiKey: 'k', fetchImpl });
    const p = await planSearch(q, { apiKey: 'k', fetchImpl });
    expect(p.provenance).toBe('jev:cached');
    expect(p.shape).toBe('quote');
  });
  it('no key → backstop with reason no-key; HTTP failure carries the status', async () => {
    expect((await planSearch('what is zakat', { apiKey: '' })).reason).toBe('no-key');
    const p = await planSearch('what is zakat', { apiKey: 'k', cache: false, fetchImpl: async () => ({ ok: false, status: 503 }) });
    expect(p.provenance).toBe('backstop');
    expect(p.reason).toBe('jev HTTP 503');
  });
  it('a non-quote question is untouched', async () => {
    const p = await planSearch('what is zakat', { apiKey: 'k', cache: false, fetchImpl: async () => ({ ok: true, json: async () => ({ answers: ans({ shape: 'define' }) }) }) });
    expect(p.shape).toBe('define');
    expect(p.quote).toBeUndefined();
    expect(p.provenance).toBe('jev');
  });
});

// r5 (11-01 conversation harness): follow-ups quoting the assistant's own words, or asking what words mean, were forced
// into quote hunts by the quote rule (Táhirih T3 → honest_absence; justice T4 root question → find_passage).
describe('quote rule — follow-ups (r5)', () => {
  const jev = (shape) => async () => ({ ok: true, json: async () => ({ answers: ans({ shape }) }) });
  const opts = (shape) => ({ apiKey: 'k', fetchImpl: jev(shape), cache: false, resolveName: null });
  it('a span the assistant said earlier is not a quote hunt', async () => {
    const m = [
      { role: 'user', content: 'who was Tahirih?' },
      { role: 'assistant', content: 'At Badasht she appeared without a veil to signal that a new era had begun.' },
      { role: 'user', content: 'you said she appeared "without a veil to signal that a new era had begun", does Shoghi Effendi really write this?' },
    ];
    const p = await planSearch(m, opts('fact'));
    expect(p.shape).toBe('fact');
    expect(p.quote).toBeUndefined();
  });
  it('an etymology question Jev called quote becomes define; a comparison becomes topic', async () => {
    const p = await planSearch('You said al-insāf comes from the root n-ṣ-f. Does that sense shape the "turn not away from it" in the Hidden Word?', opts('quote'));
    expect(p.shape).toBe('define');
    expect(p.overridden?.by).toBe('meaning-rule');
    const c = await planSearch('How is "the knowledge of God which comes to the heart of man" different from what Hooper Dunbar says?', opts('quote'));
    expect(c.shape).toBe('topic');
  });
});
