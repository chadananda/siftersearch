// The agent (agent.js; Chad 11-01): one loop with the library tools; code grounds the reply — refs → links, unknown refs and
// unverifiable quotations out — so the model cannot invent a source.
import { describe, it, expect } from 'vitest';
import { agentAnswer, renderRefs, canonWork } from '../../api/lib/assistant/agent.js';
import { agentOn } from '../../api/lib/assistant/respond.js';

const P = { id: 11, text: 'Foremost among the priceless treasures cast forth from the billowing ocean of Bahá’u’lláh’s Revelation ranks the Kitáb-i-Íqán.',
  title: 'God Passes By', author: 'Shoghi Effendi', source_url: 'https://oceanlibrary.com/gpb#p1', document_id: 5, paragraph_index: 1 };
const tools = {
  search: async () => [P],
  work: async () => ({ doc: { id: 1, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", slug: 'kitab-i-iqan', source_site: 'oceanlibrary.com' }, others: [] }),
  notes: async () => ({ works: [{ title: 'The Kitáb-i-Íqán', notes: [{ quote: 'which is indeed the cynosure of all books', speaker: "Bahá'u'lláh", source_title: 'The Tabernacle of Unity', url: 'https://oceanlibrary.com/tab#p9' }] }] }),
};
// a scripted model: round 1 asks for tools in parallel, round 2 writes with refs
const scripted = (finalText) => {
  let n = 0;
  return async () => (n++ === 0
    ? { choices: [{ message: { content: '', tool_calls: [
      { id: 'a', function: { name: 'find_work', arguments: '{"title":"Iqan"}' } },
      { id: 'b', function: { name: 'search_library', arguments: '{"query":"Kitáb-i-Íqán priceless treasures"}' } },
      { id: 'c', function: { name: 'about_work', arguments: '{"title":"Book of Certitude"}' } }] } }] }
    : { choices: [{ message: { content: finalText } }] });
};

describe('agent: refs become links; nothing else does', () => {
  it('book, passage and note refs render to the library links', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Where can I read the Iqan?' }], tools,
      create: scripted('Here is [[B1]]. Shoghi Effendi writes that it is "Foremost among the priceless treasures cast forth from the billowing ocean" [[P1]]; Bahá’u’lláh calls it "the cynosure of all books" [[P2]].') });
    expect(r.reply).toMatch(/^Here is \[\*The Kitáb-i-Íqán\*\]\(https:\/\/siftersearch\.com\/library\//);
    expect(r.reply).toContain('(https://oceanlibrary.com/gpb#p1)');
    expect(r.reply).toContain('(https://oceanlibrary.com/tab#p9)');
    expect(r.steps.map((s) => s.tool).sort()).toEqual(['about_work', 'find_work', 'search_library']);
    expect(r.citations.length).toBe(3);
  });
  it('a ref the tools never gave is dropped, and an invented quotation goes with its sentence', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools,
      create: scripted('The Íqán is central [[P1]]. It was revealed in two days and nights, "in the space of two days and two nights in Baghdad as an answer" [[P9]]. Shoghi Effendi ranks it "Foremost among the priceless treasures" [[P1]].') });
    expect(r.reply).not.toContain('P9');
    expect(r.reply).not.toContain('two days and two nights');
    expect(r.quotes_removed).toBe(1);
  });
});

describe('renderRefs', () => {
  const found = new Map([['P1', { ...P, ref: 'P1' }], ['W1', { text: 'x', title: 'Web: news', source_url: 'https://news.example/x', web: true }]]);
  const works = new Map([['B1', { title: 'The Dawn-Breakers', url: 'https://siftersearch.com/library/dawn-breakers' }]]);
  it('groups, dedups and drops', () => {
    expect(renderRefs('Read *[[B1]]* today.', { found, works })).toBe('Read [*The Dawn-Breakers*](https://siftersearch.com/library/dawn-breakers) today.');
    expect(renderRefs('A point [[P1, P1, P7]].', { found, works })).toBe('A point ([God Passes By](https://oceanlibrary.com/gpb#p1)).');
    expect(renderRefs('News [W1].', { found, works })).toBe('News ([web: Web: news](https://news.example/x)).');
    expect(renderRefs('Lost [[P8]] and [[B4]].', { found, works })).toBe('Lost and.');
  });
});

describe('canonWork and the switch', () => {
  it('finds a core work by any of its names', () => {
    expect(canonWork('Book of Certitude').title).toBe('The Kitáb-i-Íqán');
    expect(canonWork('dawnbreakers').title).toBe('The Dawn-Breakers');
    expect(canonWork('Gleanings').title).toMatch(/^Gleanings/);
    expect(canonWork('the cat in the hat')).toBeNull();
  });
  it('engine choice beats the channel list', () => {
    expect(agentOn({ engine: 'agent', channel: 'email' }, '')).toBe(true);
    expect(agentOn({ engine: 'pipeline', channel: 'site-chat' }, 'all')).toBe(false);
    expect(agentOn({ channel: 'site-chat' }, 'site-chat')).toBe(true);
    expect(agentOn({ channel: 'email' }, 'site-chat')).toBe(false);
  });
});
