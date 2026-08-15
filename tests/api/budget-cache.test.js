// The spend gate must stay FRESH while money can move, and stop re-asking while it cannot.
//
// budgetStatus ran on a 20s supervisor tick over two providers: ~8,600 SUM(ai_usage) queries a day, 52
// minutes of API time — and it polled just as hard through fourteen hours of a peak-blocked queue with
// live=0, where the answer provably could not change. The sum was already time-bounded; the waste was the
// cadence. Caching a SPEND GATE is dangerous in the other direction, so the TTL is keyed on whether
// anything can bill rather than on the clock alone.
import { describe, it, expect, beforeEach } from 'vitest';
import { budgetStatus, resetBudgetCache } from '../../api/lib/pipeline/queue.js';

const BUDGET_ROW = { provider: 'deepseek', ceiling_usd: 100, baseline_usd: 0, warn_frac: 0.8,
  offpeak_only: 0, peak_windows: null, baseline_at: 1786000000 };

function deps({ live, spend = 1 }) {
  const calls = { sum: 0, probe: 0 };
  return {
    calls,
    queryAll: async () => [BUDGET_ROW],
    queryOne: async (sql) => {
      if (/grounding_queue/.test(sql)) { calls.probe++; return { n: live }; }
      calls.sum++; return { s: spend };
    },
  };
}

beforeEach(() => resetBudgetCache());

describe('budgetStatus caching', () => {
  it('a LIVE run recomputes on every call — a stale ceiling is how an overspend gets through', async () => {
    const d = deps({ live: 1 });
    await budgetStatus(d); await budgetStatus(d); await budgetStatus(d);
    expect(d.calls.sum).toBe(3);
  });

  it('with nothing running, the sum is computed once and reused', async () => {
    const d = deps({ live: 0 });
    await budgetStatus(d); await budgetStatus(d); await budgetStatus(d);
    expect(d.calls.sum).toBe(1);
  });

  it('the reused answer is the SAME answer, not a degraded one', async () => {
    const d = deps({ live: 0, spend: 42 });
    const first = await budgetStatus(d);
    const second = await budgetStatus(d);
    expect(second).toEqual(first);
    expect(second[0].spent).toBe(42);
  });

  it('going live again busts the idle cache immediately', async () => {
    const idle = deps({ live: 0 });
    await budgetStatus(idle); await budgetStatus(idle);
    expect(idle.calls.sum).toBe(1);
    const live = deps({ live: 2 });
    await budgetStatus(live);
    expect(live.calls.sum).toBe(1);           // recomputed despite a warm cache
  });

  it('an UNREADABLE live-probe assumes billing and stays fresh — fail toward accuracy on a spend gate', async () => {
    const calls = { sum: 0 };
    const d = {
      queryAll: async () => [BUDGET_ROW],
      queryOne: async (sql) => {
        if (/grounding_queue/.test(sql)) throw new Error('no such table: grounding_queue');
        calls.sum++; return { s: 1 };
      },
    };
    await budgetStatus(d); await budgetStatus(d);
    expect(calls.sum).toBe(2);
  });
});
