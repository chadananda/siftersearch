// Sub-documents (Chad 10-15: "the document index needs to include sub-documents … many people don't even know which book
// their sub-document was published inside"). A section = a run of paragraphs under one heading: God Passes By's Foreword,
// a chapter, a talk in a compilation. Pure: rows in, sections out; sections-repo stores them, the finder searches them.
// Phase 1 reads the per-paragraph `heading` the ingesters stored (nearest heading, no level); phase 2 adds levels from the
// source files so top-level parts whose own heading was not stored ("The Dispensation of Bahá'u'lláh") appear too.

const fold = (s) => String(s || '').replace(/^[\s\\\-–—#*_]+|[\s\\\-–—#*_]+$/g, '').replace(/\s+/g, ' ').trim();

/** A heading that names nothing a reader would look for: page numbers, bare dates or numerals, separators, runaway text. */
export function isNoiseHeading(title) {
  const t = fold(title);
  if (!t || t.length > 160) return true;
  if (!/\p{L}/u.test(t)) return true;                                        // "* * *", "12", "—"
  if (/^(page|p\.)\s*\d+$/i.test(t)) return true;
  return false;
}

/** rows: [{ id, paragraph_index, heading }] in paragraph order → [{ ord, title, start_index, end_index, paragraphs, first_para_id }]. */
export function sectionsFromRows(rows = []) {
  const out = [];
  let cur = null;
  for (const r of rows) {
    const title = fold(r.heading);
    if (cur && title === cur.title) { cur.end_index = r.paragraph_index; cur.paragraphs++; continue; }
    cur = null;
    if (isNoiseHeading(title)) continue;
    cur = { ord: out.length, title, start_index: r.paragraph_index, end_index: r.paragraph_index, paragraphs: 1, first_para_id: r.id };
    out.push(cur);
  }
  return out;
}
