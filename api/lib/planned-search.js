// Planned search: ONE Jev plan (search-plan.js) → result cache → narrow-then-relax (search-scope.js) over the
// multi-index engine with the plan's layers (keyword for quotes, HyPE, diversity only when unscoped).
// Deps: search-plan, search-scope; search.js + answer-cache.js loaded lazily so this stays unit-testable.
import { planSearch, layersFor } from './search-plan.js';
import { relaxScope } from './search-scope.js';

const TTL_MS = 10 * 60 * 1000;
const MAX = 500;
const cache = new Map();
export const clearPlannedCache = () => cache.clear();

// Same folding as search.js authorMatches: diacritics, apostrophe style and punctuation never decide a match.
const foldName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
const byAuthor = (hit, aliases) => aliases.some((a) => foldName(hit.author).includes(foldName(a)));

/**
 * Preferred author first, everything else KEPT. The author's own words rank ahead; a compilation, biography or
 * newsletter that quotes them still appears — that is often where a half-remembered tablet actually is. Pure.
 */
export function preferAuthor(authorHits, broadHits, aliases, limit) {
  const seen = new Set();
  const mine = [], others = [];
  for (const h of [...authorHits, ...broadHits]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    (byAuthor(h, aliases) ? mine : others).push({ ...h, _authorMatch: byAuthor(h, aliases) });
  }
  return [...mine, ...others].slice(0, limit);
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {string} query            what to search for
 * @param {object} o
 * @param {Array}  [o.messages]     the conversation — scope is inferred from it, not just the query
 * @param {object} [o.given]        caller filters (model tool args, explicit API filters) — always win
 * @returns {{hits, plan, layers, widened, relaxed, narrowCount, cached, timings}}
 */
export async function plannedSearch(query, { messages, given = {}, defaults = {}, limit = 10, scope_config, entityIds, planner = planSearch, engine, minResults = 3 } = {}) {
  const t0 = Date.now();
  const plan = await planner(messages?.length ? messages : query, { given });
  // Site default (an embedding site's home tradition): fills in only when the question named none and is not a
  // comparison. It is a scope like any other, so the relax ladder still widens it when the site's texts are thin.
  if (defaults?.religion && !plan.filters.religion && !plan.comparative) {
    plan.filters = { ...plan.filters, religion: defaults.religion };
    plan.source = { ...plan.source, religion: 'site-default' };
  }
  const layers = layersFor(plan);
  const planMs = Date.now() - t0;

  const { SEARCH_VERSION = '' } = engine ? {} : await import('./answer-cache.js').catch(() => ({}));
  const key = JSON.stringify([SEARCH_VERSION, fold(query), plan.filters, plan.prefer?.author || null, plan.shape, limit, scope_config || null, entityIds || null]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { ...hit.value, cached: true, timings: { plan_ms: planMs, search_ms: 0, total_ms: Date.now() - t0 } };
  }

  const run = engine || (await import('./search.js')).multiIndexSearch;
  const t1 = Date.now();
  const search = async (filters) => {
    const res = await run(query, {
      limit, filters, scope_config,
      ...(entityIds?.length ? { entityIds } : {}),
      keywordLayer: layers.keyword, hype: layers.hype, diversify: layers.diversify, includeMatchedHype: true,
    });
    return res?.hits || [];
  };
  // With a preferred author, the author-matched search runs BESIDE the broad one, never instead of it.
  const [r, authorHits] = await Promise.all([
    relaxScope(plan.filters, search, { min: Math.min(minResults, limit) }),
    plan.prefer ? search({ ...plan.filters, author: plan.prefer.aliases[0] }).catch(() => []) : Promise.resolve([]),
  ]);
  const hits = plan.prefer ? preferAuthor(authorHits, r.results, plan.prefer.aliases, limit) : r.results;

  const value = {
    hits, plan, layers,
    widened: r.widened, relaxed: r.relaxed, narrowCount: r.narrowResults.length, scopeUsed: r.scope,
  };
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return { ...value, cached: false, timings: { plan_ms: planMs, search_ms: Date.now() - t1, total_ms: Date.now() - t0 } };
}
