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
