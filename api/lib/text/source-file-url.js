// Which source URLs the converter can actually fetch — ONE definition.
//
// convert-missing-books.mjs decides "is there a file behind this doc?" with this rule, and 2,807 items are
// rejected as "no source file linked" — 75% of every rejection, and the single largest reason the converter
// finds no work. Whether that is an unrecognised URL SHAPE (widening helps thousands) or genuinely no file
// (widening helps nobody) can only be answered by testing candidates against the REAL rule, so the rule
// lives here rather than inline in the script, and the diagnostic imports it (2026-08-15).

/** Extract the first fetchable document URL from a link/blob of text, or null. */
export function fileUrlOf(linktext) {
  const t = linktext || '';
  const m = t.match(/https?:\/\/[^\s()[\]"']+\.(?:pdf|docx?|rtf)\b/i)
    || t.match(/https?:\/\/bahai-library\.com\/docs\/[^\s()[\]"']+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
}

/** Any http(s) URL at all — used to tell "no URL" apart from "URL we don't recognise". */
export function anyUrlOf(linktext) {
  const m = String(linktext || '').match(/https?:\/\/[^\s()[\]"']+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
}

/** Coarse shape of a URL for grouping: host + trailing extension (or 'none'). */
export function urlShape(url) {
  if (!url) return null;
  let host = '';
  try { host = new URL(url).host.replace(/^www\./, ''); } catch { host = '(unparseable)'; }
  const ext = (url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i) || [null, 'none'])[1].toLowerCase();
  return `${host} .${ext}`;
}

/**
 * Why can't we fetch a file for this doc?
 *   no-url          — nothing that looks like a link; widening the matcher cannot help
 *   unmatched-shape — a URL exists but the matcher rejects it; widening COULD help
 *   matchable       — the matcher accepts it (so the rejection came from elsewhere)
 */
export function classifySource(linktext) {
  if (fileUrlOf(linktext)) return 'matchable';
  return anyUrlOf(linktext) ? 'unmatched-shape' : 'no-url';
}


// ── Landing pages ──────────────────────────────────────────────────────────────────────────────────────
// 2,789 docs store a bahai-library.com LANDING page in source_url — an abstract page of ~1.4k characters
// that links to the real file. The converter's matcher already accepts /docs/ links; it simply never had
// one to look at. So this is link resolution, not document conversion: follow the landing page, take the
// file it points to, and hand the existing pipeline an RTF/DOCX/PDF it already knows how to read.
//
// Verified against live pages: /khanum_horace_hotchkiss_holley → /docs/k/….rtf + /pdf/k/….pdf;
// /khianra_immortals → /docs/k/….docx + /pdf/k/….pdf (2026-08-16).

/** A bahai-library.com page with no file extension and not already a /docs/ link. */
export function isLandingPage(url) {
  if (!url) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/(^|\.)bahai-library\.com$/i.test(u.host)) return false;
  if (/^\/(docs|pdf)\//i.test(u.pathname)) return false;              // already a file path
  return !/\.[a-z0-9]{2,5}$/i.test(u.pathname);                       // no extension ⇒ landing page
}

/**
 * Best file link on a landing page, absolutised.
 *
 * PREFERENCE ORDER IS DELIBERATE: rtf/doc/docx before pdf. ~250 items in this corpus are already rejected
 * as "low letter ratio (likely scanned or tabular)" — that is a PDF text-layer problem, and choosing a
 * word-processor format when one is offered avoids walking straight into it.
 */
export function fileLinkOnLandingPage(html, pageUrl) {
  const hrefs = [...String(html || '').matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  const abs = (h) => { try { return new URL(h, pageUrl).toString(); } catch { return null; } };
  const rx = [/\.(rtf|docx?)(?:[?#]|$)/i, /\.pdf(?:[?#]|$)/i];
  for (const re of rx) {
    const hit = hrefs.find((h) => re.test(h) && fileMatchesSlug(h, pageUrl));
    if (hit) return abs(hit);
  }
  return null;
}

/**
 * Does this file belong to THIS page, or to the volume the page sits inside?
 *
 * Caught by the dry run before anything was written: /kluge_which_world resolves to
 * /pdf/l/lights_irfan_complete_21.pdf — the whole Lights of Irfan anthology the article appears in, not the
 * article. Taking it would file an entire compilation under one article's doc id, which is corpus
 * corruption dressed as a successful ingest. So the file's basename must agree with the page's slug;
 * anything else is a different document and is skipped (2026-08-16).
 */
export function fileMatchesSlug(href, pageUrl) {
  let slug = '';
  try { slug = new URL(pageUrl).pathname.replace(/^\/+|\/+$/g, ''); } catch { return false; }
  if (!slug) return false;
  const base = String(href).split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!base) return false;
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const a = norm(slug), b = norm(base);
  // Exact, or one contains the other — bahai-library truncates some filenames, but a compilation name
  // ("lightsirfancomplete21") shares no such relationship with an article slug ("klugewhichworld").
  return a === b || a.includes(b) || b.includes(a);
}
