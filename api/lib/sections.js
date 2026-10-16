// Sub-documents (Chad 10-15: "the document index needs to include sub-documents … many people don't even know which book
// their sub-document was published inside"). A section = a run of paragraphs under one heading: God Passes By's Foreword,
// a chapter, a talk in a compilation. Pure: rows in, sections out; sections-repo stores them, the finder searches them.
// Phase 1 reads the per-paragraph `heading` the ingesters stored (nearest heading, no level); phase 2 adds levels from the
// source files so top-level parts whose own heading was not stored ("The Dispensation of Bahá'u'lláh") appear too.

// A heading as a reader would name it: page markup out ("11 -<br><br>Lawḥ-i-Maqṣúd<br>**(Tablet of Maqṣúd)" →
// "Lawḥ-i-Maqṣúd (Tablet of Maqṣúd)"), a leading item number dropped, edge punctuation trimmed.
const fold = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|__|(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w)/g, '')
  .replace(/^[\s\\\-–—#*_]+|[\s\\\-–—#*_]+$/g, '').replace(/^\d{1,4}\s*[-–—.:)]\s+(?=\p{L})/u, '').replace(/\s+/g, ' ').trim();

/** A heading that names nothing a reader would look for: page numbers, bare dates or numerals, separators, runaway text. */
export function isNoiseHeading(title) {
  const t = fold(title);
  if (!t || t.length > 160) return true;
  if (!/\p{L}/u.test(t)) return true;                                        // "* * *", "12", "—"
  if (/^(page|p\.)\s*\d+$/i.test(t)) return true;
  const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december)';
  if (new RegExp(`^${MONTH}\\s+\\d{1,2},?\\s+\\d{4}$`, 'i').test(t) || new RegExp(`^\\d{1,2}\\s+${MONTH},?\\s+\\d{4}$`, 'i').test(t)) return true;
  return false;
}

/**
 * Phase 2 — the source file's OUTLINE: every heading with its level and paragraph id ({.toc1 … id="para_72"}), so parts
 * whose own heading the ingest did not store ("The Dispensation of Bahá'u'lláh", "The Goal of a New World Order") become
 * sections, NESTED: a part spans every paragraph until the next heading of the same or a higher level.
 * md: the file; rows: [{ id, paragraph_index, para_num }] (para_num from the row's block_attrs id="para_N"), in order.
 */
export function outlineSections(md, rows = []) {
  const heads = [];
  for (const line of String(md || '').split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*\{([^{}]*)\}\s*$/);
    if (!h) continue;
    const attrs = h[3];
    if (/\btype="title"/.test(attrs)) continue;                         // the book's own title / author / copyright block
    const num = Number(attrs.match(/\bid="para_(\d+)"/)?.[1]);
    if (!num) continue;
    const level = Number(attrs.match(/\.toc(\d)\b/)?.[1]) || h[1].length;
    const title = fold(h[2]);
    if (isNoiseHeading(title)) continue;
    heads.push({ num, level, title });
  }
  const numbered = rows.filter((r) => Number.isFinite(r.para_num));
  const out = [];
  heads.forEach((hd, i) => {
    const next = heads.slice(i + 1).find((x) => x.level <= hd.level);
    const inside = numbered.filter((r) => r.para_num > hd.num && (!next || r.para_num < next.num));
    if (!inside.length) return;
    out.push({ ord: out.length, level: hd.level, title: hd.title, start_index: inside[0].paragraph_index,
      end_index: inside[inside.length - 1].paragraph_index, paragraphs: inside.length, first_para_id: inside[0].id });
  });
  return out;
}

/** para_N of a row: its block_attrs id (copied from a library file by the block-attrs job) or its external_para_id (the
 *  OceanLibrary site adapter stores the page's para id there), or null. */
export const paraNum = (blockAttrs, externalId = null) => {
  let id = externalId;
  try { id = JSON.parse(blockAttrs || '{}').id || id; } catch { /* malformed attrs: the external id stands */ }
  const m = String(id || '').match(/^para_(\d+)$/);
  return m ? Number(m[1]) : null;
};

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
