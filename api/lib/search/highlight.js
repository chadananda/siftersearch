// Query-term highlighting for hits that no engine highlighted (Qdrant layers hydrated from SQLite) — the `_formatted.text`
// Meili used to supply. Matching is diacritic- and apostrophe-folded (Bahaullah ↔ Bahá’u’lláh) and whole-word; the marks
// go on the ORIGINAL characters. Pure.
const STOP = new Set(['the', 'and', 'for', 'are', 'was', 'with', 'that', 'this', 'from', 'what', 'where', 'when', 'who', 'how',
  'does', 'did', 'say', 'says', 'about', 'into', 'his', 'her', 'its', 'their', 'there', 'which', 'have', 'has', 'not', 'but']);
const APOS = /[‘’ʼʻ`']/;

/** text → { folded, map } where folded[i] came from text[map[i]] (apostrophes dropped, marks stripped, lower-cased). */
function foldWithMap(text) {
  let folded = ''; const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (APOS.test(ch)) continue;
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const c of f) { folded += c; map.push(i); }
  }
  return { folded, map };
}

export function queryTerms(query) {
  const { folded } = foldWithMap(String(query || ''));
  return [...new Set((folded.match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/** Wrap every whole-word occurrence of a query term (prefix match, so "pray" marks "prayers") in pre/post tags. */
export function highlightText(text, query, { pre = '<mark>', post = '</mark>' } = {}) {
  const src = String(text || ''), terms = queryTerms(query);
  if (!src || !terms.length) return src;
  const { folded, map } = foldWithMap(src);
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\\p{L}\\p{N}]*`, 'gu');
  const ranges = [];
  for (const m of folded.matchAll(re)) ranges.push([map[m.index], map[m.index + m[0].length - 1] + 1]);
  let out = '', at = 0;
  for (const [s, e] of ranges) { if (s < at) continue; out += src.slice(at, s) + pre + src.slice(s, e) + post; at = e; }
  return out + src.slice(at);
}
