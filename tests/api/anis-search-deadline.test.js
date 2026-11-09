// Slow search under load must degrade, not hang an Anís turn (launch sprint W6): withDeadline, libraryTools, agentSearch.
import { describe, it, expect } from 'vitest';
import { withDeadline } from '../../api/lib/assistant/deadline.js';
import { libraryTools } from '../../api/lib/assistant/researcher.js';
import { agentSearch } from '../../api/lib/assistant/agent-search.js';

const never = () => new Promise(() => {});
describe('slow library calls degrade', () => {
  it('withDeadline: a hang is a timeout ERROR (retryable), a throw is kept, the value passes', async () => {
    await expect(withDeadline(never, 20, 'x')).rejects.toMatchObject({ code: 'timeout', retryable: true });
    await expect(withDeadline(async () => { throw new Error('boom'); }, 50, 'y')).rejects.toThrow('boom');
    expect(await withDeadline(async () => 7, 50, 'z')).toBe(7);
  });
  it('libraryTools.search/around degrade to an empty list when search hangs', async () => {
    process.env.ANIS_TOOL_DEADLINE_MS = '30';
    try {
      const t = libraryTools({ search: never });
      const t0 = Date.now();
      expect(await t.search('what is love')).toEqual([]);
      expect(Date.now() - t0).toBeLessThan(1000);
    } finally { delete process.env.ANIS_TOOL_DEADLINE_MS; }
  });
  it('agentSearch throws a timeout error (never an empty list) when multiIndexSearch hangs', async () => {
    await expect(agentSearch({ multiIndexSearch: never, deadlineMs: 30 })('q')).rejects.toMatchObject({ code: 'timeout' });
  });
});
