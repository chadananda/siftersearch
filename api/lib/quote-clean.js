// Strips what a library's "copy" appends to a quotation: OceanLibrary adds a reference line (`Bahá’u’lláh, "Gleanings…", 60.2`)
// and a short link; Ocean of Lights adds the page URL. Pure — shared by the API (prepareQuote) and the SourceHunt page (paste).
const URL_LINE = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i;
// author(s), a quoted title, then a numeric locator (5.47.1 · 60.2 · p. 12) — the reference line OceanLibrary appends
const REF_LINE = /^[^\n]{0,240}["“][^"”\n]{2,200}["”],?\s*(?:p{1,2}\.\s*)?[\d][\d.:,–\-\s]*$/;

export function stripAppendedReference(raw = '') {
  const lines = String(raw).split(/\r?\n/);
  const blank = (l) => !l.trim();
  let end = lines.length;
  const trimBlanks = () => { while (end > 0 && blank(lines[end - 1])) end--; };
  trimBlanks();
  // only ever strip trailing lines, and never the first line (that is the quotation)
  while (end > 1 && (URL_LINE.test(lines[end - 1]) || REF_LINE.test(lines[end - 1].trim()))) { end--; trimBlanks(); }
  const kept = lines.slice(0, end).join('\n').trim();
  // a URL glued to the end of a one-line paste
  return kept.replace(/\s+(?:https?:\/\/(?:www\.)?(?:oceanlibrary\.com|oceanoflights\.org)\/\S*)\s*$/i, '').trim();
}
