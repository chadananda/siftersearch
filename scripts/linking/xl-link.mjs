#!/usr/bin/env node
// CROSS-LANGUAGE PARAGRAPH LINKING (Chad, 2026-10-03: "just linking between content paragraphs … to support occasional
// original-language or translation searches while also providing both to concept extraction, disambiguation and HyPE").
// Runs ON tower. For each translated book (English paragraphs whose OWN writer — content.authors — is the Báb,
// Bahá’u’lláh or ‘Abdu’l-Bahá, with no original linked yet):
//   1 VOTE     each paragraph's sentences → Gemini phrase index (Arabic-script only) → summed reciprocal rank per paragraph
//   2 ANCHOR   clear winners only (score ≥ ANCHOR_MIN and ≥ MARGIN × runner-up, ≥ 2 sentence hits when ≥ 2 sentences)
//   3 FILL     between two anchors in the same original document: equal gaps → by order; otherwise re-vote inside that
//              document's paragraph window
//   4 WRITE    content_alignment (basis xl-anchor | xl-order | xl-window, method xl-phrase-v1, score) — only with --write
// --inherit: first link identical copies and whole quotations of already-linked paragraphs (free).
// --eval=<docId,…>: hide those books' existing links, run, and score against them (same original TEXT counts: copies exist).
//   node scripts/linking/xl-link.mjs (--docs=<ids> | --top=N) [--inherit] [--eval=<ids>] [--write] [--report=<file>]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { searchPhrases } from '../../api/lib/search/qdrant-layers.js';
import { effectiveAuthor } from '../../api/lib/authorship/effective.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const WRITE = process.argv.includes('--write'), INHERIT = process.argv.includes('--inherit');
const EVAL = (arg('eval') || '').split(',').filter(Boolean).map(Number);
const ANCHOR_MIN = 1.2, MARGIN = 1.6, METHOD = 'xl-phrase-v1';
const FIG = new Set(['The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá']);
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });
db.pragma('busy_timeout = 120000');

const strip = (t) => String(t || '').replace(/⁅\/?s\d+⁆/g, '').trim();
const linked = new Set(db.prepare('SELECT trans_id FROM content_alignment WHERE retired_at IS NULL').pluck().all());
const { getDoc } = await import('../../api/lib/docs-repo.js');
const parasOf = db.prepare('SELECT id, paragraph_index pidx, text, authors, original_text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index');
const textOf = db.prepare('SELECT text FROM content WHERE id = ?');
const pidxOf = db.prepare('SELECT doc_id, paragraph_index pidx FROM content WHERE id = ?');
const known = new Map();       // eval: trans_id → orig_id
for (const d of EVAL) for (const r of db.prepare('SELECT trans_id, orig_id FROM content_alignment WHERE retired_at IS NULL AND trans_doc = ?').all(d)) { known.set(r.trans_id, r.orig_id); linked.delete(r.trans_id); }

const targetsOf = async (docId) => {
  const d = await getDoc(docId, { follow: false, fields: ['id', 'author', 'language', 'religion'] }); if (!d || /^(ar|fa|he)/i.test(d.language || '')) return [];
  return parasOf.all(docId).filter((p) => p.text && p.text.length >= 40 && !linked.has(p.id) && (!p.original_text || known.has(p.id))
    && FIG.has(effectiveAuthor({ authors: p.authors, author: d.author }).author));
};
const search = async (q, filters) => {
  for (let k = 0; ; k++) {
    try { return (await searchPhrases(q, { limit: 10, filters })).hits; }
    catch (e) { if (k < 8 && /429|5\d\d|timeout|abort/i.test(e.message)) { await new Promise((r) => setTimeout(r, 8000 * (k + 1))); continue; } return []; }
  }
};
const sentences = (text) => {
  const s = strip(text).split(/(?<=[.;:!?])\s+/).map((x) => x.trim()).filter((x) => x.length >= 25).sort((a, b) => b.length - a.length).slice(0, 6);
  return s.length ? s : [strip(text).slice(0, 400)];
};
async function vote(p, filters) {
  const qs = sentences(p.text), score = new Map(), hitsBy = new Map(), docOf = new Map();
  for (const q of qs) (await search(q.slice(0, 400), filters)).forEach((h, r) => {
    score.set(h.paragraph_id, (score.get(h.paragraph_id) || 0) + 1 / (r + 1));
    hitsBy.set(h.paragraph_id, (hitsBy.get(h.paragraph_id) || 0) + 1); docOf.set(h.paragraph_id, h.doc_id);
  });
  const ranked = [...score].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  return { qn: qs.length, best: best && { id: best[0], score: best[1], hits: hitsBy.get(best[0]), doc: docOf.get(best[0]) }, second: second?.[1] || 0 };
}
const isAnchor = (v) => v.best && v.best.score >= ANCHOR_MIN && v.best.score >= MARGIN * v.second && (v.qn < 2 || v.best.hits >= 2);

