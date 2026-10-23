// Ops job ol-refresh (Chad 10-23): apply a new OceanLibrary export IN PLACE — matched by the block id we hold as
// block_attrs.ilm_id, so every row keeps its content.id and nothing derived (HyPE, authorship, source links, claims,
// mentions, phrase points) is orphaned. A sites-ingester re-ingest would replace every row. This version is DRY ONLY:
// per book it reports rows matched (exact / merged), text changes, added + removed blocks, display numbers (OL's `num`,
// api/lib/library/ol-display-ids.js) set / same / changed / cleared, ids withheld as content collisions, para_N shifts,
// enrichment on rows that would change; plus new export books (English, publish-checked) and held books missing from
// the export (checked against OL's catalog). Write mode lands only after Chad approves the dry run.
// params { dir, ids?, out?, liveCheck? }. Deps: docs-repo, block-attrs-repo, enrichment-repo, ol-display-ids.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { listDocs } from '../docs-repo.js';
import { olRowsForDoc } from '../repos/block-attrs-repo.js';
import { enrichmentOnRows } from '../repos/enrichment-repo.js';
import { parseExport, numberBook, words, olPn } from '../library/ol-display-ids.js';

const SAMPLES = 5;
const attrsOf = (r) => { try { return (r.block_attrs ? JSON.parse(r.block_attrs) : null) || {}; } catch { return {}; } };
// words run together: a <br> the adapter dropped without a space ("Shoghi<br>Effendi" → "ShoghiEffendi") is not a text change
const wkey = (t) => words(t).join('');

