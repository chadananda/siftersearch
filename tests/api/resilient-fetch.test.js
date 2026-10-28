import { describe, it, expect } from 'vitest';
import { resilientFetch, isTransientError } from '../../api/lib/resilient-fetch.js';
import { nextRetry, isTransientFailure, retryDelayMs, MAX_RETRIES } from '../../api/lib/ops/retry-policy.js';

const connectTimeout = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
const ok = (status = 200) => ({ status, ok: status < 300, headers: new Headers() });
const opts = (fetchFn, extra = {}) => ({ fetchFn, sleep: async (ms) => { opts.slept.push(ms); }, rand: () => 1, ...extra });
opts.slept = [];

describe('resilient fetch', () => {
  it('retries UND_ERR_CONNECT_TIMEOUT with growing backoff, then succeeds', async () => {
    opts.slept = []; let n = 0;
    const r = await resilientFetch('u', {}, opts(async () => { if (++n < 3) throw connectTimeout(); return ok(); }));
    expect(r.status).toBe(200); expect(n).toBe(3); expect(opts.slept).toEqual([1000, 2000]);
  });
  it('retries 5xx and 429, honouring Retry-After; returns the last response when exhausted', async () => {
    opts.slept = []; let n = 0;
    const r = await resilientFetch('u', {}, opts(async () => (++n === 1 ? { status: 429, headers: new Headers({ 'retry-after': '7' }) } : ok(503)), { tries: 3 }));
    expect(r.status).toBe(503); expect(n).toBe(3); expect(opts.slept[0]).toBe(7000);
  });
  it('gives up after N tries on a persistent network error, reports retries, never retries non-transient errors', async () => {
    let seen = 0; let n = 0;
    await expect(resilientFetch('u', {}, opts(async () => { n++; throw connectTimeout(); }, { tries: 5, onRetry: () => seen++ }))).rejects.toThrow('fetch failed');
    expect(n).toBe(5); expect(seen).toBe(4);
    n = 0; await expect(resilientFetch('u', {}, opts(async () => { n++; throw new Error('bad json'); }))).rejects.toThrow('bad json');
    expect(n).toBe(1); expect(isTransientError(connectTimeout())).toBe(true);
  });
});

describe('ops retry policy', () => {
  const msg = 'indexer exit 1: TypeError: fetch failed … UND_ERR_CONNECT_TIMEOUT';
  it('a transient phrase-index failure requeues with an incremented attempt; mail only after exhaustion', () => {
    expect(isTransientFailure(msg)).toBe(true);
    expect(nextRetry({ name: 'phrase-index', params: { docs: [1] } }, msg)).toBe(1);
    expect(nextRetry({ name: 'phrase-index', params: { _attempt: MAX_RETRIES } }, msg)).toBe(0);
    expect(nextRetry({ name: 'phrase-index', params: {} }, 'gemini out of credit')).toBe(0);
    expect(nextRetry({ name: 'media-assess', params: {} }, msg)).toBe(0);
    expect(retryDelayMs(1)).toBe(60000); expect(retryDelayMs(9)).toBe(300000);
  });
});
