// Search hydration OFF the serving thread (11-04). better-sqlite3 is synchronous: the hydrate read (search:hydrate, ~20 ms,
// ~150 paragraphs) + highlighting ran on the API's event loop WHILE sibling engine calls' Qdrant fetches were in flight, so
// those fetches' wall time (qdrant_by) read 200-300 ms p95 against Qdrant's own 10-20 ms. The read pool (read-pool.js, task
// 'hydrate') now runs paragraphsByIds + highlightText; the main thread only receives the documents.
// Tests / SIFTER_READ_THREADS=0 → in-process (same code). Deps: paragraphs-repo, highlighting, read-pool.
import { highlightText } from './highlighting.js';
import { runRead, warmReadPool, readPoolStats } from './read-pool.js';

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

/** Start the pool early (a serving process's warm-up). */
export const warmHydrateThreads = warmReadPool;

/** Hydrate's share of the pool's numbers (shape kept from the first version). */
export function hydrateThreadStats() {
  const { threads, failures, tasks } = readPoolStats();
  const s = tasks.hydrate || {};
  return { thread: s.thread || 0, inProcess: s.inProcess || 0, fallback: s.fallback || 0, read_ms: s.read_ms || 0, read_max_ms: s.max_ms || 0,
    highlight_ms: s.highlight_ms || 0, threads, failures };
}
