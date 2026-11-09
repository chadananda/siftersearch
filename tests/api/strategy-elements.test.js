// Tree ELEMENTS (activities/elements.js, strategy-trees section 2): one test group per element on fake tools (one/several/none/error), the
// shared ends, scope behaviour, and an A1-style tree compiled from step rows and run end to end by graph.js.
import { describe, it, expect } from 'vitest';
import { ELEMENTS, scoped } from '../../api/lib/assistant/activities/elements.js';
import { compileGraph, runGraph } from '../../api/lib/assistant/activities/graph.js';
import { activities } from '../../api/lib/assistant/activities/index.js';
import { activityCatalog } from '../../api/lib/assistant/activities/catalog.js';

const P = (i, x = {}) => ({ id: i, text: `Passage ${i}`, document_id: 100 + i, paragraph_index: i, religion: "Baha'i", authority: 'scripture', score: 0.9, ...x });
const mk = (tools = {}, units = {}, extra = {}) => ({ node: 'n', question: 'what is love', tools, units: { ...units }, ctx: {}, templates: {}, ...extra });
const go = async (name, s, params = {}) => { const edge = await ELEMENTS[name].run(s, params); return { edge, u: s.units, note: s.note }; };
const ret = (hits) => async () => ({ passages: hits });
const boom = async () => { throw new Error('down'); };

describe('catalog and registry', () => {
  it('every element is registered, strategy-scoped, with params', () => {
    const reg = activities();
    for (const name of Object.keys(ELEMENTS)) { expect(reg[name], name).toBeTruthy(); expect(reg[name].scope).toBe('strategy'); expect(Array.isArray(reg[name].params)).toBe(true); }
    expect(reg['strategy.comparison']).toBeTruthy();
    const e = activityCatalog().find((x) => x.name === 'fetch.phrase');
    expect(e.description).toBeTruthy(); expect(e.edges).toContain('thin'); expect(e.reads).toContain('religions_specified');
  });
});

describe('scope', () => {
  it('filter mode drops and counts; rank mode keeps, in-scope first, marks the rest', () => {
    const hits = [P(1, { religion: 'Islam' }), P(2)], u = { religions_specified: ["Baha'i"] };
    expect(scoped(hits, u, false)).toMatchObject({ excluded: 1, items: [{ id: 2 }] });
    const r = scoped(hits, u, true);
    expect(r.excluded).toBe(0); expect(r.items.map((x) => x.id)).toEqual([2, 1]); expect(r.items[1].out_of_scope).toBe(true);
  });
  it('a tradition param outside the scope is a free none with no tool call', async () => {
    let called = 0;
    const s = mk({ fused_search: async () => { called++; return { passages: [P(1)] }; } }, { religions_specified: ['Islam'] });
    expect((await go('search.shelf', s, { tradition: "Baha'i" })).edge).toBe('none'); expect(called).toBe(0);
  });
});

