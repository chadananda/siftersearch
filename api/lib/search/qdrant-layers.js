// Qdrant search layers for multiIndexSearch (P4 of planning/phrase-index-plan.md), both opt-in until measured:
//   searchPhrases — Gemini Embedding 2 query vector → `phrases` (binary + rescoring), one best phrase per paragraph,
//                   with its span {start, end} for highlighting; searchKeywordQdrant — BM25 sparse on `paragraphs_kw`.
// Deps: keyword-tokens.js (same tokenizer as the index). Env: QDRANT_URL, QDRANT_KEY, GEMINI_API_KEY.
// :rules: query prefix "task: search result | query:" (measured; documents were embedded with "title: none | text:").
import { noteProviderError } from '../spend-alerts.js';
import { resilientFetch } from '../resilient-fetch.js';
import { bm25Query } from '../keyword-tokens.js';
import { excludedDocIds } from './excluded-docs.js';
import { docIdsInYearRange } from '../docs-repo.js';
import { logAIUsage } from '../ai-services.js';
import { assertSpendCap } from '../spend-caps.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const QD = () => process.env.QDRANT_URL || 'http://127.0.0.1:6333';
// PHASE 0 HOT LAYER (planning/storage-wear-ram-plan.md §6.6, Chad 10-21): until the MP44 arrives, NEW phrase points go to
// `phrases_hot` in a second Qdrant (qdrant-hot, storage on the /srv/qram RAM disk) while `phrases` on /fast stays frozen.
// Search reads both and merges; writes to `phrases` (deletes, payload stamps) are mirrored to the hot copy. Unset = off.
export const hotUrl = () => process.env.QDRANT_HOT_URL || '';
export const HOT_PHRASES = () => process.env.QDRANT_HOT_PHRASES || 'phrases_hot';
/** A `/collections/phrases/…` path → the same path on the hot collection; anything else → null. Pure. */
export const hotPath = (path) => (/^\/collections\/phrases\//.test(path) ? path.replace(/^\/collections\/phrases\//, `/collections/${HOT_PHRASES()}/`) : null);
/** Main + hot points as one list: best score first, one per point id (the hot copy is newer, so it wins a tie). Pure. */
export function mergePoints(main = [], hot = []) {
  const byId = new Map();
  for (const p of hot) byId.set(p.id, p);
  for (const p of main) if (!byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => b.score - a.score);
}
/** Grouped results (one hit per paragraph) from main + hot: best hit per group key, `limit` groups. Pure. */
export function mergeGroups(main = [], hot = [], limit = Infinity) {
  const best = new Map();
  for (const g of [...hot, ...main]) { const k = g.id; const cur = best.get(k); if (!cur || g.hits[0].score > cur.hits[0].score) best.set(k, g); }
  return [...best.values()].sort((a, b) => b.hits[0].score - a.hits[0].score).slice(0, limit);
}
let hotWarnedAt = 0;
const hotFailed = (err) => { if (Date.now() - hotWarnedAt > 300000) { hotWarnedAt = Date.now(); console.warn(`qdrant-hot unavailable — phrases from main only: ${err.message}`); } };
const MODEL = 'gemini-embedding-2', DIMS = 3072;

// Query vectors, LRU per process (11-03): the same text always embeds to the same vector, so hours of TTL lose nothing;
// a hit skips the Gemini call (p50 ~325 ms, p95 ~960 ms under load). 2k × 3072 numbers ≈ 50 MB per API instance.
export const EMBED_MEMO = Object.freeze({ max: 2000, ttlMs: 12 * 3600_000 });
/** LRU read: a fresh hit moves to the newest end; an expired one is dropped. Pure over (map, now). */
export function memoGet(map, key, now = Date.now(), ttlMs = EMBED_MEMO.ttlMs) {
  const hit = map.get(key);
  if (!hit) return undefined;
  map.delete(key);
  if (now - hit.at >= ttlMs) return undefined;
  map.set(key, hit);
  return hit.v;
}
/** LRU write: evicts the least recently used past `max`. */
export function memoSet(map, key, v, max = EMBED_MEMO.max, now = Date.now()) {
  map.delete(key);
  while (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, { at: now, v });
}
const memo = new Map();   // query → { at, v: Promise<vector> }
export function geminiQueryVector(text) {
  const key = String(text ?? '');
  const hit = memoGet(memo, key);
  if (hit) return hit;
  const p = assertSpendCap('search-query', { provider: 'google' }).then(() => resilientFetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ model: `models/${MODEL}`, content: { parts: [{ text: `task: search result | query: ${key}` }] }, outputDimensionality: DIMS }),
  }, { tries: 2, baseMs: 300 })).then(async (r) => {
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      noteProviderError('Gemini', { status: r.status, message: text });
      throw new Error(`gemini ${r.status} ${text.slice(0, 120)}`);
    }
    // Spend (every uncached query): the response carries no token count, so estimate ~4 chars/token.
    logAIUsage({ provider: 'google', model: MODEL, serviceType: 'embedding', caller: 'search-query', promptTokens: Math.ceil((key.length + 30) / 4) });
    return (await r.json()).embedding.values;
  }).catch((err) => { memo.delete(key); throw err; });
  memoSet(memo, key, p);
  return p;
}

