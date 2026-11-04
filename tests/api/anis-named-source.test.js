// The named source (11-03 goth: "how does Saiedi explain…" never reached Gate of the Heart): Jev chooses, among the
// conversation's own name spans, the book or author the answer is drawn from (plan.drawFrom); code resolves it against
// the library (work by title, author by the documents' author field) and its works lead the in-book step.
import { describe, it, expect } from 'vitest';
import { buildPlan, planSearch, drawFromCriteria } from '../../api/lib/search-plan.js';
import { namedSource, research } from '../../api/lib/assistant/researcher.js';
import { understanding } from '../../api/lib/assistant/strategies.js';

const GATE = { id: 8632, title: 'Gate of the Heart: Understanding the Writings of the Báb', author: 'Nader Saiedi' };
const p = (doc, i, author, title = 'T') => ({ id: doc * 10000 + i, text: `passage ${doc}:${i}`, title, author, document_id: doc, paragraph_index: i, source_url: `u/${doc}#${i}` });

describe('drawFromCriteria — the options are the turn\'s name spans', () => {
  it('lists the spans of the last user turns, latest first, plus none', () => {
    const c = drawFromCriteria([{ role: 'user', content: 'In Gate of the Heart, how does Nader Saiedi divide the Báb\'s writings?' }]);
    expect(Object.keys(c)).toEqual(expect.arrayContaining(['Gate of the Heart', 'Nader Saiedi', 'none']));
  });
  it('no spans → no question', () => {
    expect(drawFromCriteria([{ role: 'user', content: 'what happens to the soul after death?' }])).toBeNull();
  });
});

describe('buildPlan — drawFrom is Jev\'s choice', () => {
  const base = { tradition: { choice: 'none', confidence: 0.9 }, shape: { choice: 'topic', confidence: 0.9 } };
  it('a chosen name becomes plan.drawFrom', () => {
    const plan = buildPlan({ ...base, draw_from: { choice: 'Saiedi', confidence: 0.8 } });
    expect(plan.drawFrom).toEqual({ name: 'Saiedi', confidence: 0.8 });
    expect(plan.source.drawFrom).toBe('jev');
  });
  it('none, or a weak choice, sets nothing', () => {
    expect(buildPlan({ ...base, draw_from: { choice: 'none', confidence: 0.9 } }).drawFrom).toBeUndefined();
    expect(buildPlan({ ...base, draw_from: { choice: 'Saiedi', confidence: 0.3 } }).drawFrom).toBeUndefined();
  });
  it('planSearch asks Jev the draw_from question only when the turn names something', async () => {
    const bodies = [];
    const fetchImpl = async (_u, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ answers: { draw_from: { choice: 'Saiedi', confidence: 0.9 } } }) }; };
    const named = await planSearch('How does Saiedi explain the severe laws of the Persian Bayán?', { apiKey: 'k', fetchImpl, cache: false, resolveName: null, resolveMentions: null });
    expect(bodies[0].questions.draw_from.criteria).toHaveProperty('Saiedi');
    expect(named.drawFrom?.name).toBe('Saiedi');
    await planSearch('what happens to the soul after death?', { apiKey: 'k', fetchImpl, cache: false, resolveName: null, resolveMentions: null });
    expect(bodies[1].questions.draw_from).toBeUndefined();
  });
});

describe('namedSource — resolved against the library', () => {
  it('a surname → the author found in the search hits → that author\'s own works searched', async () => {
    const byCalls = [];
    const impl = {
      work: async () => null,
      search: async () => [p(284049, 4, 'stockman', 'Gate of the Heart: Review'), p(8632, 165, 'Nader Saiedi', GATE.title)],
      searchBy: async (q, author) => { byCalls.push(author); return [p(8632, 109, 'Nader Saiedi', GATE.title), p(8632, 116, 'Nader Saiedi', GATE.title)]; },
    };
    const r = await namedSource('Saiedi', 'interpretive revelation', impl);
    expect(byCalls).toEqual(['Nader Saiedi']);
    expect(r.authors).toEqual(['Nader Saiedi']);
    expect(r.works.map((w) => w.id)).toEqual([8632]);
    expect(r.passages.map((x) => x.paragraph_index)).toEqual([165, 109, 116]);   // the review (another author) is not the source
  });
  it('a title → the work by document_search', async () => {
    const impl = { work: async () => ({ doc: GATE, others: [{ id: 163882 }] }), search: async () => [], searchBy: async () => [] };
    const r = await namedSource('Gate of the Heart', 'three stages', impl);
    expect(r.works.map((w) => w.id)).toEqual([8632]);
    expect(r.authors).toEqual([]);
  });
  it('two library spellings of one author are both searched; a stub title match is not the work', async () => {
    const byCalls = [];
    const impl = {
      work: async () => ({ doc: { id: 921203, title: 'saiedi_oppression_empowerment', paragraph_count: 1 }, others: [] }),
      probe: async () => [p(282889, 8, 'saiedi'), p(12733, 570, 'Various'), p(8632, 900, 'Nader Saiedi', GATE.title)],
      search: async () => { throw new Error('the wide probe is used'); },
      searchBy: async (q, a) => { byCalls.push(a); return a === 'Nader Saiedi' ? [p(8632, 901, a, GATE.title)] : [p(282889, 9, a)]; },
    };
    const r = await namedSource('Saiedi', 'Sea of Names', impl);
    expect(byCalls).toEqual(['saiedi', 'Nader Saiedi']);
    expect(r.works.map((w) => w.id)).toEqual([282889, 8632]);
    expect(r.passages.some((x) => x.document_id === 12733)).toBe(false);
  });
});

describe('the named source reaches the in-book step', () => {
  it('research: the named work is the first book searched inside, and its passages are kept', async () => {
    const inside = [];
    const tools = {
      search: async () => [p(20898, 1, 'The Báb')],
      work: async () => ({ doc: GATE, others: [] }),
      searchBy: async () => [],
      searchIn: async (q, doc) => { inside.push(doc); return [p(Number(doc), 1000 + inside.length, 'x')]; },
    };
    const create = async () => ({ choices: [{ message: { tool_calls: [{ id: 'a', type: 'function', function: { name: 'combined_search', arguments: '{"query":"stages"}' } }] } }] });
    const r = await research({ messages: [{ role: 'user', content: 'In Gate of the Heart, what are the three stages?' }], create, tools, maxRounds: 1, maxCalls: 5, brief: false, inBooks: 2, drawFrom: 'Gate of the Heart' });
    expect(inside[0]).toBe(8632);
    expect(r.steps.some((s) => s.tool === 'named_source')).toBe(true);
  });
  it('understanding: the named source\'s passages lead and its work is searched inside', async () => {
    const inside = [];
    const sourceTools = { search: async () => [p(8632, 165, 'Nader Saiedi', GATE.title)], work: async () => null, searchBy: async () => [p(8632, 109, 'Nader Saiedi', GATE.title)] };
    const out = await understanding({}, { messages: [{ role: 'user', content: 'How does Saiedi explain X?' }], query: 'Saiedi explain X',
      search: async () => ({ hits: [p(20898, 1, 'The Báb')] }), plan: {}, searchIn: async (q, doc) => { inside.push(doc); return []; }, inBooks: 2,
      drawFrom: 'Saiedi', sourceTools });
    expect(inside[0]).toBe(8632);
    expect(out.passages.some((x) => x.document_id === 8632)).toBe(true);
  });
});
