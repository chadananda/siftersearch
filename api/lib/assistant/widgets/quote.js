// Display widget `quote`: one passage the reply quotes, shown as a card (cover, the words, "— author, Work" linked to the place).
// Built from a passage ref the writer named ({{quote P3}}); the words are the passage's own, never the writer's. Pure.
import { misfiled } from '../source-tier.js';
import { cleanCardText, isPdfDump, readableTitle, holdsPhrase, shownText } from './card-text.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const coverOf = (id) => (Number(id) > 0 ? `https://siftersearch.com/img/covers/${Number(id)}` : null);   // the cover by doc id (no cover → 404 → the card's drawn cover)
export function fromRefs([ref], { found }, [words] = []) {
  const p = found?.get(ref);
  if (!p?.text || !p.source_url || isPdfDump(p.text)) return null;   // a PDF page is never a card (its lead-in goes with it: lint dropDanglingLeadIn)
  const shown = words && holdsPhrase(p.text, words) ? words : p.text;   // the words quoted, when the passage holds them (blockquoteCards); else the whole passage
  return { kind: 'quote', text: cleanCardText(shownText(shown, p.document_id ?? p.doc_id)), url: p.source_url, title: readableTitle(p.title), author: misfiled(p) ? null : (p.author ?? null), place: p.place ?? null, cover_url: p.cover_url ?? coverOf(p.document_id ?? p.doc_id) };
}
const by = (d) => `${d.author ? `${d.author}, ` : ''}[*${d.title || 'source'}*](${d.url})${d.place ? `, ${d.place}` : ''}`;
export const toMarkdown = (d) => `${d.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')}\n> — ${by(d)}`;
export const toHtml = (d) => `<figure class="quote-card"><blockquote>${d.text.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join('')}</blockquote>`
  + `<figcaption>— ${d.author ? `${esc(d.author)}, ` : ''}<a href="${esc(d.url)}"><em>${esc(d.title || 'source')}</em></a>${d.place ? `, ${esc(d.place)}` : ''}</figcaption></figure>`;
