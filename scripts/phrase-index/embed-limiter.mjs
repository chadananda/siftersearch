// Adaptive limiter for embedding calls: AIMD concurrency (+1 per `step` successes, halve on 429), Retry-After honoured,
// optional token buckets sized at `frac` of the account quota (EMBED_RPM / EMBED_TPM from the AI Studio rate-limit page).
export function retryAfterMs(headers, bodyText = '') {
  const h = headers?.get?.('retry-after');
  if (h && !Number.isNaN(Number(h))) return Number(h) * 1000;
  const m = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(bodyText);   // google.rpc.RetryInfo
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}
export function createLimiter({ max = 16, start = 4, step = 10, rpm = 0, tpm = 0, frac = 0.85, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let limit = Math.min(start, max), active = 0, ok = 0, pauseUntil = 0, waiters = [];
  const buckets = [[rpm * frac, 1], [tpm * frac, 0]].map(([perMin, isReq]) => ({ perMin, isReq, level: perMin, at: now() }));
  const take = async (tokens) => {
    for (const b of buckets) {
      if (!b.perMin) continue;
      const cost = b.isReq ? 1 : Math.min(tokens, b.perMin);
      for (;;) {
        const t = now(); b.level = Math.min(b.perMin, b.level + ((t - b.at) / 60000) * b.perMin); b.at = t;
        if (b.level >= cost) { b.level -= cost; break; }
        await sleep(Math.ceil(((cost - b.level) / b.perMin) * 60000));
      }
    }
  };
  return {
    get limit() { return limit; }, get active() { return active; },
    async acquire(tokens = 0) {
      while (active >= limit) await new Promise((r) => waiters.push(r));
      active++;
      const wait = pauseUntil - now(); if (wait > 0) await sleep(wait);
      await take(tokens);
    },
    release({ status = 200, retryAfter = null } = {}) {
      active--;
      if (status === 429) { limit = Math.max(1, Math.floor(limit / 2)); ok = 0; pauseUntil = Math.max(pauseUntil, now() + (retryAfter ?? 5000)); }
      else if (status < 300 && ++ok >= step) { ok = 0; limit = Math.min(max, limit + 1); }
      const w = waiters.splice(0); w.forEach((r) => r());
    },
  };
}
