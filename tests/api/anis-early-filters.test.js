// Early filters (Chad 11-09): Jev's span kinds + subject religion → hard search filters; named work/author outrank authority; thin → widen; the judge reads the tree trace.
import { describe, it, expect } from 'vitest';
import { chooseStrategy, namedUnits } from '../../api/lib/assistant/strategy-choice.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { turnFromPath, itemsForTurn, judgeMessage } from '../../api/lib/audit/improve.js';

const Q = "According to 'Abdu'l-Bahá in Some Answered Questions, what happens to the soul after death?";
const ans = (choice, confidence = 0.95) => ({ choice, confidence });
const P = (i, x = {}) => ({ id: i, text: `Passage ${i}`, document_id: 100 + i, paragraph_index: i, religion: "Baha'i", authority: 'scripture', score: 0.9, title: `T${i}`, ...x });
const NONE = async () => ({ passages: [] });
const mk = (units = {}, extra = {}) => ({ node: 'n', question: 'q', tools: {}, units: { found_passages: [], found_records: [], web_found: [], found_outcome: {}, missing: [], scope_excluded: 0, ...units }, ctx: {}, templates: {}, ...extra });

describe('Jev fills the filter units in the same call', () => {
  it('namedUnits: span kinds → named_work / named_person (frame words stripped) + topic = the question minus those spans', () => {
    const a = { kind_1: ans('person'), kind_2: ans('work') };
    expect(namedUnits(a, ["According to 'Abdu'l-Bahá", 'Some Answered Questions'], Q)).toEqual({ named_person: "'Abdu'l-Bahá", named_work: 'Some Answered Questions', topic: 'what happens to the soul after death?' });
  });
  it('namedUnits: below-confidence or "neither" kinds set nothing (topic stays the question)', () => {
    expect(namedUnits({ kind_1: ans('work', 0.3), kind_2: ans('neither') }, ['Rumi', 'fana'], 'Rumi on fana')).toEqual({});
  });
  it('chooseStrategy returns the units, asks kind_N + subject_religion in ONE call, and the subject tradition is a turn-only scope', async () => {
    let body;
    const fetchImpl = async (url, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { strategy: ans('unmatched'), kind_1: ans('work'), subject_religion: ans('Buddhist'), scope_religion: ans('unchanged') } }) }; };
    const r = await chooseStrategy([{ role: 'user', content: 'In "The Seven Valleys", what do Buddhist teachers say about anatta?' }], { apiKey: 'k', fetchImpl, options: { unmatched: 'x' } });
    expect(Object.keys(body.questions)).toEqual(expect.arrayContaining(['kind_1', 'subject_religion', 'strategy']));
    expect(r.units.named_work).toBe('The Seven Valleys');
    expect(r.patch.turnOnly?.scope?.religions_specified?.length).toBe(1);
  });
});

describe('a bare work title is the book (Chad 11-09: "God Passes By" fell to Unmatched and ran slow research)', () => {
  const run = (content, strategy, kind = ans('work')) => chooseStrategy([{ role: 'user', content }],
    { apiKey: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { strategy, kind_1: kind } }) }), options: { book: 'b', about: 'a', understanding: 'u', unmatched: 'x' } });
  it('below-confidence book on a message that is only a work name → book', async () => {
    const r = await run('“God Passes By”', ans('book', 0.4));
    expect(r.strategy.choice).toBe('book'); expect(r.strategy.reason).toBe('named-work-only'); expect(r.units.named_work).toBe('God Passes By');
    expect(r.decisions[0].chosen).toBe('book');
  });
  it('Jev picking Unmatched (or anything below confidence) on a bare title still → book', async () => {
    for (const pick of [ans('unmatched', 0.9), ans('understanding', 0.4), ans('unmatched', 0.3)]) {
      const r = await run('“God Passes By”', pick);
      expect(r.strategy.choice).toBe('book'); expect(r.strategy.reason).toBe('named-work-only');
    }
  });
  it('a question with more than the title, or a below-confidence work kind, stays Unmatched', async () => {
    expect((await run('What does God Passes By say about the Báb’s martyrdom?', ans('book', 0.4))).strategy.choice).toBe('unmatched');
    expect((await run('“God Passes By”', ans('book', 0.4), ans('work', 0.2))).strategy.choice).toBe('unmatched');
  });
});

