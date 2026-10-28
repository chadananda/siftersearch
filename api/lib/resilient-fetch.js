// fetch for Google/OpenAI-class hosts: IPv4 first (tower's IPv6 route to Google is dead: curl -6 fails, so Happy Eyeballs burned the
// 10 s connect budget), 30 s connect timeout (undici Agent when resolvable), and bounded retry of connect/reset/timeout errors and
// 5xx/429 with exponential backoff + jitter. Transient hiccups never fail a job; `onRetry` lets a limiter shrink concurrency.
import dns from 'node:dns';
import net from 'node:net';
try { dns.setDefaultResultOrder('ipv4first'); net.setDefaultAutoSelectFamily?.(true); net.setDefaultAutoSelectFamilyAttemptTimeout?.(2000); } catch { /* old node */ }

let dispatcher;
async function getDispatcher() {
  if (dispatcher !== undefined) return dispatcher;
  try { const { Agent } = await import('undici'); dispatcher = new Agent({ connect: { timeout: 30000 }, keepAliveTimeout: 4000 }); } catch { dispatcher = null; }
  return dispatcher;
}
const TRANSIENT = /UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|EPIPE|fetch failed|terminated|TimeoutError|AbortError/;
export const isTransientError = (e) => TRANSIENT.test(`${e?.code || ''} ${e?.cause?.code || ''} ${e?.name || ''} ${e?.message || ''}`);
export const isTransientStatus = (s) => s === 429 || s >= 500;

export async function resilientFetch(url, init = {}, { tries = 5, baseMs = 1000, maxMs = 30000, onRetry = null, fetchFn = null, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), rand = Math.random } = {}) {
  const f = fetchFn || globalThis.fetch; const d = fetchFn ? null : await getDispatcher();
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await f(url, d ? { ...init, dispatcher: d } : init);
      if (!isTransientStatus(r.status) || attempt >= tries) return r;
      onRetry?.({ status: r.status, attempt });
      const ra = Number(r.headers?.get?.('retry-after')); await sleep(ra > 0 ? ra * 1000 : Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.5 + rand() / 2));
    } catch (e) {
      if (!isTransientError(e) || attempt >= tries) throw e;
      onRetry?.({ error: e.cause?.code || e.code || e.message, attempt });
      await sleep(Math.min(maxMs, baseMs * 2 ** (attempt - 1)) * (0.5 + rand() / 2));
    }
  }
}