describe('search.* / fetch.* retrieval paths', () => {
  const cases = [['search.shelf', 'fused_search'], ['search.hype', 'hype_search'], ['search.originals', 'originals_search'], ['fetch.guidance', 'fused_search'], ['fetch.prayer', 'hype_search'],
    ['fetch.original', 'original_lookup'], ['fetch.translation', 'translation_lookup'], ['fetch.phrase', 'quotation_candidates']];
  for (const [name, tool] of cases) {
    it(`${name}: several / none / error, scope_excluded, note`, async () => {
      const many = await go(name, mk({ [tool]: ret([P(1), P(2, { religion: 'Islam' }), P(3)]) }, { religions_specified: ["Baha'i"] }));
      const strict = !['fetch.original', 'fetch.translation', 'fetch.phrase'].includes(name);
      expect(many.edge).toBe(strict || name === 'fetch.phrase' ? 'several' : 'one'); expect(many.u.found_passages.length).toBe(strict ? 2 : 3); expect(many.u.scope_excluded).toBe(strict ? 1 : 0);
      expect(many.note).toMatchObject({ count: strict ? 2 : 3, scope_excluded: strict ? 1 : 0 }); expect(many.note.read.religions_specified).toBeTruthy();
      const none = await go(name, mk({ [tool]: ret([]) })); expect(none.edge).toBe('none'); expect(none.u.missing.length).toBe(1);
      const err = await go(name, mk({ [tool]: boom })); expect(err.edge).toBe('error'); expect(err.u.found_outcome.n).toBe('error');
    });
  }
  it('search.shelf: one, thin, authority_floor filter', async () => {
    expect((await go('search.shelf', mk({ fused_search: ret([P(1)]) }))).edge).toBe('one');
    expect((await go('search.shelf', mk({ fused_search: ret([P(1, { score: 0.1 }), P(2, { score: 0.1 })]) }))).edge).toBe('thin');
    const r = await go('search.shelf', mk({ fused_search: ret([P(1, { authority: 'scholarship' }), P(2)]) }, { authority_floor: 'scripture' }));
    expect(r.u.found_passages.map((x) => x.id)).toEqual([2]); expect(r.u.scope_excluded).toBe(1);
  });
  it('search.originals is skipped when search_originals is false', async () => {
    expect((await go('search.originals', mk({ originals_search: ret([P(1), P(2)]) }, { search_originals: false }))).edge).toBe('none');
  });
  it('fetch.phrase close mode without a source is thin', async () => {
    expect((await go('fetch.phrase', mk({ quotation_candidates: ret([P(1, { role: 'quote' }), P(2, { role: 'quote' })]) }), { mode: 'close' })).edge).toBe('thin');
  });
  it('search.web fills web_found only', async () => {
    const r = await go('search.web', mk({ web_search: async () => ({ text: 'summary', citations: ['https://example.org/a'] }) }));
    expect(r.edge).toBe('one'); expect(r.u.web_found.length).toBe(1); expect(r.u.found_passages.length).toBe(0);
    expect((await go('search.web', mk({ web_search: boom }))).edge).toBe('error');
    expect((await go('search.web', mk({ web_search: async () => ({}) }))).edge).toBe('none');
  });
});

describe('named-thing, reference, not-built, facts', () => {
  it('fetch.work / person / renderings / work_notes', async () => {
    expect((await go('fetch.work', mk({ document_search: async () => ({ works: [{ id: 1, title: 'A' }] }) }, { named_work: 'A' }))).edge).toBe('one');
    expect((await go('fetch.work', mk({ document_search: async () => ({ works: [{ id: 1 }, { id: 2 }] }) }, { named_work: 'A' }))).edge).toBe('several');
    expect((await go('fetch.work', mk({ document_search: async () => ({ works: [] }) }, { named_work: 'A' }))).edge).toBe('none');
    expect((await go('fetch.work', mk({ document_search: boom }, { named_work: 'A' }))).edge).toBe('error');
    expect((await go('fetch.person', mk({ biography_search: async () => ({ people: [{ id: 1, name: 'X' }] }) }))).edge).toBe('one');
    expect((await go('fetch.person', mk({ biography_search: async () => ({ people: [] }) }))).edge).toBe('none');
    const rr = await go('fetch.renderings', mk({ rendering_lookup: async () => ({ found: true, term: 'x', passages: [P(1), P(2)], renderings: [] }) }, { term: 'كلمة' }));
    expect(rr.edge).toBe('several'); expect(rr.u.found_records.length).toBe(1);
    expect((await go('fetch.renderings', mk({ rendering_lookup: async () => ({ found: false }) }, { term: 'كلمة' }))).edge).toBe('none');
    expect((await go('fetch.work_notes', mk({ work_notes_lookup: async () => ({ work: 'W', notes: [{ text: 'n' }] }) }))).edge).toBe('one');
    expect((await go('fetch.work_notes', mk({ work_notes_lookup: boom }))).edge).toBe('error');
  });
  it('fetch.reference needs a reference', async () => {
    const hit = ret([P(1)]);
    expect((await go('fetch.reference', mk({ reference: hit }, { scripture_reference: 'John 3:16' }))).edge).toBe('one');
    expect((await go('fetch.reference', mk({ reference: hit }, {}), { query: 'nothing here' })).edge).toBe('none');
    expect((await go('fetch.reference', mk({ reference: boom }, { scripture_reference: 'John 3:16' }))).edge).toBe('error');
  });
  it('not-built indexes answer none; a hook can serve them', async () => {
    for (const n of ['fetch.collection', 'fetch.events', 'fetch.calendar', 'fetch.activity']) expect((await go(n, mk())).edge).toBe('none');
    expect((await go('fetch.events', mk({ events: async () => [{ id: 1 }, { id: 2 }] }))).edge).toBe('several');
    expect((await go('fetch.events', mk({ events: boom }))).edge).toBe('error');
  });
  it('fetch.facts / anchor / align', async () => {
    expect((await go('fetch.facts', mk({ facts: async () => ({ documents: 5 }) }))).edge).toBe('one');
    expect((await go('fetch.facts', mk({ facts: async () => null }))).edge).toBe('error');
    expect((await go('fetch.anchor', mk({}, { referent: { text: 'x', id: 1 } }))).edge).toBe('one');
    expect((await go('fetch.anchor', mk({ context_lookup: ret([P(1)]) }, { reader_position: { doc: 5 } }))).edge).toBe('one');
    expect((await go('fetch.anchor', mk({}, { quoted_words: 'abc' }))).edge).toBe('thin');
    expect((await go('fetch.anchor', mk())).edge).toBe('none');
    expect((await go('fetch.anchor', mk({ context_lookup: boom }, { reader_position: { doc: 5 } }))).edge).toBe('error');
    const al = await go('fetch.align', mk({ links_lookup: async () => ({ original: 'orig', translations: [] }) }, { found_passages: [P(1)] }));
    expect(al.edge).toBe('one'); expect(al.u.found_passages[0].original).toBe('orig');
    expect((await go('fetch.align', mk({ links_lookup: async () => ({}) }, { found_passages: [P(1)] }))).edge).toBe('none');
    expect((await go('fetch.align', mk({ links_lookup: boom }, { found_passages: [P(1)] }))).edge).toBe('error');
  });
});