// The author as a filter KEY: accents, apostrophe variants and punctuation folded away — the same folding search.js's
// authorMatches uses — so "Abdu'l-Bahá", "‘Abdu’l-Bahá" and "Abdu'l-Baha" are one author. Meili matches with CONTAINS over
// apostrophe variants; a Qdrant keyword match is exact, so points carry `author_fold` and the filter folds too.
// what fusion needs to weigh AUTHORITY from the outset (search/doctrinal-rank.js keyFactor): the writer, scope, collection
export const RANK_PAYLOAD = ['author_fold', 'scope', 'collection'];
export const rankFields = (p = {}) => Object.fromEntries(RANK_PAYLOAD.filter((k) => p[k] != null).map((k) => [k, p[k]]));

export const authorKey = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2018\u2019\u02bc\u02bb`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

// Search filters (as search.js uses them) → a Qdrant filter. Keys the payloads lack (year, language label) are ignored.
// scope: 'primary' (library only) = NOT supplemental — library points written before `scope` existed carry none, and a
// bulk re-stamp of millions of points did not complete under load, so absence must mean library. 'supplemental' = the
// scraped sites only (every one of those points is stamped at write time); omitted = both.
export function toQdrantFilter(filters = {}) {
  const must = [], must_not = [];
  if (filters.scope === 'primary') must_not.push({ key: 'scope', match: { value: 'supplemental' } });
  else if (filters.scope === 'supplemental') must.push({ key: 'scope', match: { value: 'supplemental' } });
  const eq = (key, v) => must.push(Array.isArray(v) ? { key, match: { any: v } } : { key, match: { value: v } });
  if (filters.religion) eq('religion', filters.religion);
  if (filters.collection) eq('collection', filters.collection);
  // the asked author as WRITER or as a QUOTED voice (voices_fold, stamped by the indexer's stamp-voices job): the Báb quoted
  // in Mazindarani's history answers "what did the Báb say" (Chad 10-19). Points not yet stamped still match by author_fold.
  if (filters.author) {
    const keys = (Array.isArray(filters.author) ? filters.author : [filters.author]).map(authorKey);
    // writerOnly: the indexed author_fold alone — a fast, selective filter (the authoritative pass; 10-20 a should over the
    // then-unindexed voices_fold scanned 35M points and timed out on every query)
    must.push(filters.writerOnly ? { key: 'author_fold', match: { any: keys } }
      : { should: [{ key: 'author_fold', match: { any: keys } }, { key: 'voices_fold', match: { any: keys } }] });
  }
  const excl = filters.documentId == null ? excludedDocIds() : [];
  if (excl.length) must_not.push({ key: 'doc_id', match: { any: excl } });   // metadata indexes are not passages
  if (filters.documentId != null) eq('doc_id', Array.isArray(filters.documentId) ? filters.documentId.map(Number) : Number(filters.documentId));
  // lang_group is the paragraph's script group ('ar-fa', 'ja', 'zh', else the doc language); the Meili-style
  // `language` filter maps onto it so one filter means the same thing on both engines.
  const group = filters.langGroup || (filters.language ? (/^(ar|fa)/i.test(filters.language) ? 'ar-fa' : String(filters.language).toLowerCase()) : null);
  if (group) eq('lang_group', group);
  if (!must.length && !must_not.length) return undefined;
  return { ...(must.length ? { must } : {}), ...(must_not.length ? { must_not } : {}) };
}

/** Filters as search.js gives them → filters Qdrant can apply. A year range becomes a doc_id set from SQLite (points carry
 *  no year — adding one would mean a bulk payload rewrite of every point, which un-indexes the collection, 10-09). An empty
 *  range matches nothing. An explicit documentId wins. */
export async function resolveQdrantFilters(filters = {}) {
  if ((!filters.yearFrom && !filters.yearTo) || filters.documentId != null) return filters;
  const ids = await docIdsInYearRange({ yearFrom: filters.yearFrom, yearTo: filters.yearTo });
  return { ...filters, documentId: ids.length ? ids : [-1] };
}

// Vector search parameters per collection — ONE place, so latency/accuracy tuning is a change here (measured with
// scripts/search/qdrant-profile.mjs), never a copy of the query code. rescore re-reads full 3072-d vectors (on disk) for
// oversampling × limit candidates — the dominant cost; hnsw_ef null = Qdrant's default.
// 11-01 (tower, read-only bench, 10 random vectors, Bahá'í primary filter, limit 120): oversampling 2 vs 4 → top-30
// paragraphs agree 29–30/30 on phrases and hype; no rescore → ~22/30. Half the disk reads, and Qdrant is read-bound under
// the agent's parallel searches (6 at once → 1.4 s each, 30 → 4.8 s). concept: not measured, stays 4.
// 11-03 (tower, read-only, FRESH real vectors — a repeated vector is served from page cache and times ~5× too fast): the
// rescore read of on-disk originals is the cost (phrases limit 60: 27 ms with rescore, 10 without; payload ~2 ms; filter 0).
// oversampling 1 vs 4 (at limit×4): phrase ×2 top-30 28.4/30, top-10 9.4/10 (old ×4 os2: 29.3, 9.7); hype grouped
// 29.7/30 (os2 29.8). No rescore: 20.8/30 phrase, 24.4 hype — not acceptable. Cost: phrases 43 → 17 ms, hype 33 → 23 ms
// (conc 8: 155 → 40, 61 → 40). Only originals in RAM (hype ≈ 14–28 GB) get a rescored search near 10 ms.
// 11-04 (tower, read-only, 30 fresh real vectors, scripts/search/qdrant-knobs.mjs; planning/qdrant-10ms-plan-20261104.md):
// hnsw_ef 64 (default = ef_construct 100; a larger limit×oversampling still raises it, so the ×4 escalation is untouched):
// phrases 8.7 → 7.3 ms p50, 11.2 → 8.1 p95, top-30 overlap vs os4/ef512 0.990 → 0.983 (Bahá'í filter 0.994 → 0.990,
// doctrinal 0.982 = 0.982); hype 4.8 → 3.8 ms, 0.996 → 0.998; at 3 engine calls in flight phrases 15.1 → 13.3, hype 11.6 → 8.4.
// concept oversampling 4 → 2: 4.8 → 3.4 ms, top-30 vs EXACT 0.997 → 0.991; cold rescore reads halve.
export const SEARCH_PARAMS = Object.freeze({
  phrase: Object.freeze({ rescore: true, oversampling: 1, hnsw_ef: 64 }),
  hype: Object.freeze({ rescore: true, oversampling: 1, hnsw_ef: 64 }),
  concept: Object.freeze({ rescore: true, oversampling: 2, hnsw_ef: null }),
});
const searchParams = (p) => ({ quantization: { rescore: p.rescore, oversampling: p.oversampling }, ...(p.hnsw_ef ? { hnsw_ef: p.hnsw_ef } : {}) });

// UNCOMPRESSED replies (11-03, search-budget). Node's fetch sends `Accept-Encoding: gzip, deflate` unasked; Qdrant then
// gzips + chunks every reply and the call stalls ~40 ms once the body passes ~1-2 KB (tower, same query: 49-53 ms wall
// with gzip vs 7-11 ms identity). Loopback has no use for compression. Every Qdrant request uses these headers.
export const qdrantHeaders = (json = true) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), 'Accept-Encoding': 'identity', 'api-key': process.env.QDRANT_KEY || '' });

// Per-search log of every Qdrant call {collection, ms} — multiIndexSearch opens one (withQdrantCallLog) so the trace
// carries each call's wall + Qdrant's own time (latency-budget.js judges the own time: < 10 ms working, > 100 ms wrong). Outside a log: no cost.
const callLog = new AsyncLocalStorage();
export const withQdrantCallLog = (log, fn) => callLog.run(log, fn);

async function qdrant(path, body, timeoutMs = 2500, base = QD()) {
  const t = performance.now();
  const r = await fetch(base + path, { method: 'POST', headers: qdrantHeaders(),
    // 2.5 s: past the search budget a layer is dropped, not waited on — and the relax ladder re-runs the engine, so a stalled
    // Qdrant (a payload backfill or build beside it, 2026-10-04) cost 5 s per rung at the old 5 s.
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`qdrant ${path} ${r.status} ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  // server_ms = Qdrant's own time for the request: wall − server_ms is ours (event loop, transport, JSON)
  callLog.getStore()?.push({ collection: path.split('/')[2] || path, ms: Math.round(performance.now() - t),
    ...(typeof j.time === 'number' ? { server_ms: Math.round(j.time * 10_000) / 10 } : {}) });
  return j.result;
}

