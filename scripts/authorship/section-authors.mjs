#!/usr/bin/env node
// DRY RUN (read-only; runs ON tower): OceanLibrary compilations → per-paragraph SECTION author from the source file's
// heading hierarchy (planning/paragraph-authorship-plan.md). The content table keeps only each paragraph's nearest
// heading ("— 86 —"), losing the level that names the author ("From the Writings of Bahá’u’lláh"); the file has it, and
// every OceanLibrary paragraph carries its file id (external_para_id = para_N). Also reads the frontmatter author list
// (author, author_2, author_3 …) — the ingester kept only the first, which filed whole compilations under Bahá’u’lláh.
//   node scripts/authorship/section-authors.mjs <out.json> [--emit]
import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = '/home/chad/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library';
const [OUT] = process.argv.slice(2);
const EMIT = process.argv.includes('--emit');
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });

import { sectionAuthor, frontmatter, clean } from '../../api/lib/authorship/sections.js';

const docs = db.prepare(`SELECT id, title, author, file_path FROM docs WHERE deleted_at IS NULL AND scope = 'primary' AND file_path LIKE '-sites/oceanlibrary.com/%'`).all();
const paraByExt = db.prepare(`SELECT id, paragraph_index pidx FROM content WHERE doc_id = ? AND external_para_id = ? AND deleted_at IS NULL`);
const report = { at: new Date().toISOString(), docs: [], assignments: [] };
for (const d of docs) {
  const path = join(LIB, d.file_path);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  const fm = frontmatter(text);
  const authors = Object.keys(fm).filter((k) => /^author(_\d+)?$/.test(k)).sort().map((k) => fm[k]).filter(Boolean);
  const stack = [];          // [{level, heading, section}]
  const counts = {}; let sections = 0, covered = 0;
  for (const line of text.split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const id = (line.match(/\bid="(para_\d+)"/) || [])[1];
    if (h) {
      const level = h[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const sec = sectionAuthor(h[2]);
      if (sec) sections++;
      stack.push({ level, heading: clean(h[2]), section: sec });
      continue;
    }
    if (!id) continue;
    const sec = [...stack].reverse().find((s) => s.section)?.section;
    if (!sec) continue;
    const row = paraByExt.get(d.id, id);
    if (!row) continue;
    covered++;
    const key = `${sec.names.join(' + ')}${sec.on_behalf ? ' (on behalf)' : ''}${sec.mixed ? ' [mixed]' : ''}${sec.role === 'reported' ? ' [reported]' : ''}`;
    counts[key] = (counts[key] || 0) + 1;
    if (EMIT) report.assignments.push({ content_id: row.id, doc_id: d.id, pidx: row.pidx, section: sec, path: stack.map((s) => s.heading).filter(Boolean) });
  }
  if (authors.length > 1 || sections) report.docs.push({ id: d.id, title: d.title, db_author: d.author, frontmatter_authors: authors, sections, covered, by_section: counts });
}
report.totals = { docs_multi_author: report.docs.filter((x) => x.frontmatter_authors.length > 1).length, docs_with_sections: report.docs.filter((x) => x.sections).length,
  paragraphs_covered: report.docs.reduce((s, x) => s + x.covered, 0) };
writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.totals));
