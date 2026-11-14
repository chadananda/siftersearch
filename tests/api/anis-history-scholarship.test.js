// History and biography keep scholarship (Chad 11-14, Dawn-Breakers pilot: "We will need to pull in other sources to unravel many
// of these"). The live Íqán divines table wrote "the library holds no passage identifying him" for 6 names: core-first had left the
// histories out. The agent judges the kind (about: 'teaching' | 'history', no word rules); history keeps the order and drops nothing.
import { describe, it, expect } from 'vitest';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { agentAnswer, AGENT_SYSTEM } from '../../api/lib/assistant/agent-core.js';
import { circularRows } from '../../api/lib/assistant/lint.js';
import { REGISTRY, PROCESS } from '../../api/lib/assistant/tools.js';

const B = "Baha'i";
const url = (id) => `https://oceanlibrary.com/d${id}#p1`;
const IQAN = { id: 1, title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: 'Mullá Mihdíy-i-Kandí … Mírzá Muḥammad-Taqí … Ḥájí Muḥammad-Karím Khán' };
const GLEAN = { id: 2, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: 'the divines of the age' };
const GPB = { id: 3, title: 'God Passes By', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: B, collection: 'Core Publications', text: 'the divines who rose against the Báb' };
const BALYUZI = { id: 4, title: 'Bahá’u’lláh, The King of Glory', author: 'H. M. Balyuzi', book_author: 'H. M. Balyuzi', religion: B, collection: "Baha'i Books", text: 'the brother of Mullá Mihdíy-i-Kandí, named in the Íqán, opposed the Báb at Qazvín' };
const MOMEN = { id: 5, title: 'The Bábí and Bahá’í Religions, 1844–1944', author: 'Moojan Momen', book_author: 'Moojan Momen', religion: B, collection: "Baha'i Books", text: 'Mírzá Muḥammad-Taqí, the mujtahid of Qazvín' };
const ALL = [IQAN, BALYUZI, GLEAN, MOMEN, GPB].map((p) => ({ ...p, source_url: url(p.id) }));
const Q = 'Who are the divines named in the Kitáb-i-Íqán?';
const heads = (out) => out.split('\n').filter((l) => /^\[P\d+\]/.test(l)).join('\n');

describe('history keeps scholarship: the search', () => {
  const runner = () => toolRunner({ search: async () => ALL, writings: async () => [IQAN, GLEAN, GPB], translationsOf: async () => new Map() }).run;
  it('a teaching search leaves the histories out once the core suffices, and says how to keep them', async () => {
    const out = await runner().fused_search({ query: 'divines named in the Íqán', tradition: B });
    expect(heads(out)).not.toMatch(/King of Glory|Momen/);
    expect(out).toMatch(/about: "history"/);
  });
  it('a history search keeps them, after the Writings and Shoghi Effendi, labelled as scholars\' claims', async () => {
    const out = await runner().fused_search({ query: 'divines named in the Íqán', tradition: B, about: 'history' });
    const h = heads(out);
    expect(h).toMatch(/King of Glory/);
    expect(h).toMatch(/Momen/);
    expect(h.indexOf('Kitáb-i-Íqán')).toBeLessThan(h.indexOf('King of Glory'));
    expect(h.indexOf('God Passes By')).toBeLessThan(h.indexOf('King of Glory'));
    expect(out).toMatch(/name each scholar's claim as theirs/);
    expect(out).not.toMatch(/left out/);
  });
  it('the kind is the agent\'s parameter on fused_search and research_lookup (no word rules)', () => {
    for (const n of ['fused_search', 'research_lookup']) expect((REGISTRY[n] || PROCESS[n]).input.properties.about.enum).toEqual(['teaching', 'history']);
  });
});

describe('history keeps scholarship: the Íqán divines table from held research', () => {
  it('held research holds back the histories for a teaching reading; research_lookup about history gives them, and the brother of Mullá Mihdíy-i-Kandí reaches the agent', async () => {
    const seen = [];
    const held = { same: true, status: 'answered', question: Q, passages: ALL };
    await agentAnswer({ messages: [{ role: 'user', content: Q }], tools: { search: async () => [] }, held,
      create: async (p) => { seen.push(p);
        return seen.length === 1 ? { choices: [{ message: { content: '', tool_calls: [{ id: 'h', function: { name: 'research_lookup', arguments: JSON.stringify({ question: Q, about: 'history' }) } }] } }] }
          : { choices: [{ message: { content: 'The divines named in the Íqán:\n\n| # | Name |\n|---|---|\n| 11 | the brother of Mullá Mihdíy-i-Kandí |' } }] }; } });
    const turn = seen[0].messages.findLast((m) => m.role === 'user').content;
    expect(turn).not.toMatch(/King of Glory/);
    expect(turn).toMatch(/2 passages of scholarship held back/);
    expect(turn).toMatch(/except with about: "history"/);
    const tool = seen[1].messages.findLast((m) => m.role === 'tool').content;
    expect(tool).toMatch(/King of Glory/);
    expect(tool).toMatch(/brother of Mullá Mihdíy-i-Kandí/);
    expect(tool).toMatch(/Momen/);
  });
  it('held research with nothing held back says nothing about scholarship', async () => {
    const seen = [];
    await agentAnswer({ messages: [{ role: 'user', content: Q }], tools: { search: async () => [] }, held: { same: true, status: 'answered', question: Q, passages: [IQAN, GLEAN].map((p) => ({ ...p, source_url: url(p.id) })) },
      create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'x' } }] }; } });
    expect(seen[0].messages.findLast((m) => m.role === 'user').content).not.toMatch(/held back|about: "history"/);
  });
  it('the prompt: history keeps scholarship, each unidentified person searched in the histories before "no passage", the reader\'s correction is evidence', () => {
    expect(AGENT_SYSTEM).toMatch(/HISTORY AND BIOGRAPHY keep scholarship/);
    expect(AGENT_SYSTEM).toMatch(/for EACH person you have not yet identified before writing that the library holds nothing/);
    expect(AGENT_SYSTEM).toMatch(/a correction from the reader is evidence/);
  });
});