/** The collections passage search queries (main Qdrant); `phrases` also has its hot copy (phase 0). */
export const SEARCHED_COLLECTIONS = Object.freeze(['phrases', 'hype', 'concepts', 'paragraphs_kw']);

/** Points per doc for `docIds` in every searched collection (+ the hot phrases copy) — Qdrant facet on the indexed doc_id,
 *  exact, in chunks. → { collection: Map(docId → points) } (only docs with points appear). A missing hot collection is
 *  empty; any other failure throws (the caller then keeps its full list). Background use only (excluded-docs.js). */
export async function docPointCounts(docIds, { timeoutMs = 30000, chunk = 1000 } = {}) {
  const ids = [...new Set(docIds.map(Number))];
  const facet = async (coll, base) => {
    const m = new Map();
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk);
      const r = await qdrant(`/collections/${coll}/facet`, { key: 'doc_id', filter: { must: [{ key: 'doc_id', match: { any: part } }] }, limit: part.length, exact: true }, timeoutMs, base);
      for (const h of r.hits || []) m.set(Number(h.value), h.count);
    }
    return m;
  };
  const out = {};
  for (const c of SEARCHED_COLLECTIONS) out[c] = await facet(c, QD());
  if (hotUrl()) {
    try { out[HOT_PHRASES()] = await facet(HOT_PHRASES(), hotUrl()); } catch (err) { if (!/ 404 /.test(err.message)) throw err; out[HOT_PHRASES()] = new Map(); }
  }
  return out;
}

