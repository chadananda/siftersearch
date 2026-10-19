// dewey-retitle ops report — imported documents whose title describes what the pre-OCR appraisal could not read ("Untitled
// pilgrim's account … (no heading in the excerpts)") get a real one from their own opening text: the title it prints, or —
// a manuscript with none — an archival SUPPLIED title in square brackets (what it is, who, when, where), never "excerpts".
// Read-only: proposals { doc_id, from, to }; applied through PUT /api/library/documents/:id. params { limit? }.
import { listItems } from '../repos/dewey-repo.js';
import { getParagraphs } from '../docs-repo.js';
import { roleCreate } from '../role-client.js';
import { placeholderTitle } from './dewey-ocr-job.js';

const ASK = (title, author, text) => `A library document was given this provisional title from a few unreadable pages: "${title}"${author ? ` (author: ${author})` : ''}.
Here is the beginning of its full text. Give its proper library title:
- if the text prints a title (a title page, a heading at the start), use that title, in title case;
- otherwise (a letter, notes, a manuscript with no title) write an archival supplied title in square brackets, concise: what it is, by or to whom, when and where — e.g. "[Letter from William Sears to Leroy Ioas, 20 September 1960]".
Never mention excerpts, legibility or the provisional title. Reply with JSON only: {"title":"…","printed":true|false}

${text}`;

export async function deweyRetitleJob({ limit = 50 } = {}, deps = {}) {
  const { items = async () => listItems({ state: 'ingested', limit: 5000 }), paragraphs = (id) => getParagraphs(id, { proseOnly: false, limit: 60 }), create = roleCreate } = deps;
  const out = [];
  for (const i of await items()) {
    if (out.length >= limit || !i.doc_id || !placeholderTitle(i.title)) continue;
    const text = (await paragraphs(i.doc_id).catch(() => [])).map((p) => p.text).join('\n\n').slice(0, 6000);
    if (text.length < 200) continue;
    const r = await create('dewey-identify', { max_tokens: 400, temperature: 0, messages: [{ role: 'user', content: ASK(i.title, i.author, text) }] }).catch(() => null);
    const m = String(r?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
    let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch { /* skipped */ }
    if (j?.title && !placeholderTitle(j.title)) out.push({ item: i.id, doc_id: i.doc_id, from: i.title, to: j.title.trim(), printed: !!j.printed });
  }
  return { proposals: out.length, list: out };
}
