// COMPILATION AUTHORS — the records the main library ingester got wrong (Chad 10-19: "that is an ingestion error.
// Compilations have author, author_2, author_3 when coming from OceanLibrary"): every live library document (not a site
// copy) whose FILE lists several contributors but whose record credits the first one — Lights of Guidance 20804 "by
// Bahá'u'lláh". The rule is library/compilation-author.js (the ingester now applies it too). Dry run unless write:true;
// write corrects docs.author through docs-repo (paragraphs keep their own authors). params { write = false, religion }.
import { readFile } from 'fs/promises';
import { join } from 'path';
import { listDocs, setDocAuthor } from '../docs-repo.js';
import { compilationAuthor, contributors } from '../library/compilation-author.js';

export async function compilationAuthorsJob({ write = false, religion = "Baha'i" } = {}, deps = {}) {
  const { docs = listDocs, read = (p) => readFile(p, 'utf8'), parse = async (t) => (await import('../../services/ingester.js')).parseMarkdownFrontmatter(t).metadata,
    base = (await import('../config.js')).config.library.basePath, setAuthor = setDocAuthor } = deps;
  const out = { scanned: 0, unreadable: 0, wrong: [], written: 0 };
  for (let offset = 0; ; offset += 1000) {
    const page = await docs({ scope: 'live', religion, sourceSite: 'library', fields: ['id', 'title', 'author', 'religion', 'file_path'], limit: 1000, offset, count: false });
    for (const d of page.docs) {
      if (!d.file_path) continue;
      out.scanned++;
      let fm;
      try { fm = await parse(await read(join(base, d.file_path))); } catch { out.unreadable++; continue; }
      const should = compilationAuthor(fm, d.file_path, d.religion);
      if (!should || should === d.author) continue;
      out.wrong.push({ id: d.id, title: d.title, was: d.author, now: should, contributors: contributors(fm) });
      if (write) { await setAuthor(d.id, should); out.written++; }
    }
    if (page.docs.length < 1000) break;
  }
  return { write, ...out };
}
