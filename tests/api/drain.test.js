// Queued updates (docs/architecture/continuous-deploy.md): a drain wakes every sleeping loop at once and stops new work.
import { describe, it, expect } from 'vitest';

describe('drain', () => {
  it('nap() ends early when a drain starts, and returns at once afterwards', async () => {
    const { nap, startDrain, isDraining } = await import('../../api/lib/drain.js');
    const t0 = Date.now();
    const sleeping = nap(60_000);
    setTimeout(() => startDrain('SIGHUP'), 20);
    await sleeping;
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(isDraining()).toBe(true);
    const t1 = Date.now(); await nap(60_000);
    expect(Date.now() - t1).toBeLessThan(500);   // vs the 60 s nap: 'at once' without racing a loaded CPU
  });
});
