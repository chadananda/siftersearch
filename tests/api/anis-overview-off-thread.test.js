// 10-21 02:10Z: one cold GET /api/admin/anis/overview held the search API's main thread 56 s (synchronous better-sqlite3 reads
// of the 14.7 GB System-1 log + the ai_usage scan, in-process); a docs listing and /observatory/activity queued behind it
// timed out at the gateway after 43.8 s. The overview now computes on a worker thread, cached, an expired answer served
// while the next computes. Fails on the old code: the route ran the section readers itself and there was no cache.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Anís overview stays off the serving thread', () => {
  it('the route does not run the section readers (or SQL) itself', () => {
    const src = readFileSync(join(ROOT, 'api/routes/assistant-admin.js'), 'utf8');
    expect(src).not.toMatch(/anisSystem1|anisAssessment|anisCosts|anisActivity/);
    expect(src).not.toMatch(/\/db\.js['"]/);
    expect(src).toMatch(/getAnisOverview\(/);
    const worker = readFileSync(join(ROOT, 'api/lib/assistant/overview-worker.js'), 'utf8');
    expect(worker).toMatch(/worker_threads/);
    expect(worker).toMatch(/computeAnisOverview/);
  });

  it('one compute per window per 5 min; an expired answer is served while the next computes', async () => {
    const { getAnisOverview, _resetAnisOverview } = await import('../../api/lib/assistant/admin-overview.js');
    _resetAnisOverview();
    let n = 0, release;
    const compute = (days) => { n++; return n === 1 ? Promise.resolve({ days, v: 1 }) : new Promise((r) => { release = () => r({ days, v: 2 }); }); };
    const t0 = 1_000_000;
    expect(await getAnisOverview(30, { compute, now: t0 })).toEqual({ days: 30, v: 1 });
    expect(await getAnisOverview(30, { compute, now: t0 + 60_000 })).toEqual({ days: 30, v: 1 });
    expect(n).toBe(1);
    // expired: the stale answer comes back at once (the recompute has not finished)
    expect(await getAnisOverview(30, { compute, now: t0 + 6 * 60_000 })).toEqual({ days: 30, v: 1 });
    expect(n).toBe(2);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(await getAnisOverview(30, { compute, now: t0 + 6 * 60_000 + 1 })).toEqual({ days: 30, v: 2 });
    expect(n).toBe(2);
  });

  it('a failed compute is not cached', async () => {
    const { getAnisOverview, _resetAnisOverview } = await import('../../api/lib/assistant/admin-overview.js');
    _resetAnisOverview();
    let n = 0;
    const compute = () => { n++; return n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true }); };
    await expect(getAnisOverview(7, { compute, now: 1 })).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));
    expect(await getAnisOverview(7, { compute, now: 2 })).toEqual({ ok: true });
  });
});
