// Phrase-indexer pure helpers: paragraph → phrase units (offsets + embedding text), the vector cache key, half-precision
// storage, Arabic-script share. Deps: phrases.js. Used by scripts/phrase-index/indexer.mjs (runs on tower-nas).
// :rules: point id = paragraph_id × 1000 + k (Qdrant needs unsigned ints); the cache key covers model + dims + the exact
//         embedding text, so a vector is never paid for twice and a model/rule change never reuses a stale one.
import { createHash } from 'crypto';
/* global Float16Array */   // Node ≥ 24 (ES2025)
import { segment, cleanText, anchored, SEG_VERSION } from './phrases.js';

export const pointId = (paragraphId, k) => Number(paragraphId) * 1000 + k;

export function unitsOf({ id, text, lang }) {
  const clean = cleanText(text);
  const spans = segment(text, lang).slice(0, 999);
  const phr = spans.map((s) => clean.slice(s.start, s.end));
  return spans.map((s, k) => ({ pointId: pointId(id, k), k, start: s.start, end: s.end, embedText: anchored(phr, k), segV: SEG_VERSION }));
}

export const vecKey = (model, dims, text) => createHash('sha1').update(`${model}\u0000${dims}\u0000${text}`).digest('hex');

export const packF16 = (v) => Buffer.from(new Float16Array(v).buffer);
export const unpackF16 = (b) => Array.from(new Float16Array(b.buffer, b.byteOffset, b.length / 2));

const ARABIC = new RegExp(`[${[[0x600, 0x6ff], [0x750, 0x77f], [0x8a0, 0x8ff], [0xfb50, 0xfdff], [0xfe70, 0xfefc]]   // Arabic-script blocks incl. presentation forms
  .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`, 'g');
export function arabicShare(text) {
  const letters = (String(text || '').match(/\p{L}/gu) || []).length;
  return letters ? (String(text).match(ARABIC) || []).length / letters : 0;
}
