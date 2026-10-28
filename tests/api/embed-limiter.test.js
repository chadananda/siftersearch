import { describe, it, expect } from 'vitest';
import { createLimiter, retryAfterMs } from '../../scripts/phrase-index/embed-limiter.mjs';

describe('embed limiter', () => {
  it('AIMD: +1 per step successes, halves on 429, pauses for Retry-After', async () => {
    let t = 0; const slept = [];
    const l = createLimiter({ max: 8, start: 4, step: 2, now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } });
    for (let i = 0; i < 2; i++) { await l.acquire(); l.release({ status: 200 }); }
    expect(l.limit).toBe(5);
    await l.acquire(); l.release({ status: 429, retryAfter: 7000 });
    expect(l.limit).toBe(2);
    await l.acquire();
    expect(slept).toContain(7000);
  });
  it('token bucket paces to 85% of the RPM', async () => {
    let t = 0; let slept = 0;
    const l = createLimiter({ rpm: 60, now: () => t, sleep: async (ms) => { slept += ms; t += ms; } });   // 51/min -> 51 free calls
    for (let i = 0; i < 52; i++) { await l.acquire(); l.release({}); }
    expect(slept).toBeGreaterThan(0);
  });
  it('reads Retry-After and RetryInfo', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '12' }))).toBe(12000);
    expect(retryAfterMs(new Headers(), '{"retryDelay":"34s"}')).toBe(34000);
  });
});
