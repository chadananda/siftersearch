// Search trace — one durable row per search, detailed enough to reconstruct WHY it returned what it did.
//
// Chad: "search quality is vitally important … we can only [iterate] if we have very good metrics and paths
// of search strategy and timings."
//
// WHAT WAS MISSING. `search_log` recorded query, result_count, duration_ms, search_type, filters — nothing
// about strategy. And SOURCE_STATS in search.js, which DOES track whether HyPE or the main index led, lived
// only in process memory: lost on every restart, never queryable. On 2026-09-24 that cost most of a day —
// a search returned the wrong tradition and there was no way to tell whether the HyPE layer had contributed,
// so the wrong suspect was chased. `_layers` was computed and then stripped by the response schema.
//
// A trace answers, for ONE search: which layers ran, which layer FOUND the top hit, what the filters were and
// where they came from, where the milliseconds went, whether it came from cache, and at which engine version.
// That turns a quality argument into an attribution.
//
// TRACING MUST NEVER BREAK A SEARCH. buildTrace tolerates partial input and recordTrace is fire-and-forget.
//
// Deps: db (write via query(), single-writer routed), logger. Read API: routes/admin.js search-trace endpoints.
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const num = (v) => (Number.isFinite(v) ? v : 0);
const j = (v) => { try { return v == null ? null : JSON.stringify(v); } catch { return null; } };

/**
 * Which layer found the top hit? This is the number that tells you whether HyPE earns its weight.
 * A layer "led" when it ranked the top hit better than the others did (absent = did not find it at all).
 */
export function topLayer(hit) {
  const r = hit?._layerRanks || {};
  const cands = [['main', r.main], ['hype', r.hype], ['entity', r.entity]]
    .filter(([, v]) => typeof v === 'number');
  if (!cands.length) return 'none';
  return cands.sort((a, b) => a[1] - b[1])[0][0];
}

/** Shape one trace row. Pure; never throws. */
export function buildTrace({
  traceId, endpoint, query, searchVersion, cacheStatus, filters, filtersSource,
  layers, timings, hits, relaxed, userId, apiKeyId,
} = {}) {
  const top = (hits || [])[0] || null;
  const layer = top ? topLayer(top) : 'none';
  return {
    trace_id: traceId || randomUUID(),
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
    hype_led: layer === 'hype' ? 1 : 0,
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
  };
}

/** Fire-and-forget write. A tracing failure is logged and swallowed — never surfaced to the caller. */
export async function recordTrace(row) {
  try {
    const { query: dbQuery } = await import('./db.js');
    const cols = Object.keys(row);
    await dbQuery(
      `INSERT INTO search_trace (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => row[c]),
      'search-trace:insert',
    );
  } catch (err) {
    const { logger } = await import('./logger.js');
    logger.warn({ err: err.message }, 'search-trace write failed (search unaffected)');
  }
  return row.trace_id;
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
