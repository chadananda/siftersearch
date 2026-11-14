// One line of Anís's markdown → its block kind: a heading ("## Title" or a bold-only line) or an ordered-list item ("1. text").
// Lines arrive HTML-escaped (renderRich); bullets and quotes are handled there. Pure.
export function headingOf(line) {
  const s = String(line ?? '');
  const m = s.match(/^\s*#{1,4}\s+(.{1,160}?)\s*#*\s*$/) || s.match(/^\s*\*\*([^*\n]{1,120})\*\*:?\s*$/);
  return m ? m[1].replace(/^\*\*(.*)\*\*$/, '$1').replace(/:\s*$/, '') : null;   // "**Sources:**" → Sources
}
export function olItem(line) {
  const m = String(line ?? '').match(/^\s*(\d{1,3})[.)]\s+(\S.*)$/);
  return m ? { n: Number(m[1]), text: m[2] } : null;
}
