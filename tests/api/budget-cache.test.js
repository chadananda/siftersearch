// The spend gate must stay FRESH while money can move, and stop re-asking while it cannot.
//
// budgetStatus ran on a 20s supervisor tick over two providers: ~8,600 SUM(ai_usage) queries a day, 52
// minutes of API time — and it polled just as hard through fourteen hours of a peak-blocked queue with
// live=0, where the answer provably could not change. The sum was already time-bounded; the waste was the
// cadence. Caching a SPEND GATE is dangerous in the other direction, so the TTL is keyed on whether
// anything can bill rather than on the clock alone.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Drive the PRODUCTION path: the cache deliberately does not apply to injected deps (a caller with its own
// data source must never receive a value cached from someone else's), so the db module is mocked instead.
let live = 0, spend = 1;
const calls = { sum: 0, probe: 0 };
vi.mock('../../api/lib/db.js', async (orig) => ({
  ...(await orig()),
  queryAll: async () => [{ provider: 'deepseek', ceiling_usd: 100, baseline_usd: 0, warn_frac: 0.8,
    offpeak_only: 0, peak_windows: null, baseline_at: 1786000000 }],
  queryOne: async (sql) => {
    if (/grounding_queue/.test(sql)) { calls.probe++; return { n: live }; }
    calls.sum++; return { s: spend };
  },
}));
const { budgetStatus, resetBudgetCache } = await import('../../api/lib/pipeline/queue.js');

const setup = ({ live: l = 0, spend: sp = 1 } = {}) => { live = l; spend = sp; calls.sum = 0; calls.probe = 0; };

beforeEach(() => { resetBudgetCache(); setup(); });

describe('budgetStatus caching', () => {
  it('a LIVE run recomputes on every call — a stale ceiling is how an overspend gets through', async () => {
    setup({ live: 1 });
    await budgetStatus(); await budgetStatus(); await budgetStatus();
    expect(calls.sum).toBe(3);
  });

  it('with nothing running, the sum is computed once and reused', async () => {
    setup({ live: 0 });
    await budgetStatus(); await budgetStatus(); await budgetStatus();
    expect(calls.sum).toBe(1);
  });

  it('the reused answer is the SAME answer, not a degraded one', async () => {
    setup({ live: 0, spend: 42 });
    const first = await budgetStatus();
    const second = await budgetStatus();
    expect(second).toEqual(first);
    expect(second[0].spent).toBe(42);
  });

  it('going live again busts the idle cache immediately', async () => {
    setup({ live: 0 });
    await budgetStatus(); await budgetStatus();
    expect(calls.sum).toBe(1);
    setup({ live: 2 });                        // a run starts; the warm cache must not be used
    await budgetStatus();
    expect(calls.sum).toBe(1);
  });

  it('an UNREADABLE live-probe assumes billing and stays fresh — fail toward accuracy on a spend gate', async () => {
    // deps ARE injected here on purpose: it also demonstrates the injected path never reads the cache.
    const c = { sum: 0 };
    const d = {
      queryAll: async () => [{ provider: 'deepseek', ceiling_usd: 100, baseline_usd: 0, warn_frac: 0.8,
        offpeak_only: 0, peak_windows: null, baseline_at: 1786000000 }],
      queryOne: async (sql) => {
        if (/grounding_queue/.test(sql)) throw new Error('no such table: grounding_queue');
        c.sum++; return { s: 1 };
      },
    };
    await budgetStatus(d); await budgetStatus(d);
    expect(c.sum).toBe(2);
  });

  it('NEVER caches the clock: peakBlocked is recomputed even when the spend is reused', async () => {
    // The regression this file now guards. budgetStatus also returns inPeak/peakBlocked/offPeakResumesAt,
    // which move with the CLOCK, not with spend. Caching them held peakBlocked=true for ~4.5 minutes past
    // the 16:30Z boundary and delayed the launch of 23 queued books by exactly that long.
    setup({ live: 0 });
    const inPeakTime = new Date('2026-08-15T12:00:00Z');    // inside the 00:30-16:30 peak window
    const offPeakTime = new Date('2026-08-15T17:00:00Z');   // after it

    const during = await budgetStatus({ now: inPeakTime });
    const after = await budgetStatus({ now: offPeakTime });  // warm cache, later clock

    expect(during[0].inPeak).toBe(true);
    expect(after[0].inPeak).toBe(false);                     // the clock won, not the cache
  });
});
