// Search hydration OFF the serving thread (11-04). better-sqlite3 is synchronous: the hydrate read (search:hydrate, ~20 ms,
// ~150 paragraphs) + highlighting ran on the API's event loop WHILE sibling engine calls' Qdrant fetches were in flight, so
// those fetches' wall time (qdrant_by) read 200-300 ms p95 against Qdrant's own 10-20 ms. The read pool (read-pool.js, task
// 'hydrate') now runs paragraphsByIds + highlightText; the main thread only receives the documents.
// 11-04 (digest #167): search reads BODIES only (no query → no highlight on the thread) through a short-lived id cache
// (repeat searches in one Anís turn re-read the same paragraphs); search.js highlights only the final top-k. hydrateBodies
// reports the split {ids, cached, read, wait} so the hydrate stage shows queueing vs the read itself.
// Tests / SIFTER_READ_THREADS=0 → in-process (same code). Deps: paragraphs-repo, highlighting, read-pool.
import { highlightText } from './highlighting.js';
import { runRead, runReadTimed, warmReadPool, readPoolStats } from './read-pool.js';

/** The work itself, wherever it runs: live paragraphs for `ids` (paragraphs-repo shape) with the query terms marked. */
export async function hydrateInProcess(ids, query, timing = null) {
  const { paragraphsByIds } = await import('../paragraphs-repo.js');
  const t0 = performance.now();
  const docs = await paragraphsByIds(ids);
  const t1 = performance.now();
  const out = query ? docs.map((doc) => ({ ...doc, _formatted: { text: highlightText(doc.text, query) } })) : docs;   // no query → bodies only
  if (timing) { timing.read = t1 - t0; timing.highlight = performance.now() - t1; }
  return out;
}

/** Hydrated, highlighted paragraphs for `ids` — on a read-pool thread when the pool is on, else in-process. */
export const hydrateParagraphs = (ids, query) => runRead('hydrate', ids, query);

// ── id → body cache (main thread). A paragraph's text changes only on re-ingest; a 2-minute copy is safe for search.
const CACHE_MAX = 2000;
const cacheTtl = () => {
  const v = process.env.SIFTER_HYDRATE_CACHE_MS;
  if (v != null && v !== '') return Math.max(0, Number(v) || 0);
  return process.env.NODE_ENV === 'test' || process.env.VITEST ? 0 : 120_000;
};
const cache = new Map();   // String(id) → { doc, at } — Map order = recency (re-set on hit)
let cacheHits = 0, cacheMisses = 0;
export const clearHydrateCache = () => { cache.clear(); cacheHits = 0; cacheMisses = 0; };
export const hydrateCacheStats = () => ({ size: cache.size, hits: cacheHits, misses: cacheMisses, ttl_ms: cacheTtl() });

/** Paragraph bodies for `ids` (paragraphs-repo shape, NOT highlighted), cached by id. Fills `by` with
 *  {ids, cached, read, wait}: ids asked, served from cache, ms inside the read thread, ms waiting for a thread. */
export async function hydrateBodies(ids, by = null) {
  const ttl = cacheTtl(), now = Date.now();
  const out = [], miss = [];
  for (const id of ids) {
    const k = String(id), c = ttl ? cache.get(k) : null;
    if (c && now - c.at < ttl) { cache.delete(k); cache.set(k, c); out.push(c.doc); } else miss.push(id);
  }
  cacheHits += out.length; cacheMisses += miss.length;
  let read = 0, wait = 0;
  if (miss.length) {
    const t0 = performance.now();
    const { value, timing } = await runReadTimed('hydrate', miss, null);
    const wall = performance.now() - t0;
    read = timing?.read ?? wall; wait = Math.max(0, wall - (timing?.total ?? wall));
    for (const doc of value) {
      out.push(doc);
      if (ttl) { cache.set(String(doc.id), { doc, at: now }); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
    }
  }
  if (by) Object.assign(by, { ids: ids.length, cached: ids.length - miss.length, read: Math.round(read), wait: Math.round(wait) });
  return out;
}

/** One hit's query terms marked (search.js calls this for the final top-k only). */
export const highlightDoc = (doc, query) => (query && doc?.text ? { ...doc, _formatted: { ...(doc._formatted || {}), text: highlightText(doc.text, query) } } : doc);

/** Start the pool early (a serving process's warm-up). */
export const warmHydrateThreads = warmReadPool;

/** Hydrate's share of the pool's numbers (shape kept from the first version). */
export function hydrateThreadStats() {
  const { threads, failures, tasks } = readPoolStats();
  const s = tasks.hydrate || {};
  return { thread: s.thread || 0, inProcess: s.inProcess || 0, fallback: s.fallback || 0, read_ms: s.read_ms || 0, read_max_ms: s.max_ms || 0,
    highlight_ms: s.highlight_ms || 0, threads, failures };
}
