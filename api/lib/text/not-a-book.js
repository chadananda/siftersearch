// Things that must not become books.
//
// The 2026-08-13 conversion run ingested web ERROR PAGES as library documents — titles 'Error 404' and
// 'PDF Support' appear in docs, with a full doc row, a paragraph count, and eventually an entity layer built
// on top of them. A 404 page is not a book in any circumstance, and the cheapest place to say so is before
// it is written.
//
// Two classes, deliberately kept apart:
//   REJECT   — not a document at all (error/support/access pages). Never ingest; no judgement call.
//   APPARATUS— real material that is not a WORK (an index, a table of contents, a cross-reference list).
//              Flagged, not silently dropped: whether the library wants Gleanings' index as a document is
//              Chad's decision, not a regex's. Callers choose what to do with the flag.
// Deps: none (pure).

// Title-level: what the catalogue calls it.
const ERROR_TITLE = /^\s*(error\s*\d{3}|\d{3}\s*error|page not found|not found|access denied|forbidden|unauthori[sz]ed|bad gateway|service unavailable|under construction|coming soon|pdf support|support|help|login|sign in)\s*$/i;
// Text-level: what actually came back. Catches the case the title hides — a stub titled like a book whose
// file 404s and returns an error page body.
const ERROR_BODY = /\b(404 not found|error 404|page (?:you requested )?(?:was )?not found|the requested url .{0,60} was not found|access denied|403 forbidden|you (?:do not|don'?t) have permission|this page (?:is|has been) (?:unavailable|removed))\b/i;
// Apparatus: real, but not a work in its own right.
const APPARATUS_TITLE = /(^|[_\s-])(index|toc|table of contents|contents|bibliography|cross-?references?|concordance)([_\s-]|$)/i;

export const isErrorPageTitle = (t) => ERROR_TITLE.test(String(t || '').trim());
export const isApparatusTitle = (t) => APPARATUS_TITLE.test(String(t || '').trim());

/**
 * Does the extracted TEXT read as a web error page? Checked on the head only: an error page is short and
 * says so immediately, whereas a real book may quote the phrase "not found" anywhere in 300 pages.
 */
export function isErrorPageText(text, { headChars = 1200, maxWords = 400 } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (t.split(' ').length > maxWords) return false;      // long enough to be real content
  return ERROR_BODY.test(t.slice(0, headChars));
}

/**
 * The verdict for one candidate. `reject` is unambiguous; `apparatus` is advisory and carries the reason so
 * a caller can count them without deciding for the librarian.
 */
export function classifyCandidate({ title, text } = {}) {
  if (isErrorPageTitle(title)) return { reject: true, reason: `not a document: the catalogue title is a web error/support page ("${String(title).trim()}")` };
  if (isErrorPageText(text)) return { reject: true, reason: 'not a document: the fetched file is a web error page, not the book' };
  if (isApparatusTitle(title)) return { reject: false, apparatus: true, reason: 'apparatus (index/TOC/bibliography), not a work in its own right' };
  return { reject: false };
}