/** Pure: one book's export blocks + its stored rows → the in-place plan (what a write would do) and its counts. */
export function planOlBook(blocks, rows) {
  const nb = numberBook(blocks);
  const dupSet = new Set(nb.dups);
  const byIlm = new Map(); blocks.forEach((b, i) => { if (b.ilm) byIlm.set(b.ilm, i); });
  const isPar = (i) => blocks[i]?.type === 'par';
  const keyOf = blocks.map((b) => (b.type === 'par' ? wkey(b.text) : null));
  const covered = new Set();
  const byKey = new Map(); keyOf.forEach((k, i) => { if (k) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
  const c = { rows: rows.length, footnotes: 0, matched_exact: 0, matched_merged: 0, matched_by_text: 0, no_ilm: 0, removed: 0, text_changed: 0,
    pn_set: 0, pn_same: 0, pn_changed: 0, pn_new: 0, pn_cleared: 0, cite: 0, withheld_dup: 0, inherited: 0,
    not_citable: { source: 0, signature: 0, 'lead-in': 0, struct: 0 }, unnumbered: 0, para_n_changed: 0 };
  const s = { text: [], pn_changed: [], removed: [], no_ilm: [], withheld: [] };
  const changes = []; const atRisk = [];
  for (const r of rows) {
    if (r.blocktype === 'footnote') { c.footnotes++; continue; }
    const a = attrsOf(r);
    if (!a.ilm_id) {
      // a row stored without a block id (an id-less list item, a heading-like line): its words find its block
      const k = (byKey.get(wkey(r.text)) || []).find((x) => !covered.has(x));
      if (k != null) { covered.add(k); c.matched_by_text++; continue; }
      c.no_ilm++; if (s.no_ilm.length < SAMPLES) s.no_ilm.push(String(r.text).slice(0, 80)); continue;
    }
    const i = byIlm.get(a.ilm_id);
    if (i == null) { c.removed++; atRisk.push(r.id); if (s.removed.length < SAMPLES) s.removed.push({ ilm: a.ilm_id, text: String(r.text).slice(0, 80) }); continue; }
    const rk = wkey(r.text);
    let span = null;
    if (rk === keyOf[i]) { span = [i]; c.matched_exact++; } else {
      // one stored row may hold several export blocks (an address + its body, a paragraph joined across a page)
      outer: for (let back = 0; back <= 4; back++) for (let fwd = 0; fwd <= 4; fwd++) {
        if (!back && !fwd) continue;
        const ix = []; for (let k = i - back; k <= i + fwd; k++) if (isPar(k)) ix.push(k);
        if (ix.length > 1 && ix.map((k) => keyOf[k]).filter(Boolean).join('') === rk) { span = ix; c.matched_merged++; break outer; }
      }
    }
    let textChanged = false;
    if (!span) { span = [i]; textChanged = true; c.text_changed++; atRisk.push(r.id); if (s.text.length < SAMPLES) s.text.push({ ilm: a.ilm_id, held: String(r.text).slice(0, 160), export: String(blocks[i].text).slice(0, 160) }); }
    span.forEach((k) => covered.add(k));
    const first = span.find((k) => nb.blocks[k].pn) ?? span[0];
    const o = nb.blocks[first];
    const kind = span.some((k) => nb.blocks[k].kind === 'content') ? 'content' : nb.blocks[i].kind;
    const pn = kind === 'content' || kind === 'lead-in' ? o.pn : null;
    const cite = kind === 'content' && !!pn && !dupSet.has(pn);
    if (pn) c.pn_set++; else c.unnumbered++;
    if (kind !== 'content') c.not_citable[kind] = (c.not_citable[kind] || 0) + 1;
    if (o.inherited && pn) c.inherited++;
    if (cite) c.cite++;
    if (pn && dupSet.has(pn)) { c.withheld_dup++; if (s.withheld.length < SAMPLES) s.withheld.push({ pn, text: String(r.text).slice(0, 70) }); }
    const was = a.pn != null ? String(a.pn) : null;
    if (pn && was === pn) c.pn_same++;
    else if (pn && was) { c.pn_changed++; if (s.pn_changed.length < SAMPLES) s.pn_changed.push({ was, now: pn, text: String(r.text).slice(0, 60) }); }
    else if (pn) c.pn_new++;
    else if (was) c.pn_cleared++;
    const paraN = blocks[i].paraN ? `para_${blocks[i].paraN}` : null;
    if (paraN && r.external_para_id && paraN !== r.external_para_id) c.para_n_changed++;
    changes.push({ id: r.id, ilm: a.ilm_id, pn, cite, kind, textChanged, paraN, was });
  }
  // export blocks no row holds: what a write would insert
  const added = { content: 0, 'lead-in': 0, source: 0, signature: 0 }; const addedSamples = [];
  blocks.forEach((b, k) => {
    if (b.type !== 'par' || covered.has(k) || !keyOf[k]) return;
    if (/^!\[/.test(String(b.text).trim())) return;   // an illustration written as a par
    const kind = nb.blocks[k].kind; added[kind] = (added[kind] || 0) + 1;
    if (addedSamples.length < SAMPLES) addedSamples.push({ ilm: b.ilm, kind, text: String(b.text).slice(0, 80) });
  });
  const roman = blocks.filter((b) => b.num && olPn(b.num) !== String(b.num).trim().replace(/[.\s]+$/, '')).length;
  const invocations = nb.blocks.map((o, k) => (o.invocationNumbered ? { num: o.pn, ilm: blocks[k].ilm, text: String(blocks[k].text).slice(0, 70) } : null)).filter(Boolean);
  const textChange = c.text_changed + c.removed + added.content + added['lead-in'] > 0;
  const status = textChange ? 'text-changed' : (c.pn_changed + c.pn_new + c.pn_cleared + c.para_n_changed) ? 'numbering-only' : 'unchanged';
  return { status, counts: { ...c, added, roman_converted: roman }, dup_ids: nb.dups, invocations, samples: { ...s, added: addedSamples }, changes, atRisk };
}

// test / draft books OL's editors left in the export: names and date-stamped titles ("Arem 09.2023", "Copy-… 06.08")
const JUNKISH = /(?:^|[\s_-])test|arem|temporary|reimport|^copy-|broken|postponed|smoke|\d\d\.\d\d/i;

/** Pure: what to do with an export book we do not hold. OL's own catalog (Bindery) is the publish signal — its SSR page
 *  renders drafts and test books too, so "the page renders" proves nothing. → { action: import|hold|junk, reason } */
export function classifyNewBook({ bookid, title, paragraphs }, { inCatalog = null, secondCopyOf = null } = {}) {
  if (!paragraphs) return { action: 'junk', reason: 'no paragraphs' };
  if (JUNKISH.test(title)) return { action: 'junk', reason: 'test/draft title' };
  if (secondCopyOf) return { action: 'junk', reason: `second copy of held doc ${secondCopyOf}` };
  if (JUNKISH.test(bookid) && inCatalog !== true) return { action: 'junk', reason: 'test/draft id, not in the OL catalog' };
  if (inCatalog === false) return { action: 'hold', reason: 'not in the OL catalog (Bindery) — unpublished?' };
  return { action: 'import', reason: inCatalog ? 'in the OL catalog' : 'catalog not checked' };
}

/** OL's published catalog: Set of bookids (bindery.lnker.com, the app OceanLibrary.com is built from) | null on error */
async function catalogIds(fetchImpl = fetch) {
  try {
    const r = await fetchImpl('https://bindery.lnker.com/api/libraries/oceanlibrary', { signal: AbortSignal.timeout(60000) });
    const j = await r.json(); return new Set((j?.project?.books || []).map((b) => b.id));
  } catch { return null; }
}

/** All export books in dir (nested) → Map(bookid → { path, fm, blocks }). */
function readExport(dir) {
  const out = new Map();
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) { const x = parseExport(readFileSync(p, 'utf8')); if (x.fm.bookid) out.set(x.fm.bookid, { path: p, ...x }); } } };
  walk(dir);
  return out;
}

