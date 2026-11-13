// Display widget `book`: a work the reply recommends or names, as a card (cover, title linked to the book, author, a line on it).
// Built from a book ref the writer named ({{book B1}}). Pure.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function fromRefs([ref], { works, books }) {
  const w = works?.get(ref), b = books?.get(ref) || {};
  if (!w?.title || !w.url) return null;
  return { kind: 'book', title: w.title, author: w.author ?? null, url: w.url, year: b.year ?? null, cover_url: b.cover_url ?? null, description: b.description ?? null };
}
export const toMarkdown = (d) => `**[*${d.title}*](${d.url})**${d.author ? ` — ${d.author}` : ''}${d.year ? ` (${d.year})` : ''}`;
export const toHtml = (d) => `<div class="book-card"><a href="${esc(d.url)}"><em>${esc(d.title)}</em></a>${d.author ? ` — ${esc(d.author)}` : ''}${d.year ? ` (${esc(d.year)})` : ''}${d.description ? `<p>${esc(d.description)}</p>` : ''}</div>`;