describe('composition', () => {
  it('search.together merges tiers in parallel, shares scope_excluded, errors only if all error', async () => {
    const tools = { fused_search: ret([P(1), P(2, { religion: 'Islam' })]), hype_search: ret([P(1), P(3)]) };
    const steps = [{ element: 'search.shelf' }, { element: 'search.hype' }];
    const r = await go('search.together', mk(tools, { religions_specified: ["Baha'i"] }), { list: steps });
    expect(r.edge).toBe('several'); expect(r.u.found_passages.map((x) => x.id).sort()).toEqual([1, 3]); expect(r.u.scope_excluded).toBe(1);
    expect((await go('search.together', mk({ fused_search: boom, hype_search: ret([P(1)]) }), { list: steps })).edge).toBe('one');
    expect((await go('search.together', mk({ fused_search: boom, hype_search: boom }), { list: steps })).edge).toBe('error');
    expect((await go('search.together', mk({ fused_search: ret([]), hype_search: ret([]) }), { list: steps })).edge).toBe('none');
  });
  it('search.fanout runs per value and tags sides', async () => {
    const tools = { fused_search: async (i) => ({ passages: i.query.includes('b') ? [] : [P(i.query.length)] }) };
    const inner = { element: 'search.shelf', params: { query: '{{value}}' } };
    const r = await go('search.fanout', mk(tools), { facets: ['a', 'b'], inner });
    expect(r.edge).toBe('some_thin'); expect(r.u.found_passages[0].side).toBe('a');
    expect((await go('search.fanout', mk(tools), { facets: ['b'], inner })).edge).toBe('all_none');
    expect((await go('search.fanout', mk(tools), { facets: ['a', 'aa'], inner })).edge).toBe('all');
    expect((await go('search.fanout', mk({ fused_search: boom }), { facets: ['a'], inner })).edge).toBe('error');
  });
  it('probe: match / adjust (writes override) / mismatch', async () => {
    const step = { element: 'search.shelf' };
    expect((await go('probe', mk({ fused_search: ret([P(1, { language: 'ar' }), P(2, { language: 'ar' })]) }), { step, expect: { language: 'ar' } })).edge).toBe('match');
    const adj = await go('probe', mk({ fused_search: ret([P(1, { language: 'ar' }), P(2, { language: 'en' })]) }), { step, expect: { language: 'ar' }, target: 'x' });
    expect(adj.edge).toBe('adjust'); expect(adj.u.param_overrides.x.language).toBe('ar');
    const mm = await go('probe', mk({ fused_search: ret([P(1, { language: 'en' })]) }), { step, expect: { language: 'ar' } });
    expect(mm.edge).toBe('mismatch'); expect(mm.u.defects[0].kind).toBe('probe_mismatch');
    expect((await go('probe', mk({ fused_search: boom }), { step, expect: {} })).edge).toBe('mismatch');
  });
});

