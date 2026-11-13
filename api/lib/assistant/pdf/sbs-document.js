// A whole tablet in its original beside its translation, as a printable PDF (Chad 11-13: "offer a SBS translation document" — CTAI-style).
// Any held passage of the work (original or translation) → the original edition's paragraphs, each with its aligned translation
// (editions.js), split sentence by sentence (sbs/align.js, Chad 11-13), drawn by the side_by_side print renderer, stored in R2
// → { url, title, rows, approximate }. Deps injectable.
import { buildSideBySide, toMarkdown, verseNumber } from '../widgets/side-by-side.js';
import { alignKey, verifyLines, MIN_LLM_CHARS } from '../../sbs/align.js';

export const SBS_MAX_ROWS = 150;   // a tablet, not a book: a longer work is refused, never a 1000-row PDF
const clean = (t) => String(t ?? '').replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, '$1');   // stored markdown escapes ("1\\.") → plain
const OWN_SCRIPT = new Set(['ar', 'fa', 'he', 'ur', 'ota']);

const defaults = async () => {
  const [ed, pr, docs, links, pdf, sbs, al] = await Promise.all([import('../editions.js'), import('../../paragraphs-repo.js'), import('../../docs-repo.js'),
    import('../../hit-links.js'), import('./documents.js'), import('../../repos/sbs-repo.js'), import('../../sbs/align.js')]);
  return { editionsOf: ed.editionsOf, langCode: ed.langCode, paragraphsInRange: pr.paragraphsInRange, getLinkMeta: docs.getLinkMeta,
    withLinks: links.withLinks, documents: pdf.makeDocuments(), align: { cacheGet: sbs.getAlignments, cachePut: sbs.putAlignment, llm: al.haikuAlign } };
};

async function pool(items, k, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: k }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i).catch(() => null); } }));
  return out;
}

/** Verse rows → sentence rows: each verse and its translation broken at matching sentence boundaries (Haiku inserts line breaks only,
 *  code verifies the words unchanged; cached per text pair, shared with the reader's side-by-side). Each row carries its verse and
 *  `first` (the verse's first sentence). A verse that is short, tied to others by a spanned translation, or not splittable stays whole.
 *  → { rows, failed } (failed = alignments that errored and will be retried). */
export async function sentenceRows(rows, { cacheGet, cachePut, llm, lang }) {
  const tied = new Set();
  rows.forEach((r, i) => r.translations.forEach((c) => { if (c?.span > 1) for (let k = i; k < i + c.span; k++) tied.add(k); }));
  const items = rows.map((r, i) => {
    const t = r.translations[0], vo = verseNumber(r.original.text), vt = verseNumber(t?.text);
    const o = vo.rest.trim(), e = vt.rest.trim(), split = !tied.has(i) && !!e && r.translations.length === 1 && (o.length >= MIN_LLM_CHARS || e.length >= MIN_LLM_CHARS);
    return { r, i, num: vt.num ?? vo.num, o, e, key: split ? alignKey(o, e) : null };
  });
  const todo = items.filter((x) => x.key);
  const got = todo.length ? await cacheGet(todo.map((x) => x.key)).catch(() => new Map()) : new Map();
  let failed = 0;
  await pool(todo.filter((x) => !got.get(x.key)?.length), 4, async (x) => {
    let out;
    try { out = await llm(x.o, x.e, lang); } catch { failed++; return; }   // transient: not cached, the next request retries
    const lines = verifyLines(x.o, x.e, out) || [{ o: x.o, t: x.e }];      // rejected → one row, cached: never paid for twice
    await cachePut(x.key, lines, 'sbs-align').catch(() => {});
    got.set(x.key, lines);
  });
  const numbered = items.some((x) => x.num);
  const out = [];
  for (const x of items) {
    const verse = numbered ? x.num ?? '' : x.i + 1, lines = x.key ? got.get(x.key) : null;
    if (!lines?.length) {
      out.push({ ...x.r, original: { ...x.r.original, text: x.o || x.r.original.text }, translations: x.r.translations.map((c, m) => (m === 0 && x.e ? { ...c, text: x.e } : c)), verse, first: true });
      continue;
    }
    lines.forEach((l, n) => out.push({ ...x.r, original: { ...x.r.original, text: l.o, url: n ? null : x.r.original.url },
      translations: [{ ...x.r.translations[0], text: l.t, url: n ? null : x.r.translations[0].url }], verse, first: n === 0 }));
  }
  return { rows: out, failed };
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
  const verses = data.rows.length;
  let failed = 0;
  if (d.align) ({ rows: data.rows, failed } = await sentenceRows(data.rows, { ...d.align, lang }));
  const name = m.title || 'Tablet', title = `${name}: ${data.original.label} and English`, tr = data.translations[0];
  const by = tr?.translator ? `translation by ${tr.translator}` : tr?.title ? `English from ${tr.title}` : 'English translation';
  const intro = `${m.author ? `${m.author}, ` : ''}*${name}*: the ${data.original.label} original beside ${tr?.translator || tr?.title || 'its English translation'}, sentence by sentence.`;
  const doc = await d.documents.create({ title, markdown: `${intro}\n\n<!-- widget:${data.id} -->\n\n${toMarkdown(data)}`, widgets: [data],
    qr: { url: data.work?.url || data.rows[0]?.original?.url, label: `${data.original.label} on Ocean of Lights` },
    running: [`${name} Study`, `${data.original.label} original · ${by}`],
    cacheKey: failed ? null : `sbs|${docId}|${best}` });   // an alignment still pending → not cached: the next request completes it
  if (!doc?.url) return { error: 'the document could not be stored just now' };
  return { url: doc.url, title, rows: verses, sentences: data.rows.length, approximate: !!data.approximate, document_id: docId };
}
