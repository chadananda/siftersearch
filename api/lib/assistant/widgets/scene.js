// Display widget `scene`: one moment of a person's or an event's story, told by its record — the book's cover, the scene's title and
// one line, then the passage(s) that record it, each linked to its place. {{scene "Conference of Badasht" "1848: the old law is set aside" P4 P5}}.
// The title and line are the writer's; the words are the passages' own. Pure.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const coverOf = (id) => (Number(id) > 0 ? `https://siftersearch.com/img/covers/${Number(id)}` : null);   // the cover by doc id (no cover → 404 → the card's drawn cover)
export function fromRefs(refs, { found }, [title, line] = []) {
  const passages = refs.map((r) => found?.get(r)).filter((p) => p?.text && p.source_url)
    .map((p) => ({ text: String(p.text).trim(), url: p.source_url, title: p.title ?? null, author: p.author ?? null, place: p.place ?? null }));
  if (!title?.trim() || !passages.length) return null;
  const lead = refs.map((r) => found?.get(r)).find((p) => p?.cover_url);
  return { kind: 'scene', title: title.trim(), line: line?.trim() || null, cover_url: lead?.cover_url ?? coverOf(found?.get(refs[0])?.document_id), passages };
}
const by = (p) => `${p.author ? `${p.author}, ` : ''}[*${p.title || 'source'}*](${p.url})${p.place ? `, ${p.place}` : ''}`;
export const toMarkdown = (d) => [`**${d.title}**${d.line ? ` — ${d.line}` : ''}`,
  ...d.passages.map((p) => `${p.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}\n> — ${by(p)}`)].join('\n\n');
export const toHtml = (d) => `<section class="scene-card"><h4>${esc(d.title)}</h4>${d.line ? `<p class="scene-line">${esc(d.line)}</p>` : ''}`
  + d.passages.map((p) => `<figure><blockquote>${p.text.split(/\n\s*\n/).map((x) => `<p>${esc(x)}</p>`).join('')}</blockquote>`
    + `<figcaption>— ${p.author ? `${esc(p.author)}, ` : ''}<a href="${esc(p.url)}"><em>${esc(p.title || 'source')}</em></a>${p.place ? `, ${esc(p.place)}` : ''}</figcaption></figure>`).join('')
  + '</section>';