describe('hard filters first, widening when thin', () => {
  it('search.shelf by_person filters by author, gated free when none; the tradition filter applies', async () => {
    const seen = [];
    const fused = async (i) => { seen.push(i.filters || {}); return { passages: [P(1, { religion: 'Christian' })] }; };
    const s = mk({ named_person: 'Augustine', religions_specified: ['Christian'] }, { tools: { fused_search: fused } });
    expect(await ELEMENTS['search.shelf'].run(s, { by_person: true })).toBe('one');
    expect(seen[0].author).toBe('Augustine'); expect(seen[0].tradition).toBeTruthy();
    const s2 = mk({}, { tools: { fused_search: fused } }); seen.length = 0;
    await ELEMENTS['search.shelf'].run(s2, { by_person: true }); expect(seen.length).toBe(0); expect(s2.units.found_outcome.n).toBe('skipped');
  });
  it('search.shelf about_person: the histories ABOUT the named person — no author filter, whole question, gated free when none', async () => {
    const seen = [];
    const fused = async (i) => { seen.push(i); return { passages: [P(1, { authority: 'history' })] }; };
    const s = mk({ named_person: 'Siyyid Káẓim', topic: 'What did teach his students?', current_user_question: 'What did Siyyid Káẓim teach his students?' }, { tools: { fused_search: fused } });
    expect(await ELEMENTS['search.shelf'].run(s, { about_person: true, authority: ['history', 'scholarship'] })).toBe('one');
    expect(seen[0].filters.author).toBeUndefined(); expect(seen[0].filters.authority).toEqual(['history', 'scholarship']); expect(seen[0].query).toContain('Káẓim');
    const s2 = mk({}, { tools: { fused_search: fused } }); seen.length = 0;
    await ELEMENTS['search.shelf'].run(s2, { about_person: true }); expect(seen.length).toBe(0); expect(s2.units.found_outcome.n).toBe('skipped');
  });
  it('wide: runs with no filters, only when a hard filter was applied', async () => {
    const seen = [];
    const fused = async (i) => { seen.push(i.filters || {}); return { passages: [P(1)] }; };
    const f = mk({ named_person: 'Rumi' }, { tools: { fused_search: fused } });
    await ELEMENTS['search.shelf'].run(f, { wide: true, scope: 'rank' }); expect(seen).toEqual([{}]);
    seen.length = 0; const g = mk({}, { tools: { fused_search: fused } });
    await ELEMENTS['search.shelf'].run(g, { wide: true }); expect(seen.length).toBe(0);
  });
  it('the understanding tree: a filtered pass that finds nothing widens once; the members show in the trace', async () => {
    const g = graphFor('understanding', 2), calls = [];
    const tools = { fused_search: async (i) => { calls.push(i.filters || {}); return { passages: i.filters?.tradition || i.filters?.author ? [] : [P(1)] }; }, hype_search: NONE, originals_search: NONE, document_search: async () => ({ works: [] }), context_lookup: NONE, source_trace: NONE, reference: NONE };
    const choice = { units: { named_person: 'Rumi', topic: 'fana' } };
    const s = { choice, ctx: {}, trace: [], question: 'Sufi Rumi on fana', messages: [], tools, jev: async () => ({ choice: 'answers' }), templates: Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text])), onEvent: () => {} };
    s.units = entryUnits(g, choice, { query: s.question, question: s.question, channel: { id: 'site-chat' }, messages: [], scope: { units: { religions_specified: ['Islam'] }, source: 'turn' } });
    await runGraph(g, s);
    const names = s.trace.map((t) => t.node);
    expect(names.slice(0, 3)).toEqual(['anchor', 'gather', 'widen']);
    expect(calls.some((f) => f.author === 'Rumi')).toBe(true); expect(calls.some((f) => !Object.keys(f).length)).toBe(true);
    expect(s.trace[1].members.map((m) => m.element)).toContain('search.shelf');
    expect(s.trace[1].members.find((m) => m.node === 'gather.1').filters.author).toBe('Rumi'); expect(s.trace[1].members.find((m) => m.node === 'gather.1').query).toBe('fana');
    // only the pass whose filter carries the name uses the stripped topic; the others keep the whole question (dry run 5)
    expect(s.trace[1].members.filter((m) => m.query && !m.filters?.author).every((m) => m.query === 'Sufi Rumi on fana')).toBe(true);
  });
  it('inside: searches the books already found (documentId = any of the top 3) with the whole question; free none when nothing was found', async () => {
    const seen = [], E = ELEMENTS;
    const s = { ctx: {}, trace: [], question: 'q', tools: { fused_search: async (i) => { seen.push(i); return { passages: [P(9)] }; } }, onEvent: () => {} };
    const found = [1, 1, 2, 3, 4].map((d, i) => ({ ...P(i + 1), document_id: d }));
    await E['search.shelf'].run({ ...s, units: { current_user_question: 'what is anatta?', topic: 'anatta', found_passages: found } }, { inside: true, books: 3, k: 6 });
    expect(seen[0].filters).toEqual({ documentId: [1, 2, 3] }); expect(seen[0].query).toBe('what is anatta?');
    await E['search.shelf'].run({ ...s, units: { current_user_question: 'q', found_passages: [] } }, { inside: true }); expect(seen.length).toBe(1);
  });
  it('quoted: the reader\'s quoted words searched literal + phrase; gated free when nothing is quoted', async () => {
    const seen = [], E = ELEMENTS;
    const s = { ctx: {}, trace: [], question: 'q', tools: { fused_search: async (i) => { seen.push(i); return { passages: [P(1)] }; } }, onEvent: () => {} };
    await E['search.shelf'].run({ ...s, units: { current_user_question: 'q', quoted_words: 'The earth is but one country' } }, { quoted: true, k: 4 });
    expect(seen[0].query).toBe('The earth is but one country'); expect(seen[0].layers).toEqual(['literal', 'phrase']);
    await E['search.shelf'].run({ ...s, units: { current_user_question: 'q' } }, { quoted: true, k: 4 }); expect(seen.length).toBe(1);
  });
});

