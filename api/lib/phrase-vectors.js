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

// Document language labels are not normalised in the library (en/En/Eng, fr/Fr/FR, de/Ger…).
const LANG_ALIASES = { eng: 'en', english: 'en', fre: 'fr', fra: 'fr', french: 'fr', ger: 'de', deu: 'de', german: 'de',
  spa: 'es', esp: 'es', spanish: 'es', ita: 'it', heb: 'he', per: 'fa', fas: 'fa', persian: 'fa', ara: 'ar', arabic: 'ar' };
export function normLang(code) {
  const c = String(code || '').trim().toLowerCase();
  return c ? (LANG_ALIASES[c] || c.slice(0, 2)) : 'und';
}

// Which segmenter a paragraph gets, and the language group it is filed under. Script decides, not the document label:
// translations carry Arabic-script originals and Arabic works carry English notes.
const HAN = /[一-鿿]/g, KANA = /[぀-ヿ]/g;
export function paragraphLang(text, docLang) {
  const t = String(text || '');
  if (arabicShare(t) >= 0.5) return { seg: 'ar', group: 'ar-fa' };
  const letters = (t.match(/\p{L}/gu) || []).length || 1;
  const kana = (t.match(KANA) || []).length, han = (t.match(HAN) || []).length;
  if (kana / letters >= 0.1) return { seg: 'ja', group: 'ja' };
  if (han / letters >= 0.3) return { seg: 'zh', group: 'zh' };
  return { seg: 'en', group: normLang(docLang) };
}

// Token estimate for spend: measured on the first 1.19M units (Arabic script ≈ 2.2 chars/token; Latin ≈ 4.2).
export function estTokens(text) {
  const t = String(text || '');
  const ar = arabicShare(t);
  return Math.round(t.length * (ar / 2.2 + (1 - ar) / 4.2));
}
