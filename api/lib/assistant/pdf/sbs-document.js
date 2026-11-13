// A whole tablet in its original beside its translation, as a printable PDF (Chad 11-13: "offer a SBS translation document" — CTAI-style).
// Any held passage of the work (original or translation) → the original edition's paragraphs, each with its aligned translation
// (editions.js), split sentence by sentence (sbs/align.js, Chad 11-13), drawn by the side_by_side print renderer, stored in R2
// → { url, title, rows, approximate }. Deps injectable.
import { buildSideBySide, toMarkdown, verseNumber } from '../widgets/side-by-side.js';
import { alignKey, verifyLines, MIN_LLM_CHARS } from '../../sbs/align.js';
import { sourceKey, authorKey } from '../editions.js';
import { alignByMeaning } from '../../sbs/embed-align.js';

export const SBS_MAX_ROWS = 150;   // a tablet, not a book: a longer work is refused, never a 1000-row PDF
const clean = (t) => String(t ?? '').replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, '$1');   // stored markdown escapes ("1\\.") → plain
const OWN_SCRIPT = new Set(['ar', 'fa', 'he', 'ur', 'ota']);

// multilingual embeddings for the meaning alignment (through the ledger + spend cap, caller sbs-align-embed)
const embedTexts = async (texts) => {
  const { createEmbeddings } = await import('../../ai.js');
  const out = [];
  for (let i = 0; i < texts.length; i += 256) out.push(...(await createEmbeddings(texts.slice(i, i + 256), { caller: 'sbs-align-embed' })).embeddings);
  return out;
};

/** The whole work beside its whole translation, sentence by sentence by MEANING (embed-align.js; cached per text pair) → sentence rows
 *  in the renderer's shape, or null (no translation cell to copy, or the embedding failed: the caller keeps its own rows). */
export async function meaningRows(rows, translationText, { embed, cacheGet, cachePut }) {
  const cell = rows.find((r) => r.translations[0]?.text)?.translations[0];
  if (!cell || !embed) return null;
  const vs = rows.map((r) => verseNumber(r.original.text)), verses = vs.map((v) => v.rest.trim());
  const key = `meaning:${alignKey(verses.join('\n'), translationText)}`;
  let lines = (await cacheGet?.([key]).catch(() => null))?.get(key);
  if (!lines) {
    try { lines = await alignByMeaning(verses, translationText, embed); } catch (err) { console.warn(`[sbs-document] meaning alignment failed: ${err?.message || err}`); return null; }
    await cachePut?.(key, lines, 'sbs-meaning').catch(() => {});
  }
  const numbered = vs.some((v) => v.num);
  return rows.flatMap((r, i) => (lines[i]?.length ? lines[i] : [{ o: verses[i], t: '' }]).map((l, n) => ({ ...r,
    original: { ...r.original, text: l.o, url: n ? null : r.original.url },
    translations: [l.t ? { ...cell, span: 1, text: l.t, url: n ? null : (r.translations[0]?.url ?? cell.url) } : null],
    verse: numbered ? vs[i].num ?? '' : i + 1, first: n === 0 })));
}

const defaults = async () => {
  const [ed, pr, docs, links, pdf, sbs, al] = await Promise.all([import('../editions.js'), import('../../paragraphs-repo.js'), import('../../docs-repo.js'),
    import('../../hit-links.js'), import('./documents.js'), import('../../repos/sbs-repo.js'), import('../../sbs/align.js')]);
  return { editionsOf: ed.editionsOf, langCode: ed.langCode, paragraphsInRange: pr.paragraphsInRange, getLinkMeta: docs.getLinkMeta,
    withLinks: links.withLinks, documents: pdf.makeDocuments(), embed: embedTexts, align: { cacheGet: sbs.getAlignments, cachePut: sbs.putAlignment, llm: al.haikuAlign } };
};

/** Pure: each verse's anchor (the translation paragraph_index its match landed on, or null) → its [from, to] span of the translation, or null.
 *  Only anchors in order count (the longest increasing run: an out-of-order match is a wrong match); a span runs to the next kept anchor,
 *  the first starts at 0 and the last runs to the end — so every translation paragraph lands in some verse. */
