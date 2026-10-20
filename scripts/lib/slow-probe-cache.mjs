// The pipeline snapshot (every 5 min) ran dozens of whole-table aggregates — language totals, embedding totals, all-time
// ai_usage groupings — each up to 120 s. They kept SQLite's pages out of the ZFS cache, so search hydration (primary-key
// lookups) took 200–1000 ms and searches 5–15 s (10-19). A probe that was SLOW last time reuses its last result for up to
// an hour; fast probes stay live every run. Times in params are normalised so "since <now − 24h>" keys stay stable. Pure but fs.
import { readFileSync, writeFileSync } from 'fs';

const isTime = (v) => (typeof v === 'number' && v > 1e9) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v));
export const probeKey = (sql, params = []) => `${sql}|${JSON.stringify((params || []).map((v) => (isTime(v) ? '<time>' : v)))}`;

export function slowProbeCache(file, { slowMs = 2000, ttlMs = 60 * 60 * 1000, now = () => Date.now() } = {}) {
  let cache = {};
  try { cache = JSON.parse(readFileSync(file, 'utf8')); } catch { cache = {}; }
  const stats = { reused: 0, ran: 0 };
  const wrap = (fn) => async (sql, params, name) => {
    const k = probeKey(sql, params);
    const c = cache[k];
    if (c && c.ms >= slowMs && now() - c.at < ttlMs) { stats.reused++; return c.v; }
    const t = now();
    const v = await fn(sql, params, name);
    // a slow probe keeps the time it was MEASURED, so it reruns once the hour is up
    cache[k] = { v, ms: now() - t, at: now() };
    stats.ran++;
    return v;
  };
  const save = () => {
    for (const [k, c] of Object.entries(cache)) if (now() - c.at > 6 * ttlMs) delete cache[k];
    try { writeFileSync(file, JSON.stringify(cache)); } catch { /* next run measures again */ }
  };
  return { wrap, save, stats };
}
