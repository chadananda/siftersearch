// Adaptive embedding limiter (Chad 10-28: Google publishes no embedding limits -> ask the API, back off when it complains).
// AIMD concurrency: +1 per `step` clean, flat-latency successes up to the LEARNED CEILING; 429/RESOURCE_EXHAUSTED/5xx halve it,
// record ceiling = (limit before cut - 1), honour Retry-After; after `quietMs` without a cut the ceiling is probed +1.
// The ceiling + counters persist in a state file shared by every embedding process on the box (per model+key): restarts resume
// near it, workers split it (cap = ceiling / live workers) so they never each probe alone. The same JSON is a services
// heartbeat (data/run/services/embed-<model>.json) so /api/admin/ops/services shows it. EMBED_RPM / EMBED_TPM are optional HARD caps only.
import { mkdirSync, writeFileSync, renameSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export function retryAfterMs(headers, bodyText = '') {
  const h = headers?.get?.('retry-after');
  if (h && !Number.isNaN(Number(h))) return Number(h) * 1000;
  const m = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(bodyText);   // google.rpc.RetryInfo
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}
export const stateFileFor = (model, key = '', dir = join(process.cwd(), 'data', 'run', 'services')) =>
  join(dir, `embed-${model}-${createHash('sha1').update(String(key)).digest('hex').slice(0, 6)}.json`);
export function limiterFromEnv(env = process.env, opts = {}) {
  const num = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));   // 0 = no cap
  return createLimiter({ rpm: num(env.EMBED_RPM), tpm: num(env.EMBED_TPM), frac: env.EMBED_FRAC ? Number(env.EMBED_FRAC) : 0.8, ...opts });
}
export function createLimiter({ max = 32, start = 4, step = 10, rpm = 0, tpm = 0, frac = 0.8, quietMs = 600000, slowFactor = 2, stateFile = null, name = 'embed',
  now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let limit = Math.min(start, max), active = 0, ok = 0, pauseUntil = 0, waiters = [];
  let ceiling = max, lastCut = 0, n429 = 0, n5xx = 0, baseMs = 0, lastSync = 0, lastWrite = 0, workers = 1; const win = [];   // win: [t, tokens]
  const pid = process.pid;
  const read = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return null; } };
  const write = (force) => {
    if (!stateFile) return; const t = now(); if (!force && t - lastWrite < 2000) return; lastWrite = t;
    const cur = read() || {}; const peers = { ...(cur.peers || {}), [pid]: { at: t, active } };
    for (const k of Object.keys(peers)) if (t - peers[k].at > 30000) delete peers[k];
    try {
      mkdirSync(join(stateFile, '..'), { recursive: true });
      const rec = { name, pid, state: 'running', beat_at: new Date(t).toISOString(), ceiling, concurrency: limit, active,
        n429, n5xx, tokens_per_min: tokensPerMin(), peers, last_cut_at: lastCut || cur.last_cut_at || 0 };
      writeFileSync(`${stateFile}.${pid}.tmp`, JSON.stringify(rec)); renameSync(`${stateFile}.${pid}.tmp`, stateFile);
    } catch { /* best effort */ }
  };
  const sync = () => {   // adopt the shared ceiling + worker count (every 5 s)
    if (!stateFile) return; const t = now(); if (t - lastSync < 5000) return; lastSync = t;
    const cur = read(); if (!cur) return;
    if (cur.ceiling) ceiling = Math.max(1, Math.min(max, cur.ceiling));
    if (cur.last_cut_at && cur.last_cut_at > lastCut) lastCut = cur.last_cut_at;
    workers = Math.max(1, Object.entries(cur.peers || {}).filter(([k, v]) => t - v.at < 30000 || +k === pid).length);
  };
  const cap = () => Math.max(1, Math.floor(ceiling / workers));
  const tokensPerMin = () => { const t = now(); while (win.length && t - win[0][0] > 60000) win.shift(); return win.reduce((n, w) => n + w[1], 0); };
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
  if (stateFile) { const cur = read(); if (cur?.ceiling) { ceiling = Math.max(1, Math.min(max, cur.ceiling)); limit = Math.max(1, Math.min(limit, ceiling)); lastCut = cur.last_cut_at || 0; } }
  return {
    get limit() { return limit; }, get active() { return active; }, get ceiling() { return ceiling; },
    get stats() { return { concurrency: limit, ceiling, active, n429, n5xx, tokens_per_min: tokensPerMin(), workers }; },
    async acquire(tokens = 0) {
      sync();
      while (active >= Math.min(limit, cap())) await new Promise((r) => waiters.push(r));
      active++;
      const wait = pauseUntil - now(); if (wait > 0) await sleep(wait);
      await take(tokens);
      win.push([now(), tokens]);
    },
    release({ status = 200, retryAfter = null, ms = null } = {}) {
      active--; const t = now();
      if (status === 429 || status >= 500) {   // RESOURCE_EXHAUSTED / overloaded: learn the ceiling, halve, pause
        status === 429 ? n429++ : n5xx++;
        if (!lastCut || t - lastCut > 1000) ceiling = Math.max(1, Math.min(ceiling, limit * Math.max(1, workers) - 1)); // total across workers
        lastCut = t || 1; limit = Math.max(1, Math.floor(limit / 2)); ok = 0;
        pauseUntil = Math.max(pauseUntil, t + (retryAfter ?? (status === 429 ? 5000 : 2000))); write(true);
      } else if (status < 300) {
        const slow = ms != null && baseMs && ms > baseMs * slowFactor;   // latency rising = approaching the limit: hold
        if (ms != null) baseMs = baseMs ? Math.min(baseMs * 1.02, ms) : ms;   // fast to drop, slow to drift up
        if (!slow && ++ok >= step) { ok = 0; if (limit < cap()) limit++; }
        if (lastCut && t - lastCut > quietMs && ceiling < max) { ceiling++; lastCut = t; }   // quiet: probe upward slowly
        write(false);
      }
      const w = waiters.splice(0); w.forEach((r) => r());
    },
  };
}
