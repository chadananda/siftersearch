// Title/author for a converted document, WITHOUT inventing either.
//
// bahai-library.com stubs carry metadata derived from the FILE PATH, not from the book: a PDF served at
// /pdf/z/zwemer_islam_challenge_faith.pdf becomes author "pdf-z-zwemer", title "zwemer_islam_challenge_faith".
// That is a file locator wearing an author's clothes — it names the format, an alphabetical bucket and a
// surname — and it flows straight into citations, search facets and the entity layer, where "pdf-z-zwemer"
// is indistinguishable from a person. Chad caught ~1,915 documents carrying it (2026-08-13).
//
// Doctrine, the same one that governs hype questions: a wrong value is worse than an absent one. We do not
// convert a locator into a plausible-looking author. We recover what the document itself states, and where
// it states nothing we leave the field NULL and say so.
// Deps: none (pure) — callers supply the document's opening text.

/** A stub value that is a file locator, not metadata: <ext>-<letter>-<surname>, or a bare filename slug. */
const LOCATOR_AUTHOR = /^(pdf|doc|docx|html?|txt|rtf|epub|md)[-_]/i;
const FILENAME_TITLE = /^[a-z0-9]+([_-][a-z0-9]+){2,}$/;      // all-lowercase, underscore/hyphen separated

export const isLocatorAuthor = (a) => LOCATOR_AUTHOR.test(String(a || '').trim());
export const isFilenameTitle = (t) => FILENAME_TITLE.test(String(t || '').trim());

/**
 * Surname carried by a locator author, when there is one: 'pdf-z-zwemer' → 'zwemer'. NOT an author — only a
 * hint for verifying a candidate found in the text, so we never promote the locator itself.
 */
export function locatorSurname(author) {
  const m = /^[a-z]+[-_]([a-z])[-_](.+)$/i.exec(String(author || '').trim());
  return m ? m[2].replace(/[-_]+/g, ' ').trim().toLowerCase() : null;
}

/**
 * Recover a title from the document's own opening lines. Conservative on purpose: a title line is short,
 * mostly letters, not a sentence, and not front-matter furniture. Returns null rather than guessing.
 */
export function titleFromText(text, { maxLines = 12 } = {}) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, maxLines);
  const SKIP = /^(published|copyright|©|all rights|isbn|first published|contents|table of contents|page \d|www\.|https?:)/i;
  for (const l of lines) {
    if (l.length < 4 || l.length > 120) continue;
    if (SKIP.test(l)) continue;
    if (/[.!?]$/.test(l) && l.split(/\s+/).length > 12) continue;    // a sentence, not a title
    if ((l.match(/[A-Za-z]/g) || []).length < l.length * 0.6) continue;
    return l.replace(/\s+/g, ' ');
  }
  return null;
}

/**
 * Recover an author from an explicit byline only ("by X", "Author: X"). No inference from surrounding prose:
 * the cost of a wrong author is a fabricated person in the graph.
 * When `expectSurname` is given (from the locator) it must appear in the candidate, which turns the locator
 * into CORROBORATION instead of a source.
 */
export function authorFromText(text, { expectSurname = null, maxChars = 3000 } = {}) {
  const head = String(text || '').slice(0, maxChars);
  const pats = [/^\s*(?:by|By|BY)[:\s]+([^\n]{3,80})$/m, /^\s*Author[:\s]+([^\n]{3,80})$/mi];
  for (const re of pats) {
    const m = re.exec(head);
    if (!m) continue;
    const cand = m[1].replace(/\s+/g, ' ').replace(/[,.;]+$/, '').trim();
    if (!/[A-Za-z]{2}/.test(cand) || cand.split(/\s+/).length > 8) continue;
    if (expectSurname && !cand.toLowerCase().includes(expectSurname)) continue;   // must corroborate
    return cand;
  }
  return null;
}

/**
 * The decision for one document. Returns what to WRITE plus why, so a reviewer can see which documents
 * still need a human. `null` for a field means "unknown" — never a placeholder.
 */
export function resolveSourceMetadata({ stubTitle, stubAuthor, text }) {
  const notes = [];
  let title = stubTitle || null;
  let author = stubAuthor || null;

  if (isLocatorAuthor(author)) {
    const surname = locatorSurname(author);
    const found = authorFromText(text, { expectSurname: surname });
    notes.push(found ? `author recovered from byline (corroborated by '${surname}')`
      : `author was a file locator ('${author}') → left unknown; no byline in the text`);
    author = found;                                   // null when the document does not say
  }
  if (isFilenameTitle(title)) {
    const found = titleFromText(text);
    notes.push(found ? 'title recovered from the document opening'
      : `title was a filename slug ('${title}') → left unknown`);
    title = found;
  }
  return { title, author, notes, needsReview: !author || !title };
}
