// Display widget `book`: a work the reply recommends or names, as a card (cover, title linked to the book, author, a line on it).
// Built from a book ref the writer named ({{book B1}}). Pure.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const coverOf = (id) => (Number(id) > 0 ? `https://siftersearch.com/img/covers/${Number(id)}` : null);   // the cover by doc id (no cover → 404 → the card's drawn cover)

export function fromRefs([ref], { works, books, shown }) {
  const w = works?.get(ref), b = books?.get(ref) || {};
  if (!w?.title || !w.url) return null;
  if (shown?.has(ref) || shown?.has(`id:${w.id}`)) return null;   // its card already shows (book_card / a cited work): ONE card per work (Chad 11-13 "two book cards")
  return { kind: 'book', title: w.title, author: w.author ?? null, url: w.url, year: b.year ?? null, cover_url: b.cover_url ?? coverOf(w.id ?? w.document_id), description: b.description ?? null };
}
export const toMarkdown = (d) => `**[*${d.title}*](${d.url})**${d.author ? ` — ${d.author}` : ''}${d.year ? ` (${d.year})` : ''}`;
export const toHtml = (d) => `<div class="book-card"><a href="${esc(d.url)}"><em>${esc(d.title)}</em></a>${d.author ? ` — ${esc(d.author)}` : ''}${d.year ? ` (${esc(d.year)})` : ''}${d.description ? `<p>${esc(d.description)}</p>` : ''}</div>`;
