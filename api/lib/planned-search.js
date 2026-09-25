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

const foldTok = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set('a an and or of the to in on at for by with from is are be as that this what whats does do did say says said about tell me my his her their its how why when where who which on upon into'.split(' '));

/** Words that name the preferred author (aliases + label), folded — they are the FILTER, not the subject. */
function nameWords(prefer) {
  return new Set([prefer.author, ...(prefer.aliases || [])].flatMap((a) => foldTok(a).split(' ')).filter(Boolean));
}
/** The query minus the author's name: under an author filter the name is redundant, and partial matching then
 *  dropped the SUBJECT ("justice") instead. */
export function withoutAuthor(query, prefer) {
  const names = nameWords(prefer);
  const kept = String(query).split(/\s+/).filter((t) => !foldTok(t).split(' ').every((w) => names.has(w)));
  return kept.join(' ').trim() || query;
}
/** Subject terms: content words of the query that are not the author's name. */
export function subjectTerms(query, prefer) {
  const names = nameWords(prefer);
  return foldTok(query).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !names.has(w));
}
const onSubject = (hit, terms) => {
  if (!terms.length) return true;
  const t = foldTok(hit.text);
  return terms.some((w) => new RegExp(`(^| )${w.length > 4 ? w.replace(/(es|s)$/, '') : w}`).test(t));
};

/**
 * Preferred author first, everything else KEPT. The author's own words rank ahead; a compilation, biography or
 * newsletter that quotes them still appears — that is often where a half-remembered tablet actually is. Pure.
 */
export function preferAuthor(authorHits, broadHits, aliases, limit, terms = []) {
  const seen = new Set();
  const mine = [], others = [];
  // Promoted = BY the author AND on the question's subject; "his words first" means his words on THIS.
  for (const h of [...authorHits.filter((x) => onSubject(x, terms)), ...broadHits]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const isMine = byAuthor(h, aliases) && onSubject(h, terms);
    (isMine ? mine : others).push({ ...h, _authorMatch: byAuthor(h, aliases) });
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
  const search = async (filters, q = query) => {
    const res = await run(q, {
      limit, filters, scope_config,
      ...(entityIds?.length ? { entityIds } : {}),
      keywordLayer: layers.keyword, hype: layers.hype, diversify: layers.diversify, includeMatchedHype: true,
    });
    return res?.hits || [];
  };
  // With a preferred author, the author-matched search runs BESIDE the broad one, never instead of it.
  const [r, authorHits] = await Promise.all([
    relaxScope(plan.filters, search, { min: Math.min(minResults, limit) }),
    plan.prefer ? search({ ...plan.filters, author: plan.prefer.aliases[0] }, withoutAuthor(query, plan.prefer)).catch(() => []) : Promise.resolve([]),
  ]);
  const hits = plan.prefer ? preferAuthor(authorHits, r.results, plan.prefer.aliases, limit, subjectTerms(query, plan.prefer)) : r.results;

  const value = {
    hits, plan, layers,
    widened: r.widened, relaxed: r.relaxed, narrowCount: r.narrowResults.length, scopeUsed: r.scope,
  };
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return { ...value, cached: false, timings: { plan_ms: planMs, search_ms: Date.now() - t1, total_ms: Date.now() - t0 } };
}
