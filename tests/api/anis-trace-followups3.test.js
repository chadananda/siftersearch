// 11-09 follow-ups 3: ordinary-word kinds, person/work gate, fresh-conversation reply anchors, one-side comparison, whole previous reply. Jev + repos mocked.
import { describe, it, expect } from 'vitest';
import { namedUnits, stateOf, chooseStrategy } from '../../api/lib/assistant/strategy-choice.js';
import { replyLinkPairs, replyAnchors, withReplyContext } from '../../api/lib/assistant/reply-anchors.js';
import { runStrategy, withAnchors, comparison } from '../../api/lib/assistant/strategies.js';
import { conversationSummary } from '../../api/lib/assistant/respond.js';
import { validatePlan } from '../../api/lib/assistant/strategy-planner.js';
import { fixGates } from '../../api/lib/repos/strategy-candidates-repo.js';
import { DESIGN_SYSTEM } from '../../api/lib/assistant/strategy-design.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';

const REPLY = "Abdu'l-Bahá says [*Selections*](https://oceanlibrary.com/selections-writings-abdul-baha/?paraId=para_887&selectionString=a.0~a.9) and also [*Bahá'í World Faith*](https://oceanlibrary.com/bahai-world-faith/?paraId=para_12).";
const THREAD = (q) => [{ role: 'user', content: 'My grandmother passed away. Will I recognise her in the next world?' }, { role: 'assistant', content: REPLY }, { role: 'user', content: q }];
const rows = [{ slug: 'selections-writings-abdul-baha', pid: 'para_887', document_id: 11, paragraph_index: 40, religion: "Baha'i" }, { slug: 'bahai-world-faith', pid: 'para_12', document_id: 12, paragraph_index: 3, religion: "Baha'i" }];
const resolve = async () => rows;

describe('1. names: ordinary sentence-initial word, highest-confidence person', () => {
  it('namedUnits takes the highest-confidence person, not the first', () => {
    const a = { kind_1: { choice: 'person', confidence: 0.7 }, kind_2: { choice: 'person', confidence: 0.95 } };
    expect(namedUnits(a, ['Trace', "'Abdu'l-Bahá"], 'Trace how \'Abdu\'l-Bahá uses "Most Great Justice" across his talks').named_person).toBe("'Abdu'l-Bahá");
  });
  it('the option text makes a capitalised first word that is an ordinary word "neither"', async () => {
    let body; const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: {} }) }; };
    await chooseStrategy([{ role: 'user', content: 'Trace how Abdu\'l-Bahá uses "Most Great Justice" across his talks' }], { apiKey: 'k', fetchImpl });
    const q = Object.entries(body.questions).find(([k]) => k.startsWith('kind_'))?.[1];
    expect(q.criteria.neither).toMatch(/STARTS the sentence/); expect(q.instructions).toMatch(/ordinary command word or an acknowledgment .* is neither/); expect(q.criteria.subject).toMatch(/ABOUT/); expect(q.criteria.neither).toMatch(/Great/);
  });
  it('planner: in_named + by_person on one search.shelf, or named_person read without by_person, is rejected; the prompt says so', () => {
    expect(DESIGN_SYSTEM).toMatch(/Never put in_named and by_person on the same search.shelf/);
    expect(fixGates({ in_named: true, by_person: true, k: 5 }, 'search.shelf')).toEqual({ by_person: true, k: 5 });
    expect(fixGates({ in_named: true, k: 5 }, 'search.shelf')).toEqual({ in_named: true, k: 5 });
    const v = validatePlan({ name: 'x_y', graph: { entry: 'a', nodes: { a: { element: 'search.shelf', kind: 'tool', params: { in_named: true, by_person: true }, reads: ['named_person'], writes: ['found_passages'] }, b: { element: 'search.shelf', kind: 'tool', params: {}, reads: ['named_person'], writes: ['found_passages'] } }, edges: [] } }, { cat: { strategies: [], templates: { latest: new Map() } } });
    expect(v.errors.join('\n')).toMatch(/node a: in_named and by_person/); expect(v.errors.join('\n')).toMatch(/node b: reads named_person but params.by_person is not set/);
  });
});

