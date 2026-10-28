import { describe, it, expect } from 'vitest';
import { createLimiter, limiterFromEnv, retryAfterMs, DEFAULT_RPM } from '../../scripts/phrase-index/embed-limiter.mjs';

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
  it('token bucket paces to 80% of the RPM', async () => {
    let t = 0; let slept = 0;
    const l = createLimiter({ rpm: 60, now: () => t, sleep: async (ms) => { slept += ms; t += ms; } });   // 48/min -> 48 free calls
    for (let i = 0; i < 49; i++) { await l.acquire(); l.release({}); }
    expect(slept).toBeGreaterThan(0);
  });
  it('reads env with defaults, 0 disables', async () => {
    expect(DEFAULT_RPM).toBe(3000);
    let t = 0, slept = 0; const o = { now: () => t, sleep: async (ms) => { slept += ms; t += ms; } };
    const l = limiterFromEnv({ EMBED_RPM: '10', EMBED_TPM: '0', EMBED_FRAC: '0.5' }, o);   // 5 free calls
    for (let i = 0; i < 6; i++) { await l.acquire(); l.release({}); }
    expect(slept).toBeGreaterThan(0);
    slept = 0; const off = limiterFromEnv({ EMBED_RPM: '0', EMBED_TPM: '0' }, o);
    for (let i = 0; i < 100; i++) { await off.acquire(500); off.release({}); }
    expect(slept).toBe(0);
  });
  it('reads Retry-After and RetryInfo', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '12' }))).toBe(12000);
    expect(retryAfterMs(new Headers(), '{"retryDelay":"34s"}')).toBe(34000);
  });
});