export function spansByAnchors(anchors, last) {
  const idx = anchors.map((a, i) => [a, i]).filter(([a]) => Number.isFinite(a));
  const len = idx.map(() => 1), prev = idx.map(() => -1);
  for (let j = 0; j < idx.length; j++) for (let k = 0; k < j; k++) if (idx[k][0] < idx[j][0] && len[k] + 1 > len[j]) { len[j] = len[k] + 1; prev[j] = k; }
  const keep = [];
  for (let j = len.indexOf(Math.max(0, ...len)); j >= 0; j = prev[j]) keep.unshift(idx[j]);
  const out = anchors.map(() => null);
  keep.forEach(([a, i], k) => { out[i] = [k === 0 ? 0 : a, k + 1 < keep.length ? keep[k + 1][0] - 1 : last]; });
  return out;
}

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
    try { out = await llm(x.o, x.e, lang); } catch (err) { failed++; console.warn(`[sbs-document] alignment failed: ${err?.message || err}`); return; }   // transient: not cached, the next request retries
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
  const found = await pool(origs, 6, async (o) => (await d.editionsOf(o.id, { want: 'translations', limit: 3 }))?.passages?.filter((p) => p.role === 'translation') || []);
  const votes = new Map();
  for (const ps of found) for (const p of ps || []) votes.set(p.document_id, (votes.get(p.document_id) || 0) + 1);
  // the same source file in English (oceanoflights …-ar ↔ …-en: the primary pair, 11-13) wins, then the author's own work in English
  // (Bahá'u'lláh's tablet, not a commentary quoting it: 11-13 a study paper filled the column), then the most aligned paragraphs
  const auth = new Map(found.flat().filter(Boolean).map((p) => [p.document_id, p.author]));
  const tmeta = await d.getLinkMeta([...votes.keys()]).catch(() => new Map()), sk = sourceKey(m.source_url);
  const score = ([id, v]) => v + (sk && sourceKey(tmeta.get(Number(id))?.source_url) === sk ? 2e6 : 0) + (m.author && authorKey(auth.get(id)) === authorKey(m.author) ? 1e6 : 0);
  const best = [...votes].sort((a, b) => score(b) - score(a))[0]?.[0];
  if (best == null) return { error: 'no translation of this work is aligned with its original in the library' };
  // a translator by name, else the edition's title when it reads as one (never a file slug like "bahaullah-pm03-030_en")
  const tm = tmeta.get(Number(best)) || {}, md = (() => { try { return JSON.parse(tm.metadata || '{}') || {}; } catch { return {}; } })();
  const named = (t) => (/\s/.test(t || '') ? t : null);
  const trs = new Map();
  const fill = (p, extra = {}) => ({ ...p, title: named(p.title), translator: p.translator || md.translator || md.translated_by || null, text: clean(p.text), aligned_to: [], ...extra });
  // the work itself won (its author, a short file): EVERY paragraph of it goes to a verse, anchor to anchor (11-13: the Tablet of Aḥmad's
  // 17 English paragraphs against 7 Arabic verses — one matched paragraph per verse left most of the tablet out)
  const own = m.author && authorKey(auth.get(best)) === authorKey(m.author);
  const whole = own ? (await d.paragraphsInRange(Number(best), 0, 1e9, { limit: SBS_MAX_ROWS * 4 + 1 }).catch(() => [])) || [] : [];
  if (whole.length && whole.length <= SBS_MAX_ROWS * 4) {
    const mine = found.map((ps) => (ps || []).filter((x) => x.document_id === best));
    const spans = spansByAnchors(mine.map((ps) => (ps.length ? Math.min(...ps.map((x) => x.paragraph_index ?? Infinity)) : null)), Math.max(...whole.map((r) => r.paragraph_index)));
    const tpl = mine.flat()[0];
    spans.forEach((sp, i) => {
      const ps = sp ? whole.filter((r) => r.paragraph_index >= sp[0] && r.paragraph_index <= sp[1] && clean(r.text).trim()) : [];
      if (ps.length) trs.set(ps[0].id, fill(tpl, { id: ps[0].id, paragraph_index: ps[0].paragraph_index, text: ps.map((r) => clean(r.text).trim()).join(' '), aligned_to: [origs[i].id] }));
    });
  } else found.forEach((ps, i) => { const p = (ps || []).find((x) => x.document_id === best); if (!p) return;
    const t = trs.get(p.id) || fill(p); t.aligned_to.push(origs[i].id); trs.set(p.id, t); });
  const data = buildSideBySide([...origs, ...trs.values()], { layout: 'tight' });
  if (!data) return { error: 'the stored original is not in its own script' };
  const verses = data.rows.length;
  let failed = 0, meaning = null;
  // the work itself: every sentence aligned by meaning across the whole text (Chad 11-13: "it MUST be aligned by semantics")
  if (whole.length && d.embed) meaning = await meaningRows(data.rows, whole.map((r) => clean(r.text).trim()).filter(Boolean).join(' '), { embed: d.embed, ...d.align });
  if (meaning) { data.rows = meaning; data.approximate = false; }
  else if (d.align) ({ rows: data.rows, failed } = await sentenceRows(data.rows, { ...d.align, lang }));
  const name = m.title || 'Tablet', title = `${name}: ${data.original.label} and English`, tr = data.translations[0];
  const translator = tr?.translator || null, ttitle = tr?.title || null;
  const by = translator ? `translation by ${translator}` : ttitle ? `English from ${ttitle}` : 'English translation';
  const intro = `${m.author ? `${m.author}, ` : ''}*${name}*: the ${data.original.label} original beside ${translator ? `the translation by ${translator}` : ttitle || 'its English translation'}, sentence by sentence.`;
  const doc = await d.documents.create({ title, markdown: `${intro}\n\n<!-- widget:${data.id} -->\n\n${toMarkdown(data)}`, widgets: [data],
    qr: { url: data.work?.url || data.rows[0]?.original?.url, label: `${data.original.label} on Ocean of Lights` },
    running: [`${name} Study`, `${data.original.label} original · ${by}`],
    cacheKey: failed ? null : `sbs|${docId}|${best}|${meaning ? 'meaning' : 'anchors'}` });   // an alignment still pending → not cached: the next request completes it
  if (!doc?.url) return { error: 'the document could not be stored just now' };
  return { url: doc.url, title, rows: verses, sentences: data.rows.length, approximate: !!data.approximate, aligned: meaning ? 'meaning' : 'editions', document_id: docId,
    translation: { document_id: best, votes: Object.fromEntries([...votes].sort((x, y) => score(y) - score(x)).slice(0, 5)) } };   // which edition won, and why (visibility)
}
