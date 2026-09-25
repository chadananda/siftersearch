// Planned search: ONE Jev plan (search-plan.js) → result cache → narrow-then-relax (search-scope.js) over the
// multi-index engine with the plan's layers (keyword for quotes, HyPE, diversity only when unscoped).
// Deps: search-plan, search-scope; search.js + answer-cache.js loaded lazily so this stays unit-testable.
import { planSearch, layersFor } from './search-plan.js';
import { relaxScope } from './search-scope.js';

const TTL_MS = 10 * 60 * 1000;
const MAX = 500;
const cache = new Map();
export const clearPlannedCache = () => cache.clear();

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {string} query            what to search for
 * @param {object} o
 * @param {Array}  [o.messages]     the conversation — scope is inferred from it, not just the query
 * @param {object} [o.given]        caller filters (model tool args, explicit API filters) — always win
 * @returns {{hits, plan, layers, widened, relaxed, narrowCount, cached, timings}}
 */
export async function plannedSearch(query, { messages, given = {}, limit = 10, scope_config, entityIds, planner = planSearch, engine, minResults = 3 } = {}) {
  const t0 = Date.now();
  const plan = await planner(messages?.length ? messages : query, { given });
  const layers = layersFor(plan);
  const planMs = Date.now() - t0;

  const { SEARCH_VERSION = '' } = engine ? {} : await import('./answer-cache.js').catch(() => ({}));
  const key = JSON.stringify([SEARCH_VERSION, fold(query), plan.filters, plan.shape, limit, scope_config || null, entityIds || null]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.value, cached: true, timings: { plan_ms: planMs, search_ms: 0, total_ms: Date.now() - t0 } };
  }

  const run = engine || (await import('./search.js')).multiIndexSearch;
  const t1 = Date.now();
  const r = await relaxScope(plan.filters, async (filters) => {
    const res = await run(query, {
      limit, filters, scope_config,
      ...(entityIds?.length ? { entityIds } : {}),
      keywordLayer: layers.keyword, hype: layers.hype, diversify: layers.diversify, includeMatchedHype: true,
    });
    return res?.hits || [];
  }, { min: Math.min(minResults, limit) });

  const value = {
    hits: r.results, plan, layers,
    widened: r.widened, relaxed: r.relaxed, narrowCount: r.narrowResults.length, scopeUsed: r.scope,
  };
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return { ...value, cached: false, timings: { plan_ms: planMs, search_ms: Date.now() - t1, total_ms: Date.now() - t0 } };
}
