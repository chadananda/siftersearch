// Qdrant search layers for multiIndexSearch (P4 of planning/phrase-index-plan.md), both opt-in until measured:
//   searchPhrases — Gemini Embedding 2 query vector → `phrases` (binary + rescoring), one best phrase per paragraph,
//                   with its span {start, end} for highlighting; searchKeywordQdrant — BM25 sparse on `paragraphs_kw`.
// Deps: keyword-tokens.js (same tokenizer as the index). Env: QDRANT_URL, QDRANT_KEY, GEMINI_API_KEY.
// :rules: query prefix "task: search result | query:" (measured; documents were embedded with "title: none | text:").
import { noteProviderError } from '../spend-alerts.js';
import { bm25Query } from '../keyword-tokens.js';
import { excludedDocIds } from './excluded-docs.js';
import { docIdsInYearRange } from '../docs-repo.js';
import { logAIUsage } from '../ai-services.js';

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

const memo = new Map();   // query → { at, p }
export function geminiQueryVector(text) {
  const key = String(text ?? '');
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit.p;
  const p = fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ model: `models/${MODEL}`, content: { parts: [{ text: `task: search result | query: ${key}` }] }, outputDimensionality: DIMS }),
  }).then(async (r) => {
    if (!r.ok) {
      const text = (await r.text()).slice(0, 300);
      noteProviderError('Gemini', { status: r.status, message: text });
      throw new Error(`gemini ${r.status} ${text.slice(0, 120)}`);
    }
    // Spend (every uncached query): the response carries no token count, so estimate ~4 chars/token.
    logAIUsage({ provider: 'google', model: MODEL, serviceType: 'embedding', caller: 'search-query', promptTokens: Math.ceil((key.length + 30) / 4) });
    return (await r.json()).embedding.values;
  }).catch((err) => { memo.delete(key); throw err; });
  if (memo.size >= 500) memo.delete(memo.keys().next().value);
  memo.set(key, { at: Date.now(), p });
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
export const SEARCH_PARAMS = Object.freeze({
  phrase: Object.freeze({ rescore: true, oversampling: 4, hnsw_ef: null }),
  hype: Object.freeze({ rescore: true, oversampling: 4, hnsw_ef: null }),
  concept: Object.freeze({ rescore: true, oversampling: 4, hnsw_ef: null }),
});
const searchParams = (p) => ({ quantization: { rescore: p.rescore, oversampling: p.oversampling }, ...(p.hnsw_ef ? { hnsw_ef: p.hnsw_ef } : {}) });

async function qdrant(path, body, timeoutMs = 2500, base = QD()) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' },
    // 2.5 s: past the search budget a layer is dropped, not waited on — and the relax ladder re-runs the engine, so a stalled
    // Qdrant (a payload backfill or build beside it, 2026-10-04) cost 5 s per rung at the old 5 s.
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`qdrant ${path} ${r.status} ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).result;
}

/** Qdrant liveness + each search collection's status (green = fully indexed; yellow = optimizing, searches slower). */
export async function qdrantHealth(timeoutMs = 3000) {
  try {
    const out = {};
    for (const c of ['phrases', 'paragraphs_kw', 'hype']) {
      const r = await fetch(`${QD()}/collections/${c}`, { headers: { 'api-key': process.env.QDRANT_KEY || '' }, signal: AbortSignal.timeout(timeoutMs) });
      const j = r.ok ? (await r.json()).result : null;
      out[c] = j ? { status: j.status, points: j.points_count, unindexed: Math.max(0, (j.points_count || 0) - (j.indexed_vectors_count || 0)) } : { status: `http ${r.status}` };
    }
    // phase 0 hot layer: informational — search degrades to main without it, so it never fails health
    let hot;
    if (hotUrl()) {
      hot = await fetch(`${hotUrl()}/collections/${HOT_PHRASES()}`, { headers: { 'api-key': process.env.QDRANT_KEY || '' }, signal: AbortSignal.timeout(timeoutMs) })
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

/** → { hits: [{ paragraph_id, doc_id, score, span: {start, end} }] } — best phrase per paragraph.
 *  A plain top-(limit×4) query grouped here, not Qdrant's /query/groups: measured 10-09 the grouped query cost 2.0–2.3 s
 *  vs 0.6–1.1 s for the plain one, which already held 60–101 distinct paragraphs for limit 30 (same ranking: best phrase
 *  per paragraph). Only when fewer than `limit` distinct paragraphs come back does it fall back to the grouped query. */
export async function searchPhrases(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.phrase } = {}) {
  const vector = await geminiQueryVector(query);
  const payload = ['paragraph_id', 'doc_id', 'start', 'end', ...RANK_PAYLOAD];
  const filter = toQdrantFilter(filters);
  const res = await queryPhrasesCollection('/collections/phrases/points/query', {
    query: vector, using: 'literal', limit: limit * 4, with_payload: payload, params: searchParams(params), filter,
  }, timeoutMs);
  let best = bestPerParagraph(res.points || [], limit);
  if (best.length < limit && (res.points || []).length >= limit * 4) {
    const g = await queryPhrasesCollection('/collections/phrases/points/query/groups', {
      query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: payload, params: searchParams(params), filter,
    }, timeoutMs, { groups: true, limit });
    best = (g.groups || []).map((x) => x.hits[0]);
  }
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
 *  the phrase layer, so one query vector serves both (memoized). The SQLite hyp_questions are the store; `hype` is their index. */
export async function searchHypeQdrant(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.hype } = {}) {
  const vector = await geminiQueryVector(query);
  const res = await qdrant('/collections/hype/points/query/groups', {
    query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: ['paragraph_id', 'doc_id', 'k', ...RANK_PAYLOAD],
    params: searchParams(params), filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.groups || []).map((g) => {
    const p = g.hits[0];
    return { paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, thesis: p.payload.k === 999, ...rankFields(p.payload) };
  }) };
}

/** → { hits: [{ paragraph_id, doc_id, score }] } — CONCEPT CLAIMS ("the clouds — symbolizes the human limitations…"), one
 *  point per cited claim, best per paragraph; same Gemini vector as phrases/HyPE. Built by the phrase indexer --field concepts. */
export async function searchConceptsQdrant(query, { limit = 30, filters, timeoutMs, params = SEARCH_PARAMS.concept } = {}) {
  const vector = await geminiQueryVector(query);
  const res = await qdrant('/collections/concepts/points/query/groups', {
    query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: ['paragraph_id', 'doc_id', ...RANK_PAYLOAD],
    params: searchParams(params), filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.groups || []).map((g) => ({ paragraph_id: g.hits[0].payload.paragraph_id, doc_id: g.hits[0].payload.doc_id, score: g.hits[0].score, ...rankFields(g.hits[0].payload) })) };
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
