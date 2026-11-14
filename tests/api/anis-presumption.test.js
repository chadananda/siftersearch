// The question's presumption (Chad 11-14, Reddit "why prohibit homosexuality when it limits growth?"): the live reply accepted
// the frame ("You're right that this is the sharpest tension…"). The agent and writer prompts now tell the model to name an
// unexamined assumption warmly in a sentence or two and answer from the texts' frame. Detection is the model's judgement:
// the question reaches it untouched, with no keyword tag. Fixtures: tests/quality/questions/reddit-bahai.jsonl.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { agentAnswer, AGENT_SYSTEM } from '../../api/lib/assistant/agent-core.js';
import { HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';

const bank = readFileSync(new URL('../quality/questions/reddit-bahai.jsonl', import.meta.url), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const row = (id) => bank.find((r) => r.id === id);

describe('the question\'s presumption', () => {
  it('the agent prompt: name it warmly, answer inside the texts\' frame, never accept the frame or invent one', () => {
    expect(AGENT_SYSTEM).toMatch(/THE QUESTION'S PRESUMPTION \(Chad 11-14\)/);
    expect(AGENT_SYSTEM).toMatch(/name the assumption in one or two warm sentences/);
    expect(AGENT_SYSTEM).toMatch(/never preachy/);
    expect(AGENT_SYSTEM).toMatch(/answer the actual question succinctly from inside the Writings' own frame/);
    expect(AGENT_SYSTEM).toMatch(/moral struggle is with one's own failings, not with other people/);
    expect(AGENT_SYSTEM).toMatch(/Do not accept the frame and then defend inside it/);
    expect(AGENT_SYSTEM).toMatch(/one or two at most; offers to go further belong in the follow-up questions/);
    expect(AGENT_SYSTEM).toMatch(/never invent one/);
  });
  it('succinct (Chad: shortest complete answer, more on request): a challenge gets a few short paragraphs and one or two passages; depth waits in the pills', () => {
    expect(AGENT_SYSTEM).toMatch(/A why \/ how \/ isn't-it question .* is answered in a few short paragraphs/);
    expect(AGENT_SYSTEM).toMatch(/the one or two passages that settle it, the strongest core passage first\. No section headings/);
    expect(AGENT_SYSTEM).toMatch(/go in the follow-up questions, not the prose, unless the reader asked for depth or research/);
    expect(AGENT_SYSTEM).toMatch(/a scholar's depth .* is for a reader who asks for depth or research/);
    expect(AGENT_SYSTEM).not.toMatch(/the more cards breaking up the text, the better/);
    expect(AGENT_SYSTEM).not.toMatch(/\b\d{2,4} words\b|at most \d+ cards/);   // no numeric caps (round-7 test, Chad)
    expect(HOUSE_STYLE).toMatch(/in a few short paragraphs, with the one or two passages that settle it, the strongest core passage first\. Depth .* goes in the follow-up questions, not the prose, unless the person asked for depth or research/);
  });
  it('a question that reads as factual can still carry a presumption — judged by the model, not matched', () => {
    expect(AGENT_SYSTEM).toMatch(/A question can read as purely factual .* and still carry one/);
    expect(HOUSE_STYLE).toMatch(/A question can read as purely factual .* and still carry one/);
  });
  it('the writer prompt says the same, apart from the factual-premise rule', () => {
    expect(HOUSE_STYLE).toMatch(/THE QUESTION'S PRESUMPTION \(Chad 11-14\) is a different thing from a factual premise/);
    expect(HOUSE_STYLE).toMatch(/Never accept the frame and argue within it; never invent an assumption/);
  });
  it('the Reddit question reaches the model untouched under that prompt — no keyword detector in between', async () => {
    const q = row('reddit:1xsjex0');
    const seen = [];
    await agentAnswer({ messages: [{ role: 'user', content: q.text }], tools: { search: async () => [] },
      create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'ok' } }] }; } });
    const sys = seen[0].messages.find((m) => m.role === 'system').content;
    expect(sys).toMatch(/THE QUESTION'S PRESUMPTION/);
    const turn = seen[0].messages.findLast((m) => m.role === 'user').content;
    expect(turn).toContain(q.text.slice(0, 200));
    expect(turn).not.toMatch(/PRESUMPTION/);
  });
  it('the bank fixture: the homosexuality question carries both presumptions Chad named; a plain question carries none', () => {
    const q = row('reddit:1xsjex0');
    const cls = q.extra.presumptions.flatMap((p) => p.classes);
    expect(cls).toEqual(expect.arrayContaining(['progress-is-culture', 'goal-is-growth']));
    expect(bank.length).toBeGreaterThanOrEqual(150);
    expect(bank.every((r) => Array.isArray(r.extra.presumptions) && r.extra.url)).toBe(true);
    expect(bank.some((r) => r.extra.presumptions.length === 0)).toBe(true);
  });
});
