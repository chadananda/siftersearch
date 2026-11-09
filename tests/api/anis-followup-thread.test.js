// Follow-ups start from the last turn's evidence (11-09): Jev's refers_back + the thread units (last_topic / last_passages) reach the tree; a compare side's named book is its work filter. Jev mocked.
import { describe, it, expect } from 'vitest';
import { chooseStrategy } from '../../api/lib/assistant/strategy-choice.js';
import { ELEMENTS } from '../../api/lib/assistant/activities/elements.js';
import { entryUnits, graphFor } from '../../api/lib/assistant/activities/graph.js';
import { lastPassages, lastTopic, emptyState, applyPatch } from '../../api/lib/assistant/units.js';
import { linkedInPrevious, jevState } from '../../api/lib/assistant/request-features.js';
import { LOOKUP_KINDS, OUTCOMES, KINDS } from '../../api/lib/assistant/triage.js';

const ans = (choice, confidence = 0.95) => ({ choice, confidence });
const Q1 = 'My grandmother passed away. Will I recognise her in the next world?';
const R1 = 'Abdu\'l-Bahá says [*Selections from the Writings of ‘Abdu’l-Bahá*](https://oceanlibrary.com/a#1) and also [*Tablets of ‘Abdu’l-Bahá vol. 1-3*](https://oceanlibrary.com/b#2).';
const thread = (q) => [{ role: 'user', content: Q1 }, { role: 'assistant', content: R1 }, { role: 'user', content: q }];
const state = applyPatch(emptyState(), { thread: [{ turn: 0, strategy: 'understanding', topic: Q1, found_outcome: 'several' }], given: [{ turn: 0, kind: 'passage', ref: '20910:42' }, { turn: 0, kind: 'passage', ref: '20915:7' }] }, { turn: 0 });
const mk = (units = {}, extra = {}) => ({ node: 'n', question: 'q', tools: {}, units: { found_passages: [], found_records: [], web_found: [], found_outcome: {}, missing: [], scope_excluded: 0, ...units }, ctx: {}, templates: {}, ...extra });

describe('thread units', () => {
  it('lastPassages: only the last turn\'s cited passages, parsed from the given refs', () => {
    const st = applyPatch(state, { given: [{ turn: 1, kind: 'passage', ref: '5:3' }, { turn: 1, kind: 'title', ref: '9' }] }, { turn: 1 });
    expect(lastPassages(state)).toEqual([{ ref: '20910:42', document_id: 20910, paragraph_index: 42 }, { ref: '20915:7', document_id: 20915, paragraph_index: 7 }]);
    expect(lastPassages(st)).toEqual([{ ref: '5:3', document_id: 5, paragraph_index: 3 }]);
    expect(lastPassages(emptyState())).toEqual([]);
  });
  it('lastTopic: the thread entry, else the previous user message', () => {
    expect(lastTopic(state, thread('x'))).toBe(Q1);
    expect(lastTopic(emptyState(), thread('x'))).toBe(Q1);
  });
  it('entryUnits: refers_back puts the last topic in follows_topic and the passages in last_passages; own subject leaves them out', () => {
    const g = graphFor('comparison', 2), ctx = { query: 'x', question: 'x', messages: thread('how does that compare with the Gita?'), state, channel: { id: 'site-chat' } };
    const u = entryUnits(g, { refersBack: true, sides: ['Baha\'i', 'Hindu'], sources: { Hindu: 'Bhagavad Gita' } }, ctx);
    expect(u.follows_topic).toBe(Q1); expect(u.refers_back).toBe(true); expect(u.last_passages.length).toBe(2); expect(u.side_sources).toEqual({ Hindu: 'Bhagavad Gita' });
    const v = entryUnits(g, { sides: ['Baha\'i', 'Hindu'] }, ctx);
    expect(v.follows_topic ?? null).toBeNull(); expect(v.refers_back).toBeFalsy();
  });
});

