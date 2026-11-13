// A whole tablet in its original beside its translation, as a printable PDF (Chad 11-13: "offer a SBS translation document" — CTAI-style).
// Any held passage of the work (original or translation) → the original edition's paragraphs, each with its aligned translation
// (editions.js), drawn by the side_by_side print renderer, stored in R2 → { url, title, rows, approximate }. Deps injectable.
import { buildSideBySide, toMarkdown } from '../widgets/side-by-side.js';

export const SBS_MAX_ROWS = 150;   // a tablet, not a book: a longer work is refused, never a 1000-row PDF
const clean = (t) => String(t ?? '').replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, '$1');   // stored markdown escapes ("1\\.") → plain
const OWN_SCRIPT = new Set(['ar', 'fa', 'he', 'ur', 'ota']);

const defaults = async () => {
  const [ed, pr, docs, links, pdf] = await Promise.all([import('../editions.js'), import('../../paragraphs-repo.js'), import('../../docs-repo.js'),
    import('../../hit-links.js'), import('./documents.js')]);
  return { editionsOf: ed.editionsOf, langCode: ed.langCode, paragraphsInRange: pr.paragraphsInRange, getLinkMeta: docs.getLinkMeta,
    withLinks: links.withLinks, documents: pdf.makeDocuments() };
};

async function pool(items, k, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: k }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i).catch(() => null); } }));
  return out;
}

/** { paragraph_id, document_id } → { url, title, rows, approximate, document_id } | { error } */
export async function sbsDocument({ paragraph_id: pid, document_id: did }, deps = {}) {
  const d = { ...(deps.editionsOf ? {} : await defaults()), ...deps };
  const meta = async (id) => (await d.getLinkMeta([id]).catch(() => new Map())).get(Number(id)) || {};
  let docId = Number(did), m = await meta(docId);
  if (!OWN_SCRIPT.has(d.langCode(m.language))) {   // a translation was held: the work's original edition
    const orig = (await d.editionsOf(Number(pid), { want: 'original', limit: 1 }).catch(() => null))?.passages?.find((p) => p.role === 'original');
    if (!orig?.document_id) return { error: 'the library holds no original-language edition of this work' };
    docId = Number(orig.document_id); m = await meta(docId);
  }
  const rows = (await d.paragraphsInRange(docId, 0, 1e9, { limit: SBS_MAX_ROWS + 1 }).catch(() => [])) || [];
  if (!rows.length) return { error: 'the original could not be read' };
  if (rows.length > SBS_MAX_ROWS) return { error: `a long work (over ${SBS_MAX_ROWS} paragraphs): too long for one side-by-side document` };
  const lang = d.langCode(m.language);
  const urls = await d.withLinks(rows.map((r) => ({ id: r.id, doc_id: docId, paragraph_index: r.paragraph_index, text: r.text, title: m.title }))).catch(() => []);
  const origs = rows.map((r, i) => ({ id: r.id, document_id: docId, paragraph_index: r.paragraph_index, text: clean(r.text), title: m.title, author: m.author,
    language: lang, role: 'original', source_url: urls[i]?.url || null }));
  // each paragraph's aligned translation; ONE translation column: the edition most paragraphs align to
  const found = await pool(origs, 6, async (o) => (await d.editionsOf(o.id, { want: 'translations', limit: 2 }))?.passages?.filter((p) => p.role === 'translation') || []);
  const votes = new Map();
  for (const ps of found) for (const p of ps || []) votes.set(p.document_id, (votes.get(p.document_id) || 0) + 1);
  // the author's own work in English (Bahá'u'lláh's tablet, not a commentary quoting it) wins; then the most aligned paragraphs
  const auth = new Map(found.flat().filter(Boolean).map((p) => [p.document_id, p.author]));
  const score = ([id, v]) => v + (m.author && auth.get(id) === m.author ? 1e6 : 0);
  const best = [...votes].sort((a, b) => score(b) - score(a))[0]?.[0];
  if (best == null) return { error: 'no translation of this work is aligned with its original in the library' };
  const trs = new Map();
  found.forEach((ps, i) => { const p = (ps || []).find((x) => x.document_id === best); if (!p) return;
    const t = trs.get(p.id) || { ...p, text: clean(p.text), aligned_to: [] }; t.aligned_to.push(origs[i].id); trs.set(p.id, t); });
  const data = buildSideBySide([...origs, ...trs.values()], { layout: 'tight' });
  if (!data) return { error: 'the stored original is not in its own script' };
  const name = m.title || 'Tablet', title = `${name}: ${data.original.label} and English`, tr = data.translations[0];
  const intro = `${m.author ? `${m.author}, ` : ''}*${name}*: the ${data.original.label} original beside ${tr?.translator || tr?.title || 'its English translation'}.`;
  const doc = await d.documents.create({ title, markdown: `${intro}\n\n<!-- widget:${data.id} -->\n\n${toMarkdown(data)}`, widgets: [data], cacheKey: `sbs|${docId}|${best}` });
  if (!doc?.url) return { error: 'the document could not be stored just now' };
  return { url: doc.url, title, rows: data.rows.length, approximate: !!data.approximate, document_id: docId };
}
