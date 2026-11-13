// Streamed roleCreate calls log their usage from the final chunk (11-02: streamed chat-answer/dewey-chat were unbilled in ai_usage).
import { describe, it, expect } from 'vitest';
import { logStreamUsage } from '../../api/lib/role-client.js';

const fakeStream = (chunks) => ({ async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; }, controller: 'kept' });

describe('logStreamUsage', () => {
  it('passes every chunk through and logs the usage chunk once the stream is read', async () => {
    const logged = [];
    const s = logStreamUsage(fakeStream([{ choices: [{ delta: { content: 'a' } }] }, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }]), (u) => logged.push(u));
    const seen = [];
    for await (const c of s) seen.push(c);
    expect(seen).toHaveLength(2);
    expect(s.controller).toBe('kept');
    expect(logged).toEqual([{ prompt_tokens: 10, completion_tokens: 5 }]);
  });

  it('still logs what it saw when the reader stops early', async () => {
    const logged = [];
    const s = logStreamUsage(fakeStream([{ usage: { prompt_tokens: 3, completion_tokens: 1 } }, { choices: [] }]), (u) => logged.push(u));
    for await (const c of s) { void c; break; }
    expect(logged).toEqual([{ prompt_tokens: 3, completion_tokens: 1 }]);
  });

  it('wraps an async generator (its iterator is itself) without recursing — 11-12 native stream overflow', async () => {
    const logged = [];
    const s = logStreamUsage((async function* () { yield { choices: [{ delta: { content: 'a' } }] }; yield { choices: [], usage: { prompt_tokens: 2 } }; })(), (u) => logged.push(u));
    const out = [];
    for await (const c of s) out.push(c);
    expect(out).toHaveLength(2);
    expect(logged).toEqual([{ prompt_tokens: 2 }]);
  });
});
