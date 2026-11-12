// Pure helpers for the side-by-side printable document (/print/sbs/<doc>): quotes, ornaments, paging, section lookup.
export const smartQuotes = (s = '') => String(s)
  .replace(/(^|[\s(\[{\u2014])"(\S)/g, '$1\u201C$2').replace(/(\S)"([\s)\]}.,:;!?\u2014]|$)/g, '$1\u201D$2').replace(/"/g, '\u201D')
  .replace(/(^|[\s(\[{\u2014])'(\S)/g, '$1\u2018$2').replace(/(\w)'(\w)/g, '$1\u2019$2').replace(/'/g, '\u2019');
// A row that is only `*` / `* * *` is a divider → ۝
export const isOrnament = (s) => /^\s*(\*\s*)+$/.test(s || '');
// Row → { o, t, orn } ready to render (English smart-quoted, dividers flagged)
export const prepRow = (r) => (isOrnament(r.o) || (isOrnament(r.t) && !r.o)) ? { o: '', t: '', orn: true } : { o: r.o || '', t: smartQuotes(r.t || ''), orn: false };
export const sbsUrl = (base, id, offset = 0, limit = 400) => `${base}/api/v1/documents/${encodeURIComponent(id)}/sbs?offset=${offset}&limit=${limit}`;
// Follow next_offset until done; `first` (already fetched page) is optional. Returns { doc, sections, paragraphs }.
export async function loadAll(fetchFn, base, id, first = null) {
  let page = first, offset = 0, paragraphs = [], doc, sections = [];
  for (let guard = 0; guard < 500; guard++) {
    if (!page) { const r = await fetchFn(sbsUrl(base, id, offset)); if (!r.ok) throw Object.assign(new Error(`sbs ${r.status}`), { status: r.status }); page = await r.json(); }
    doc ??= page.doc; if (page.sections?.length) sections = page.sections;
    paragraphs = paragraphs.concat(page.paragraphs || []);
    if (page.next_offset == null) break;
    offset = page.next_offset; page = null;
  }
  return { doc, sections, paragraphs };
}
// Sections keyed by the paragraph number they start at
export const sectionStarts = (sections = []) => new Map(sections.map((s, i) => [s.start, { ...s, i }]));
// a CSS string inside an {@html <style>}: quotes/backslash escaped, '<' as \3C so a title can never close the style element
export const cssString = (s = '') => String(s).replace(/[\\"]/g, '\\$&').replace(/</g, '\\3C ').replace(/[\r\n]+/g, ' ');
export const pageUrlFor = (origin, id) => `${origin}/print/sbs/${encodeURIComponent(id)}`;
