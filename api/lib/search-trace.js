// Search trace — one durable row per search, detailed enough to reconstruct WHY it returned what it did.
//
// Chad: "search quality is vitally important … we can only [iterate] if we have very good metrics and paths
// of search strategy and timings." (09-24) — and (11-04) "There is no reason you should have to write code to
// check search history": so a row also keeps its RANKED LIST (top 20, compact) and WHO asked (the Anís thread,
// turn, route, tool), and replay re-runs it on today's code (search/trace-replay.js).
//
// A trace answers, for ONE search: which layers ran, which layer FOUND the top hit, what the filters were and
// where they came from, where the milliseconds went, whether it came from cache, at which engine version, what
// it returned in which order (hits_json), and which Anís turn/tool asked for it.
//
// TRACING MUST NEVER BREAK OR SLOW A SEARCH. buildTrace tolerates partial input and is pure; recordTrace is
// fire-and-forget through the single writer; the context rides AsyncLocalStorage (ai-context.js) — no extra query.
//
// Deps: repos/search-trace-repo (write + reads), ai-context (the ambient trace context), assistant/source-tier.
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { currentAIContext, withAIContext } from './ai-context.js';
import { sourceTier, tierGap } from './assistant/source-tier.js';

const num = (v) => (Number.isFinite(v) ? v : 0);
const j = (v) => { try { return v == null ? null : JSON.stringify(v); } catch { return null; } };
const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

export const HITS_KEPT = 20;
// sourceTier → one letter in the stored list (W writings, G Guardian, C a Writings compilation's unattributed passage,
// R reported, H House, S secondary, null other tradition; X = NO TIER READABLE: the document has no religion — tierGap)
const TIER_CODE = { writings: 'W', guardian: 'G', compilation: 'C', reported: 'R', house: 'H', secondary: 'S' };
export const TIER_NAME = Object.fromEntries(Object.entries(TIER_CODE).map(([k, v]) => [v, k]));
export const GAP_CODE = 'X';

// TIER GAPS (11-04 digest #227/#242): a hit whose document carries no religion has no readable standing — it is silently
// neither a Writing nor commentary. Counted per process and logged LOUDLY once per document (a metadata defect to fix at
// the library, never guessed at search time). tierGapStats() → { hits, docs, sample }.
const gapDocs = new Set();
let gapHits = 0;
export const tierGapStats = () => ({ hits: gapHits, docs: gapDocs.size, sample: [...gapDocs].slice(0, 20) });
function noteGap(h) {
  gapHits++;
  const doc = h.doc_id ?? h.document_id ?? null;
  if (doc == null || gapDocs.has(doc) || gapDocs.size >= 5000) return;
  gapDocs.add(doc);
  import('./logger.js').then(({ logger }) => logger.warn({ doc_id: doc, title: h.title ? String(h.title).slice(0, 120) : null, author: h.author ?? null },
    'search hit has NO source tier: its document has no religion (metadata gap — fix the document, the tier cannot be read)')).catch(() => {});
}

/**
 * Which layer found the top hit? This is the number that tells you whether HyPE earns its weight.
 * A layer "led" when it ranked the top hit better than the others did (absent = did not find it at all).
 * Every layer the engine reports counts (the Qdrant layers too — before 11-04 only main/hype/entity were read, so a
 * Qdrant-path search always traced top1_layer 'none').
 */
export function topLayer(hit) {
  const r = hit?._layerRanks || {};
  const cands = Object.entries(r).filter(([, v]) => typeof v === 'number');
  if (!cands.length) return 'none';
  return cands.sort((a, b) => a[1] - b[1])[0][0];
}
const isHypeLayer = (l) => l === 'hype' || l === 'qhype';

/** One hit → [para_id, doc_id, score, layer, tier] — ~60 bytes; titles hydrate on read from docs. */
export function compactHit(h = {}) {
  const score = h._rrfScore ?? h.score ?? h._score ?? null;
  let tier = null;
  try {
    tier = TIER_CODE[sourceTier(h)] ?? null;
    if (!tier && !h._stub && tierGap(h)) { tier = GAP_CODE; noteGap(h); }
  } catch { /* a tier is decoration, never a failure */ }
  return [h.paragraph_id ?? h.id ?? null, h.doc_id ?? h.document_id ?? null,
    typeof score === 'number' ? Math.round(score * 1e5) / 1e5 : null, h._layerRanks ? topLayer(h) : (h._layer ?? null), tier];
}