// Thread 73b1d410, round 3 replayed as fixture data (the reader asked for evidence of who each was): rows 5, 8, 9, 10, 12 and 13 cited
// "Named in the Íqán list (The Kitáb-i-Íqán)" — the text that names them, never evidence of who they were (Chad: "fail")
describe('circular evidence: the Íqán divines table', () => {
  const R3Q = 'For each divine named in the Kitáb-i-Íqán, give the evidence of who he was.';
  const LIST = { id: 31, title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh', religion: B, source_url: 'https://oceanlibrary.com/kitab-i-iqan#p248',
    text: 'Mullá Mihdíy-i-Khu’í … Siyyid Ḥusayn-i-Turshízí … Mullá Sa‘íd-i-Bárfurúshí … Ḥájí Mírzá Karím Khán … Mírzá Muḥammad-Taqí … Mullá Báqir' };
  const NABIL = { id: 32, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam', religion: B, source_url: 'https://oceanlibrary.com/dawn-breakers#p900',
    text: 'Siyyid Ḥusayn-i-Turshízí, the mujtahid, one of the Seven Martyrs of Ṭihrán, was put to death in the Sabzih-Maydán' };
  const found = [['P1', LIST], ['P2', NABIL]];
  const R3 = ['| # | Divine | Who he was | Evidence |', '|---|---|---|---|',
    '| 5 | Mullá Mihdíy-i-Khu’í | not identified | Named in the Íqán list [[P1]] |',
    '| 7 | Siyyid Ḥusayn-i-Turshízí | one of the Seven Martyrs of Ṭihrán | [[P2]] |',
    '| 8 | Mullá Sa‘íd-i-Bárfurúshí | not identified | Named in the Íqán list [[P1]] |',
    '| 9 | Mullá Báqir | not identified | [[P1]] |',
    '| 10 | Ḥájí Mírzá Karím Khán | the Shaykhí leader of Kirmán | [[P1, P2]] |'].join('\n');
  it('flags the rows whose only citation is the Íqán list; a row with a describing passage passes', () => {
    expect(circularRows(R3, found, R3Q)).toEqual(['Mullá Mihdíy-i-Khu’í', 'Mullá Sa‘íd-i-Bárfurúshí', 'Mullá Báqir']);
  });
  it('no flag when the cited work is not the one being explained, or for a table with no people', () => {
    expect(circularRows(R3, found, 'Who were the martyrs of Ṭihrán?')).toEqual([]);
    expect(circularRows('| a | b |\n|---|---|\n| 1 | 2 |', found, R3Q)).toEqual([]);
  });
  it('the agent is sent back once to search the histories for those rows and rewrite the table', async () => {
    const seen = [];
    await agentAnswer({ messages: [{ role: 'user', content: R3Q }], tools: { search: async () => [] },
      held: { same: true, status: 'answered', question: R3Q, passages: [LIST, NABIL] },
      create: async (p) => { seen.push(p);
        const tbl = R3.replace(/P1/g, 'X1').replace(/P2/g, 'X2');
        return { choices: [{ message: { content: seen.length === 1 ? tbl.replace(/X1/g, refOf(p, 'Kitáb-i-Íqán')).replace(/X2/g, refOf(p, 'Dawn-Breakers')) : 'rewritten' } }] }; } });
    expect(seen).toHaveLength(2);
    const ask = seen[1].messages.at(-1).content;
    expect(ask).toMatch(/Naming is not evidence/);
    expect(ask).toMatch(/Mullá Mihdíy-i-Khu’í; Mullá Sa‘íd-i-Bárfurúshí; Mullá Báqir/);
    expect(ask).toMatch(/about: "history"/);
    expect(ask).toMatch(/not identified in the library \(searched:/);
  });
  it('the prompt: evidence describes the person; each unidentified person searched by name variants', () => {
    expect(AGENT_SYSTEM).toMatch(/The text that merely names them \(the list being explained\) is never evidence/);
    expect(AGENT_SYSTEM).toMatch(/not identified in the library \(searched: …\)/);
  });
});
// the [P#] the agent was handed for a title (held research is shown as "[P#] … title …" lines)
function refOf(p, title) { const u = p.messages.findLast((m) => m.role === 'user').content; const l = u.split('\n').find((x) => /^\[P\d+\]/.test(x) && x.includes(title)); return l.match(/^\[(P\d+)\]/)[1]; }