const diag = [];
const results = [];             // {trans_id, orig_id, trans_doc, orig_doc, basis, score}
async function linkBook(docId) {
  const T = await targetsOf(docId); if (!T.length) return { docId, targets: 0 };
  const votes = new Map();
  for (const p of T) {
    const v = await vote(p, { langGroup: 'ar-fa' }); votes.set(p.id, v);
    if (known.has(p.id) && v.best) {     // eval diagnostics: is the top vote the right original (any copy)?
      const ok = v.best.id === known.get(p.id) || overlap(textOf.get(v.best.id)?.text, textOf.get(known.get(p.id))?.text) >= 0.5;
      diag.push({ ok, score: +v.best.score.toFixed(3), ratio: +(v.best.score / Math.max(0.05, v.second)).toFixed(2), hits: v.best.hits, qn: v.qn });
    }
  }
  const anchors = T.map((p, i) => ({ i, p, v: votes.get(p.id) })).filter((a) => isAnchor(a.v))
    .map((a) => ({ ...a, o: pidxOf.get(a.v.best.id) }));
  const out = new Map();
  for (const a of anchors) out.set(a.p.id, { orig: a.v.best.id, orig_doc: a.v.best.doc, basis: 'xl-anchor', score: +a.v.best.score.toFixed(3) });
  // FILL between consecutive anchors that land in the same original document, in order
  for (let k = 0; k + 1 < anchors.length; k++) {
    const A = anchors[k], B = anchors[k + 1];
    if (!A.o || !B.o || A.o.doc_id !== B.o.doc_id || B.o.pidx <= A.o.pidx || B.i - A.i < 2) continue;
    const gapT = T.slice(A.i + 1, B.i), gapO = B.o.pidx - A.o.pidx - 1;
    const origRows = db.prepare('SELECT id, paragraph_index pidx FROM content WHERE doc_id = ? AND deleted_at IS NULL AND paragraph_index > ? AND paragraph_index < ? ORDER BY paragraph_index').all(A.o.doc_id, A.o.pidx, B.o.pidx);
    if (gapT.length === gapO && origRows.length === gapO) {
      gapT.forEach((p, j) => out.set(p.id, { orig: origRows[j].id, orig_doc: A.o.doc_id, basis: 'xl-order', score: null }));
    } else if (origRows.length && origRows.length <= 60) {
      const window = new Set(origRows.map((r) => r.id));
      for (const p of gapT) {
        const v = await vote(p, { langGroup: 'ar-fa', documentId: A.o.doc_id });
        if (v.best && window.has(v.best.id) && v.best.score >= ANCHOR_MIN / 2 && v.best.score >= 1.2 * v.second)
          out.set(p.id, { orig: v.best.id, orig_doc: A.o.doc_id, basis: 'xl-window', score: +v.best.score.toFixed(3) });
      }
    }
  }
  for (const [tid, r] of out) results.push({ trans_id: tid, orig_id: r.orig, trans_doc: docId, orig_doc: r.orig_doc, basis: r.basis, score: r.score });
  const byBasis = {}; for (const r of out.values()) byBasis[r.basis] = (byBasis[r.basis] || 0) + 1;
  return { docId, targets: T.length, anchors: anchors.length, linked: out.size, by_basis: byBasis };
}

// eval scoring: same original TEXT counts (the same original exists in several documents)
const norm = (t) => strip(t).replace(/[ً-ٰٟـ]/g, '').replace(/[^\p{L}]/gu, '');
const overlap = (a, b) => { const g = (t) => { const s = new Set(); for (let i = 0; i + 6 <= t.length; i += 2) s.add(t.slice(i, i + 6)); return s; };
  const A = g(norm(a)), B = g(norm(b)); let k = 0; for (const x of A) if (B.has(x)) k++; return k / Math.max(1, Math.min(A.size, B.size)); };

// ── which books ──────────────────────────────────────────────────────────────────────────────────────────────────────
let books = (arg('docs') || '').split(',').filter(Boolean).map(Number);
if (EVAL.length) books = EVAL;
if (!books.length && arg('top')) {
  books = db.prepare(`SELECT doc_id FROM content WHERE deleted_at IS NULL AND authors_model LIKE 'reader-%' AND original_text IS NULL
    AND json_extract(authors, '$[0].name') IN ('The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá') GROUP BY doc_id ORDER BY COUNT(*) DESC LIMIT ?`).pluck().all(Number(arg('top')));
}
const perBook = [];
for (const d of books) { const r = await linkBook(d); perBook.push(r); console.log(JSON.stringify(r)); }

