// ISBN — a book's OWN ISBN (Chad 10-23: "Only the document's OWN ISBN counts: from its metadata, or from its own copyright or
// title page in the first pages, near 'ISBN' plus the publisher/© line"). An ISBN cited in a bibliography, footnote or the
// running text is some OTHER book's and never counts. Pure; checksums verified (ISBN-10 mod 11, ISBN-13 mod 10).

const digits = (s) => String(s || '').toUpperCase().replace(/[^0-9X]/g, '');

export function validIsbn10(s) {
  const d = digits(s);
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i);
  return sum % 11 === 0;
}
export function validIsbn13(s) {
  const d = digits(s);
  if (!/^97[89]\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}
/** ISBN-10 → ISBN-13 (978 prefix, new check digit). */
export function toIsbn13(s) {
  const d = digits(s);
  if (d.length === 13) return d;
  const core = `978${d.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
/** A valid ISBN (10 or 13, any hyphenation) → its ISBN-13, else null. */
export function normalizeIsbn(s) {
  const d = digits(s);
  if (d.length === 13 && validIsbn13(d)) return d;
  if (d.length === 10 && validIsbn10(d)) return toIsbn13(d);
  return null;
}

// "ISBN", "ISBN-13:", "ISBN 10", "I.S.B.N." then the number (digits/hyphens/spaces, final X allowed).
const LABELLED = /\bI\.?\s?S\.?\s?B\.?\s?N\.?(?:[-\s]?1[03])?\s*[:#.]?\s*((?:97[89][-\s.]?)?(?:\d[-\s.]?){8,9}[\dXx])\b/g;
/** Every valid labelled ISBN in a text → [{ isbn13, raw, index }]. Unlabelled digit runs are not ISBNs here. */
export function findIsbns(text) {
  const out = [];
  for (const m of String(text || '').matchAll(LABELLED)) {
    const isbn13 = normalizeIsbn(m[1]);
    if (isbn13) out.push({ isbn13, raw: m[0].trim(), index: m.index });
  }
  return out;
}

// The copyright/title-page company an OWN ISBN keeps: ©, "Copyright", "All rights reserved", publisher/imprint lines,
// printing and cataloguing data.
const IMPRINT_RE = /©|\(c\)\s*\d{4}|\bcopyright\b|\ball rights reserved\b|\bpublished (by|in)\b|\bpublishers?\b|\bpublishing\b|\bpress\b|\bprinted in\b|\bfirst (published|edition|printing)\b|\b(library of congress|british library|cataloging|cataloguing)\b|\bedition\b|\bimprint\b/i;
// A citation: the ISBN follows a reference ("pp.", "vol.", a year in parentheses after a title, "In:", "cited", a numbered note).
const CITATION_RE = /\b(pp?\.\s*\d|vol\.\s*\d|in:|cited|see also|bibliography|references|works cited|ibid)/i;

export const FRONT_PARAGRAPHS = 40;   // "the first pages": a book's copyright page sits within its first 40 paragraphs

/**
 * The document's OWN ISBN, with its evidence, or null.
 *   meta:        frontmatter/metadata object (isbn, isbn13, isbn10, ISBN, identifiers)
 *   paragraphs:  the first paragraphs in order [{ paragraph_index, text }] (only the first FRONT_PARAGRAPHS are read)
 * → { isbn13, source: 'metadata' | 'copyright-page', evidence, paragraph_index? }
 */
export function ownIsbn({ meta = null, paragraphs = [] } = {}) {
  for (const k of ['isbn13', 'isbn', 'ISBN', 'isbn10', 'ISBN13', 'ISBN10']) {
    const vals = Array.isArray(meta?.[k]) ? meta[k] : meta?.[k] != null ? [meta[k]] : [];
    for (const v of vals) { const n = normalizeIsbn(v); if (n) return { isbn13: n, source: 'metadata', evidence: `${k}: ${v}` }; }
  }
  for (const id of Array.isArray(meta?.identifiers) ? meta.identifiers : []) {
    const n = /isbn/i.test(id?.type || id?.scheme || '') ? normalizeIsbn(id?.value || id?.identifier) : null;
    if (n) return { isbn13: n, source: 'metadata', evidence: `identifiers: ${id.value || id.identifier}` };
  }
  const front = paragraphs.slice(0, FRONT_PARAGRAPHS);
  for (let i = 0; i < front.length; i++) {
    const text = String(front[i]?.text || '');
    const hits = findIsbns(text);
    if (!hits.length) continue;
    // the imprint may share the ISBN's paragraph or sit just beside it (copyright pages are often split line-per-paragraph)
    const near = [front[i - 2], front[i - 1], front[i], front[i + 1], front[i + 2]].map((p) => String(p?.text || '')).join('\n');
    if (!IMPRINT_RE.test(near)) continue;
    // a long paragraph naming the ISBN amid running text, or one that reads as a reference, is a citation of another book
    if (text.length > 600 || CITATION_RE.test(text)) continue;
    return { isbn13: hits[0].isbn13, source: 'copyright-page', evidence: text.replace(/\s+/g, ' ').trim().slice(0, 240), paragraph_index: front[i].paragraph_index };
  }
  return null;
}
