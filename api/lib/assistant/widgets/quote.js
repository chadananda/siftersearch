// Display widget `quote`: one passage the reply quotes, shown as a card (cover, the words, "— author, Work" linked to the place).
// Built from a passage ref the writer named ({{quote P3}}); the words are the passage's own, never the writer's. Pure.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function fromRefs([ref], { found }) {
  const p = found?.get(ref);
  if (!p?.text || !p.source_url) return null;
  return { kind: 'quote', text: String(p.text).trim(), url: p.source_url, title: p.title ?? null, author: p.author ?? null, place: p.place ?? null, cover_url: p.cover_url ?? null };
}
const by = (d) => `${d.author ? `${d.author}, ` : ''}[*${d.title || 'source'}*](${d.url})${d.place ? `, ${d.place}` : ''}`;
export const toMarkdown = (d) => `${d.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}\n> — ${by(d)}`;
export const toHtml = (d) => `<figure class="quote-card"><blockquote>${d.text.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join('')}</blockquote>`
  + `<figcaption>— ${d.author ? `${esc(d.author)}, ` : ''}<a href="${esc(d.url)}"><em>${esc(d.title || 'source')}</em></a>${d.place ? `, ${esc(d.place)}` : ''}</figcaption></figure>`;
