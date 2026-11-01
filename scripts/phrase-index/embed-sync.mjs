// Sync Gemini embedder (batchEmbedContents) + watchWait. Splits any request list into calls of <= maxPerCall (the API
// rejects > 100 with a 400), paces each call through the adaptive limiter, retries ONLY 429/5xx/network errors, throws at
// once on any other status. Job #77869: a 500-request batch fallback got a 400 and slept through 21 "retries" (~76 min) silently.
import { retryAfterMs } from './embed-limiter.mjs';
import { resilientFetch, isTransientError } from '../../api/lib/resilient-fetch.js';

export const SYNC_MAX_PER_CALL = 100;   // Gemini: "at most 100 requests can be in one batch" (verified 11-01)
export const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/** While `promise` is pending past `after` ms, report { phase: 'waiting', on, waited_ms } every `every` ms. Reports only —
 *  never cancels (health is progress evidence, not a clock). Timers are unref'd: a report never keeps the process alive. */
export function watchWait(on, promise, { note, after = 30000, every = 60000, now = Date.now } = {}) {
  if (!note) return promise;
  const t0 = now(); let h = null;
  const arm = (ms) => { h = setTimeout(() => { note({ phase: 'waiting', on, waited_ms: now() - t0 }); arm(every); }, ms); h.unref?.(); };
  arm(after);
  return Promise.resolve(promise).finally(() => clearTimeout(h));
}

export function createSyncEmbedder({ model, apiKey, limiter, estTokens, maxPerCall = 96, maxAttempts = 20, timeoutMs = 120000,
  fetchFn = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), note = null,
  onProviderError = null, isExhaustion = () => false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const send = fetchFn || ((u, init) => resilientFetch(u, init, { tries: 3, onRetry: () => limiter.penalize() }));
  const fatal = (msg) => Object.assign(new Error(msg), { fatal: true });

  async function call(requests, part) {
    const tokens = requests.reduce((n, r) => n + estTokens(r.content.parts[0].text), 0);
    const body = JSON.stringify({ requests }); const what = `gemini batchEmbedContents ${requests.length} requests (part ${part})`;
    for (let attempt = 1; ; attempt++) {
      await watchWait(`embed limiter slot/quota for ${what}`, limiter.acquire(tokens), { note });
      let released = false; const release = (o) => { if (!released) { released = true; limiter.release(o); } };
      let retryAfter = null, why = ''; const t0 = now();
      try {
        const r = await watchWait(what, send(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body,
          signal: AbortSignal.timeout(timeoutMs) }), { note });
        if (r.ok) { release({ status: r.status, ms: now() - t0 }); return (await r.json()).embeddings.map((e) => e.values); }
        const text = await r.text(); retryAfter = retryAfterMs(r.headers, text);
        release({ status: r.status, retryAfter });
        onProviderError?.({ status: r.status, message: text });
        if (isExhaustion({ status: r.status, message: text })) throw fatal(`gemini out of credit: ${text.slice(0, 200)}`);   // don't wait out a 429 that won't clear
        if (!RETRY_STATUS.has(r.status)) throw fatal(`gemini ${r.status} ${text.slice(0, 300)}`);   // 400 etc.: retrying cannot help
        why = `gemini ${r.status}`;
      } catch (e) {
        release({ status: 599 });
        if (e.fatal || !isTransientError(e)) throw e;
        why = `network ${e.cause?.code || e.code || e.name || e.message}`;
      }
      if (attempt >= maxAttempts) throw new Error(`${what}: gave up after ${attempt} attempts (${why})`);
      const ms = retryAfter ?? Math.min(300000, 3000 * 2 ** (attempt - 1));   // per-minute quota clears in minutes
      note?.({ phase: 'embed-retry', on: what, why, attempt, sleep_ms: ms });
      await sleep(ms);
    }
  }

  /** requests: EmbedContentRequest[] (any length) → vectors in order. */
  return async function embedSync(requests) {
    const out = []; const parts = Math.ceil(requests.length / maxPerCall);
    for (let i = 0, p = 1; i < requests.length; i += maxPerCall, p++) out.push(...await call(requests.slice(i, i + maxPerCall), `${p}/${parts}`));
    return out;
  };
}
