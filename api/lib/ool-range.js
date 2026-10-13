// Ocean of Lights range links (Chad 10-12): `<page>#(<start>)(<end>)[$N]`. The site (parseQuoteHash/highlightQuote in its
// Nuxt bundle, read 10-12) decodeURIComponent()s the hash, finds each fragment in the page text (textContent of
// `.tablet-content.nuxt-content`; we use our stored copy of the page, ocean-links.js) by plain indexOf (exact, case-sensitive, any substring), takes occurrence N (default the
// first) of BOTH fragments, and highlights from the start fragment to the end of the end fragment. So the shortest link
// is the shortest prefix of the quote whose first occurrence is where the quote starts + the shortest suffix whose first
// occurrence is where it ends, grown a word at a time from ONE word, ignoring case (Chad 10-12: "#(The)(knowledge)" for the
// first "The"; "#(the knowledge)(and the)" when an earlier "The" makes "the" ambiguous); `$N` only when no such pair exists.
// Pure.

/** Quote text for a private "~q=" marker: encodeURIComponent leaves ( ) ' ! * ~ alone, and a link inside text or JSON ends
 *  at ")" or "'" — a quote holding one was cut there (10-12: a broken Divine Philosophy link). */
export const encodeMarker = (s) => encodeURIComponent(String(s)).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// loose match: whitespace runs and typographic quotes/dashes don't break a quote taken from our copy of the text
const fold = (c) => (/\s/.test(c) ? ' ' : /[‘’ʼ`´]/.test(c) ? "'" : /[“”„]/.test(c) ? '"' : /[–—]/.test(c) ? '-' : c);
function normalised(s) {
  // an array + the last char, never `out.endsWith` on a growing string: that flattened the rope on every character and
  // made a whole-book page quadratic (10-12: 31 s for 1.8 MB — the API froze)
  const chars = [], map = [];
  let last = '';
  for (let i = 0; i < s.length; i++) {
    const c = fold(s[i]);
    if (c === ' ' && (last === ' ' || last === '')) continue;
    chars.push(c); map.push(i); last = c;
  }
  return { out: chars.join(''), map };
}

// our stored text keeps markup the page doesn't show: sentence markers, footnote refs, page marks, links, emphasis, escapes
export const plainText = (s) => String(s || '').replace(/⁅\/?s\d+⁆/g, '').replace(/\[\d+(?:\.\d+)*\]\s*/g, '')   // section markers our copies add: "[93.1] Know thou…" (10-12)
  .replace(/\[\^[^\]\s]+\]/g, '').replace(/\[pg [^\]]*\]/g, '')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\\(?=[\\`*_{}[\]()#+\-.!])/g, '').replace(/[*_]/g, '');

/** [start, end) of `quote` in `page` (whitespace/typography/markup-insensitive), or null. */
export function locateQuote(page, quote) {
  const q = normalised(plainText(quote).trim().replace(/^[“"‘'(«\s]+|[”"’')»\s,.;:!?]+$/g, '')).out.trim();
  if (!q) return null;
  const { out, map } = normalised(page);
  const at = out.indexOf(q);
  return at < 0 ? null : [map[at], map[at + q.length - 1] + 1];
}

/** 1-based rank of position `pos` among the occurrences of `frag` in `page` (overlapping, as the site counts). */
function rankOf(page, frag, pos, lowerPage = null) {
  if (lowerPage) { page = lowerPage; frag = frag.toLowerCase(); }   // caseless: the page lowered ONCE by the caller
  for (let n = 1, i = page.indexOf(frag); i >= 0; n++, i = page.indexOf(frag, i + 1)) if (i === pos) return n; else if (i > pos) return 0;
  return 0;
}

/** The shortest `(start)(end)[$N]` hash for page[s, e), or null. */
export function oolQuoteHash(page, s, e) {
  const quote = page.slice(s, e);
  const words = [...quote.matchAll(/\S+/g)];
  if (!words.length) return null;
  // bounded (10-12: whole-book pages × 350-word quotes × a lowercase of the book per phrase froze the API for minutes):
  // phrases grow to 15 words at most — a longer one is never needed to be unique; else the $N form
  const MAX_WORDS = 15;
  const lower = page.toLowerCase();
  const prefixes = words.slice(0, MAX_WORDS).map((w) => quote.slice(0, w.index + w[0].length)).filter((p) => !p.includes(')'));
  const suffixes = words.slice(-MAX_WORDS).map((w) => quote.slice(w.index)).reverse().filter((q) => !q.includes(')'));
  const best = (frags, at, caseless) => {        // rank → shortest fragment with that rank
    const by = new Map();
    for (const f of frags) { const r = rankOf(page, f, at(f), caseless ? lower : null); if (r && !by.has(r)) by.set(r, f); }
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
export const OOL_PAGE_MAX = 2_000_000;   // characters: a longer page gets a text fragment, not a range (bounded work)
export function oolQuoteUrl(pageUrl, page, quote) {
  if (!page || page.length > OOL_PAGE_MAX) return null;
  const at = page && locateQuote(page, quote);
  const hash = at && oolQuoteHash(page, at[0], at[1]);
  return hash ? `${String(pageUrl).replace(/#.*$/, '')}#${hash}` : null;
}
