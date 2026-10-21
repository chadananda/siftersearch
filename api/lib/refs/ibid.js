// Ibid. → the reference it stands for (Chad 10-21: "Ibid does not work for RAG"): a retrieved paragraph must carry its own
// source. Compilation trailers "(Ibid.)", "(Ibid., p. 89)", "(… April 18, 1971: Ibid., p. 66)" and footnotes "[^2]: Ibid., p. 45."
// take the reference before them of the same kind, with the new locator. Applied at ingest (ingester.js) — the library file
// keeps its wording. Pure.

const LOCATOR = /[,\s]+(?:pp?\.|pages?|¶)\s*[\divxlc][\divxlc\s,\-–]*$/i;   // the trailing page / paragraph locator
const IBID = /^ibid\b\.?\s*,?\s*(.*?)\s*$/i;
const withLocator = (ref, loc) => (loc ? `${ref.replace(LOCATOR, '')}, ${loc}` : ref);

/** One citation body (no parens, no footnote mark) → the expanded body, or null when it is not an Ibid / cannot be resolved. */
function expand(body, prev) {
  if (!prev) return null;
  let m = body.match(IBID);
  if (m) return withLocator(prev, m[1].replace(/\.$/, ''));
  m = body.match(/^(.*?:\s*)ibid\b\.?\s*,?\s*(.*?)\s*$/i);   // "From a letter …, 1971: Ibid., p. 66" — the publication of the one before
  if (m) {
    const src = prev.includes(': ') ? prev.slice(prev.lastIndexOf(': ') + 2) : null;
    return src ? m[1] + withLocator(src, m[2].replace(/\.$/, '')) : null;
  }
  return null;
}

// "(… )" then any tail: "[pg 140]", "<br>", a pandoc attribute block
const PAREN = /^(\s*\()(.+?)(\)\s*\.?)((?:\s*<br\s*\/?>)*(?:\s*\[pg\.?\s*\d+\])?(?:\s*\{[^{}]*\})?\s*)$/is;
// "[^2]: …", "2. …", "2) …", "² …"
const NOTE = /^(\s*(?:\[\^\w+\]:|\d{1,4}[.)]|[¹²³⁴⁵⁶⁷⁸⁹⁰]+)\s*)(.+?)(\.?\s*)$/s;

/**
 * texts: block texts in order; types (optional): their block types ('footnote' marks a note). → the texts, Ibids expanded.
 * A trailer Ibid follows the last trailer; a footnote Ibid the last footnote.
 */
export function expandIbid(texts, types = []) {
  let lastTrailer = null, lastNote = null;
  return texts.map((t, i) => {
    const s = String(t ?? '');
    const p = s.match(PAREN);
    if (p && p[2].length < 500) {
      const exp = expand(p[2].trim(), lastTrailer);
      if (exp) { lastTrailer = exp; return `${p[1]}${exp}${p[3]}${p[4]}`; }
      if (!IBID.test(p[2].trim()) && !/:\s*ibid\b/i.test(p[2])) lastTrailer = p[2].trim();
      return s;
    }
    const n = (types[i] === 'footnote' || /^\s*(?:\[\^\w+\]:|\d{1,4}[.)])\s*ibid\b/i.test(s)) ? s.match(NOTE) : null;
    if (n) {
      const body = n[2].replace(/\.$/, '');
      const exp = expand(body, lastNote);
      if (exp) { lastNote = exp; return `${n[1]}${exp}.`; }
      if (!IBID.test(body)) lastNote = body;
    }
    return s;
  });
}
