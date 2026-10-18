// dewey-quality ops report — every document Dewey imported, inspected (dewey/quality.js), WORST FIRST, with the causes
// tallied across books: the list of what to fix in Dewey next and what to suggest to SearchLayerPDF. Read-only.
// params { limit? (docs to report, default 40), since? (ISO date) }.
import { listItems } from '../repos/dewey-repo.js';
import { getParagraphs } from '../docs-repo.js';
import { inspectDocument } from '../dewey/quality.js';

export async function deweyQualityJob({ limit = 40, since = null } = {}, deps = {}) {
  const { items = async () => listItems({ state: 'ingested', limit: 5000 }), paragraphs = (id) => getParagraphs(id, { proseOnly: false }) } = deps;
  const rows = [];
  for (const i of await items()) {
    if (!i.doc_id || (since && i.updated_at < since)) continue;
    const ps = await paragraphs(i.doc_id).catch(() => []);
    const q = inspectDocument(ps, i);
    rows.push({ doc_id: i.doc_id, item: i.id, title: i.title, ocr: i.identified?.slp ? (i.identified.slp.engine || 'slp') : null, ...q });
  }
  const tally = {};
  for (const r of rows) for (const f of r.findings) { const t = (tally[f.code] ||= { docs: 0, n: 0, cause: f.cause, fix: f.fix, ocr_docs: 0 }); t.docs++; t.n += f.n; if (r.ocr) t.ocr_docs++; }
  rows.sort((a, b) => b.score - a.score);
  return { inspected: rows.length, clean: rows.filter((r) => !r.findings.length).length, tally, worst: rows.slice(0, limit) };
}
