// Display-safe titles/authors for scraped metadata. Raw docs.title values carry bahai-library's
// <u>Kh</u> transliteration digraphs, stray HTML, entities, and %-escapes from filename-derived
// titles — all of which render as literal junk. Pure; callers keep the raw DB value untouched.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

// Bahá'í orthography underlines the aspirated digraphs; Unicode expresses that as the two letters
// joined by COMBINING DOUBLE MACRON BELOW (K͟h, S͟h…), which is what our own corpus uses.
const UNDERSCORE_DIGRAPH = /^(?:ch|dh|gh|kh|sh|th|zh)$/i;
const DOUBLE_MACRON_BELOW = '͟';

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// %-escapes only ever appear here because the title was derived from a URL/filename, so decoding
// is a restoration, not a guess. decodeURIComponent throws on a lone '%' — fall back to %20 only.
// Such a title also spells its remaining spaces as underscores ("…,%20Lincoln_Celebration"), so
// unescape those too — but ONLY for these filename-derived titles, never for a hand-written one.
function decodePercent(s) {
  if (!/%[0-9a-f]{2}/i.test(s)) return { s, fromFilename: false };
  let out;
  try { out = decodeURIComponent(s); } catch { out = s.replace(/%20/g, ' '); }
  return { s: out.replace(/_+/g, ' '), fromFilename: true };
}

/**
 * @param {string} raw a docs.title / docs.author straight from the DB
 * @returns {string} the same text as a human would read it
 */
export function cleanTitle(raw) {
  let s = String(raw ?? '');
  if (!s) return '';
  s = s.replace(/<u>\s*([^<]*?)\s*<\/u>/gi, (_, inner) =>
    (UNDERSCORE_DIGRAPH.test(inner) ? inner[0] + DOUBLE_MACRON_BELOW + inner.slice(1) : inner));
  s = s.replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, ' ').replace(/<[^>]*>/g, '');
  s = decodeEntities(decodePercent(s).s);
  return s.replace(/\s+/g, ' ').replace(/[\s,;–—-]+$/, '').trim();
}
