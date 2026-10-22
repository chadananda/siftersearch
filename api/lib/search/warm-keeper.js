// Search warm keeper: the in-memory indexes a search reads (concept lexicon, who-met-whom encounter index) are loaded and
// refreshed on a timer in the background, never by a search — a TTL refresh triggered by a request made that request pay
// for it (the first search of a fresh API process took 6–10 s while the lexicon load ran beside it, 10-22). Deps: concepts, encounters.
import { logger } from '../logger.js';

export const KEEP_EVERY_MS = 20 * 60 * 1000;   // under the 30-minute TTLs, so a search never finds them stale

/** One refresh pass; each loader injectable for tests. Failures are logged, never thrown. */
export async function keepWarm({
  lexicon = async () => (await import('./concepts.js')).refreshLexicon(),
  encounters = async () => (await import('../encounters.js')).refreshEncounterIndex(),
} = {}) {
  const out = {};
  for (const [name, fn] of Object.entries({ lexicon, encounters })) {
    const t = Date.now();
    try { await fn(); out[name] = Date.now() - t; } catch (err) { out[name] = null; logger.warn({ err: err.message, index: name }, 'warm keeper: refresh failed'); }
  }
  return out;
}

/** Start the timer (unref'd: it never holds a draining process open). Returns a stop function. */
export function startWarmKeeper({ everyMs = KEEP_EVERY_MS, run = keepWarm } = {}) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { const ms = await run(); logger.info({ ms }, 'warm keeper: search indexes refreshed'); } finally { busy = false; }
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