describe('read.*', () => {
  it('read.around attaches context; copyright books are not read around', async () => {
    const s = mk({ context_lookup: async (i) => (i.document_id === 101 ? { passages: [P(9)] } : { copyright: true }) }, { found_passages: [P(1), P(2)] });
    expect((await go('read.around', s)).edge).toBe('done'); expect(s.units.found_passages[0].context.length).toBe(1); expect(s.units.found_passages[1].copyright).toBe(true);
    expect((await go('read.around', mk({ context_lookup: boom }, { found_passages: [P(1)] }))).edge).toBe('done');
  });
  it('read.source traces to the primary or keeps', async () => {
    const tr = await go('read.source', mk({ source_trace: async () => ({ passages: [P(50)] }) }, { found_passages: [P(1)] }));
    expect(tr.edge).toBe('traced'); expect(tr.u.found_passages[0].id).toBe(50); expect(tr.u.found_passages.length).toBe(2);
    expect((await go('read.source', mk({ source_trace: async () => ({}) }, { found_passages: [P(1)] }))).edge).toBe('kept');
    expect((await go('read.source', mk({ source_trace: boom }, { found_passages: [P(1)] }))).edge).toBe('kept');
  });
});

describe('decisions', () => {
  it('switch: first_filled / count / outcome / unit / value, default, dynamic edges', () => {
    const sw = ELEMENTS.switch, run = (u, p) => sw.run(mk({}, u), p);
    expect(sw.edgesFor({ cases: { a: 'x', b: 'y' }, default: 'z' }).sort()).toEqual(['x', 'y', 'z']);
    expect(run({ named_work: 'W', quoted_words: 'q' }, { on: { first_filled: ['quoted_words', 'named_work'] }, cases: { quoted_words: 'q', named_work: 'w' }, default: 'd' })).toBe('q');
    expect(run({}, { on: { first_filled: ['a'] }, cases: { a: 'q' }, default: 'd' })).toBe('d');
    expect(run({ found_passages: [P(1), P(2)] }, { on: { count: 'found_passages' }, cases: { many: 'm', 1: 'o', 0: 'z' } })).toBe('m');
    expect(run({ found_outcome: { n1: 'thin' } }, { on: { outcome: 'n1' }, cases: { thin: 't' }, default: 'd' })).toBe('t');
    expect(run({ topic: 'x' }, { on: { unit: 'topic' }, cases: { filled: 'f', empty: 'e' } })).toBe('f');
    expect(run({ output_form: 'list' }, { on: { value: 'output_form' }, cases: { list: 'l' }, default: 'd' })).toBe('l');
  });
  it('judge: one generic activity; options are params; default on no answer; records the decision', async () => {
    const log = [], options = [{ edge: 'a', when: 'A' }, { edge: 'b', when: 'B' }];
    expect(ELEMENTS.judge.edgesFor({ options })).toEqual(['a', 'b']);
    const s = mk({}, {}, { jev: async () => ({ choice: 'b' }), direction: { decisions: { record: (...x) => log.push(x) } } });
    expect(await ELEMENTS.judge.run(s, { question: 'q?', options })).toBe('b'); expect(log[0][0]).toBe('tree:n'); expect(log[0][1].chosen).toBe('b');
    expect(await ELEMENTS.judge.run(mk({}, {}, { jev: async () => null }), { question: 'q', options, default: 'a' })).toBe('a');
    expect(await ELEMENTS.judge.run(mk({}, {}, { jev: async () => { throw new Error('x'); } }), { question: 'q', options })).toBe('a');
  });
  it('judge marks items', async () => {
    const s = mk({}, { found_records: [{ title: 'a' }, { title: 'b' }] }, { jev: async () => ({ choice: 'a', marked: [1] }) });
    await ELEMENTS.judge.run(s, { question: 'q', options: [{ edge: 'a', when: 'x' }], mark: true }); expect(s.units.found_records[1].marked).toBe(true);
  });
  it('judge.passages: answers / mentions_only / conflict / empty', async () => {
    const run = (verdicts, n = verdicts.length) => { let i = 0; const s = mk({}, { found_passages: Array.from({ length: n }, (_, k) => P(k + 1)) }, { jev: async () => ({ choice: verdicts[i++] }) }); return ELEMENTS['judge.passages'].run(s, {}).then((e) => [e, s.units.found_passages.length]); };
    expect(await run(['answers', 'mentions_only'])).toEqual(['answers', 1]);
    expect(await run(['mentions_only', 'mentions_only'])).toEqual(['mentions_only', 2]);
    expect((await run(['answers', 'contradicts']))[0]).toBe('conflict');
    expect(await run([], 0)).toEqual(['empty', 0]);
  });
});

