// section-index ops job: builds every document's sub-documents (doc_sections) — Chad 10-15: the document index must
// include sub-documents. Two sources (sections.js): the source file's OUTLINE when its headings carry paragraph ids
// (levels, nested parts — "The Dispensation of Bahá'u'lláh" inside The World Order of Bahá'u'lláh), else the runs of the
// paragraphs' stored headings. Re-runnable; params { ids?, limit? }. One document per read, one transaction per document.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { listDocs } from '../docs-repo.js';
import { headingRowsForDoc, replaceSections } from '../repos/sections-repo.js';
import { sectionsFromRows, outlineSections, paraNum } from '../sections.js';

function fileOutline(doc, rows) {
  const path = doc.file_path && join(config.library.basePath, doc.file_path);
  if (!path || !existsSync(path)) return [];
  const md = readFileSync(path, 'utf8');
  if (!/^#{1,6}\s.*\bid="para_\d+"/m.test(md)) return [];
  return outlineSections(md, rows.map((r) => ({ ...r, para_num: paraNum(r.block_attrs) })));
}

export async function sectionIndexJob({ ids = null, limit = 0 } = {}) {
  const stats = { docs: 0, with_sections: 0, from_outline: 0, sections: 0, largest: null };
  for (let after = 0; ;) {
    const page = await listDocs({ ids: ids || undefined, afterId: ids ? undefined : after, fields: ['id', 'title', 'paragraph_count', 'file_path'], limit: 500, count: false });
    if (!page.docs.length) break;
    for (const d of page.docs) {
      after = d.id; stats.docs++;
      if (!d.paragraph_count && !ids) continue;
      const rows = await headingRowsForDoc(d.id);
      let sections = [], source = 'outline';
      try { sections = fileOutline(d, rows); } catch { sections = []; }   // an unreadable file falls back to stored headings
      if (!sections.length) {
        source = 'heading-run';
        sections = sectionsFromRows(rows);
        // a document whose every paragraph carries a different heading is a list, not a book with parts
        if (sections.length >= Math.max(3, rows.length * 0.8)) sections = [];
      }
      await replaceSections(d.id, d.title, sections, source);
      if (sections.length) {
        stats.with_sections++; stats.sections += sections.length; if (source === 'outline') stats.from_outline++;
        if (!stats.largest || sections.length > stats.largest.n) stats.largest = { id: d.id, n: sections.length };
      }
      if (limit && stats.docs >= limit) return stats;
    }
    if (ids || page.docs.length < 500) break;
  }
  return stats;
}