describe('rank: the named work / author outranks authority order', () => {
  it('a named work (by title or id) and a named author come before a higher authority kind', () => {
    const items = [P(1, { authority: 'scripture', title: 'Gleanings' }), P(2, { authority: 'interpretation', title: 'Some Answered Questions', document_id: 9 }), P(3, { authority: 'history', author: 'Augustine' })];
    const a = mk({ found_passages: [...items], named_work: 'Some Answered Questions' }); ELEMENTS.rank.run(a, { by: ['named', 'authority'] });
    expect(a.units.found_passages[0].id).toBe(2);
    const b = mk({ found_passages: [...items], named_work: 9 }); ELEMENTS.rank.run(b, { by: ['named', 'authority'] }); expect(b.units.found_passages[0].id).toBe(2);
    const c = mk({ found_passages: [...items], named_person: 'Augustine' }); ELEMENTS.rank.run(c, { by: ['named', 'authority'] }); expect(c.units.found_passages[0].id).toBe(3);
  });
});

describe('the judge sees the tree', () => {
  it('turnFromPath keeps node members/filters; the judge message names the gather members', () => {
    const steps = [{ node: 'gather', step: 's@1', ms: 9, edge: 'several', count: 6, members: [{ node: 'gather.0', element: 'search.shelf', edge: 'one', count: 3, query: 'soul after death', filters: { work: 'Some Answered Questions' } }, { node: 'gather.1', element: 'search.shelf', edge: 'none', count: 0, skipped: true }] }];
    const t = turnFromPath({ question: Q, reply: 'r', path: { strategy: { choice: 'understanding' }, steps } });
    const msg = judgeMessage(itemsForTurn(t, { messageId: 'x' }).reply);
    expect(msg).toContain('TREE understanding'); expect(msg).toContain('gather.0 search.shelf "soul after death" filters {"work":"Some Answered Questions"} → 3'); expect(msg).toContain('gather.1 search.shelf (skipped');
  });
});

