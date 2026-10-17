// Keyword (BM25) tokens for the Qdrant sparse index — ONE tokenizer for indexing and querying, so they cannot drift.
// Folding: Arabic-script variants via arabic-script.js, Latin diacritics off, lowercase. Token id = crc32 (stable, uint32).
// :rules: document side carries saturated TF with length normalisation; Qdrant applies IDF (modifier 'idf') at query time.
//         Measured 2026-10-01 (tests/quality/crosslingual/lexical_test.py): beats Meili keyword on ar/fa by 16 pts @1.
import { crc32 } from 'zlib';
import { foldArabic } from './arabic-script.js';

export const foldKeyword = (text) => foldArabic(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
export const tokens = (text) => foldKeyword(text).match(/[\p{L}\p{N}]+/gu) || [];
export const tokenId = (word) => crc32(word);

// Document vector: BM25 TF part. avgLen = mean token count over the collection.
export function bm25Doc(text, avgLen, k = 1.2, b = 0.75) {
  const ws = tokens(text);
  if (!ws.length) return null;
  const tf = new Map();
  for (const w of ws) { const id = tokenId(w); tf.set(id, (tf.get(id) || 0) + 1); }
  const norm = k * (1 - b + b * ws.length / avgLen);
  const indices = [...tf.keys()];
  return { indices, values: indices.map((i) => +((tf.get(i) * (k + 1)) / (tf.get(i) + norm)).toFixed(4)) };
}

// Document vector WITH its place in the book (Chad 10-17: structure before BM25 "so that sections get indexed"): the
// section path's words ("The Dawn-Breakers › Chapter XVI › The Conference of Badasht") join the paragraph's own at a
// fraction of a word's weight, so a heading reaches every paragraph under it without outranking what a paragraph says.
// A paragraph with no words of its own stays unindexable (null).
export function bm25DocWithContext(text, context, avgLen, weight = 0.3) {
  const base = bm25Doc(text, avgLen);
  if (!base || !context) return base;
  const at = new Map(base.indices.map((id, i) => [id, i]));
  const values = [...base.values], indices = [...base.indices];
  for (const id of new Set(tokens(context).map(tokenId))) {
    if (at.has(id)) values[at.get(id)] = +(values[at.get(id)] + weight).toFixed(4);
    else { at.set(id, indices.length); indices.push(id); values.push(weight); }
  }
  return { indices, values };
}

// Query vector: each distinct query token once; IDF comes from Qdrant.
export function bm25Query(text) {
  const ids = [...new Set(tokens(text).map(tokenId))];
  return { indices: ids, values: ids.map(() => 1) };
}
