#!/usr/bin/env node
// TRANSLATORS (migration 141; Chad 2026-10-03: "every translation … the translator identified. Every talk needs to list the
// translator so we can compare Farid to Sohrab"). Runs ON tower; reads sifter.db read-only in SHORT pages (never one long
// read — feedback_long_read_txn_blocks_wal); writes only with --write, through the single writer.
//   1 docs.translators  ← source-file frontmatter `translator:` · title ("… – tr William McCants")
//   2 talk interpreters ← "X, Interpreter" / "Interpreted by X" / "Translated by X from his Persian notes" headings or lines:
//     the talk under it (until the next unrelated heading) gets content.translator = X
//   3 book translator   → paragraphs whose OWN writer (content.authors) is the Báb / Bahá’u’lláh / ‘Abdu’l-Bahá — or, outside
//     the Bahá’í library, the scripture's own author — when the book names exactly ONE translator
//   4 inheritance       → whole quotations (source links, coverage ≥ 0.8 & share ≥ 0.6) and identical copies (normalized_hash)
//     take their source's translator
//   node scripts/authorship/translators.mjs [--write] [--report=<file.json>]
import Database from 'better-sqlite3';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { canonicalTranslator, interpreterOf, titleTranslator, frontmatterTranslators } from '../../api/lib/authorship/translators.js';
import { effectiveAuthor } from '../../api/lib/authorship/effective.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WRITE = process.argv.includes('--write');
const REPORT = (process.argv.find((a) => a.startsWith('--report=')) || '').split('=')[1] || null;
const LIB = process.env.LIBRARY_BASE_PATH || join(process.env.HOME, 'Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library');
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
db.pragma('busy_timeout = 120000');
const TRANSLATED_FIGURES = new Set(['The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá']);