describe('search.originals under a tradition scope', () => {
  it("skips the Bahá'í originals index on a turn scoped to another tradition, runs it for Bahá'í or unscoped", async () => {
    let called = 0;
    const tools = { originals_search: async () => { called++; return { passages: [P(1)] }; } };
    await ELEMENTS['search.originals'].run(mk({ religions_specified: ['Buddhist'], current_user_question: 'anatta' }, { tools }), {});
    expect(called).toBe(0);
    await ELEMENTS['search.originals'].run(mk({ religions_specified: ["Bahá'í"], current_user_question: 'soul' }, { tools }), {});
    await ELEMENTS['search.originals'].run(mk({ current_user_question: 'soul' }, { tools }), {});
    expect(called).toBe(2);
  });
});

describe('rank keeps the scope', () => {
  it('a widened out-of-scope passage never outranks an in-scope one, even by authority', () => {
    const s = mk({ found_passages: [P(1, { religion: "Baha'i", authority: 'scripture', out_of_scope: true }), P(2, { religion: 'Buddhist', authority: 'other' })] });
    ELEMENTS.rank.run(s, { by: ['named', 'authority'], k: 1 });
    expect(s.units.found_passages.map((x) => x.id)).toEqual([2]);
  });
});

describe('quoted_words: the reader\'s own quotation marks fill the unit (single quotes too)', () => {
  it('entryUnits resolves the quoted span when the tree needs it', async () => {
    const { quotedSpan } = await import('../../api/lib/assistant/respond.js');
    const q = "'The earth is but one country, and mankind its citizens.' In what context did Bahá'u'lláh write this?";
    expect(quotedSpan(q)).toBe('The earth is but one country, and mankind its citizens.');
    expect(quotedSpan("What did Bahá'u'lláh mean by unity?")).toBe(null);
    const u = entryUnits({ needs: ['quoted_words'] }, {}, { query: q, question: q, messages: [], channel: { id: 'site-chat' } });
    expect(u.quoted_words).toBe('The earth is but one country, and mankind its citizens.');
  });
});

describe('namedUnits: topic remnants after a removed span (11-09 widget turns)', () => {
  const p = (n = 1) => ({ kind_1: ans('person') });
  it('"the Báb\'s childhood" with Báb removed leaves no lone "s"', () => {
    expect(namedUnits(p(), ['the Báb'], 'What is the story of the Báb\'s childhood in Shiraz?').topic).toBe('What is the story of childhood in Shiraz?');
  });
  it('a bare "Who was Ṭáhirih?" with the span removed has no topic (falls back to the whole question)', () => {
    expect(namedUnits(p(), ['Ṭáhirih'], 'Who was Ṭáhirih?').topic).toBeUndefined();
  });
  it('lone apostrophe tokens are dropped', () => {
    expect(namedUnits(p(), ["'Abdu'l-Bahá"], 'Trace how \'Abdu\'l-Bahá uses "Most Great Justice" across his talks').topic).toBe('Trace how uses "Most Great Justice" across his talks');
  });
  it('a person the question is ABOUT is "neither" (Jev); a bare asking frame around it → the person is the topic', () => {
    expect(namedUnits({ kind_1: ans('neither') }, ['Ṭáhirih'], 'Who was Ṭáhirih?')).toEqual({ topic: 'Ṭáhirih' });
    expect(namedUnits({ kind_1: ans('neither') }, ['Vaḥíd'], 'Tell me about Vaḥíd')).toEqual({ topic: 'Vaḥíd' });
    expect(namedUnits({ kind_1: ans('neither') }, ['Vaḥíd'], 'Can you tell me about Vaḥíd?')).toEqual({ topic: 'Vaḥíd' });
  });
  it('a question with its own content beyond the subject keeps the whole question (no topic)', () => {
    expect(namedUnits({ kind_1: ans('neither') }, ['Báb'], 'When did the Báb declare His mission?')).toEqual({});
    expect(namedUnits({ kind_1: ans('neither', 0.3) }, ['Vaḥíd'], 'Tell me about Vaḥíd')).toEqual({});
  });
});
