// Dewey's HOLDINGS CHECK: "do we already have it?" from identified fields (dewey/identify.js). Each field is searched
// where it is strongest — title/author in the document finder and the sub-documents, printed lines in BM25 (finds the
// work under any title or inside a compilation) — and the evidence is merged per document. A verdict of NOT HELD needs
// the text to miss as well as the title: a title miss alone only says "not found by title". Deps injectable for tests.
import { findDocuments, listDocs } from '../docs-repo.js';
import { findSections } from '../repos/sections-repo.js';
import { searchKeywordQdrant } from '../search/qdrant-layers.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export async function checkHoldings(id, { find = findDocuments, sections = findSections, keyword = searchKeywordQdrant, docs = listDocs } = {}) {
  const fields = ['id', 'title', 'author', 'language', 'religion', 'collection', 'year', 'paragraph_count', 'cover_url'];
  const by = new Map();
  const add = (d, ev) => { const e = by.get(d.id) || { doc: d, evidence: [], score: 0 }; e.evidence.push(ev); e.score += ev.weight; by.set(d.id, e); };
  const title = [id.title, id.subtitle].filter(Boolean).join(' ');
  const [titleHits, authorHits, sectionHits, lineHits] = await Promise.all([
    title ? find(title, { fields, limit: 8 }).then((r) => r.docs || r).catch(() => []) : [],
    id.author && title ? find(`${title} ${id.author}`, { fields, limit: 5 }).then((r) => r.docs || r).catch(() => []) : [],
    title ? sections(title, { limit: 5 }).catch(() => []) : [],
    Promise.all((id.printed_lines || []).slice(0, 6).map((l) => keyword(l, { limit: 3 }).then((r) => ({ line: l, hits: r.hits || [] })).catch(() => ({ line: l, hits: [] })))),
  ]);
  for (const d of titleHits) add(d, { kind: 'title', weight: fold(d.title) === fold(title) ? 3 : 1, detail: d.title });
  for (const d of authorHits) add(d, { kind: 'title+author', weight: 1, detail: d.author });
  const lineDocIds = new Map();
  for (const { line, hits } of lineHits) if (hits[0]) lineDocIds.set(hits[0].doc_id, [...(lineDocIds.get(hits[0].doc_id) || []), line]);
  const sectionDocs = new Map(sectionHits.map((s) => [s.doc_id, s]));
  const missing = [...new Set([...lineDocIds.keys(), ...sectionDocs.keys()])].filter((d) => !by.has(d));
  const fetched = missing.length ? (await docs({ ids: missing, fields, limit: missing.length, count: false })).docs : [];
  const docOf = (idv) => by.get(idv)?.doc || fetched.find((d) => d.id === idv);
  for (const [docId, lines] of lineDocIds) { const d = docOf(docId); if (d) add(d, { kind: 'text', weight: 2 * lines.length, detail: `${lines.length} of ${(id.printed_lines || []).length} printed lines found` }); }
  for (const [docId, s] of sectionDocs) { const d = docOf(docId); if (d) add(d, { kind: 'part of', weight: fold(s.title) === fold(title) ? 3 : 1, detail: `“${s.title}” inside ${s.book}` }); }
  const candidates = [...by.values()].sort((a, b) => b.score - a.score).slice(0, 8)
    .map(({ doc, evidence, score }) => ({ ...doc, score, evidence }));
  const top = candidates[0];
  const textMatched = candidates.some((c) => c.evidence.some((e) => e.kind === 'text' && e.weight >= 4));
  const verdict = !candidates.length
    ? ((id.printed_lines || []).length ? 'not-held' : 'not-found-by-title')
    : textMatched || top.evidence.some((e) => (e.kind === 'title' || e.kind === 'part of') && e.weight >= 3) ? 'held' : 'possible';
  return { verdict, candidates };
}