// ── 1. book translators ───────────────────────────────────────────────────────────────────────────────────────────────
const { listDocs } = await import('../../api/lib/docs-repo.js');
const docs = [];
for (let offset = 0; ; offset += 1000) {
  const { docs: got } = await listDocs({ scope: 'live', limit: 1000, offset, fields: ['id', 'title', 'author', 'file_path', 'religion', 'language', 'source_site'] });
  docs.push(...got); if (got.length < 1000) break;
}
const docTrans = new Map();      // id → [{name, basis, raw}]
const fmTranslator = (path) => {
  try {
    const head = readFileSync(path, 'utf8').slice(0, 6000);
    const fm = head.match(/^---\n([\s\S]*?)\n---/); if (!fm) return null;
    const m = fm[1].match(/^translators?\s*:\s*(.+)$/im); if (!m) return null;
    return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { return null; }
};
for (const d of docs) {
  const out = [];
  if (d.file_path?.endsWith('.md')) {
    const raw = fmTranslator(join(LIB, d.file_path));
    for (const name of frontmatterTranslators(raw)) out.push({ name, basis: 'frontmatter', raw });
  }
  const t = titleTranslator(d.title);
  if (t && !out.some((x) => x.name === t)) out.push({ name: t, basis: 'title', raw: d.title });
  if (out.length) docTrans.set(d.id, out);
}
const docById = new Map(docs.map((d) => [d.id, d]));

// ── paragraph passes, paged by id ─────────────────────────────────────────────────────────────────────────────────────
const page = db.prepare(`SELECT id, doc_id, paragraph_index pidx, blocktype, text, authors, normalized_hash h FROM content
  WHERE id > ? AND deleted_at IS NULL ORDER BY id LIMIT 20000`);
const assign = new Map();       // content id → {translator, basis}
const talkDocs = new Map();     // doc → interpreter counts
const isHeadingRow = (r) => /^heading/.test(r.blocktype || '') || /^#{1,6}\s/.test(r.text || '');
// First pass: find docs containing interpreter lines, and collect per-doc rows for those docs only (they are few).
const talkCand = new Set();
let scanned = 0;
for (let last = 0; ;) {
  const rows = page.all(last); if (!rows.length) break; last = rows[rows.length - 1].id; scanned += rows.length;
  for (const r of rows) if (r.text && r.text.length < 170 && /Interpret|Translated\s+by/i.test(r.text) && interpreterOf(r.text)) talkCand.add(r.doc_id);
}
// 2. talk interpreters, doc by doc in reading order
const byDoc = db.prepare(`SELECT id, paragraph_index pidx, blocktype, text, authors FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index`);
for (const docId of talkCand) {
  const d = docById.get(docId); if (!d) continue;
  let cur = null, prevHeading = false; const counts = {};
  for (const r of byDoc.all(docId)) {
    const head = isHeadingRow(r), who = interpreterOf(r.text);
    if (who) { cur = who; counts[who] = counts[who] || 0; prevHeading = head; continue; }
    if (head) { if (!prevHeading) cur = null; prevHeading = true; continue; }
    prevHeading = false;
    if (!cur) continue;
    const a = effectiveAuthor({ authors: r.authors, author: d.author });
    if (a.author !== '‘Abdu’l-Bahá') continue;            // the interpreter rendered the Master's words only
    assign.set(r.id, { translator: cur, basis: 'interpreter-heading' }); counts[cur]++;
  }
  const used = Object.entries(counts).filter(([, n]) => n > 0);
  if (used.length) {
    talkDocs.set(docId, Object.fromEntries(used));
    const list = docTrans.get(docId) || [];
    for (const [name] of used) if (!list.some((x) => x.name === name)) list.push({ name, basis: 'interpreter-heading' });
    docTrans.set(docId, list);
  }
}
// 3. book translator → the translated writer's paragraphs; collect hashes for 4
const hashTrans = new Map();    // normalized_hash → translator (from 2/3)
const later = [];               // paragraphs of translated writers still without a translator
for (let last = 0; ;) {
  const rows = page.all(last); if (!rows.length) break; last = rows[rows.length - 1].id;
  for (const r of rows) {
    const d = docById.get(r.doc_id); if (!d) continue;
    const a = effectiveAuthor({ authors: r.authors, author: d.author });
    const translated = d.religion?.startsWith('Bah') ? TRANSLATED_FIGURES.has(a.author) && !/^(ar|fa|he)/i.test(d.language || '')
      : !!docTrans.get(r.doc_id) && a.fromBook;
    if (!translated) continue;
    let got = assign.get(r.id);
    const list = docTrans.get(r.doc_id)?.filter((x) => x.basis !== 'interpreter-heading');
    if (!got && list?.length === 1) { got = { translator: list[0].name, basis: 'book' }; assign.set(r.id, got); }
    if (got && r.h) hashTrans.set(r.h, got.translator);
    if (!got) later.push({ id: r.id, h: r.h });
  }
}
// 4. inheritance: identical copies, then whole quotations of a paragraph with a translator
const linkQ = (ids) => db.prepare(`SELECT quote_id, source_id, coverage, share FROM content_source_links WHERE quote_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
let viaHash = 0, viaLink = 0;
const rest = [];
for (const p of later) {
  const t = p.h && hashTrans.get(p.h);
  if (t) { assign.set(p.id, { translator: t, basis: 'identical-text' }); viaHash++; } else rest.push(p.id);
}
for (let i = 0; i < rest.length; i += 900) {
  for (const l of linkQ(rest.slice(i, i + 900))) {
    if (assign.has(l.quote_id) || l.coverage < 0.8 || (l.share ?? 1) < 0.6) continue;
    const s = assign.get(l.source_id);
    if (s) { assign.set(l.quote_id, { translator: s.translator, basis: 'source-link' }); viaLink++; }
  }
}

// ── report ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const byBasis = {}, byName = {};
for (const v of assign.values()) { byBasis[v.basis] = (byBasis[v.basis] || 0) + 1; byName[v.translator] = (byName[v.translator] || 0) + 1; }
const interp = {}; for (const c of talkDocs.values()) for (const [n, k] of Object.entries(c)) interp[n] = (interp[n] || 0) + k;
const summary = { scanned, docs_with_translators: docTrans.size, talk_docs: talkDocs.size, paragraphs: assign.size, by_basis: byBasis,
  translated_writer_paragraphs_without_translator: rest.length - viaLink,
  top_translators: Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 15), interpreters_in_talks: interp, write: WRITE };
console.log(JSON.stringify(summary));
if (REPORT) writeFileSync(REPORT, JSON.stringify({ summary, talk_docs: [...talkDocs].map(([id, c]) => ({ id, title: docById.get(id)?.title, interpreters: c })),
  doc_translators: [...docTrans].map(([id, l]) => ({ id, title: docById.get(id)?.title, translators: l })) }, null, 1));
if (!WRITE) process.exit(0);

const { transaction } = await import('../../api/lib/db.js');
const stmts = [...assign].map(([id, v]) => ({ sql: 'UPDATE content SET translator = ?, translator_basis = ? WHERE id = ?', args: [v.translator, v.basis, id] }));
for (let i = 0; i < stmts.length; i += 500) await transaction(stmts.slice(i, i + 500), 'translators:content');
const dstmts = [...docTrans].map(([id, l]) => ({ sql: 'UPDATE docs SET translators = ? WHERE id = ?', args: [JSON.stringify(l), id] }));
for (let i = 0; i < dstmts.length; i += 500) await transaction(dstmts.slice(i, i + 500), 'translators:docs');
console.log(JSON.stringify({ written: { content: stmts.length, docs: dstmts.length } }));
process.exit(0);
