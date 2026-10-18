// Dewey's HOLDINGS CHECK: "do we already have it?" from identified fields (dewey/identify.js). Each field is searched
// where it is strongest — title/author in the document finder and the sub-documents, printed lines in BM25 (finds the
// work under any title or inside a compilation) — and the evidence is merged per document. A verdict of NOT HELD needs
// the text to miss as well as the title: a title miss alone only says "not found by title". Deps injectable for tests.
import { findDocuments, listDocs, getParagraphs } from '../docs-repo.js';
import { compareWords, compareTexts, probes, HELD } from './compare.js';
import { findSections } from '../repos/sections-repo.js';
import { searchKeywordQdrant } from '../search/qdrant-layers.js';
import { paragraphsByIds } from '../paragraphs-repo.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘'ʼ`]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const textLines = (id) => (id.printed_lines || []).filter((l) => String(l).trim().split(/\s+/).length >= 6).slice(0, 6);

/** Does this paragraph really contain the line? ≥ 80% of the line's words present (OCR noise allowed). BM25 always returns a
 *  top hit for any line, so a hit alone proves nothing — it called the Sohrab Diary "held" as an unrelated paper (10-17). */
export function contains(paragraph, line) {
  const have = new Set(fold(paragraph).split(' '));
  const words = fold(line).split(' ').filter((w) => w.length > 1);
  return words.length > 0 && words.filter((w) => have.has(w)).length / words.length >= 0.8;
}

export async function checkHoldings(id, { find = findDocuments, sections = findSections, keyword = searchKeywordQdrant, docs = listDocs, texts = paragraphsByIds, paragraphs = getParagraphs } = {}) {
  // A document's TEXT decides when we have enough of it (a file, a pasted passage, a photographed page): compare.js
  const body = id._text || (id.printed_lines || []).join('\n');
  const ourWords = compareWords(body);
  const byText = ourWords.length >= 60;
  const fields = ['id', 'title', 'author', 'language', 'religion', 'collection', 'year', 'paragraph_count', 'cover_url'];
  const by = new Map();
  const add = (d, ev) => { const e = by.get(d.id) || { doc: d, evidence: [], score: 0 }; e.evidence.push(ev); e.score += ev.weight; by.set(d.id, e); };
  const title = [id.title, id.subtitle].filter(Boolean).join(' ');
  const [titleHits, authorHits, sectionHits, lineHits] = await Promise.all([
    title ? find(title, { fields, limit: 8 }).then((r) => r.docs || r).catch(() => []) : [],
    id.author && title ? find(`${title} ${id.author}`, { fields, limit: 5 }).then((r) => r.docs || r).catch(() => []) : [],
    title ? sections(title, { limit: 5 }).catch(() => []) : [],
    // only lines of running text are TEXT evidence — a title page's short lines would match its own title, not prove the text
    byText ? [] : Promise.all(textLines(id).map((l) => keyword(l, { limit: 3 }).then((r) => ({ line: l, hits: r.hits || [] })).catch(() => ({ line: l, hits: [] })))),
  ]);
  const exact = new Set([title, id.title_alt].filter(Boolean).map(fold));
  for (const d of titleHits) add(d, { kind: 'title', weight: exact.has(fold(d.title)) ? 3 : 1, detail: d.title });
  for (const d of authorHits) add(d, { kind: 'title+author', weight: 1, detail: d.author });
  // a line is FOUND only where one of its top hits really contains it
  const paraText = new Map((await texts(lineHits.flatMap(({ hits }) => hits.slice(0, 3).map((h) => h.paragraph_id)).filter(Boolean)).catch(() => [])).map((p) => [p.id, p.text]));
  const lineDocIds = new Map();
  for (const { line, hits } of lineHits) {
    const hit = hits.slice(0, 3).find((h) => contains(paraText.get(h.paragraph_id) || '', line));
    if (hit) lineDocIds.set(hit.doc_id, [...(lineDocIds.get(hit.doc_id) || []), line]);
  }
  const sectionDocs = new Map(sectionHits.map((s) => [s.doc_id, s]));
  if (byText) return compareWithLibrary({ id, body, ourWords, by, add, exact, sectionDocs, fields }, { keyword, texts, docs, paragraphs });
  const missing = [...new Set([...lineDocIds.keys(), ...sectionDocs.keys()])].filter((d) => !by.has(d));
  const fetched = missing.length ? (await docs({ ids: missing, fields, limit: missing.length, count: false })).docs : [];
  const docOf = (idv) => by.get(idv)?.doc || fetched.find((d) => d.id === idv);
  for (const [docId, lines] of lineDocIds) { const d = docOf(docId); if (d) add(d, { kind: 'text', weight: 2 * lines.length, detail: `${lines.length} of ${textLines(id).length} printed lines found` }); }
  for (const [docId, s] of sectionDocs) { const d = docOf(docId); if (d) add(d, { kind: 'part of', weight: exact.has(fold(s.title)) ? 3 : 1, detail: `“${s.title}” inside ${s.book}` }); }
  const candidates = [...by.values()].sort((a, b) => b.score - a.score).slice(0, 8)
    .map(({ doc, evidence, score }) => ({ ...doc, score, evidence }));
  const top = candidates[0];
  const textMatched = candidates.some((c) => c.evidence.some((e) => e.kind === 'text' && e.weight >= 4));
  const verdict = !candidates.length
    ? (textLines(id).length ? 'not-held' : 'not-found-by-title')
    : textMatched || top.evidence.some((e) => (e.kind === 'title' || e.kind === 'part of') && e.weight >= 3) ? 'held' : 'possible';
  return { verdict, candidates };
}

const RANK = { same: 5, inside: 5, partial: 4, overlap: 3, quotes: 2, 'too-short': 1, unrelated: 0 };
const pct = (x) => `${Math.round(x * 100)}%`;
const say = (c) => ({
  same: `the same text: ${pct(c.ours_in_theirs)} of this document is in it, in order`,
  inside: `contained in it: ${pct(c.ours_in_theirs)} of this document is in it, in order — this is ${pct(1 / c.length_ratio)} of its length`,
  partial: `the library holds only part: ${pct(c.theirs_in_ours)} of it is in this document, but it is ${pct(c.length_ratio)} of this document's length`,
  overlap: `shares a passage: ${pct(c.ours_in_theirs)} of this document, in order`,
  quotes: `shares quoted passages only (${pct(Math.max(c.ours_in_theirs, c.theirs_in_ours))}, out of order)`,
  'too-short': 'the library copy has (almost) no text — cannot compare',
  unrelated: `a different text (${pct(c.ours_in_theirs)} shared)`,
}[c.relation]);

