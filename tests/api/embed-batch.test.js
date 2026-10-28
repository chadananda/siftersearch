import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBatchEmbedder, batchStateFileFor } from '../../scripts/phrase-index/embed-batch.mjs';

// Fake Gemini: asyncBatchEmbedContent returns a job; polling finishes after `pollsToDone`; vector = [index].
function fakeServer({ pollsToDone = 2, submitStatus = 200, failIdx = [] } = {}) {
  const jobs = {}; let submits = 0, n = 0;
  const fetchFn = async (url, init = {}) => {
    const res = (status, body) => ({ ok: status < 300, status, headers: new Headers(), text: async () => JSON.stringify(body), json: async () => body });
    if (url.includes(':asyncBatchEmbedContent')) {
      if (submitStatus !== 200) return res(submitStatus, { error: 'no' });
      submits++; const id = `batches/b${++n}`; jobs[id] = { polls: 0, reqs: JSON.parse(init.body).batch.inputConfig.requests.requests };
      return res(200, { name: id });
    }
    const id = url.split('/v1beta/')[1]; const j = jobs[id];
    if (++j.polls < pollsToDone) return res(200, { name: id, metadata: { state: 'JOB_STATE_RUNNING' } });
    const inlinedResponses = j.reqs.map((r, i) => (failIdx.includes(i) ? { metadata: r.metadata, error: { code: 3 } } : { metadata: r.metadata, response: { embedding: { values: [i] } } }));
    return res(200, { name: id, done: true, metadata: { state: 'JOB_STATE_SUCCEEDED' }, response: { inlinedResponses: { inlinedResponses } } });
  };
  return { fetchFn, get submits() { return submits; } };
}
const reqs = (n, tag = '') => Array.from({ length: n }, (_, i) => ({ model: 'models/m', content: { parts: [{ text: `${tag}t${i}` }] } }));
const base = (srv, o = {}) => ({ model: 'm', apiKey: 'k', fetchFn: srv.fetchFn, sleep: async () => {}, now: () => 1e12, capTokens: 1000, ...o });
const syncFn = async (r) => r.map(() => ['sync']);

describe('batch embedder', () => {
  it('submits, polls, collects in order, mode=batch', async () => {
    const srv = fakeServer(); const b = createBatchEmbedder(base(srv));
    const v = await b.embed(reqs(3), { tokens: 100, sync: syncFn });
    expect([...v]).toEqual([[0], [1], [2]]); expect(v.mode).toBe('batch'); expect(srv.submits).toBe(1);
  });
  it('job larger than the cap, or batch unavailable (404) -> sync fallback; 404 disables batch', async () => {
    const srv = fakeServer({ submitStatus: 404 }); const b = createBatchEmbedder(base(srv));
    expect((await b.embed(reqs(2), { tokens: 5000, sync: syncFn })).mode).toBe('sync');   // over cap: never submitted
    expect((await b.embed(reqs(2), { tokens: 10, sync: syncFn })).mode).toBe('sync');     // 404
    const before = srv.submits; await b.embed(reqs(2), { tokens: 10, sync: syncFn });
    expect(srv.submits).toBe(before);                                                      // disabled: no more submits
  });
  it('waits for enqueued capacity, then falls back rather than stalling', async () => {
    const srv = fakeServer(); let t = 1e12; const o = base(srv, { now: () => t, sleep: async (ms) => { t += ms; }, fallbackWaitMs: 60000, capTokens: 100 });
    const b = createBatchEmbedder(o);
    const first = b.embed(reqs(1, 'a'), { tokens: 80, sync: syncFn });   // holds 80 of 100 while polling
    const second = await b.embed(reqs(1, 'b'), { tokens: 80, sync: syncFn });
    expect(second.mode).toBe('sync');
    expect((await first).mode).toBe('batch');
  });
  it('per-request failures are redone synchronously (mixed)', async () => {
    const srv = fakeServer({ failIdx: [1] }); const b = createBatchEmbedder(base(srv));
    const v = await b.embed(reqs(3), { tokens: 10, sync: syncFn });
    expect([...v]).toEqual([[0], ['sync'], [2]]); expect(v.mode).toBe('mixed');
  });
  it('a job that outlives maxWaitMs is cancelled and done synchronously', async () => {
    const srv = fakeServer({ pollsToDone: 1e9 }); let t = 1e12; const cancels = [];
    const f = async (u, i) => { if (u.endsWith(':cancel')) { cancels.push(u); return { ok: true, status: 200, headers: new Headers(), text: async () => '{}' }; } return srv.fetchFn(u, i); };
    const b = createBatchEmbedder({ ...base({ fetchFn: f }), now: () => t, sleep: async (ms) => { t += ms; }, maxWaitMs: 60000, pollMs: 20000 });
    const v = await b.embed(reqs(2), { tokens: 10, sync: syncFn });
    expect(v.mode).toBe('sync'); expect(cancels.length).toBe(1);
  });
  it('restart resumes the same job (persisted by request hash) instead of re-submitting', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'emb-')); const f = batchStateFileFor('m', 'k', dir);
    const srv = fakeServer({ pollsToDone: 2 }); let polls = 0;
    const crashing = { ...srv, fetchFn: async (u, i) => { if (!u.includes(':async') && ++polls === 1) throw new Error('process killed'); return srv.fetchFn(u, i); } };
    const b1 = createBatchEmbedder(base(crashing, { stateFile: f }));
    await expect(b1.embed(reqs(2), { tokens: 10, sync: syncFn })).rejects.toThrow('killed');
    expect(Object.keys(JSON.parse(readFileSync(f, 'utf8')).jobs).length).toBe(1);
    const b2 = createBatchEmbedder(base(srv, { stateFile: f }));
    const v = await b2.embed(reqs(2), { tokens: 10, sync: syncFn });
    expect(v.mode).toBe('batch'); expect(srv.submits).toBe(1);
  });
});
