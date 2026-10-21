// DOC CORRECTIONS — a person's corrections to document records (Chad 10-21: "Messages … 1986-2001" scraped copy credited to
// "3819"; "A Prophet in Modern Times" credited to its translator). params { fixes: [{ id, author?, translators? }], write = false }.
// Dry run lists what would change; write applies through docs-repo (author → paragraphs re-sync). A library FILE's frontmatter
// must be corrected too, or a re-ingest restores the old value — the result says which records come from library files.
import { getDoc, setDocAuthor, setDocTranslators } from '../docs-repo.js';

export async function docCorrectionsJob({ fixes = [], write = false } = {}, deps = {}) {
  const { get = (id) => getDoc(id, { follow: false, fields: ['id', 'title', 'author', 'translators', 'file_path', 'source_site'] }), setAuthor = setDocAuthor, setTranslators = setDocTranslators } = deps;
  const out = { write, changes: [], missing: [] };
  for (const f of fixes) {
    const d = await get(f.id);
    if (!d) { out.missing.push(f.id); continue; }
    const c = { id: d.id, title: d.title, library_file: !d.source_site && d.file_path ? d.file_path : null };
    if (f.author && f.author !== d.author) c.author = { was: d.author, now: f.author };
    if (f.translators) c.translators = { was: d.translators || null, now: f.translators };
    if (!c.author && !c.translators) continue;
    if (write) {
      if (c.author) await setAuthor(d.id, f.author);
      if (c.translators) await setTranslators(d.id, f.translators);
    }
    out.changes.push(c);
  }
  return out;
}
