// Which failed ops jobs requeue themselves (transient network errors) and how long they back off. Pure; used by service-worker.js.
// A TRANSIENT failure (network connect/reset/timeout, 5xx) of a retry-safe job (indexers resume from what is stored) requeues itself with
// backoff; the "FAILED" mail goes out only once the retries are exhausted (10-28: one 10 s connect timeout mailed #40090 and stayed failed).
export const RETRY_JOBS = new Set(['phrase-index', 'keyword-fill', 'section-index']);
export const MAX_RETRIES = 4;
export const isTransientFailure = (msg) => /UND_ERR_|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|socket hang up|\bgemini 5\d\d\b|\b50[234]\b/.test(String(msg));
export const retryDelayMs = (attempt) => Math.min(300_000, 30_000 * 2 ** attempt);
export const nextRetry = (run, msg) => (RETRY_JOBS.has(run.name) && isTransientFailure(msg) && (run.params?._attempt || 0) < MAX_RETRIES ? (run.params?._attempt || 0) + 1 : 0);
