// Spec #5 (11-06): a model-written library search stays on Jev's current subject (query-anchor.js). Fresh questions only.
import { describe, it, expect } from 'vitest';
import { anchorSearches, onSubject, driftedQueries, jevSubject } from '../../api/lib/assistant/query-anchor.js';
import { agentAnswer } from '../../api/lib/assistant/agent.js';
import { research } from '../../api/lib/assistant/researcher.js';
import { forensicPass } from '../../api/lib/audit/forensics.js';

const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const P = { id: 31, text: 'Vahid went to Nayriz and proclaimed the Cause of the Báb.', title: 'The Dawn-Breakers', author: 'Nabíl-i-Zarandí',
  source_url: 'https://oceanlibrary.com/db#p31', document_id: 7, paragraph_index: 31 };
// person A, then a follow-up about person B
const HISTORY = [
  { role: 'user', content: 'What poetry did Táhirih leave us?' },
  { role: 'assistant', content: 'Táhirih’s surviving poems are few; several are in Persian…' },
];

describe('query-anchor', () => {
  const B = { text: 'What was Vahid’s part in the upheaval at Nayriz?', names: [], earlier: 'Tell me about Táhirih’s poetry.' };
  it('a query naming the subject is kept; a query on the previous person is rebuilt from the subject', () => {
    expect(onSubject('Vahid Nayriz upheaval', B)).toBe(true);
    const r = anchorSearches([{ name: 'fused_search', args: { query: 'Tahirih poetry' } }], B);
    expect(r.rebuilt.from).toBe('Tahirih poetry');
    expect(r.calls[0].args.query).toMatch(/Vahid/);
  });
  it('one search on the subject is enough; other tools and Arabic-script queries are never judged', () => {
    const calls = [{ name: 'fused_search', args: { query: 'Tahirih poetry' } }, { name: 'combined_search', args: { query: 'Nayriz siege' } }];
    expect(anchorSearches(calls, B).rebuilt).toBeNull();
    expect(anchorSearches([{ name: 'find_work', args: { title: 'Dawn-Breakers' } }], B).rebuilt).toBeNull();
    expect(anchorSearches([{ name: 'fused_search', args: { query: 'وحید نیریز' } }], B).rebuilt).toBeNull();
  });
  it('a query on neither subject (another language, a paraphrase) is never rewritten', () => {
    expect(anchorSearches([{ name: 'fused_search', args: { query: 'Vahid Nayriz' } }], { text: '¿Qué papel tuvo Vahid en Nayriz?', earlier: 'Háblame de Táhirih.' }).rebuilt).toBeNull();
    expect(anchorSearches([{ name: 'fused_search', args: { query: 'meaning of steadfastness in tests' } }], { text: '¿Qué es la firmeza en las pruebas?', earlier: 'Háblame de Táhirih.' }).rebuilt).toBeNull();
    expect(anchorSearches([{ name: 'fused_search', args: { query: 'Tahirih poetry' } }], { ...B, earlier: null }).rebuilt).toBeNull();   // first turn: nothing to drift to
  });
  it('a subject with no terms ("and what did he write?" unresolved) never rebuilds', () => {
    expect(anchorSearches([{ name: 'fused_search', args: { query: 'Tahirih poems' } }], { text: 'And what did he write?' }).rebuilt).toBeNull();
  });
  it('Jev’s subject: the resolved turn plus the names its plan resolved', () => {
    expect(jevSubject({ query: 'writings of Vahid' }, { mentions: [{ name: 'Vahid', matched: 'Siyyid Yahya Darabi' }] }))
      .toEqual({ text: 'writings of Vahid', names: ['Vahid', 'Siyyid Yahya Darabi'] });
    expect(driftedQueries(['Tahirih poems'], { text: 'writings of Vahid' })).toEqual(['Tahirih poems']);
    expect(driftedQueries(['Tahirih poems', 'Vahid treatise'], { text: 'writings of Vahid' })).toEqual([]);
  });
});

// a scripted model whose first search stays on the PREVIOUS person
const drifting = (seen) => {
  let n = 0;
  return async (params) => { seen.push(params); return n++ === 0
    ? { choices: [{ message: { content: '', tool_calls: [call('a', 'fused_search', { query: 'Táhirih poems and verses' })] } }] }
    : { choices: [{ message: { content: 'Vahid led the defence at Nayriz [[P1]].' } }] }; };
};