describe('rank / shape / plan', () => {
  it('rank by authority then score, k, dedupe, skip given, pin, group, empty', () => {
    const items = [P(1, { authority: 'scholarship', score: 0.9 }), P(2, { authority: 'scripture', score: 0.3 }), P(3, { authority: 'scripture', score: 0.8 }), P(3, { authority: 'scripture', score: 0.8 })];
    const s = mk({}, { found_passages: items });
    expect(ELEMENTS.rank.run(s, { by: ['authority', 'score'], dedupe: true, k: 2 })).toBe('done'); expect(s.units.found_passages.map((x) => x.id)).toEqual([3, 2]);
    const g = mk({}, { found_passages: [P(1), P(2)] }, { state: { given: [{ id: 1 }] } });
    ELEMENTS.rank.run(g, { by: 'score', skip: 'given' }); expect(g.units.found_passages.map((x) => x.id)).toEqual([2]);
    const f = mk({}, { found_passages: [P(1), P(2)] }, { state: { given: [{ id: 1 }] } });
    ELEMENTS.rank.run(f, { skip: 'flag' }); expect(f.units.found_passages[0].given).toBe(true);
    const k = mk({}, { found_passages: [P(1), P(2)], depth: 'research' }); ELEMENTS.rank.run(k, { k: { default: 1, research: 2 } }); expect(k.units.found_passages.length).toBe(2);
    const pin = mk({}, { found_passages: [P(1), P(2, { marked: true })] }); ELEMENTS.rank.run(pin, { pin: 'marked' }); expect(pin.units.found_passages[0].id).toBe(2);
    const gr = mk({}, { found_passages: [P(1, { author: 'a' }), P(2, { author: 'a' }), P(3, { author: 'b' })] }); ELEMENTS.rank.run(gr, { group: 'author' }); expect(gr.units.groups[0]).toMatchObject({ key: 'a', count: 2 });
    expect(ELEMENTS.rank.run(mk({}, {}), { by: 'score' })).toBe('empty');
  });
  it('shape: template, by_count, sub template, offers; stopAtShape is a no-op', () => {
    const templates = { one: 'ONE {{topic}}', many: 'MANY', sub: 'SUB' };
    const s = mk({}, { found_passages: [P(1)], topic: 'love' }, { templates });
    expect(ELEMENTS.shape.run(s, { by_count: { 1: 'one', n: 'many' }, offers: ['the link'] })).toBe('done');
    expect(s.out.format.how).toBe('ONE love'); expect(s.units.offers[0].what).toBe('the link');
    const m = mk({}, { found_passages: [P(1), P(2)] }, { templates }); ELEMENTS.shape.run(m, { by_count: { 1: 'one', n: 'many' } }); expect(m.out.format.how).toBe('MANY');
    const sb = mk({}, { sub_template: 'sub' }, { templates }); ELEMENTS.shape.run(sb, { template: '@sub' }); expect(sb.out.format.variant).toBe('sub');
    const st = mk({}, {}, { templates, stopAtShape: true }); ELEMENTS.shape.run(st, { template: 'one' }); expect(st.out).toBeUndefined();
  });
  it('plan.subthemes: generator or the topic default', async () => {
    expect(await ELEMENTS['plan.subthemes'].run(mk({ subthemes: async () => ['a', 'b'] }, { topic: 't' }), {})).toBe('done');
    const s = mk({}, { topic: 't' }); expect(await ELEMENTS['plan.subthemes'].run(s, {})).toBe('fail'); expect(s.units.sub_themes).toEqual(['t']);
  });
});

