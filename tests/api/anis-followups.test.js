// Follow-up pills: the fast model's answer is cleaned (JSON array, ≤3, short, no echo of the question); failures give none.
import { describe, it, expect } from 'vitest';
import { cleanFollowups, followups } from '../../api/lib/assistant/followups.js';

describe('follow-up pills', () => {
  it('keeps up to three short distinct questions, never the one just asked', () => {
    const raw = 'Here:\n["What is the next paragraph?", "Who translated it?", "who translated it?", "Show me the next paragraph", "Is there an original?"]';
    expect(cleanFollowups(raw, 'show me the next paragraph')).toEqual(['What is the next paragraph?', 'Who translated it?', 'Is there an original?']);
  });
  it('bad output → no pills', () => {
    expect(cleanFollowups('sure, here are some ideas')).toEqual([]);
    expect(cleanFollowups('{"a":1}')).toEqual([]);
  });
  it('a failing or slow model → no pills, never an error', async () => {
    expect(await followups('q', 'reply', { complete: async () => { throw new Error('x'); } })).toEqual([]);
    expect(await followups('q', 'reply', { complete: () => new Promise(() => {}), timeoutMs: 20 })).toEqual([]);
    expect(await followups('q', 'reply', { complete: async () => ({ content: '["What does kawthar mean?"]' }) })).toEqual(['What does kawthar mean?']);
  });
});
