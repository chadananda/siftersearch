// Prayer-book structure, pure (no model): attribution lines, headings, prayers split on them, the section holding a paragraph. Used by prayer-shelf.js (Jev picks) and the prayer_lookup tool.

export const PRAYER_BOOK = 'Bahá’í Prayers';

/** An attribution line closes a prayer: "_—Bahá’u’lláh_", "—‘Abdu’l-Bahá", "— The Báb". Pure. */
export const isAttribution = (text) => /^[\s_*]*[—–-]\s*\S/.test(String(text || '')) && String(text || '').replace(/[_*]/g, '').trim().length < 60;

/** Is this row a heading line (not body text)? `heading` on a content row is the SECTION it sits under (every prayer under
 *  "For The Departed" carries heading "For The Departed"), so it never marks the row itself: blocktype does, or a markdown
 *  "#" line, or a row whose whole text is its heading. A bare `heading: true` (older fixtures) still counts. Pure. */
export const isHeadingRow = (r) => r?.blocktype === 'heading' || r?.heading === true || /^\s*#/.test(String(r?.text || ''))
  || (typeof r?.heading === 'string' && r.heading.trim() !== '' && String(r.text || '').trim() === r.heading.trim());

/** Section rows → prayers: runs of paragraphs, each ending at an attribution line (a run without one is kept too). Pure. */
export function splitPrayers(rows = []) {
  const prayers = []; let cur = [];
  for (const r of rows) {
    if (!String(r.text || '').trim() || isHeadingRow(r)) continue;
    cur.push(r);
    if (isAttribution(r.text)) { prayers.push(cur); cur = []; }
  }
  if (cur.length) prayers.push(cur);
  return prayers.filter((p) => p.some((r) => !isAttribution(r.text)));
}

/** The prayer (a splitPrayers run) holding paragraph `pi`, or null. Pure. */
export const prayerAt = (prayers, pi) => prayers.find((p) => p.some((r) => r.paragraph_index === pi)) || null;

/** The smallest section of the book holding paragraph `pi`, or null. Pure. */
export const sectionAt = (sections, pi) => (pi == null ? null
  : sections.filter((x) => pi >= x.start_index && pi <= x.end_index).sort((a, b) => a.paragraphs - b.paragraphs)[0] || null);

/** The book's search hits → choice candidates for Jev: this book only (a hit elsewhere shares paragraph numbers with no section
 *  here — 11-04 w3:pr-no-heading served the Tablets of Visitation from another book's ¶831), body text only, one per paragraph,
 *  meaning hits first. Keyed "found:<paragraph_index>". Pure. */
export function foundCandidates(docId, lists, sections) {
  const seen = new Set(); const out = [];
  for (const p of lists.flat()) {
    const pi = p?.paragraph_index;
    if (pi == null || Number(p.document_id) !== Number(docId) || seen.has(pi) || isAttribution(p.text) || isHeadingRow(p)) continue;
    seen.add(pi);
    out.push({ key: `found:${pi}`, p, section: sectionAt(sections, pi) });
  }
  return out;
}

