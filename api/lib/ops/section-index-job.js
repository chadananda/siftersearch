// section-index ops job: builds every document's sub-documents (doc_sections) from its paragraphs' stored headings
// (sections.js) — Chad 10-15: the document index must include sub-documents. Re-runnable; params { ids?, limit? }.
// Paced: one document's rows per read, one transaction per document through the single writer.
import { listDocs } from '../docs-repo.js';
import { headingRowsForDoc, replaceSections } from '../repos/sections-repo.js';
import { sectionsFromRows } from '../sections.js';

export async function sectionIndexJob({ ids = null, limit = 0 } = {}) {
  const stats = { docs: 0, with_sections: 0, sections: 0, largest: null };
  for (let after = 0; ;) {
    const page = await listDocs({ ids: ids || undefined, afterId: ids ? undefined : after, fields: ['id', 'title', 'paragraph_count'], limit: 500, count: false });
    if (!page.docs.length) break;
    for (const d of page.docs) {
      after = d.id; stats.docs++;
      if (!d.paragraph_count && !ids) continue;
      const sections = sectionsFromRows(await headingRowsForDoc(d.id));
      // a document whose every paragraph carries a different heading is a list, not a book with parts: a "section"
      // per paragraph would only echo the paragraph search
      const useful = sections.length && sections.length < Math.max(3, (d.paragraph_count || 0) * 0.8) ? sections : [];
      await replaceSections(d.id, d.title, useful);
      if (useful.length) { stats.with_sections++; stats.sections += useful.length; if (!stats.largest || useful.length > stats.largest.n) stats.largest = { id: d.id, n: useful.length }; }
      if (limit && stats.docs >= limit) return stats;
    }
    if (ids || page.docs.length < 500) break;
  }
  return stats;
}