describe('hand.* and fallback', () => {
  it('hand.strategy: found / thin / none / error', async () => {
    const sub = (n) => ({ graphFor: () => ({ id: 'sub', version: 1, entry: 'a', nodes: { a: { id: 'a', params: {}, out: new Map(), any: '$end', step: 'a', run: (s) => { for (let i = 0; i < n; i++) s.units.found_passages.push(P(i + 1)); return 'x'; } } } }) });
    expect((await go('hand.strategy', mk({}, {}, sub(2)), { name: 'sub' })).edge).toBe('found');
    expect((await go('hand.strategy', mk({}, {}, sub(1)), { name: 'sub', min: 2 })).edge).toBe('thin');
    expect((await go('hand.strategy', mk({}, {}, sub(0)), { name: 'sub' })).edge).toBe('none');
    expect((await go('hand.strategy', mk({}, {}, { graphFor: () => { throw new Error('x'); } }), { name: 'sub' })).edge).toBe('error');
    expect((await go('hand.strategy', mk({}, {}, { graphFor: () => null }), { name: 'sub' })).edge).toBe('error');
  });
  it('hand.job queues with a frozen scope; no queue is error', async () => {
    let seen; const r = await go('hand.job', mk({ job: async (p) => { seen = p; return { id: 7 }; } }, { religions_specified: ['Islam'] }), { kind: 'deep_report' });
    expect(r.edge).toBe('queued'); expect(seen.scope.religions_specified).toEqual(['Islam']); expect(r.u.offers.length).toBe(1);
    expect((await go('hand.job', mk(), { kind: 'weird' })).edge).toBe('error');
    expect((await go('hand.job', mk({ job: boom }), { kind: 'deep_report' })).edge).toBe('error');
  });
  it('deliver.email and fallback.agent', async () => {
    const withAddr = { ctx: { email: 'reader-address' } };
    expect((await go('deliver.email', mk({}, {}), {})).edge).toBe('no_address');
    expect((await go('deliver.email', mk({ deliver_email: async () => {} }, {}, withAddr), {})).edge).toBe('sent');
    expect((await go('deliver.email', mk({}, {}, withAddr), {})).edge).toBe('error');
    const ok = mk({}, {}, { agentRun: async () => ({ reply: 'x' }) }); expect((await go('fallback.agent', ok)).edge).toBe('answered'); expect(ok.done).toBeTruthy(); expect(ok.units.defects[0].kind).toBe('fallback');
    expect((await go('fallback.agent', mk({}, {}, { agentRun: async () => null }))).edge).toBe('fail');
  });
});

describe('shared ends', () => {
  it('end.absence widens once, says so, labels the nearest', async () => {
    const s = mk({ fused_search: ret([P(1)]) }, { religions_specified: ['Islam'], authority_floor: 'scripture', topic: 'x' });
    expect(await ELEMENTS['end.absence'].run(s)).toBe('done');
    expect(s.units.religions_specified).toBe('all'); expect(s.units.widened.from).toEqual(['Islam']); expect(s.units.found_passages[0].nearest).toBe(true);
    expect(s.out.format.how).toMatch(/nearest/); expect(s.out.format.how).toMatch(/widened/);
  });
  it('end.absence survives a failing nearest search; end.unavailable never claims absence; end.fallback = agent', async () => {
    const s = mk({ fused_search: boom }, {}); expect(await ELEMENTS['end.absence'].run(s)).toBe('done'); expect(s.out.format.how).toMatch(/does not hold/);
    const u = mk(); expect(await ELEMENTS['end.unavailable'].run(u)).toBe('done'); expect(u.out.format.how).toMatch(/NEVER say/);
    expect(await ELEMENTS['end.fallback'].run(mk({}, {}, { agentRun: async () => ({ r: 1 }) }))).toBe('answered');
  });
});