/** Qdrant liveness + each search collection's status (green = fully indexed; yellow = optimizing, searches slower). */
export async function qdrantHealth(timeoutMs = 3000) {
  try {
    const out = {};
    for (const c of ['phrases', 'paragraphs_kw', 'hype']) {
      const r = await fetch(`${QD()}/collections/${c}`, { headers: qdrantHeaders(false), signal: AbortSignal.timeout(timeoutMs) });
      const j = r.ok ? (await r.json()).result : null;
      out[c] = j ? { status: j.status, points: j.points_count, unindexed: Math.max(0, (j.points_count || 0) - (j.indexed_vectors_count || 0)) } : { status: `http ${r.status}` };
    }
    // phase 0 hot layer: informational — search degrades to main without it, so it never fails health
    let hot;
    if (hotUrl()) {
      hot = await fetch(`${hotUrl()}/collections/${HOT_PHRASES()}`, { headers: qdrantHeaders(false), signal: AbortSignal.timeout(timeoutMs) })
        .then(async (r) => (r.ok ? (({ status, points_count: points, indexed_vectors_count: ix }) => ({ status, points, unindexed: Math.max(0, (points || 0) - (ix || 0)) }))((await r.json()).result) : { status: `http ${r.status}` }))
        .catch((err) => ({ status: 'unreachable', error: err.message }));
    }
    return { status: Object.values(out).every((x) => x.status === 'green' || x.status === 'yellow') ? 'ok' : 'error', collections: out, ...(hot ? { hot: { [HOT_PHRASES()]: hot } } : {}) };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/** Raw request for the index writer (deletes by filter from the outbox) — the only Qdrant WRITE path at runtime. A write to
 *  `phrases` is mirrored to the hot copy (phase 0) so deletes and payload stamps reach the new points too; a hot failure is
 *  logged, never fails the main write (a missing hot collection is a 404 — nothing there to change). */
export async function qdrantRequest(path, body, timeoutMs = 15000) {
  const hp = hotUrl() ? hotPath(path) : null;
  const [main, hot] = await Promise.allSettled([qdrant(path, body, timeoutMs), hp ? qdrant(hp, body, timeoutMs, hotUrl()) : null]);
  if (hot.status === 'rejected' && !/ 404 /.test(hot.reason?.message || '')) hotFailed(hot.reason);
  if (main.status === 'rejected') throw main.reason;
  return main.value;
}

/** A `phrases` query against main and (phase 0) hot, merged. Main failing fails the layer as before; hot failing or slow
 *  degrades to main only. */
async function queryPhrasesCollection(path, body, timeoutMs, { groups = false, limit } = {}) {
  const hp = hotUrl() ? hotPath(path) : null;
  const [main, hot] = await Promise.allSettled([qdrant(path, body, timeoutMs), hp ? qdrant(hp, body, timeoutMs, hotUrl()) : null]);
  if (main.status === 'rejected') throw main.reason;
  if (!hp || hot.status === 'rejected' || !hot.value) { if (hot.status === 'rejected' && !/ 404 /.test(hot.reason?.message || '')) hotFailed(hot.reason); return main.value; }
  return groups ? { groups: mergeGroups(main.value.groups, hot.value.groups, limit) } : { points: mergePoints(main.value.points, hot.value.points).slice(0, body.limit) };
}

/** Best point per paragraph, in score order — what Qdrant's /query/groups computes, done on a plain top-N result. Pure. */
export function bestPerParagraph(points, limit) {
  const seen = new Set(), out = [];
  for (const p of points) {
    const pid = p.payload?.paragraph_id;
    if (pid == null || seen.has(pid)) continue;
    seen.add(pid); out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Best point per paragraph via plain queries: top limit×2 grouped here; a FULL page short of paragraphs escalates to ×4,
 *  and only a full ×4 page still short runs `grouped()` (Qdrant's /query/groups). plain(n) → { points }, grouped() → { groups }. */
export async function bestPerParagraphQuery(plain, grouped, limit) {
  let res = await plain(limit * 2);
  let best = bestPerParagraph(res.points || [], limit);
  if (best.length < limit && (res.points || []).length >= limit * 2) {
    res = await plain(limit * 4);
    best = bestPerParagraph(res.points || [], limit);
  }
  if (best.length < limit && (res.points || []).length >= limit * 4) best = ((await grouped()).groups || []).map((x) => x.hits[0]);
  return best;
}

/** → { hits: [{ paragraph_id, doc_id, score, span: {start, end} }] } — best phrase per paragraph.
 *  A plain top-N query grouped here, not Qdrant's /query/groups: measured 10-09 the grouped query cost 2.0–2.3 s vs
 *  0.6–1.1 s for the plain one (same ranking: best phrase per paragraph). N = limit×2 (11-03: limit 60 held 27–52 distinct
 *  paragraphs for limit 30, ≥30 in 97% of 40 fresh vectors, at half the cost of ×4); a FULL page short of paragraphs
 *  escalates to ×4, and only a full ×4 page still short falls back to the grouped query. */
export async function searchPhrases(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.phrase } = {}) {
  const vector = await geminiQueryVector(query);
  const payload = ['paragraph_id', 'doc_id', 'start', 'end', ...RANK_PAYLOAD];
  const filter = toQdrantFilter(filters);
  const plain = (n) => queryPhrasesCollection('/collections/phrases/points/query', {
    query: vector, using: 'literal', limit: n, with_payload: payload, params: searchParams(params), filter,
  }, timeoutMs);
  const best = await bestPerParagraphQuery(plain, () => queryPhrasesCollection('/collections/phrases/points/query/groups', {
    query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: payload, params: searchParams(params), filter,
  }, timeoutMs, { groups: true, limit }), limit);
  return { hits: best.map((p) => ({ paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, span: { start: p.payload.start, end: p.payload.end }, ...rankFields(p.payload) })) };
}

/** The quote's best-matching PHRASES inside one paragraph: [{ start, end, score }] (character spans of the indexed text) —
 *  what SourceHunt highlights in an Arabic/Persian original. */
export async function searchPhraseSpans(query, paragraphId, { limit = 8, timeoutMs } = {}) {
  const vector = await geminiQueryVector(query);
  const res = await queryPhrasesCollection('/collections/phrases/points/query', {
    query: vector, using: 'literal', limit, with_payload: ['start', 'end'], params: searchParams(SEARCH_PARAMS.phrase),
    filter: { must: [{ key: 'paragraph_id', match: { value: Number(paragraphId) } }] },
  }, timeoutMs);
  return (res.points || []).map((p) => ({ start: p.payload.start, end: p.payload.end, score: p.score }));
}

/** → { hits: [{ paragraph_id, doc_id, score, thesis }] } — HyPE questions (+ thesis) embedded with the SAME Gemini model as
 *  the phrase layer, so one query vector serves both (memoized). The SQLite hyp_questions are the store; `hype` is their index.
 *  Plain top-(limit×2) grouped here, like phrases (11-03, 56 trace queries on tower: hype 3.7 vs 7.8 ms server, recall@10
 *  vs float 0.968 vs 0.963; concepts 4.4 vs 7.0 ms, recall vs exact 0.993 vs 0.991; ×2 always held ≥30 paragraphs). */
export async function searchHypeQdrant(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.hype } = {}) {
  const vector = await geminiQueryVector(query);
  const body = { query: vector, using: 'literal', with_payload: ['paragraph_id', 'doc_id', 'k', ...RANK_PAYLOAD], params: searchParams(params), filter: toQdrantFilter(filters) };
  const best = await bestPerParagraphQuery((n) => qdrant('/collections/hype/points/query', { ...body, limit: n }, timeoutMs),
    () => qdrant('/collections/hype/points/query/groups', { ...body, group_by: 'paragraph_id', group_size: 1, limit }, timeoutMs), limit);
  return { hits: best.map((p) => ({ paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, thesis: p.payload.k === 999, ...rankFields(p.payload) })) };
}

/** → { hits: [{ paragraph_id, doc_id, score }] } — CONCEPT CLAIMS ("the clouds — symbolizes the human limitations…"), one
 *  point per cited claim, best per paragraph; same Gemini vector as phrases/HyPE. Built by the phrase indexer --field concepts. */
export async function searchConceptsQdrant(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.concept } = {}) {
  const vector = await geminiQueryVector(query);
  const body = { query: vector, using: 'literal', with_payload: ['paragraph_id', 'doc_id', ...RANK_PAYLOAD], params: searchParams(params), filter: toQdrantFilter(filters) };
  const best = await bestPerParagraphQuery((n) => qdrant('/collections/concepts/points/query', { ...body, limit: n }, timeoutMs),
    () => qdrant('/collections/concepts/points/query/groups', { ...body, group_by: 'paragraph_id', group_size: 1, limit }, timeoutMs), limit);
  return { hits: best.map((p) => ({ paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, ...rankFields(p.payload) })) };
}

/** → { hits: [{ paragraph_id, doc_id, score }] } — BM25 over whole paragraphs with our folding. */
export async function searchKeywordQdrant(query, { limit = 30, filters, timeoutMs } = {}) {
  const sparse = bm25Query(query);
  if (!sparse.indices.length) return { hits: [] };
  const res = await qdrant('/collections/paragraphs_kw/points/query', {
    query: sparse, using: 'bm25', limit, with_payload: ['paragraph_id', 'doc_id', ...RANK_PAYLOAD], filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.points || []).map((p) => ({ paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, ...rankFields(p.payload) })) };
}