/** Stored list → readable rows (titles from a Map(doc_id → {title, author}) when given). */
export function expandHits(json, titles = new Map()) {
  const arr = Array.isArray(json) ? json : parse(json) || [];
  return arr.map(([para_id, doc_id, score, layer, tier], i) => {
    const d = titles.get(Number(doc_id));
    // a layer hit carries no author, so its tier is read from the document (same rule, sourceTier)
    let t = TIER_NAME[tier] ?? null;
    let gap = tier === GAP_CODE ? 'no-religion' : null;
    if (!t && !gap && d) {
      try { t = sourceTier({ author: d.author, title: d.title, collection: d.collection, religion: d.religion }); } catch { t = null; }
      if (!t && 'religion' in d) gap = tierGap({ ...d, doc_id }) ?? null;
    }
    // collection + religion shown (already read): a tier is decided by them, so a replay shows WHY a hit has the tier it has
    const meta = d ? { ...('collection' in d ? { collection: d.collection ?? null } : {}), ...('religion' in d ? { religion: d.religion ?? null } : {}) } : {};
    return { rank: i + 1, doc_id, para_id, title: d?.title ?? null, author: d?.author ?? null, ...meta, tier: t, ...(gap ? { tier_gap: gap } : {}), layer, score };
  });
}

// engine options that can be replayed (JSON-safe; functions, trace plumbing and per-request objects dropped)
const REPLAY_DROP = new Set(['traceEndpoint', 'noTrace', 'filtersSource', 'signal', 'messages']);
export function replayOptions(options = {}) {
  const out = {};
  for (const [k, v] of Object.entries(options || {})) {
    if (REPLAY_DROP.has(k) || typeof v === 'function' || v === undefined) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Shape one trace row. Pure; never throws. ctx = the ambient trace context ({thread, turn, route, tool, step, parent}). */
export function buildTrace({
  traceId, endpoint, query, searchVersion, cacheStatus, filters, filtersSource,
  layers, timings, hits, relaxed, userId, apiKeyId, options, ctx = {},
} = {}) {
  const top = (hits || [])[0] || null;
  const layer = top ? topLayer(top) : 'none';
  const id = traceId || randomUUID();
  let hitsJson = null;
  try { hitsJson = hits?.length ? JSON.stringify(hits.slice(0, HITS_KEPT).map(compactHit)) : null; } catch { hitsJson = null; }
  return {
    trace_id: id,
    endpoint: endpoint || 'unknown',
    query: query == null ? null : String(query).slice(0, 500),
    query_hash: query ? createHash('sha256').update(String(query).toLowerCase().trim()).digest('hex').slice(0, 16) : null,
    search_version: searchVersion || null,
    cache_status: cacheStatus || 'miss',
    filters_json: j(filters && Object.keys(filters).length ? filters : null),
    // 'caller' = the client/model passed them; 'inferred' = we derived them from the conversation. Auditing
    // inferred scope separately matters: a wrong inference silently hides most of the corpus.
    filters_source: filtersSource || (filters && Object.keys(filters).length ? 'caller' : 'none'),
    layers_json: j(layers || null),
    top1_layer: layer,
    hype_led: isHypeLayer(layer) ? 1 : 0,
    timings_json: j(timings || null),
    total_ms: num(timings?.total),
    result_count: (hits || []).length,
    top1_doc_id: top?.doc_id ?? top?.document_id ?? null,
    top1_title: top?.title ? String(top.title).slice(0, 200) : null,
    top1_authority: typeof top?.authority === 'number' ? top.authority : null,
    relaxed_json: j(relaxed?.length ? relaxed : null),
    widened: relaxed?.length ? 1 : 0,
    user_id: userId ?? null,
    api_key_id: apiKeyId ?? null,
    hits_json: hitsJson,
    options_json: j(replayOptions(options)),
    thread_id: ctx.thread ?? null,
    turn_id: ctx.turn ?? null,
    route: ctx.route ? String(ctx.route).slice(0, 80) : null,
    tool: ctx.tool ?? null,
    step: ctx.step ?? null,
    parent_trace: ctx.parent && ctx.parent !== id ? ctx.parent : null,
  };
}

/** Fire-and-forget write. A tracing failure is logged and swallowed — never surfaced to the caller. */
export async function recordTrace(row) {
  try {
    const { insertTrace } = await import('./repos/search-trace-repo.js');
    await insertTrace(row);
  } catch (err) {
    const { logger } = await import('./logger.js');
    logger.warn({ err: err.message }, 'search-trace write failed (search unaffected)');
  }
  return row.trace_id;
}

/** The ambient trace context (who is searching): set by the Anís turn, tools and planned search. */
export const traceContext = () => currentAIContext().trace || {};

/** Run `fn` with `patch` merged into the trace context (thread/turn/route/tool/step/parent). */
export const withSearchContext = (patch, fn) => withAIContext({ trace: { ...traceContext(), ...patch } }, fn);

/** The live search path's one call: shape a trace from a finished search and record it (fire-and-forget; `record` injectable). */
export function traceSearch({ options = {}, query, filters, layers, timings, hits, traceId, ctx }, record = recordTrace) {
  const requested = ['keywordLayer', 'phraseLayer', 'qdrantKeyword', 'qdrantHype', 'hype', 'conceptLayer'].filter((k) => options[k]);
  return record(buildTrace({ traceId, endpoint: options.traceEndpoint || 'multi-index', query, searchVersion: process.env.SEARCH_VERSION || null, filters,
    filtersSource: options.filtersSource, layers: { ...layers, requested }, timings, hits, options, ctx: ctx ?? traceContext() }));
}

/**
 * A raw layer call made by an Anís tool (literal/phrase/hype search, the quotation trace's lookups) — traced as
 * `layer:<name>` ONLY inside a tool context, so the library's own internal layer calls add no rows. Returns `res`.
 */
export function traceLayer(name, query, args, res, ms) {
  try {
    const ctx = traceContext();
    if (!ctx.tool || process.env.NODE_ENV === 'test') return res;
    const hits = Array.isArray(res) ? res : res?.hits || [];
    traceSearch({ options: { traceEndpoint: `layer:${name}`, ...(args && typeof args === 'object' ? args : {}) }, query, filters: args?.filters,
      layers: { [name]: hits.length }, timings: { total: ms ?? 0 }, hits: hits.map((h) => ({ ...h, _layer: h._layer ?? name })), ctx }).catch?.(() => {});
  } catch { /* never */ }
  return res;
}

/** Wrap an async layer function so each call by a tool is traced (see traceLayer). */
export const tracedLayer = (name, fn) => async (query, args = {}, ...rest) => {
  const t = Date.now();
  const res = await fn(query, args, ...rest);
  return traceLayer(name, query, args, res, Date.now() - t);
};

/** A stored row → readable (JSON columns parsed; hits expanded with titles when a Map is given). */
export function expandTrace(r, titles) {
  if (!r) return r;
  const { hits_json, options_json, filters_json, layers_json, timings_json, relaxed_json, ...rest } = r;
  return { ...rest, filters: parse(filters_json), layers: parse(layers_json), timings: parse(timings_json), relaxed: parse(relaxed_json),
    options: parse(options_json), hits: hits_json ? expandHits(hits_json, titles) : null };
}

/** Every doc id in some rows' ranked lists (to hydrate titles in one read). */
export const hitDocIds = (rows = []) => rows.flatMap((r) => (parse(r?.hits_json) || []).map((h) => h[1])).filter((d) => d != null);

/**
 * Old ranked list vs new: per passage its old rank, new rank and the move (+ = climbed), plus what dropped out and what
 * came in. Keyed by paragraph (doc when a hit has none). Pure.
 */
export function rankDiff(oldHits = [], newHits = []) {
  const key = (h) => (h.para_id != null ? `p${h.para_id}` : `d${h.doc_id}`);
  const oldAt = new Map(oldHits.map((h, i) => [key(h), i + 1]));
  const newAt = new Map(newHits.map((h, i) => [key(h), i + 1]));
  const rows = newHits.map((h, i) => {
    const was = oldAt.get(key(h)) ?? null;
    return { ...h, rank: i + 1, old_rank: was, move: was == null ? 'new' : was - (i + 1) };
  });
  const dropped = oldHits.filter((h) => !newAt.has(key(h))).map((h) => ({ ...h, old_rank: oldAt.get(key(h)) }));
  const same = oldHits.length === newHits.length && rows.every((r) => r.move === 0);
  return { same, top1_changed: key(oldHits[0] || {}) !== key(newHits[0] || {}), kept: rows.filter((r) => r.move !== 'new').length,
    entered: rows.filter((r) => r.move === 'new').length, dropped_count: dropped.length, rows, dropped };
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);

/** The aggregate a dev agent reads to see whether search is getting better. */
export function summarizeTraces(rows = []) {
  const n = rows.length || 1;
  const lat = rows.map((r) => num(r.total_ms)).sort((a, b) => a - b);
  const layerCounts = {};
  let zero = 0, cached = 0, widened = 0;
  for (const r of rows) {
    layerCounts[r.top1_layer || 'none'] = (layerCounts[r.top1_layer || 'none'] || 0) + 1;
    if (!num(r.result_count)) zero++;
    if (r.cache_status && r.cache_status !== 'miss') cached++;
    if (num(r.widened)) widened++;
  }
  return {
    searches: rows.length,
    latency: { p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: lat[lat.length - 1] || 0 },
    // The single most important quality number: a search that returns nothing reads to a user as
    // "the corpus does not have it", which is usually false.
    zero_result_rate: zero / n,
    cache_hit_rate: cached / n,
    widened_rate: widened / n,
    top1_layer: layerCounts,
  };
}
