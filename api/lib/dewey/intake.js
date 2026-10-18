// Dewey's INTAKE pieces (Chad 10-17: "If we add a PDF or a url to a PDF for that book, we remove it from the missing
// books and start processing"): archive the original untouched (by sha256), extract its text by type, check it is real
// prose (letters in ANY script — the converter's gate counts Latin only and would reject an Arabic book), choose where it
// belongs among the library's EXISTING tradition › collection folders (never a new one), and write the Markdown file
// collision-safe. The ops job (ops/dewey-intake-job.js) strings them together and ingests.
import { createHash } from 'crypto';
import { existsSync, readdirSync, statSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { roleCreate } from '../role-client.js';
import { toMarkdownText } from './convert.js';

export const originalsDir = () => process.env.LIBRARY_ORIGINALS_DIR || '/tank/library-originals';

/** Keep the original untouched: <originals>/<sha256>.<ext> + a sidecar of where it came from. Same bytes → same file. */
export async function archiveOriginal(bytes, { name = '', url = null, itemId = null } = {}) {
  const buf = Buffer.from(bytes);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const ext = (name.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1] || (buf.subarray(0, 4).toString() === '%PDF' ? 'pdf' : 'bin')).toLowerCase();
  const path = join(originalsDir(), `${sha256}.${ext}`);
  await mkdir(originalsDir(), { recursive: true });
  if (!existsSync(path)) {
    await writeFile(path, buf);
    await writeFile(`${path}.json`, JSON.stringify({ sha256, name, url, itemId, bytes: buf.length, archivedAt: new Date().toISOString() }, null, 2));
  }
  return { path, sha256, ext, bytes: buf.length };
}

/** Text by type → { text, pages }: Markdown from the one converter (convert.js). A scan PDF has no text layer — OCR later. */
export async function extractText(bytes, ext) {
  const { markdown, pages } = await toMarkdownText(bytes, `original.${ext}`);
  return { text: markdown, pages };
}

/** Real prose? Letters in any script, a substantial length, some text per page. A scan reads ~0 words. */
export function proseGate(text, { pages = 1 } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const words = t ? t.split(' ').length : 0;
  const letters = (t.match(/\p{L}/gu) || []).length;
  const ratio = t.length ? letters / t.length : 0;
  const perPage = words / Math.max(1, pages);
  const why = [words < 300 && `too short (${words} words)`, ratio < 0.55 && `low letter ratio (${ratio.toFixed(2)})`,
    perPage < 25 && `almost no text per page (${Math.round(perPage)} words/page)`].filter(Boolean);
  return { ok: !why.length, why: why.join('; '), words, scan: words / Math.max(1, pages) < 25 };
}

/** The library's existing shelves: tradition folders (those with .religion/meta.yaml) and their collection folders. */
export function libraryShelves(base = config.library.basePath) {
  const out = {};
  for (const r of readdirSync(base)) {
    const rp = join(base, r);
    if (!existsSync(join(rp, '.religion', 'meta.yaml'))) continue;
    out[r] = readdirSync(rp).filter((c) => !c.startsWith('.') && statSync(join(rp, c)).isDirectory());
  }
  return out;
}

const jsonOf = (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

/** Where a work belongs: one of the existing tradition › collection pairs, chosen by the model from what we know. */
export async function chooseShelf(work, shelves, { create = roleCreate } = {}) {
  const list = Object.entries(shelves).map(([r, cs]) => `${r}: ${cs.join(' | ')}`).join('\n');
  const res = await create('dewey-identify', { max_tokens: 200, temperature: 0, messages: [{ role: 'user', content:
    `Where does this work belong in the library? Choose ONE existing tradition and ONE of its existing collections.
Work: ${JSON.stringify(work)}
SHELVES (tradition: collections)
${list}
Return JSON {"religion":"…","collection":"…","why":"one short reason"}` }] });
  const out = jsonOf(res?.choices?.[0]?.message?.content);
  if (out && shelves[out.religion]?.includes(out.collection)) return out;
  return null;   // an answer outside the existing shelves is refused — a person files it
}

const slugify = (s) => String(s || 'untitled').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Write the Markdown into the library; a path already taken gets the item id appended, never overwritten. → rel */
export async function writeLibraryFile({ religion, collection, title, itemId, markdown }, base = config.library.basePath) {
  let rel = join(religion, collection, `${slugify(title)}.md`);
  if (existsSync(join(base, rel))) rel = join(religion, collection, `${slugify(title)}-dewey${itemId}.md`);
  await mkdir(dirname(join(base, rel)), { recursive: true });
  await writeFile(join(base, rel), markdown);
  return rel;
}

/** Frontmatter + text. Metadata comes from research and identification; what nothing states is left out, not guessed. */
export function toMarkdown({ title, author, language, research = {}, sourceUrl, sha256, itemId }, text) {
  const line = (k, v) => (v == null || v === '' ? '' : `${k}: "${String(v).replace(/"/g, "'")}"\n`);
  return `---\n${line('title', title)}${line('author', author)}language: ${language || 'en'}\n${line('publisher', research.publisher)}${line('year', research.year)}`
    + `${line('isbn', research.isbn13 || research.isbn10)}${line('source_url', sourceUrl)}${line('original_sha256', sha256)}dewey_item: ${itemId}\n---\n\n`
    + String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
