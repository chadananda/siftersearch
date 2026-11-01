// Per-turn stage timeline (assistant/timeline.js): timed() records name/start/ms inside a turn scope, is a no-op outside one.
import { describe, it, expect } from 'vitest';
import { withAIContext } from '../../api/lib/ai-context.js';
import { timed, timelineOf } from '../../api/lib/assistant/timeline.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
describe('timeline', () => {
  it('outside a turn scope timed() just runs the function', async () => {
    expect(await timed('x', async () => 7)).toBe(7);
  });
  it('records each stage with its start offset and duration, even when it throws', async () => {
    const timeline = [], t0 = Date.now();
    await withAIContext({ timeline }, async () => {
      await timed('a', () => wait(20));
      await expect(timed('b', async () => { throw new Error('x'); })).rejects.toThrow('x');
      await Promise.all([timed('c', () => wait(10)), timed('d', () => wait(10))]);
    });
    const out = timelineOf(timeline, t0);
    expect(out.map((s) => s.name)).toEqual(['a', 'b', expect.stringMatching(/^[cd]$/), expect.stringMatching(/^[cd]$/)]);
    expect(out[0].ms).toBeGreaterThanOrEqual(15);
    expect(out[1].at).toBeGreaterThanOrEqual(out[0].at + out[0].ms - 2);
  });
  it('timelineOf is [] for nothing', () => { expect(timelineOf(undefined, 0)).toEqual([]); });
});