describe('2. fresh conversation: the previous reply\'s links are the anchor', () => {
  it('replyLinkPairs: the last assistant message\'s paraId links, in order, unique', () => {
    expect(replyLinkPairs(THREAD('what are the actual words?'))).toEqual([['selections-writings-abdul-baha', 'para_887'], ['bahai-world-faith', 'para_12']]);
  });
  it('replyAnchors resolves them to doc+paragraph (structure only); a failed lookup is []', async () => {
    expect((await replyAnchors(THREAD('x'), { resolve })).map((a) => a.ref)).toEqual(['11:40', '12:3']);
    expect(await replyAnchors(THREAD('x'), { resolve: async () => { throw new Error('down'); } })).toEqual([]);
  });
  it('withAnchors with an empty state loads the reply\'s passages first', async () => {
    const seen = []; const tools = { context_lookup: async (i) => { seen.push(`${i.document_id}:${i.paragraph_index}`); return { passages: [{ document_id: i.document_id, paragraph_index: i.paragraph_index, text: 'the full words' }] }; } };
    const out = await withAnchors([{ document_id: 1, paragraph_index: 1, text: 'other' }], undefined, { tools, messages: THREAD('what are the actual words?'), replyIo: { resolve } }, decisionLog([]));
    expect(seen).toEqual(['11:40', '12:3']); expect(out[0]).toMatchObject({ document_id: 11, anchor: true }); expect(out.at(-1).document_id).toBe(1);
  });
});

describe('3. refers_back + one side: the other side is the previous turn\'s tradition; a named book is read even with one side', () => {
  it('sides gets the previous tradition (from the reply\'s links) first', async () => {
    const r = await withReplyContext({ refersBack: true, sides: ['Hindu'] }, { messages: THREAD('how does that compare with the Gita?'), state: { given: [], scope: {} } }, { resolve });
    expect(r.choice.sides).toEqual(["Baha'i", 'Hindu']);
  });
  it('state scope wins over links; two sides or no refers_back change nothing', async () => {
    const st = { given: [], scope: { religions_specified: ['Christian'] } };
    expect((await withReplyContext({ refersBack: true, sides: ['Hindu'] }, { messages: THREAD('q'), state: st }, { resolve })).choice.sides).toEqual(['Christian', 'Hindu']);
    const two = { refersBack: true, sides: ['Hindu', 'Islam'] }; expect((await withReplyContext(two, { messages: THREAD('q'), state: { given: [{ kind: 'passage', ref: '1:1', turn: 1 }], scope: {} } }, { resolve })).choice).toBe(two);
    const own = { sides: ['Hindu'] }; expect((await withReplyContext(own, { messages: THREAD('q') }, { resolve })).choice).toBe(own);
  });
  it('runStrategy comparison: Hindu + the Bahá\'í of the last reply, each searched', async () => {
    const religions = []; const search = async (a) => { religions.push(a.plan?.defaults?.religion ?? null); return { passages: [] }; };
    await runStrategy({ strategy: { choice: 'comparison', confidence: 0.9 }, refersBack: true, sides: ['Hindu'], sources: { Hindu: 'Gita' } }, { messages: THREAD('how does that compare with the Gita?'), question: 'q', query: 'q', search, state: { given: [], scope: {} }, profile: {}, decisions: decisionLog([]), replyIo: { resolve } });
    expect(religions).toContain('Hindu'); expect(religions).toContain("Baha'i");
  });
  it('one-side fallback still reads the named book', async () => {
    const named = []; const sourceTools = { search: async (...a) => { named.push(a); return { passages: [] }; } };
    const out = await comparison({ sides: ['Hindu'], sources: { Hindu: 'Bhagavad Gita' } }, { messages: [{ role: 'user', content: 'q' }], query: 'q', search: async () => ({ passages: [{ document_id: 5, paragraph_index: 1, religion: 'Hindu', text: 'w' }] }), decisions: decisionLog([]), sourceTools });
    expect(named.length).toBeGreaterThan(0);   // the Gita was looked up
    expect(out.plan.wide).toBe(true); expect(out.passages.length).toBeGreaterThan(0);
  });
});

describe('4. the previous reply is never clipped', () => {
  const long = `Intro. ${'Item text that goes on. '.repeat(200)}THE SECOND ONE IS HERE.`;
  const msgs = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: long }, { role: 'user', content: 'the second one' }];
  it('the writer\'s history holds the whole last reply', () => { expect(conversationSummary(msgs, 'Anís')).toContain('THE SECOND ONE IS HERE.'); });
  it('Jev\'s view holds the whole last reply, other messages stay clipped', () => {
    expect(stateOf(msgs)).toContain('THE SECOND ONE IS HERE.');
    expect(stateOf([{ role: 'user', content: 'x'.repeat(2000) + 'END' }, { role: 'assistant', content: 'a' }])).not.toContain('END');
  });
});
