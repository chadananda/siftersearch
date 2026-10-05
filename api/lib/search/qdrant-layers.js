// Qdrant search layers for multiIndexSearch (P4 of planning/phrase-index-plan.md), both opt-in until measured:
//   searchPhrases — Gemini Embedding 2 query vector → `phrases` (binary + rescoring), one best phrase per paragraph,
//                   with its span {start, end} for highlighting; searchKeywordQdrant — BM25 sparse on `paragraphs_kw`.
// Deps: keyword-tokens.js (same tokenizer as the index). Env: QDRANT_URL, QDRANT_KEY, GEMINI_API_KEY.
// :rules: query prefix "task: search result | query:" (measured; documents were embedded with "title: none | text:").
import { bm25Query } from '../keyword-tokens.js';
import { excludedDocIds } from './excluded-docs.js';

const QD = () => process.env.QDRANT_URL || 'http://127.0.0.1:6333';
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
    if (!r.ok) throw new Error(`gemini ${r.status} ${(await r.text()).slice(0, 120)}`);
    return (await r.json()).embedding.values;
  }).catch((err) => { memo.delete(key); throw err; });
  if (memo.size >= 500) memo.delete(memo.keys().next().value);
  memo.set(key, { at: Date.now(), p });
  return p;
}

// The author as a filter KEY: accents, apostrophe variants and punctuation folded away — the same folding search.js's
// authorMatches uses — so "Abdu'l-Bahá", "‘Abdu’l-Bahá" and "Abdu'l-Baha" are one author. Meili matches with CONTAINS over
// apostrophe variants; a Qdrant keyword match is exact, so points carry `author_fold` and the filter folds too.
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
  if (filters.author) eq('author_fold', Array.isArray(filters.author) ? filters.author.map(authorKey) : authorKey(filters.author));
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

async function qdrant(path, body, timeoutMs = 2500) {
  const r = await fetch(QD() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': process.env.QDRANT_KEY || '' },
    // 2.5 s: past the search budget a layer is dropped, not waited on — and the relax ladder re-runs the engine, so a stalled
    // Qdrant (a payload backfill or build beside it, 2026-10-04) cost 5 s per rung at the old 5 s.
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`qdrant ${path} ${r.status} ${(await r.text()).slice(0, 120)}`);
  return (await r.json()).result;
}

/** → { hits: [{ paragraph_id, doc_id, score, span: {start, end} }] } — best phrase per paragraph. */
export async function searchPhrases(query, { limit = 30, filters, timeoutMs } = {}) {
  const vector = await geminiQueryVector(query);
  const res = await qdrant('/collections/phrases/points/query/groups', {
    query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: ['paragraph_id', 'doc_id', 'start', 'end'],
    params: { quantization: { rescore: true, oversampling: 4 } }, filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.groups || []).map((g) => {
    const p = g.hits[0];
    return { paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, span: { start: p.payload.start, end: p.payload.end } };
  }) };
}

/** → { hits: [{ paragraph_id, doc_id, score, thesis }] } — HyPE questions (+ thesis) embedded with the SAME Gemini model as
 *  the phrase layer, so one query vector serves both (memoized). The SQLite hyp_questions are the store; `hype` is their index. */
export async function searchHypeQdrant(query, { limit = 30, filters, timeoutMs } = {}) {
  const vector = await geminiQueryVector(query);
  const res = await qdrant('/collections/hype/points/query/groups', {
    query: vector, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit, with_payload: ['paragraph_id', 'doc_id', 'k'],
    params: { quantization: { rescore: true, oversampling: 4 } }, filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.groups || []).map((g) => {
    const p = g.hits[0];
    return { paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score, thesis: p.payload.k === 999 };
  }) };
}

/** → { hits: [{ paragraph_id, doc_id, score }] } — BM25 over whole paragraphs with our folding. */
export async function searchKeywordQdrant(query, { limit = 30, filters, timeoutMs } = {}) {
  const sparse = bm25Query(query);
  if (!sparse.indices.length) return { hits: [] };
  const res = await qdrant('/collections/paragraphs_kw/points/query', {
    query: sparse, using: 'bm25', limit, with_payload: ['paragraph_id', 'doc_id'], filter: toQdrantFilter(filters),
  }, timeoutMs);
  return { hits: (res.points || []).map((p) => ({ paragraph_id: p.payload.paragraph_id, doc_id: p.payload.doc_id, score: p.score })) };
}
