import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSyncEmbedder, watchWait, SYNC_MAX_PER_CALL } from '../../scripts/phrase-index/embed-sync.mjs';
import { createBatchEmbedder } from '../../scripts/phrase-index/embed-batch.mjs';
import { createLimiter } from '../../scripts/phrase-index/embed-limiter.mjs';

// Fake batchEmbedContents with the real API's rule (verified 11-01): > 100 requests → 400 INVALID_ARGUMENT.
function fakeGemini({ statuses = [] } = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const { requests } = JSON.parse(init.body); calls.push(requests.length);
    const res = (status, body, headers = {}) => ({ ok: status < 300, status, headers: new Headers(headers), text: async () => JSON.stringify(body), json: async () => body });
    const forced = statuses.shift();
    if (forced) return res(forced, { error: { code: forced } }, forced === 429 ? { 'retry-after': '7' } : {});
    if (requests.length > SYNC_MAX_PER_CALL) return res(400, { error: { code: 400, message: '* BatchEmbedContentsRequest.requests: at most 100 requests can be in one batch' } });
    return res(200, { embeddings: requests.map((r) => ({ values: [Number(r.content.parts[0].text.slice(1))] })) });
  };
  return { fetchFn, calls };
}
const reqs = (n) => Array.from({ length: n }, (_, i) => ({ model: 'models/m', content: { parts: [{ text: `t${i}` }] } }));
const sync = (api, o = {}) => {
  const slept = [], notes = [];
  const embed = createSyncEmbedder({ model: 'm', apiKey: 'k', limiter: createLimiter({ sleep: async () => {} }), estTokens: () => 10,
    fetchFn: api.fetchFn, sleep: async (ms) => { slept.push(ms); }, note: (n) => notes.push(n), ...o });
  return { embed, slept, notes };
};

describe('sync embedder (job #77869)', () => {
  it('a 500-request job is sent as calls of <= 96, vectors in order', async () => {
    const api = fakeGemini(); const { embed, slept } = sync(api);
    const v = await embed(reqs(500));
    expect(v).toHaveLength(500); expect(v[0]).toEqual([0]); expect(v[499]).toEqual([499]);
    expect(Math.max(...api.calls)).toBeLessThanOrEqual(96); expect(api.calls.reduce((a, b) => a + b, 0)).toBe(500);
    expect(slept).toEqual([]);
  });
  it('a non-retryable status (400) fails at once — no backoff sleeps', async () => {
    const api = fakeGemini(); const { embed, slept } = sync(api, { maxPerCall: 200 });   // force the oversize call
    await expect(embed(reqs(150))).rejects.toThrow(/gemini 400 .*at most 100/);
    expect(api.calls).toEqual([150]); expect(slept).toEqual([]);
  });
  it('429 / 5xx are retried, Retry-After honoured, every retry reported', async () => {
    const api = fakeGemini({ statuses: [429, 503] }); const { embed, slept, notes } = sync(api);
    expect(await embed(reqs(3))).toEqual([[0], [1], [2]]);
    expect(slept).toEqual([7000, 6000]);
    expect(notes.filter((n) => n.phase === 'embed-retry').map((n) => n.why)).toEqual(['gemini 429', 'gemini 503']);
  });
  it('retries are bounded', async () => {
    const api = fakeGemini({ statuses: Array(5).fill(503) }); const { embed } = sync(api, { maxAttempts: 3 });
    await expect(embed(reqs(1))).rejects.toThrow(/gave up after 3 attempts/);
  });
  it('the #77869 path end to end: batch submit fails → sync fallback of a 500-request job completes, reason reported', async () => {
    const api = fakeGemini(); const notes = [];
    const fetchFn = async (url, init) => (url.includes(':asyncBatchEmbedContent')
      ? { ok: false, status: 413, headers: new Headers(), text: async () => 'too large' } : api.fetchFn(url, init));
    const b = createBatchEmbedder({ model: 'm', apiKey: 'k', fetchFn, sleep: async () => {}, now: () => 1e12, capTokens: 1e6, note: (n) => notes.push(n) });
    const { embed } = sync(api);
    const v = await b.embed(reqs(500), { tokens: 5000, sync: embed });
    expect(v).toHaveLength(500); expect(v.mode).toBe('sync');
    expect(notes.find((n) => n.phase === 'batch-fallback')).toMatchObject({ requests: 500, reason: expect.stringMatching(/submit failed: batch submit 413/) });
  });
});

describe('watchWait', () => {
  afterEach(() => vi.useRealTimers());
  it('names a slow wait every interval and passes the result through; never cancels', async () => {
    vi.useFakeTimers(); const notes = []; let done;
    const p = watchWait('gemini call', new Promise((r) => { done = r; }), { note: (n) => notes.push(n), after: 1000, every: 5000 });
    await vi.advanceTimersByTimeAsync(11500);
    expect(notes.map((n) => n.on)).toEqual(['gemini call', 'gemini call', 'gemini call']);
    expect(notes[0]).toMatchObject({ phase: 'waiting' });
    done(42); expect(await p).toBe(42);
    await vi.advanceTimersByTimeAsync(20000); expect(notes).toHaveLength(3);
  });
  it('a fast wait says nothing', async () => {
    const notes = []; expect(await watchWait('x', Promise.resolve(1), { note: (n) => notes.push(n) })).toBe(1); expect(notes).toEqual([]);
  });
});
