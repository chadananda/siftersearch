// "#section.paragraph" for a book with sections — one pattern for #letter.paragraph (WOB), #chapter.paragraph, #selection.paragraph
// (Chad 11-09, 11-11: WOB was cited "#182" though its letters are sections). section = 1-based rank among the book's TOP-level sections; paragraph = 1-based ordinal among non-heading blocks inside it. Pure.

/** doc_sections rows → the top-level ones (lowest level present), in order; [] unless there are at least two (one section is the book). */
export function topSections(sections = []) {
  const live = sections.filter((s) => Number.isInteger(s.start_index) && (s.paragraphs ?? 1) > 0);
  if (!live.length) return [];
  const top = Math.min(...live.map((s) => s.level ?? 1));
  const tops = live.filter((s) => (s.level ?? 1) === top).sort((a, b) => a.start_index - b.start_index);
  return tops.length >= 2 ? tops : [];
}

// count of sorted ints < x
const below = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };

/** { tops, body } (body = the doc's non-heading paragraph_index values, sorted) + a paragraph_index → { locator: "#s.p", section } | null. */
export function sectionPlace({ tops = [], body = [] } = {}, pi) {
  if (!tops.length || !Number.isInteger(pi)) return null;
  const i = tops.findIndex((s) => pi >= s.start_index && pi <= (s.end_index ?? s.start_index));
  if (i < 0) return null;
  const at = below(body, pi);
  if (body[at] !== pi) return null;   // a heading or an unknown row: no paragraph number
  const p = at - below(body, tops[i].start_index) + 1;
  return { locator: `#${i + 1}.${p}`, section: tops[i].title || null };
}
