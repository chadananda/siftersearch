// The agent's tool-result cache (Chad 11-12: strategies stay the cached, measured layer). In-process LRU keyed by name + canonical JSON args,
// TTL 6 h, 5000 entries. Never caches an error or an empty result (a deadline's fallback is []). callScope() tallies hit/miss per tool call.
import { AsyncLocalStorage } from 'node:async_hooks';
import { currentPrefer } from '../prefer-store.js';

export const TTL_MS = 6 * 3600 * 1000, MAX_ENTRIES = 5000;
const scope = new AsyncLocalStorage();

/** Stable JSON: object keys sorted, undefined dropped. Pure. */
export const canonicalJson = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const empty = (v) => v == null || (Array.isArray(v) && !v.length);

export function toolCache({ ttl = TTL_MS, max = MAX_ENTRIES, now = Date.now } = {}) {
  const m = new Map();   // key → { v, at }; Map order = recency
  const totals = { hits: 0, misses: 0 };
  /** fn wrapped: same name + args within the TTL → the stored value (not recomputed). */
  const wrap = (name, fn) => async (...args) => {
    // results carry links ranked for the reader's site (prefer-store.js): one cache entry per site, never another site's order
    const pf = currentPrefer(), key = `${name}${pf ? `@${pf.join(',')}` : ''}:${canonicalJson(args)}`, e = m.get(key), t = now(), s = scope.getStore();
    if (e && t - e.at < ttl) { m.delete(key); m.set(key, e); totals.hits++; if (s) s.hit++; return e.v; }
    totals.misses++; if (s) s.miss++;
    const v = await fn(...args);   // a throw passes through: nothing stored
    if (!empty(v)) { m.set(key, { v, at: t }); while (m.size > max) m.delete(m.keys().next().value); }
    return v;
  };
  return { wrap, stats: () => ({ ...totals, size: m.size, max, ttl_ms: ttl }), clear: () => m.clear() };
}

/** Every function in an impl object, cached under `<prefix>.<key>`; other values pass through. */
export const cachedImpl = (impl, cache, prefix = 'impl') => Object.fromEntries(Object.entries(impl || {}).map(([k, f]) => [k, typeof f === 'function' ? cache.wrap(`${prefix}.${k}`, f) : f]));

/** Run one tool call; → { out, cache: 'hit'|'miss'|'partial'|'none' } by the cached calls made inside it. */
export async function callScope(fn) {
  const s = { hit: 0, miss: 0, parts: {} };
  const out = await scope.run(s, fn);
  return { out, parts: s.parts, cache: !s.hit && !s.miss ? 'none' : !s.miss ? 'hit' : !s.hit ? 'miss' : 'partial' };
}

/** Time spent in a named stage of the current tool call (summed; the step shows it as parts). Outside a call: nothing. */
export const part = (name, ms) => { const s = scope.getStore(); if (s?.parts) s.parts[name] = (s.parts[name] || 0) + Math.round(ms); };

export const agentCache = toolCache();