describe('Jev decides what a follow-up refers to', () => {
  it('chooseStrategy asks refers_back only in a thread and returns refersBack from Jev\'s answer', async () => {
    let body;
    const fetchImpl = async (url, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { strategy: ans('comparison'), refers_back: ans('previous'), side_a: ans('Bahá’í'), scope_religion: ans('unchanged') } }) }; };
    const r = await chooseStrategy(thread('what are the actual words?'), { apiKey: 'k', fetchImpl, options: { comparison: 'c', unmatched: 'x' } });
    expect(body.questions.refers_back).toBeTruthy(); expect(r.refersBack).toBe(true);
    expect(r.decisions.some((d) => d.point === 'refers-back' && d.chosen === 'previous')).toBe(true);
    await chooseStrategy([{ role: 'user', content: Q1 }], { apiKey: 'k', fetchImpl, options: { unmatched: 'x' } });
    expect(body.questions.refers_back).toBeUndefined();
  });
  it('below-confidence or "own" = no refersBack (the message keeps its own subject)', async () => {
    const mkF = (a) => async () => ({ ok: true, json: async () => ({ answers: { strategy: ans('unmatched'), refers_back: a } }) });
    expect((await chooseStrategy(thread('x'), { apiKey: 'k', fetchImpl: mkF(ans('previous', 0.2)), options: { unmatched: 'x' } })).refersBack).toBeUndefined();
    expect((await chooseStrategy(thread('x'), { apiKey: 'k', fetchImpl: mkF(ans('own')), options: { unmatched: 'x' } })).refersBack).toBeUndefined();
  });
  it('Jev sees the items the previous reply linked, so "the second one" can be resolved', () => {
    expect(linkedInPrevious(thread('the second one'))).toEqual(['Selections from the Writings of ‘Abdu’l-Bahá', 'Tablets of ‘Abdu’l-Bahá vol. 1-3']);
    expect(jevState({ messages: thread('the second one') })).toMatch(/THE PREVIOUS REPLY LINKED.*2\. Tablets of/);
    expect(jevState({ messages: [{ role: 'user', content: 'hello' }] })).not.toMatch(/PREVIOUS REPLY LINKED/);
  });
  it('triage option text: a follow-up pointing at the last reply is not a quote lookup and not unclear', () => {
    expect(LOOKUP_KINDS.quote).toMatch(/NOT a request about a passage the assistant just gave/);
    expect(KINDS.unclear).toMatch(/Never when the message points at something the previous reply said/);
    expect(OUTCOMES.ask_back).toMatch(/Never when the previous reply linked/);
  });
});

describe('the tree uses the last turn', () => {
  it('search.compare: the query is the last turn\'s topic and a side\'s named book is its work filter', async () => {
    let seen;
    const s = mk({ compare_sides: ['Bahá’í', 'Hindu'], follows_topic: Q1, topic: 'how does that compare with the', current_user_question: 'how does that compare with the Gita?', side_sources: { Hindu: 'Bhagavad Gita' } },
      { tools: { compare_search: async (i) => { seen = i; return { sides: i.sides.map((x) => ({ label: x.label, passages: [{ id: x.label, text: 't', document_id: 1 }] })) }; } } });
    expect(await ELEMENTS['search.compare'].run(s, { by: 'compare_sides' })).toBe('all');
    expect(seen.query).toBe(Q1);
    expect(seen.sides.find((x) => x.label === 'Hindu').filters.work).toBe('Bhagavad Gita');
    expect(seen.sides.find((x) => x.label === 'Bahá’í').filters.work).toBeUndefined();
  });
  it('search.shelf: a refers_back turn searches follows_topic, not the follow-up\'s words', async () => {
    let seen;
    const s = mk({ follows_topic: Q1, current_user_question: 'what are the actual words?' }, { tools: { fused_search: async (i) => { seen = i; return { passages: [] }; } } });
    await ELEMENTS['search.shelf'].run(s, {});
    expect(seen.query).toBe(Q1);
  });
  it('fetch.anchor: refers_back loads the last turn\'s cited passages as the anchor', async () => {
    const calls = [];
    const s = mk({ refers_back: true, last_passages: lastPassages(state) }, { tools: { context_lookup: async (i) => { calls.push(i); return { passages: [{ id: `${i.document_id}:${i.paragraph_index}`, text: 'the words', document_id: i.document_id, paragraph_index: i.paragraph_index }] }; } } });
    expect(await ELEMENTS['fetch.anchor'].run(s, {})).toBe('one');
    expect(calls.map((c) => c.document_id)).toEqual([20910, 20915]);
    expect(s.units.found_passages.every((p) => p.anchor)).toBe(true);
  });
});
