// 10-20: stamp-voices #973 held the indexer in 'draining' for hours (no yield point), so a deploy never reached it. Both
// stamp jobs now yield between windows and return where they stopped; the service saves it so the requeued run continues.
import { describe, it, expect } from 'vitest';
import { stampVoicesJob } from '../../api/lib/ops/stamp-voices-job.js';
import { stampSiteJob } from '../../api/lib/ops/stamp-site-job.js';

describe('stamp jobs yield to a drain and resume', () => {
  it('stamp-voices stops between windows and resumes at the window it had not read', async () => {
    const read = [];
    let n = 0;
    const deps = { top: async () => 300, index: async () => {}, qd: async () => {},
      rows: async ({ afterId }) => { read.push(afterId); return []; }, draining: () => ++n > 2 };
    const r = await stampVoicesJob({ span: 100 }, deps);
    expect(r).toMatchObject({ yielded: true, resume: { after: 200 } });
    expect(read).toEqual([0, 100]);
    read.length = 0;
    const done = await stampVoicesJob({ span: 100, after: 200 }, { ...deps, draining: () => false });
    expect(done.yielded).toBeUndefined();
    expect(read).toEqual([200]);
  });
  it('stamp-site resumes on the site and doc id where it stopped', async () => {
    let n = 0;
    const docs = async ({ afterId }) => ({ docs: afterId < 2 ? [{ id: afterId + 1 }] : [] });
    const r = await stampSiteJob({ sites: ['a', 'b'], collections: ['phrases'] },
      { docs, qd: async () => {}, index: async () => {}, draining: () => ++n > 2 });
    expect(r).toMatchObject({ yielded: true, resume: { sites: ['a', 'b'], afterId: 2 } });
  });
});
