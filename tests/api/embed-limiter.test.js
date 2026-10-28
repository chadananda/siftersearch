import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLimiter, limiterFromEnv, stateFileFor, retryAfterMs } from '../../scripts/phrase-index/embed-limiter.mjs';

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
  it('env RPM/TPM are optional hard caps; 0/unset = none', async () => {
    let t = 0, slept = 0; const o = { now: () => t, sleep: async (ms) => { slept += ms; t += ms; } };
    const l = limiterFromEnv({ EMBED_RPM: '10', EMBED_FRAC: '0.5' }, o);   // 5 free calls
    for (let i = 0; i < 6; i++) { await l.acquire(); l.release({}); }
    expect(slept).toBeGreaterThan(0);
    slept = 0; const off = limiterFromEnv({}, o);
    for (let i = 0; i < 100; i++) { await off.acquire(500); off.release({}); }
    expect(slept).toBe(0);
  });
  it('learns the ceiling from a server that 429s above N concurrent, persists it, shares it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'embl-')); const f = stateFileFor('m', 'k', dir);
    let t = 0; const o = { now: () => t, sleep: async (ms) => { t += ms; }, stateFile: f, step: 1, quietMs: 1e12 };
    const N = 6, l = createLimiter({ max: 32, start: 2, ...o });
    let inflight = 0;
    const call = async () => { await l.acquire(10); inflight++; const bad = inflight > N; await Promise.resolve(); inflight--; t += 10; l.release({ status: bad ? 429 : 200, ms: 100 }); };
    for (let round = 0; round < 40; round++) await Promise.all(Array.from({ length: l.limit }, call));
    expect(l.stats.n429).toBeGreaterThan(0);
    expect(l.ceiling).toBeLessThanOrEqual(N + 1);   // learned, not the configured 32
    expect(l.limit).toBeLessThanOrEqual(l.ceiling);
    expect(JSON.parse(readFileSync(f, 'utf8')).ceiling).toBe(l.ceiling);
    const l2 = createLimiter({ max: 32, start: 2, ...o });   // restart resumes near the ceiling, not at max
    expect(l2.ceiling).toBe(l.ceiling);
  });
  it('5xx cuts like 429; slow latency holds the ramp; quiet period probes the ceiling up', async () => {
    let t = 0; const l = createLimiter({ max: 32, start: 8, step: 1, quietMs: 100000, now: () => t, sleep: async (ms) => { t += ms; } });
    await l.acquire(); l.release({ status: 503 });
    expect(l.limit).toBe(4); expect(l.ceiling).toBe(7);
    await l.acquire(); l.release({ status: 200, ms: 100 }); const before = l.limit;
    await l.acquire(); l.release({ status: 200, ms: 1000 });   // 10x baseline: hold
    expect(l.limit).toBe(before);
    t += 200000; await l.acquire(); l.release({ status: 200, ms: 100 });
    expect(l.ceiling).toBe(8);
  });
  it('reads Retry-After and RetryInfo', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '12' }))).toBe(12000);
    expect(retryAfterMs(new Headers(), '{"retryDelay":"34s"}')).toBe(34000);
  });
});