export async function olRefreshJob({ dir = '/tank/sifter/ol-export-20261023', ids = null, out = null, liveCheck = true, dry = true } = {}, deps = {}) {
  if (dry === false) throw new Error('ol-refresh write mode is not enabled: it lands after Chad approves the dry run (planning/oceanlibrary-export-20261023-plan.md)');
  const { list = listDocs, rowsFor = olRowsForDoc, risk = enrichmentOnRows, catalogFn = catalogIds } = deps;
  const exp = readExport(dir);
  const docs = [];
  for (let after = 0; ;) {
    const page = await list({ scope: 'all', sourceSite: 'oceanlibrary.com', afterId: after, limit: 500, count: false,
      fields: ['id', 'title', 'author', 'language', 'external_id', 'slug', 'source_url', 'file_path', 'paragraph_count', 'deleted_at', 'duplicate_of'] });
    if (!page.docs.length) break;
    docs.push(...page.docs); after = page.docs[page.docs.length - 1].id;
    if (page.docs.length < 500) break;
  }
  const liveDocs = docs.filter((d) => !d.deleted_at && !d.duplicate_of);
  const heldByExt = new Map(liveDocs.filter((d) => d.external_id).map((d) => [d.external_id, d]));
  const anyByExt = new Map(docs.filter((d) => d.external_id).map((d) => [d.external_id, d]));
  const books = []; const totals = { books: 0, rows: 0, unchanged: 0, 'numbering-only': 0, 'text-changed': 0 };
  const sum = {};
  const add = (o, pre = '') => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') sum[pre + k] = (sum[pre + k] || 0) + v; else if (v && typeof v === 'object') add(v, `${pre}${k}.`); } };
  for (const d of liveDocs) {
    if (ids && !ids.includes(d.id)) continue;
    const e = d.external_id && exp.get(d.external_id);
    if (!e) continue;
    const rows = await rowsFor(d.id);
    const p = planOlBook(e.blocks, rows);
    const enrichment = p.atRisk.length ? await risk(p.atRisk) : null;
    totals.books++; totals.rows += rows.length; totals[p.status]++; add(p.counts);
    books.push({ doc: d.id, bookid: d.external_id, title: d.title, status: p.status, counts: p.counts, dup_ids_n: p.dup_ids.length, dup_ids: p.dup_ids.slice(0, 40),
      invocations: p.invocations, enrichment_at_risk: enrichment, samples: p.samples });
  }
  // export books we do not hold: English only for now (Chad 10-23); OL's catalog decides published; drafts never
  const catalog = liveCheck ? await catalogFn() : null;
  const newBooks = { import: [], hold: [], junk: [], skipped_language: [], held_as_duplicate: [] };
  const heldTitles = new Map(liveDocs.map((d) => [String(d.title || '').trim().toLowerCase(), d]));
  for (const [bookid, e] of exp) {
    if (heldByExt.has(bookid)) continue;
    const title = String(e.fm.title || '').trim(); const lang = e.fm.language || '';
    const pars = e.blocks.filter((b) => b.type === 'par').length;
    const row = { bookid, title, author: e.fm.author || '', language: lang, slug: e.fm.slug || '', paragraphs: pars, category: (e.fm.ocean_category || '').trim(),
      in_catalog: catalog ? catalog.has(bookid) : null };
    if (anyByExt.has(bookid)) { newBooks.held_as_duplicate.push({ ...row, doc: anyByExt.get(bookid).id, duplicate_of: anyByExt.get(bookid).duplicate_of }); continue; }
    if (lang !== 'en') { newBooks.skipped_language.push(row); continue; }
    const same = heldTitles.get(title.toLowerCase());
    const stillExported = same && exp.has(same.external_id);
    const v = classifyNewBook(row, { inCatalog: row.in_catalog, secondCopyOf: stillExported ? same.id : null });
    newBooks[v.action].push({ ...row, reason: v.reason, ...(same && !stillExported ? { replaces_doc: same.id } : {}) });
  }
  // held OceanLibrary books the export lacks: Chad 10-23 → leave the OL collection for the supplemental library (not
  // deleted). In OL's catalog = the export is incomplete (ask for a re-export) rather than OL having dropped the book.
  const missing = [];
  for (const d of liveDocs) {
    if (d.external_id && exp.has(d.external_id)) continue;
    missing.push({ doc: d.id, bookid: d.external_id, title: d.title, paragraphs: d.paragraph_count, source_url: d.source_url, file_path: d.file_path,
      in_catalog: catalog && d.external_id ? catalog.has(d.external_id) : catalog ? false : null });
  }
  const catalogNotExported = catalog ? [...catalog].filter((id) => !exp.has(id) && !/^col-|^[0-9a-f]{32}$/.test(id)) : null;
  const result = { dir, export_books: exp.size, held_live: liveDocs.length, totals, sums: sum,
    new_books: { import: newBooks.import.length, hold: newBooks.hold.length, junk: newBooks.junk.length, skipped_language: newBooks.skipped_language.length,
      held_as_duplicate: newBooks.held_as_duplicate.length, import_paragraphs: newBooks.import.reduce((n, b) => n + b.paragraphs, 0) },
    held_not_in_export: missing.length, held_not_in_export_but_in_catalog: missing.filter((m) => m.in_catalog).length,
    catalog_not_exported: catalogNotExported, books_with_content_collisions: books.filter((b) => b.dup_ids_n).length };
  const file = out || `/tank/sifter/ol-refresh/dry-${new Date().toISOString().slice(0, 10)}.json`;
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ ...result, books, newBooks, missing }, null, 1)); result.file = file; } catch (err) { result.file_error = err.message; }
  return { ...result, newBooks, missing, books: books.map((b) => ({ doc: b.doc, title: b.title, status: b.status, rows: b.counts.rows, text_changed: b.counts.text_changed,
    removed: b.counts.removed, added: b.counts.added.content, pn_changed: b.counts.pn_changed, pn_new: b.counts.pn_new, cite: b.counts.cite, withheld: b.counts.withheld_dup, dup_ids: b.dup_ids_n,
    invocations: b.invocations.length, at_risk: b.enrichment_at_risk })) };
}