// an A1-style tree: switch, search.together, rank, judge, shape; absence / fallback via shared ends
const STEPS = new Map(Object.entries({
  'sw@1': { activity: 'switch', params: { on: { first_filled: ['named_person', 'topic'] }, cases: { named_person: 'per', topic: 'sh' }, default: 'sh' } },
  'per@1': { activity: 'fetch.person', params: {} },
  'sh@1': { activity: 'search.together', params: { list: [{ element: 'search.shelf', params: { authority: 'scripture' } }, { element: 'search.hype' }] } },
  'rk@1': { activity: 'rank', params: { by: ['authority', 'score'], k: 3, dedupe: true } },
  'jp@1': { activity: 'judge', params: { question: 'Is {{topic}} answered?', options: [{ edge: 'yes', when: 'answered' }, { edge: 'no', when: 'not' }], default: 'yes' } },
  'ra@1': { activity: 'shape', params: { by_count: { 1: 'tpl.one', n: 'tpl.many' } } },
  'rec@1': { activity: 'shape', params: { template: 'tpl.record' } },
}).map(([k, v]) => [k, { id: k.split('@')[0], version: 1, ...v }]));
const node = (id) => ({ step: id, step_version: 1 });
const TREE = { id: 'a1', version: 1, name: 'a1', graph: { entry: 'sw', nodes: { sw: node('sw'), per: node('per'), sh: node('sh'), rk: node('rk'), jp: node('jp'), ra: node('ra'), rec: node('rec') },
  edges: [{ from: 'sw', on: 'per', to: 'per' }, { from: 'sw', on: 'sh', to: 'sh' }, { from: 'sw', on: 'default', to: 'sh' },
    { from: 'per', on: 'one', to: 'rec' }, { from: 'per', on: 'several', to: 'rec' }, { from: 'per', on: 'none', to: '$absence' }, { from: 'per', on: 'error', to: '$fallback' },
    { from: 'sh', on: 'one', to: 'rk' }, { from: 'sh', on: 'several', to: 'rk' }, { from: 'sh', on: 'thin', to: 'rk' }, { from: 'sh', on: 'none', to: '$absence' }, { from: 'sh', on: 'error', to: '$fallback' },
    { from: 'rk', on: 'done', to: 'jp' }, { from: 'rk', on: 'empty', to: '$absence' },
    { from: 'jp', on: 'yes', to: 'ra' }, { from: 'jp', on: 'no', to: '$absence' }, { from: 'ra', on: 'done', to: '$end' }, { from: 'rec', on: 'done', to: '$end' }] } };
const TEMPLATES = { 'tpl.one': 'ONE', 'tpl.many': 'MANY', 'tpl.record': 'RECORD' };
const tree = (tools, units, extra = {}) => runGraph(compileGraph(TREE, (k) => STEPS.get(k), activities()), mk(tools, units, { templates: TEMPLATES, jev: async () => ({ choice: 'yes' }), ...extra }));

describe('A1-style tree compiled from step rows, end to end', () => {
  it('compiles with shared ends, counting only working nodes', () => {
    const g = compileGraph(TREE, (k) => STEPS.get(k), activities());
    expect(g.nodes.$absence.shared).toBe(true); expect(g.nodes.$unavailable.shared).toBe(true);
    expect(Object.values(g.nodes).filter((n) => !n.shared).length).toBe(7);
  });
  it('a missing edge route is refused (dynamic edges are checked)', () => {
    const bad = { ...TREE, graph: { ...TREE.graph, edges: TREE.graph.edges.filter((e) => !(e.from === 'sh' && e.on === 'none')) } };
    expect(() => compileGraph(bad, (k) => STEPS.get(k), activities())).toThrow();
  });
  it('topic path: several hits, ranked, judged, shaped; trace carries count, scope_excluded, path', async () => {
    const s = await tree({ fused_search: ret([P(1), P(2, { religion: 'Islam' })]), hype_search: ret([P(3)]) }, { topic: 'love', religions_specified: ["Baha'i"] });
    expect(s.out.format.how).toBe('MANY'); expect(s.units.found_passages.length).toBe(2);
    expect(s.trace.find((t) => t.node === 'sh')).toMatchObject({ edge: 'several', count: 2, scope_excluded: 1 });
    expect(s.units.path).toEqual(['sw:sh', 'sh:several', 'rk:done', 'jp:yes', 'ra:done']);
  });
  it('person path and the absence end', async () => {
    const s = await tree({ biography_search: async () => ({ people: [{ id: 1, name: 'X' }] }) }, { named_person: 'X' });
    expect(s.out.format.how).toBe('RECORD');
    const a = await tree({ fused_search: ret([]), hype_search: ret([]) }, { topic: 'zzz', religions_specified: ['Islam'] });
    expect(a.units.path.at(-1)).toBe('$absence:done'); expect(a.out.format.how).toMatch(/does not hold/); expect(a.units.widened).toBeTruthy();
  });
  it('error goes to fallback, then unavailable when the agent fails; never absence', async () => {
    const s = await tree({ fused_search: boom, hype_search: boom }, { topic: 'love' }, { agentRun: async () => null });
    expect(s.units.path.slice(-3)).toEqual(['sh:error', '$fallback:fail', '$unavailable:done']); expect(s.out.format.how).toMatch(/NEVER say/);
    const a = await tree({ fused_search: boom, hype_search: boom }, { topic: 'love' }, { agentRun: async () => ({ reply: 'agent' }) });
    expect(a.done).toEqual({ reply: 'agent' });
  });
});
