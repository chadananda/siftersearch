// Round 4 (11-14): talk of candidates/tools/next steps never reaches the reader; at the cap the agent answers from what it holds,
// never ends on a plan; a book's notes are searched once a question.
import { describe, it, expect } from 'vitest';
import { agentAnswer } from '../../api/lib/assistant/agent.js';
import { WRITE_NOW } from '../../api/lib/assistant/agent-core.js';
import { dropNarration, endsOnPlan, isNarration } from '../../api/lib/assistant/lint.js';

const P = { id: 11, text: 'Mullá Báqir, the brother of Mullá Mihdíy-i-Kandí, fell at Ṭabarsí.', title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam',
  source_url: 'https://oceanlibrary.com/dawn-breakers#p400', document_id: 7, paragraph_index: 400 };

describe('internal narration', () => {
  it('the live leaks are removed; answers, quotations, offers-to-know and tables are not', () => {
    expect(isNarration('The candidate source here is a scholarly book, Paradise and Paradigm.')).toBe(true);
    expect(isNarration('The glossary notes to the Íqán itself look like the best source for this.')).toBe(true);
    expect(isNarration("I'll check them directly.")).toBe(true);
    expect(isNarration('Let me search the histories for him.')).toBe(true);
    expect(isNarration('The held research covers this.')).toBe(true);
    expect(isNarration('Bahá’u’lláh wrote it in the Lawḥ-i-Maqṣúd.')).toBe(false);
    expect(isNarration('Let me know which edition you have.')).toBe(false);
    expect(isNarration('“Let me look upon Thy face,” he cried.')).toBe(false);
    const t = 'The candidate source here is a scholarly book. Bahá’u’lláh wrote these words.\n\n> I will check — the Writer\n\n| a | b |';
    const d = dropNarration(t);
    expect(d.dropped).toBe(1);
    expect(d.text).toBe('Bahá’u’lláh wrote these words.\n\n> I will check — the Writer\n\n| a | b |');
    expect(dropNarration('Plain answer.').text).toBe('Plain answer.');
    expect(endsOnPlan("The glossary notes look useful. I'll check them directly.")).toBe(true);
    expect(endsOnPlan('He was the brother of Mullá Mihdí.')).toBe(false);
  });

  it('a reply that ends on a plan is re-asked once without tools; the reader gets the answer, not the plan', async () => {
    const seen = [];
    const create = async (p) => { seen.push(p);
      if (seen.length === 1) return { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'fused_search', arguments: '{"query":"Mulla Baqir brother Kandi"}' } }] } }] };
      if (seen.length === 2) return { choices: [{ message: { content: "The glossary notes to the Íqán itself look like the best source. I'll check them directly." } }] };
      return { choices: [{ message: { content: '| # | Name | Who |\n|---|---|---|\n| 11 | Mullá Báqir | brother of Mullá Mihdíy-i-Kandí [[P1]] |' } }] }; };
    const r = await agentAnswer({ messages: [{ role: 'user', content: '#11 is wrong' }], tools: { search: async () => [P] }, create });
    expect(seen).toHaveLength(3);
    expect(seen[2].tools).toBeUndefined();
    expect(seen[2].messages.at(-1)).toEqual({ role: 'user', content: WRITE_NOW });
    expect(r.reply).toContain('Mullá Báqir');
    expect(r.reply).not.toMatch(/I'll check|best source|glossary notes/);
  });

  it('the last round (cap reached) carries the write-now instruction', async () => {
    const seen = [];
    const create = async (p) => { seen.push(p);
      return p.tools ? { choices: [{ message: { content: '', tool_calls: [{ id: `c${seen.length}`, function: { name: 'fused_search', arguments: `{"query":"q${seen.length}"}` } }] } }] }
        : { choices: [{ message: { content: 'He was the brother of Mullá Mihdíy-i-Kandí [[P1]].' } }] }; };
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Who is Mullá Báqir?' }], tools: { search: async () => [P] }, create, maxRounds: 3 });
    expect(seen).toHaveLength(3);
    expect(seen[2].tools).toBeUndefined();
    expect(seen[2].messages.at(-1)).toEqual({ role: 'user', content: WRITE_NOW });
    expect(r.reply).toContain('brother of Mullá Mihdíy-i-Kandí');
  });

  it("a book's notes are searched once a question; a second notes search is not run", async () => {
    const asked = [];
    const searchInWork = async (a) => { asked.push(a); return { work: { title: 'The Kitáb-i-Íqán' }, passages: [], total: 0, per_query: [{ exact: 0, meaning: 0 }] }; };
    let n = 0; const outs = [];
    const create = async (p) => { n++;
      outs.push(p.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n'));
      if (n <= 2) return { choices: [{ message: { content: '', tool_calls: [{ id: `s${n}`, function: { name: 'search_in_work', arguments: JSON.stringify({ work: 'Kitáb-i-Íqán', queries: [n === 1 ? 'glossary Mullá Báqir' : 'footnote Kandí brother'] }) } }] } }] };
      return { choices: [{ message: { content: 'He was the brother of Mullá Mihdíy-i-Kandí.' } }] }; };
    await agentAnswer({ messages: [{ role: 'user', content: 'Who is Mullá Báqir in the Íqán?' }], tools: { search: async () => [P], searchInWork }, create });
    expect(asked).toHaveLength(1);
    expect(outs.at(-1)).toMatch(/notes were already searched once/);
  });
});
