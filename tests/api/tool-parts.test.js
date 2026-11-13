// part(): stage times inside one tool call surface as the step's parts; outside a call nothing is recorded
import { describe, it, expect } from 'vitest';
import { callScope, part } from '../../api/lib/assistant/tool-cache.js';

describe('tool-call parts', () => {
  it('sums named stage times within the call', async () => {
    const { out, parts } = await callScope(async () => { part('search', 120.4); part('link', 30); part('search', 10); return 'ok'; });
    expect(out).toBe('ok');
    expect(parts).toEqual({ search: 130, link: 30 });
  });
  it('is a no-op outside a call', () => { expect(() => part('x', 5)).not.toThrow(); });
});
