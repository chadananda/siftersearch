// The grounding roadmap is served stale while it refreshes (10-21: callers timed out on a >20 s recompute).
import { describe, it, expect, vi } from 'vitest';
import { getIntegrationProgress, _resetProgress } from '../../api/lib/bio.js';

describe('getIntegrationProgress stale-while-refreshing', () => {
  it('an expired cache answers with the last value at once while the next one computes', async () => {
    _resetProgress();
    vi.useFakeTimers();
    try {
      const first = await getIntegrationProgress({ compute: async () => ({ v: 1 }) });
      expect(first).toEqual({ v: 1 });
      vi.advanceTimersByTime(24 * 3600 * 1000);   // past any TTL
      let release; const slow = new Promise((r) => { release = r; });
      const second = await getIntegrationProgress({ compute: () => slow.then(() => ({ v: 2 })) });
      expect(second).toEqual({ v: 1 });   // did not wait for the recompute
      release(); await slow; await Promise.resolve();
    } finally { vi.useRealTimers(); _resetProgress(); }
  });
});
