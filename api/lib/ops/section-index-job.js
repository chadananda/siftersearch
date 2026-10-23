// section-index ops job: builds every document's sub-documents (doc_sections) — Chad 10-15: the document index must
// include sub-documents. Two sources (sections.js): the source file's OUTLINE when its headings carry paragraph ids
// (levels, nested parts — "The Dispensation of Bahá'u'lláh" inside The World Order of Bahá'u'lláh), else the runs of the
// paragraphs' stored headings. Re-runnable; params { ids?, limit?, unread? } — unread: every live document not yet read
// (the reports worker queues it so structure follows ingestion, Chad 10-17). One document per read, one transaction each.
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { listDocs } from '../docs-repo.js';
import { headingRowsForDoc, replaceSections, docsWithoutStructure } from '../repos/sections-repo.js';
import { saveStructureCoverage } from '../repos/coverage-repo.js';
import { logActivity } from '../repos/activity-repo.js';
import { sectionsFromRows, outlineSections, paraNum } from '../sections.js';

function fileOutline(doc, rows) {
  const path = doc.file_path && join(config.library.basePath, doc.file_path);
  if (!path || !existsSync(path)) return [];
  const md = readFileSync(path, 'utf8');
  if (!/^#{1,6}\s.*\b(?:id|at)="para_\d+"/m.test(md)) return [];   // at=: a media transcript's subheaders
  return outlineSections(md, rows.map((r) => ({ ...r, para_num: paraNum(r.block_attrs, r.external_para_id) })));
}

export async function sectionIndexJob({ ids = null, limit = 0, unread = false } = {}) {
  if (unread) { ids = await docsWithoutStructure(100000); if (!ids.length) return { docs: 0, with_sections: 0, from_outline: 0, sections: 0, largest: null }; }
  const stats = { docs: 0, with_sections: 0, from_outline: 0, sections: 0, largest: null };
  const of = ids?.length || null;
  let lastLog = Date.now();
  // pages of 500: by id chunks when given ids (an unread pass can be tens of thousands), else walking the table by id
  for (let after = 0, chunk = 0; ;) {
    const page = ids
      ? await listDocs({ ids: ids.slice(chunk, chunk + 500), fields: ['id', 'title', 'paragraph_count', 'file_path'], limit: 500, count: false })
      : await listDocs({ afterId: after, fields: ['id', 'title', 'paragraph_count', 'file_path'], limit: 500, count: false });
    chunk += 500;
    if (!page.docs.length && (!ids || chunk >= ids.length)) break;
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
      await saveStructureCoverage(d.id, sections.length);
      if (sections.length) {
        stats.with_sections++; stats.sections += sections.length; if (source === 'outline') stats.from_outline++;
        if (!stats.largest || sections.length > stats.largest.n) stats.largest = { id: d.id, n: sections.length };
      }
      if (limit && stats.docs >= limit) return stats;
      if (Date.now() - lastLog > 60000) { lastLog = Date.now(); logActivity('index', `structure · ${stats.docs.toLocaleString('en-US')}${of ? `/${of.toLocaleString('en-US')}` : ''} documents read · ${stats.sections.toLocaleString('en-US')} sections`); }
    }
    if (ids ? chunk >= ids.length : page.docs.length < 500) break;
  }
  return stats;
}
