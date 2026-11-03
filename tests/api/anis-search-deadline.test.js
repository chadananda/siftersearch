// Slow search under load must degrade, not hang an Anís turn (launch sprint W6): withDeadline, libraryTools, agentSearch.
import { describe, it, expect } from 'vitest';
import { withDeadline } from '../../api/lib/assistant/deadline.js';
import { libraryTools } from '../../api/lib/assistant/researcher.js';
import { agentSearch } from '../../api/lib/assistant/agent-search.js';

const never = () => new Promise(() => {});
describe('slow library calls degrade', () => {
  it('withDeadline returns the fallback on a hang or a throw, the value otherwise', async () => {
    expect(await withDeadline(never, 20, 'x')).toBe('x');
    expect(await withDeadline(async () => { throw new Error('boom'); }, 50, 'y')).toBe('y');
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
  it('agentSearch returns an empty hit list when multiIndexSearch hangs', async () => {
    const r = await agentSearch({ multiIndexSearch: never, deadlineMs: 30 })('q');
    expect(r).toEqual([]);
  });
});
