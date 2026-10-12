// Ocean of Lights range links (Chad 10-12): `<page>#(<start>)(<end>)[$N]`. The site (parseQuoteHash/highlightQuote in its
// Nuxt bundle, read 10-12) decodeURIComponent()s the hash, finds each fragment in the textContent of
// `.tablet-content.nuxt-content` by plain indexOf (exact, case-sensitive, any substring), takes occurrence N (default the
// first) of BOTH fragments, and highlights from the start fragment to the end of the end fragment. So the shortest link
// is the shortest prefix of the quote whose first occurrence is where the quote starts + the shortest suffix whose first
// occurrence is where it ends, grown a word at a time from ONE word, ignoring case (Chad 10-12: "#(The)(knowledge)" for the
// first "The"; "#(the knowledge)(and the)" when an earlier "The" makes "the" ambiguous); `$N` only when no such pair exists.
// Pure.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));

/** textContent of the page's `.tablet-content.nuxt-content` element (what the site searches), or null. */
export function oolContentText(html) {
  const s = String(html || '');
  const tok = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let depth = 0, out = '';
  for (let m; (m = tok.exec(s));) {
    const [, close, tag, attrs, text] = m;
    if (text != null) { if (depth) out += decode(text); continue; }
    if (!tag) continue;
    const t = tag.toLowerCase();
    if (VOID.has(t) || /\/\s*$/.test(attrs || '')) continue;
    if (close) { if (depth && --depth === 0) return out; continue; }
    if (depth) depth++;
    else if (t === 'div') {
      const cls = (/\bclass\s*=\s*"([^"]*)"/.exec(attrs || '') || [])[1]?.split(/\s+/) || [];
      if (cls.includes('tablet-content') && cls.includes('nuxt-content')) depth = 1;
    }
  }
  return depth ? out : null;
}

// loose match: whitespace runs and typographic quotes/dashes don't break a quote taken from our copy of the text
const fold = (c) => (/\s/.test(c) ? ' ' : /[‘’ʼ`´]/.test(c) ? "'" : /[“”„]/.test(c) ? '"' : /[–—]/.test(c) ? '-' : c);
function normalised(s) {
  let out = '', map = [];
  for (let i = 0; i < s.length; i++) {
    const c = fold(s[i]);
    if (c === ' ' && (out.endsWith(' ') || !out)) continue;
    out += c; map.push(i);
  }
  return { out, map };
}

/** [start, end) of `quote` in `page` (whitespace/typography-insensitive), or null. */
export function locateQuote(page, quote) {
  const q = normalised(String(quote || '').trim().replace(/^[“"‘'(«\s]+|[”"’')»\s,.;:!?]+$/g, '')).out.trim();
  if (!q) return null;
  const { out, map } = normalised(page);
  const at = out.indexOf(q);
  return at < 0 ? null : [map[at], map[at + q.length - 1] + 1];
}

/** 1-based rank of position `pos` among the occurrences of `frag` in `page` (overlapping, as the site counts). */
function rankOf(page, frag, pos, caseless = false) {
  if (caseless) { page = page.toLowerCase(); frag = frag.toLowerCase(); }
  for (let n = 1, i = page.indexOf(frag); i >= 0; n++, i = page.indexOf(frag, i + 1)) if (i === pos) return n; else if (i > pos) return 0;
  return 0;
}

/** The shortest `(start)(end)[$N]` hash for page[s, e), or null. */
export function oolQuoteHash(page, s, e) {
  const quote = page.slice(s, e);
  const words = [...quote.matchAll(/\S+/g)];
  if (!words.length) return null;
  const prefixes = words.map((w) => quote.slice(0, w.index + w[0].length)).filter((p) => !p.includes(')'));
  const suffixes = words.map((w) => quote.slice(w.index)).reverse().filter((q) => !q.includes(')'));
  const best = (frags, at, caseless) => {        // rank → shortest fragment with that rank
    const by = new Map();
    for (const f of frags) { const r = rankOf(page, f, at(f), caseless); if (r && !by.has(r)) by.set(r, f); }
    return by;
  };
  // First choice: phrases that are the first occurrence IGNORING CASE (Chad 10-12: "the" after a "The" is not unique →
  // "the knowledge"). A caseless first occurrence is also the site's case-sensitive first, so the link still lands.
  const p1 = best(prefixes, () => s, true).get(1), q1 = best(suffixes, (q) => e - q.length, true).get(1);
  if (p1 && q1) return `(${encodeURIComponent(p1)})(${encodeURIComponent(q1)})`;
  const P = best(prefixes, () => s), Q = best(suffixes, (q) => e - q.length);   // $N: counted as the site counts
  let pick = null;
  for (const [r, p] of P) {
    const q = Q.get(r);
    if (q && (!pick || (r === 1) > (pick.r === 1) || ((r === 1) === (pick.r === 1) && p.length + q.length < pick.p.length + pick.q.length))) pick = { r, p, q };
  }
  if (!pick) return null;
  return `(${encodeURIComponent(pick.p)})(${encodeURIComponent(pick.q)})${pick.r > 1 ? `$${pick.r}` : ''}`;
}

/** Range link for `quote` on an Ocean of Lights page whose content text is `page`, or null when it can't be placed. */
export function oolQuoteUrl(pageUrl, page, quote) {
  const at = page && locateQuote(page, quote);
  const hash = at && oolQuoteHash(page, at[0], at[1]);
  return hash ? `${String(pageUrl).replace(/#.*$/, '')}#${hash}` : null;
}
