// The conversation the agent sees (Chad 11-14, D1 conversation 73b1d410): round 3's 12,433-char table was clipped to 3,000 chars with
// its newlines collapsed, so round 6 ("email me a document with the final table") rebuilt a thin table and lost round 4's #11 correction.
import { describe, it, expect } from 'vitest';
import { agentAnswer, convoWindow, AGENT_SYSTEM, CONVO_BUDGET } from '../../api/lib/assistant/agent-core.js';

const row = (i) => `| ${i} | Mullá Person-${i} of Qazvín | a divine named in the Íqán; opposed the Báb at the town of his birth, as Nabíl records in some detail |`;
const TABLE = ['The divines the Kitáb-i-Íqán names:', '', '| # | Name | Who he was |', '|---|---|---|', ...Array.from({ length: 120 }, (_, i) => row(i + 1))].join('\n');
const CORRECTION = '#11 is not the Letter of the Living — he is the brother of Mullá Mihdíy-i-Kandí.';
const THREAD = [
  { role: 'user', content: 'Who are the divines named in the Kitáb-i-Íqán? Give me a table.' },
  { role: 'assistant', content: TABLE },
  { role: 'user', content: CORRECTION },
  { role: 'assistant', content: 'You are right: #11 is the brother of Mullá Mihdíy-i-Kandí, as Balyuzi records.' },
  { role: 'user', content: 'Email me a document with the final table, based on what we researched.' }];

describe('the conversation window', () => {
  it('a 12k-char table reply goes in whole, newlines intact, with the later correction', async () => {
    expect(TABLE.length).toBeGreaterThan(12000);
    const seen = [];
    await agentAnswer({ messages: THREAD, tools: { search: async () => [] }, create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'x' } }] }; } });
    const msgs = seen[0].messages;
    const table = msgs.find((m) => m.role === 'assistant' && m.content.includes('| 1 |'));
    expect(table.content).toContain(`${row(1)}\n${row(2)}`);
    expect(table.content).toContain(row(120));
    expect(msgs.some((m) => m.role === 'user' && m.content.includes(CORRECTION))).toBe(true);
    expect(msgs.at(-1).content).toMatch(/^Email me a document/);
  });
  it('up to 12 messages (the widget sends 12), newest first within the budget; the last two replies always whole', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const w = convoWindow(many);
    expect(w).toHaveLength(12);
    expect(w[0]).toEqual({ role: 'user', content: 'm2' });
    const big = 'line\n'.repeat(20000);   // 100k chars, past the budget
    const w2 = convoWindow([{ role: 'user', content: 'q1' }, { role: 'assistant', content: big }, { role: 'user', content: 'q2' }, { role: 'assistant', content: big }, { role: 'user', content: 'q3' }]);
    expect(w2.filter((m) => m.role === 'assistant').every((m) => m.content === big.trim())).toBe(true);
  });
  it('an older turn past the budget keeps head and tail at line breaks with a marked gap; never collapses whitespace', () => {
    const old = Array.from({ length: 2000 }, (_, i) => `| ${i} | row |`).join('\n');
    const msgs = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: old }, { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' }, { role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' }, { role: 'user', content: 'q4' }];
    const w = convoWindow(msgs, { budget: 8000 });
    const clipped = w.find((m) => m.content.includes('[middle of this reply omitted]'));
    expect(clipped).toBeTruthy();
    expect(clipped.content.startsWith('| 0 | row |\n| 1 | row |')).toBe(true);
    expect(clipped.content.endsWith('| 1999 | row |')).toBe(true);
    for (const l of clipped.content.split('\n').filter((x) => x.startsWith('|'))) expect(l).toMatch(/^\| \d+ \| row \|$/);
    expect(w[0].role).toBe('user');
    expect(CONVO_BUDGET).toBeGreaterThanOrEqual(60000);
  });
  it('the follow-up prompt: a request to compile, send or tabulate earlier work builds it in full, corrections applied', async () => {
    const seen = [];
    await agentAnswer({ messages: THREAD, tools: { search: async () => [] }, create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'x' } }] }; } });
    const sys = seen[0].messages[0].content;
    expect(sys).toMatch(/compile, revise, send, email or tabulate/);
    expect(sys).toMatch(/take the LATEST table row by row, keep every row and its number \(1…N, none missing, none merged/);
    expect(sys).toMatch(/apply only the reader's corrections and any new research/);
    expect(sys).toMatch(/never claim something was not built or is not held when it is in this conversation/);
    expect(AGENT_SYSTEM).not.toMatch(/compile, revise, send/);   // the exception rides with the follow-up note only
  });
});
