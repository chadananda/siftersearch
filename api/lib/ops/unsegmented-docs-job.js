// unsegmented-docs ops report — every live document holding a whole-book "paragraph" (Chad 10-19: "Never should we search an
// unsegmented book … those documents need to be re-ingested properly. Possibly edited as files before re-ingesting"): the
// content table surveyed in short id windows (paragraphs-repo oversizedParagraphDocs), each document with its site, file
// and worst paragraph — the re-ingest list. Read-only. params { minChars? }.
import { oversizedParagraphDocs, maxContentId } from '../paragraphs-repo.js';
import { listDocs } from '../docs-repo.js';

export async function unsegmentedDocsJob({ minChars = 8000, span = 100000 } = {}, deps = {}) {
  const { windows = oversizedParagraphDocs, top = maxContentId, docs = listDocs } = deps;
  const end = await top();
  const byDoc = new Map();
  for (let after = 0; after < end; after += span) {
    for (const r of await windows({ afterId: after, span, minChars })) {
      const e = byDoc.get(r.doc_id) || { doc_id: r.doc_id, paragraphs: 0, max_chars: 0 };
      e.paragraphs += r.n; e.max_chars = Math.max(e.max_chars, r.max_chars);
      byDoc.set(r.doc_id, e);
    }
    await new Promise((z) => setTimeout(z, 25));   // a breath between windows: the API and the writer share the database
  }
  const ids = [...byDoc.keys()];
  const meta = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    for (const d of (await docs({ ids: ids.slice(i, i + 500), fields: ['id', 'title', 'author', 'source_site', 'file_path', 'paragraph_count'], limit: 500, count: false, scope: 'all' })).docs) meta.set(d.id, d);
  }
  const list = ids.map((id) => ({ ...byDoc.get(id), ...(meta.get(id) || {}) })).sort((a, b) => b.max_chars - a.max_chars);
  const bySite = {};
  for (const d of list) bySite[d.source_site || 'library'] = (bySite[d.source_site || 'library'] || 0) + 1;
  return { documents: list.length, by_site: bySite, list };
}