let inherit = [];
if (INHERIT) {
  // identical copies (normalized_hash) and whole quotations of linked paragraphs → the same original
  const origOf = new Map(db.prepare('SELECT trans_id, orig_id FROM content_alignment WHERE retired_at IS NULL').all().map((r) => [r.trans_id, r.orig_id]));
  for (const r of results) origOf.set(r.trans_id, r.orig_id);
  const hashOrig = new Map();
  for (const [tid, oid] of origOf) { const h = db.prepare('SELECT normalized_hash FROM content WHERE id = ?').pluck().get(tid); if (h) hashOrig.set(h, [tid, oid]); }
  const sameHash = db.prepare('SELECT id, doc_id FROM content WHERE normalized_hash = ? AND deleted_at IS NULL');
  for (const [h, [tid, oid]] of hashOrig) for (const c of sameHash.all(h)) if (!origOf.has(c.id)) { inherit.push({ trans_id: c.id, orig_id: oid, trans_doc: c.doc_id, orig_doc: null, basis: 'inherit-twin', score: null, via: tid }); origOf.set(c.id, oid); }
  const quotes = db.prepare('SELECT quote_id, quote_doc, source_id, coverage, share FROM content_source_links WHERE source_id = ?');
  for (const [tid, oid] of [...origOf]) for (const q of quotes.all(tid)) if (!origOf.has(q.quote_id) && q.coverage >= 0.8 && (q.share ?? 1) >= 0.6) {
    inherit.push({ trans_id: q.quote_id, orig_id: oid, trans_doc: q.quote_doc, orig_doc: null, basis: 'inherit-quote', score: null, via: tid }); origOf.set(q.quote_id, oid);
  }
  console.log(JSON.stringify({ inherit: inherit.length, twins: inherit.filter((x) => x.basis === 'inherit-twin').length, quotes: inherit.filter((x) => x.basis === 'inherit-quote').length }));
}

if (EVAL.length) {
  const scored = results.filter((r) => known.has(r.trans_id));
  const by = {};
  for (const r of scored) {
    const ok = r.orig_id === known.get(r.trans_id) || overlap(textOf.get(r.orig_id)?.text, textOf.get(known.get(r.trans_id))?.text) >= 0.5;
    (by[r.basis] ||= { n: 0, ok: 0 }); by[r.basis].n++; if (ok) by[r.basis].ok++;
  }
  console.log(JSON.stringify({ eval: { known: known.size, proposed: scored.length, recall: +(scored.length / Math.max(1, known.size)).toFixed(3), precision_by_basis: by } }));
}
if (diag.length) {
  // precision / coverage of the top vote at candidate thresholds — the anchor rule is set from this, not guessed
  const grid = [];
  for (const sMin of [0.5, 0.8, 1.0, 1.2, 1.5, 2.0]) for (const rMin of [1.0, 1.3, 1.6, 2.0, 3.0]) {
    const sel = diag.filter((d) => d.score >= sMin && d.ratio >= rMin);
    if (sel.length) grid.push({ sMin, rMin, n: sel.length, cover: +(sel.length / diag.length).toFixed(3), precision: +(sel.filter((d) => d.ok).length / sel.length).toFixed(3) });
  }
  console.log(JSON.stringify({ diag_n: diag.length, top_vote_correct: +(diag.filter((d) => d.ok).length / diag.length).toFixed(3) }));
  for (const g of grid.filter((g) => g.precision >= 0.85).sort((a, b) => b.cover - a.cover).slice(0, 8)) console.log(JSON.stringify(g));
}
if (arg('report')) writeFileSync(arg('report'), JSON.stringify({ perBook, results, inherit }, null, 1));
if (!WRITE || EVAL.length) process.exit(0);

const { transaction } = await import('../../api/lib/db.js');
const rows = [...results, ...inherit];
for (let i = 0; i < rows.length; i += 500) await transaction(rows.slice(i, i + 500).map((r) => ({
  sql: `INSERT OR IGNORE INTO content_alignment (trans_id, orig_id, trans_doc, orig_doc, basis, score, via_id, method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [r.trans_id, r.orig_id, r.trans_doc, r.orig_doc, r.basis, r.score, r.via || null, METHOD] })), 'xl-link');
console.log(JSON.stringify({ written: rows.length }));
process.exit(0);
