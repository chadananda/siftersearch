// Exact re-rank of semantic candidates. The paragraphs index stores BINARY-QUANTIZED vectors (1 bit/dim — chosen for
// speed), so Meili's semantic ORDER is coarse: within the right book the right paragraph was in the top 10 every time
// but first only 6/11, and an exact Arabic quote ranked its own paragraph 10th (2026-09-30 measurement). The float32
// vectors are kept in content.embedding (512-d); re-scoring Meili's candidates with them restores the order. Deps: db.
import { queryAll } from '../db.js';

const toVec = (buf) => (buf && buf.byteLength ? new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) : null);

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Exact cosine of the query against each paragraph's stored float vector → Map<id, score> (ids without a vector absent). */
export async function exactScores(ids, queryVector) {
  const uniq = [...new Set(ids.map(Number).filter(Boolean))];
  if (!uniq.length || !queryVector?.length) return new Map();
  const rows = await queryAll(`SELECT id, embedding FROM content WHERE id IN (${uniq.map(() => '?').join(',')})`, uniq, 'rescore:embeddings');
  const out = new Map();
  for (const r of rows) {
    const v = toVec(r.embedding);
    if (v && v.length === queryVector.length) out.set(Number(r.id), cosine(queryVector, v));
  }
  return out;
}

/**
 * Re-rank hits by exact similarity, blended with Meili's score by the search's semantic ratio:
 *   score = ratio × exactCosine + (1 − ratio) × _rankingScore
 * so a pure vector search (ratio 1) is ordered by exact cosine and a hybrid keeps its keyword share. A hit whose vector
 * is not in this database (a supplemental-site index) keeps its Meili score. Mutates _rankingScore; returns the sorted hits.
 */
export async function rescoreHits(hits, queryVector, semanticRatio = 1) {
  if (!hits?.length || !queryVector?.length || !(semanticRatio > 0)) return hits;
  const exact = await exactScores(hits.map((h) => h.id), queryVector);
  if (!exact.size) return hits;
  for (const h of hits) {
    const e = exact.get(Number(h.id));
    if (e === undefined) continue;
    h._meiliScore = h._rankingScore;
    h._exactScore = e;
    h._rankingScore = semanticRatio * e + (1 - semanticRatio) * (h._rankingScore || 0);
  }
  return hits.sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0));
}
