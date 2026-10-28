// Async Batch API embedder (asyncBatchEmbedContent: 50 % price, <=24 h turnaround, 48 h expiry; inline requests <20 MB).
// Jobs are sized under the per-tier enqueued-token cap (Tier1 500K / Tier2 5M / Tier3 10M for Gemini Embedding; EMBED_BATCH_CAP
// overrides, we use 80 %). Job state persists in a services-heartbeat JSON (data/run/services/embed-batch-*.json) keyed by a hash of
// the requests, so a restart that re-asks for the same texts resumes the SAME job instead of paying twice. Falls back to the
// caller's sync embedder when batch is off/unavailable, a job is bigger than the cap, or capacity does not free up in fallbackWaitMs.
import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { retryAfterMs } from './embed-limiter.mjs';
import { resilientFetch, isTransientError } from '../../api/lib/resilient-fetch.js';

export const BATCH_PRICE_FACTOR = 0.5;
export const batchStateFileFor = (model, key = '', dir = join(process.cwd(), 'data', 'run', 'services')) =>
  join(dir, `embed-batch-${model}-${createHash('sha1').update(String(key)).digest('hex').slice(0, 6)}.json`);
const API = 'https://generativelanguage.googleapis.com/v1beta';
const FAILED = /FAILED|CANCELLED|EXPIRED/;

export function createBatchEmbedder({ model, apiKey, stateFile = null, capTokens = 400000, pollMs = 20000, fallbackWaitMs = 1800000, disableMs = 3600000,
  fetchFn = (u, i) => resilientFetch(u, i, { onRetry: (x) => { local.retries++; onRetry?.(x); } }), onRetry = null, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), name = `embed-batch-${model}` } = {}) {
  let local = { jobs: {}, disabledUntil: 0, submitted: 0, collected: 0, retries: 0, fellBack: 0, pid: process.pid };
  const read = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } };
  const load = () => {   // jobs older than 48 h have expired at Google
    const c = stateFile ? read() : null; if (c?.jobs) local.jobs = Object.fromEntries(Object.entries(c.jobs).filter(([, j]) => now() - j.at < 48 * 3600000));  if (c?.disabledUntil) local.disabledUntil = c.disabledUntil; };
  const save = () => {
    if (!stateFile) return;
    try {
      mkdirSync(join(stateFile, '..'), { recursive: true });
      const rec = { name, pid: process.pid, state: 'running', beat_at: new Date(now()).toISOString(), cap_tokens: capTokens, enqueued_tokens: enqueued(), ...local };
      writeFileSync(`${stateFile}.${process.pid}.tmp`, JSON.stringify(rec)); renameSync(`${stateFile}.${process.pid}.tmp`, stateFile);
    } catch { /* best effort */ }
  };
  const enqueued = () => Object.values(local.jobs).reduce((n, j) => n + (j.tokens || 0), 0);
  load();
  const hdr = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  const keyOf = (requests) => createHash('sha1').update(JSON.stringify(requests)).digest('hex').slice(0, 20);

  async function submit(requests, k) {
    const body = { batch: { displayName: `sifter-${k}`, inputConfig: { requests: { requests: requests.map((request, i) => ({ request, metadata: { key: String(i) } })) } } } };
    const r = await fetchFn(`${API}/models/${model}:asyncBatchEmbedContent`, { method: 'POST', headers: hdr, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`batch submit ${r.status} ${text.slice(0, 200)}`), { status: r.status, retryAfter: retryAfterMs(r.headers, text) });
    const op = JSON.parse(text); return op.name || op.metadata?.name;
  }
  async function poll(jobName) {
    for (;;) {
      let r; try { r = await fetchFn(`${API}/${jobName}`, { headers: hdr }); } catch (e) { if (!isTransientError(e)) throw e; await sleep(pollMs); continue; }
      if (!r.ok && r.status !== 429 && r.status < 500) throw Object.assign(new Error(`batch poll ${r.status}`), { status: r.status });
      if (r.ok) {
        const op = await r.json(); const st = String(op.metadata?.state || op.state || '');
        if (op.error || FAILED.test(st)) throw Object.assign(new Error(`batch ${st || 'error'} ${JSON.stringify(op.error || '').slice(0, 160)}`), { terminal: true });
        if (op.done === true || /SUCCEEDED/.test(st)) return op;
      }
      await sleep(pollMs);
    }
  }
  async function results(op, n) {
    const out = op.response || op.metadata?.output || {}; let items = out.inlinedResponses?.inlinedResponses || out.inlinedResponses;
    if (!items && out.responsesFile) {
      const r = await fetchFn(`${API.replace('/v1beta', '')}/download/v1beta/${out.responsesFile}:download?alt=media`, { headers: hdr });
      if (!r.ok) throw Object.assign(new Error(`batch download ${r.status}`), { terminal: true });
      items = (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    }
    const vecs = new Array(n).fill(null);
    (items || []).forEach((it, i) => {
      const idx = it.metadata?.key !== undefined ? Number(it.metadata.key) : i;
      const v = it.response?.embedding?.values || it.response?.embeddings?.[0]?.values;
      if (v && idx >= 0 && idx < n) vecs[idx] = v;
    });
    return vecs;
  }

  /** requests: EmbedContentRequest[]; tokens: estimated total; sync(requests) → vectors. Returns vectors with .mode = 'batch' | 'sync'. */
  async function embed(requests, { tokens, sync }) {
    const viaSync = async (reqs) => { local.fellBack++; save(); const v = await sync(reqs); v.mode = 'sync'; return v; };
    load();
    if (now() < local.disabledUntil || tokens > capTokens) return viaSync(requests);
    const k = keyOf(requests); const t0 = now();
    let job = local.jobs[k];
    if (!job) {
      while (enqueued() + tokens > capTokens) {   // wait for capacity, but never stall progress
        if (now() - t0 > fallbackWaitMs) return viaSync(requests);
        await sleep(pollMs); load();
      }
      local.jobs[k] = job = { name: null, tokens, at: now() }; save();   // reserve before the network call
      try { job.name = await submit(requests, k); local.submitted++; save(); }
      catch (e) {
        delete local.jobs[k];
        if ([400, 403, 404, 501].includes(e.status)) local.disabledUntil = now() + disableMs;   // not available for this key/model
        save(); return viaSync(requests);
      }
    }
    try {
      const op = await poll(job.name); const vecs = await results(op, requests.length);
      delete local.jobs[k]; local.collected++; save();
      const missing = vecs.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);   // per-request failures: redo only those synchronously
      if (missing.length) { const fix = await sync(missing.map((i) => requests[i])); missing.forEach((i, j) => { vecs[i] = fix[j]; }); local.fellBack++; }
      vecs.mode = missing.length ? 'mixed' : 'batch'; return vecs;
    } catch (e) {
      if (e.terminal || e.status) { delete local.jobs[k]; save(); return viaSync(requests); }
      throw e;   // transient (network, kill): keep the job in state so a retry/restart resumes it
    }
  }
  return { embed, get enqueued() { return enqueued(); }, get stats() { return { enqueued_tokens: enqueued(), cap_tokens: capTokens, jobs: Object.keys(local.jobs).length, submitted: local.submitted, collected: local.collected, fell_back: local.fellBack, net_retries: local.retries }; } };
}