describe('agent: the first search names the current subject', () => {
  it('a follow-up about person B after a turn about person A: the query names B', async () => {
    const queries = [], seen = [];
    const tools = { search: async (q) => { queries.push(String(q)); return [P]; }, fastSearch: async (q) => { queries.push(String(q)); return [P]; } };
    const r = await agentAnswer({ messages: [...HISTORY, { role: 'user', content: 'And Vahid — what did he do at Nayriz?' }], create: drifting(seen), tools });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => /Vahid/.test(q))).toBe(true);
    expect(r.steps[0]).toMatchObject({ tool: 'fused_search', rebuilt_from: 'Táhirih poems and verses' });
    expect(JSON.parse(seen[1].messages.find((m) => m.tool_calls)?.tool_calls[0].function.arguments).query).toMatch(/Vahid/);   // the model sees what ran
  });
  it('"And what did he write?" with B resolved by Jev: the query uses B’s name', async () => {
    const queries = [];
    const tools = { search: async (q) => { queries.push(String(q)); return [P]; }, fastSearch: async (q) => { queries.push(String(q)); return [P]; } };
    await agentAnswer({ messages: [...HISTORY, { role: 'user', content: 'Tell me about Vahid.' }, { role: 'assistant', content: 'Vahid was sent by the Sháh…' },
      { role: 'user', content: 'And what did he write?' }], create: drifting([]), tools, subject: jevSubject({ query: 'What did Vahid write?' }, null) });
    expect(queries.every((q) => /Vahid/.test(q))).toBe(true);
  });
  it('a query already on the subject is left exactly as the model wrote it', async () => {
    const queries = [];
    let n = 0;
    const create = async () => (n++ === 0 ? { choices: [{ message: { content: '', tool_calls: [call('a', 'fused_search', { query: 'Vahid Nayriz siege' })] } }] }
      : { choices: [{ message: { content: 'done' } }] });
    const tools = { search: async (q) => { queries.push(String(q)); return [P]; }, fastSearch: async (q) => { queries.push(String(q)); return [P]; } };
    const r = await agentAnswer({ messages: [...HISTORY, { role: 'user', content: 'And Vahid at Nayriz?' }], create, tools });
    expect(r.steps[0].rebuilt_from).toBeUndefined();
    expect(queries.every((q) => q === 'Vahid Nayriz siege')).toBe(true);
  });
});

describe('researcher: the first search names the current subject', () => {
  it('"And what did he write?" with B resolved by Jev: the researcher’s query uses B’s name', async () => {
    const queries = [];
    const replies = [
      { tool_calls: [call('a', 'search_library', { query: 'Táhirih poems and verses' })] },
      { content: 'BRIEF:\nReaching for: Vahid’s writings\n- a treatise: P1\nKEEP: P1' },
    ];
    const r = await research({ messages: [...HISTORY, { role: 'user', content: 'And what did he write?' }], create: async () => ({ choices: [{ message: replies.shift() }] }),
      tools: { search: async (q) => { queries.push(String(q)); return [P]; } }, subject: jevSubject({ query: 'What did Vahid write?' }, { mentions: [{ name: 'Vahid' }] }) });
    expect(queries.every((q) => /Vahid/.test(q))).toBe(true);
    expect(r.steps[0].rebuilt_from).toBe('Táhirih poems and verses');
  });
});

describe('forensics: query-drift', () => {
  const base = { route: 'facts', question: 'And what did he write?', subject: 'What did Vahid write?', searches: [], reply: 'x' };
  it('fires when no model search carries a term of Jev’s subject', () => {
    const d = forensicPass({ ...base, model_queries: ['Tahirih poems'] }).defects.find((x) => x.class === 'query-drift');
    expect(d).toMatchObject({ stage: 'STRATEGY', evidence: { queries: ['Tahirih poems'] } });
    expect(d.fix_where).toMatch(/query-anchor/);
  });
  it('stays quiet when one does, and reads research steps (the model’s query, before any rebuild)', () => {
    expect(forensicPass({ ...base, model_queries: ['Vahid treatise'] }).defects.some((x) => x.class === 'query-drift')).toBe(false);
    const steps = [{ tool: 'fused_search', args: { query: 'What did Vahid write?' }, rebuilt_from: 'Tahirih poems' }];
    expect(forensicPass({ ...base, research: { steps } }).defects.some((x) => x.class === 'query-drift')).toBe(true);
  });
});