/**
 * The TEXT path: ~30 probes spread through the document find candidate library documents (a probe found in many books is
 * a common quotation and counts for little), then each candidate is compared IN FULL (compare.js) — both directions and
 * order — which names the relation: same · inside a larger work · partly held · overlap · quotes · unrelated.
 */
async function compareWithLibrary({ id, body, ourWords, by, add, exact, sectionDocs, fields }, { keyword, texts, docs, paragraphs }) {
  const ps = probes(body, 30);
  const probeList = ps.length >= 3 ? ps : textLines(id);
  const probeHits = await Promise.all(probeList.map((p) => keyword(p, { limit: 5 }).then((r) => ({ p, hits: r.hits || [] })).catch(() => ({ p, hits: [] }))));
  const ptext = new Map((await texts([...new Set(probeHits.flatMap((x) => x.hits.map((h) => h.paragraph_id)))].filter(Boolean)).catch(() => [])).map((p) => [p.id, p.text]));
  const score = new Map();
  for (const { p, hits } of probeHits) {
    const holding = [...new Set(hits.filter((h) => contains(ptext.get(h.paragraph_id) || '', p)).map((h) => h.doc_id))];
    for (const d of holding) score.set(d, (score.get(d) || 0) + 1 / holding.length);
  }
  const titled = [...by.values()].filter((e) => e.evidence.some((v) => v.weight >= 3)).map((e) => e.doc.id);
  const ids = [...new Set([...[...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d]) => d), ...titled, ...sectionDocs.keys()])].slice(0, 8);
  const missing = ids.filter((d) => !by.has(d));
  const fetched = missing.length ? (await docs({ ids: missing, fields, limit: missing.length, count: false })).docs : [];
  const out = [];
  for (const docId of ids) {
    const doc = by.get(docId)?.doc || fetched.find((d) => d.id === docId);
    if (!doc) continue;
    const theirs = compareWords((await paragraphs(docId).catch(() => [])).map((p) => p.text).join('\n'));
    const c = compareTexts(ourWords, theirs);
    add(doc, { kind: 'text', weight: RANK[c.relation] * 2, detail: say(c) });
    out.push({ docId, c, probes: +(score.get(docId) || 0).toFixed(1) });
  }
  const cmpOf = new Map(out.map((o) => [o.docId, o]));
  const candidates = [...by.values()]
    .filter(({ doc }) => cmpOf.has(doc.id) && (cmpOf.get(doc.id).c.relation !== 'unrelated' || exact.has(fold(doc.title))))
    .map(({ doc, evidence, score: sc }) => ({ ...doc, score: sc, evidence, relation: cmpOf.get(doc.id).c, probes_found: cmpOf.get(doc.id).probes }))
    .sort((a, b) => RANK[b.relation.relation] - RANK[a.relation.relation] || b.relation.ours_in_theirs - a.relation.ours_in_theirs).slice(0, 8);
  const rels = candidates.map((c) => c.relation.relation);
  const verdict = rels.some((r) => HELD.has(r)) ? 'held' : rels.includes('partial') ? 'partly-held'
    : rels.some((r) => r === 'overlap' || r === 'quotes' || r === 'too-short') ? 'possible' : 'not-held';
  return { verdict, candidates, compared: { words: ourWords.length, probes: probeList.length, documents: out.length } };
}
