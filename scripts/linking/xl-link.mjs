#!/usr/bin/env node
// CROSS-LANGUAGE PARAGRAPH LINKING (Chad, 2026-10-03: "just linking between content paragraphs … to support occasional
// original-language or translation searches while also providing both to concept extraction, disambiguation and HyPE").
// Runs ON tower. For each translated book (English paragraphs whose OWN writer — content.authors — is the Báb,
// Bahá’u’lláh or ‘Abdu’l-Bahá, with no original linked yet):
//   1 VOTE     each paragraph's sentences → Gemini phrase index (Arabic-script only) → summed reciprocal rank; the vote
//              chooses the original DOCUMENT only (measured: the top PARAGRAPH is right 39% of the time — too weak to link)
//   2 RUNS     consecutive paragraphs voting for the same original document (gaps ≤ 2 bridged) form a run
//   3 ALIGN    each run against its document's paragraphs (a window round the voted positions) with the existing
//              monotonic cross-lingual aligner (rag/concepts/align.js alignCrossLingual, text-embedding-3-large) —
//              ORDER is what voting lacked; spans below baseline + margin are not linked
//   4 WRITE    content_alignment (basis xl-dp, method xl-dp-v2, score = span similarity) — only with --write
// Votes are cached (/tank/sifter/xl-link/votes.jsonl) so re-runs cost nothing.
// --inherit: first link identical copies and whole quotations of already-linked paragraphs (free).
// --eval=<docId,…>: hide those books' existing links, run, and score against them (same original TEXT counts: copies exist).
//   node scripts/linking/xl-link.mjs (--docs=<ids> | --top=N) [--inherit] [--eval=<ids>] [--write] [--report=<file>]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { searchPhrases } from '../../api/lib/search/qdrant-layers.js';
import { effectiveAuthor } from '../../api/lib/authorship/effective.js';
import { firstPerson } from '../../api/lib/authorship/reader.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets'), quiet: true });
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const WRITE = process.argv.includes('--write'), INHERIT = process.argv.includes('--inherit');
const EVAL = (arg('eval') || '').split(',').filter(Boolean).map(Number);
const METHOD = 'xl-dp-v2', MIN_VOTE = 0.5, MARGIN = 0.10;
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
const knownSet = new Map();   // eval: trans_id → ALL known originals (a paragraph's original can span many stored rows)
for (const d of EVAL) for (const r of db.prepare('SELECT trans_id, orig_id FROM content_alignment WHERE retired_at IS NULL AND trans_doc = ?').all(d)) {
  known.set(r.trans_id, r.orig_id); linked.delete(r.trans_id); (knownSet.get(r.trans_id) || knownSet.set(r.trans_id, new Set()).get(r.trans_id)).add(r.orig_id);
}

const targetsOf = async (docId) => {
  const d = await getDoc(docId, { follow: false, fields: ['id', 'author', 'language', 'religion'] }); if (!d || /^(ar|fa|he)/i.test(d.language || '')) return [];
  return parasOf.all(docId).filter((p) => p.text && p.text.length >= 40 && !linked.has(p.id) && (!p.original_text || known.has(p.id))
    && FIG.has(firstPerson(effectiveAuthor({ authors: p.authors, author: d.author }).author || '') || ''));   // canonical spelling
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
const CACHE = '/tank/sifter/xl-link/votes.jsonl';
mkdirSync(dirname(CACHE), { recursive: true });
const voteCache = new Map();
if (existsSync(CACHE)) for (const l of readFileSync(CACHE, 'utf8').split('\n')) if (l) { const v = JSON.parse(l); voteCache.set(v.id, v.v); }
async function cachedVote(p) {
  if (voteCache.has(p.id)) return voteCache.get(p.id);
  const v = await vote(p, { langGroup: 'ar-fa' });
  voteCache.set(p.id, v); appendFileSync(CACHE, JSON.stringify({ id: p.id, v }) + '\n');
  return v;
}
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

const diag = [];
const results = [];             // {trans_id, orig_id, trans_doc, orig_doc, basis, score}
const { aiService } = await import('../../api/lib/ai-services.js');
const { alignCrossLingual } = await import('../../api/lib/rag/concepts/align.js');
const embedder = aiService('embedding');
const embed = async (texts) => {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) out.push(...await embedder.embed(texts.slice(i, i + 100).map((t) => strip(t).slice(0, 7000)), { caller: 'xl-link' }));
  return out.map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); });
};
const origWindow = db.prepare('SELECT id, paragraph_index pidx, text FROM content WHERE doc_id = ? AND deleted_at IS NULL AND paragraph_index BETWEEN ? AND ? ORDER BY paragraph_index');
async function linkBook(docId) {
  const T = await targetsOf(docId); if (!T.length) return { docId, targets: 0 };
  // 1 vote → each paragraph's original DOCUMENT (and voted position there)
  const V = [];
  for (const p of T) {
    const v = await cachedVote(p);
    if (known.has(p.id) && v.best) diag.push({ ok: v.best.id === known.get(p.id) || overlap(textOf.get(v.best.id)?.text, textOf.get(known.get(p.id))?.text) >= 0.5,
      score: +v.best.score.toFixed(3), ratio: +(v.best.score / Math.max(0.05, v.second)).toFixed(2), hits: v.best.hits, qn: v.qn });
    V.push(v.best && v.best.score >= MIN_VOTE ? { doc: v.best.doc, pidx: pidxOf.get(v.best.id)?.pidx } : null);
  }
  // 2 runs: same document, gaps of ≤ 2 unvoted/other paragraphs bridged
  const runs = [];
  for (let i = 0; i < T.length; i++) {
    if (!V[i]) continue;
    const last = runs[runs.length - 1];
    if (last && last.doc === V[i].doc && i - last.end <= 3) { last.end = i; last.pidx.push(V[i].pidx); }
    else runs.push({ doc: V[i].doc, start: i, end: i, pidx: [V[i].pidx] });
  }
  // 3 align each run against a window of its original document
  let linkedN = 0, spansN = 0;
  for (const r of runs) {
    const ours = T.slice(r.start, r.end + 1);
    const ps = r.pidx.filter((x) => x != null).sort((a, b) => a - b);
    if (!ps.length) continue;
    const lo = ps[Math.floor(ps.length * 0.1)] - 8 - ours.length, hi = ps[Math.floor(ps.length * 0.9)] + 8 + ours.length;
    const theirs = origWindow.all(r.doc, Math.max(0, lo), hi).filter((o) => /[\u0600-\u06FF]/.test(o.text));
    if (!theirs.length) continue;
    const [ov, tv] = [await embed(ours.map((p) => p.text)), await embed(theirs.map((o) => o.text))];
    const { spans, baseline } = alignCrossLingual(ov, tv, { margin: MARGIN });
    for (const sp of spans || []) {
      if (baseline != null && sp.sim < baseline + MARGIN) continue;
      spansN++;
      for (let a = sp.ours[0]; a < sp.ours[1]; a++) for (let b = sp.theirs[0]; b < sp.theirs[1]; b++) {
        results.push({ trans_id: ours[a].id, orig_id: theirs[b].id, trans_doc: docId, orig_doc: r.doc, basis: 'xl-dp', score: +sp.sim.toFixed(3) });
        linkedN++;
      }
    }
  }
  return { docId, targets: T.length, voted: V.filter(Boolean).length, runs: runs.length, spans: spansN, links: linkedN };
}

// --pair=<transDoc>:<origDoc>[,…] — a continuous translation and its continuous original, aligned whole (the aligner's
// home ground: 92–100% on the core texts). Every English paragraph with a figure as writer is offered; in --eval the
// known links are hidden first. Spans below baseline + margin are not linked.
async function linkPair(transDoc, origDoc) {
  const T = await targetsOf(transDoc); if (!T.length) return { transDoc, origDoc, targets: 0 };
  const O = db.prepare('SELECT id, paragraph_index pidx, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(origDoc)
    .filter((o) => /[\u0600-\u06FF]/.test(o.text || ''));
  // an original stored ONE PRINTED LINE PER ROW (Madaniyyih: 2,224 lines vs 318 English paragraphs) is grouped into
  // consecutive chunks of ~ratio lines first, so the aligner compares like with like; a link then covers the chunk's lines
  const k = Math.max(1, Math.round(O.length / T.length / 1.2));
  const chunks = [];
  for (let i = 0; i < O.length; i += k) chunks.push(O.slice(i, i + k));
  const [ov, tv] = [await embed(T.map((p) => p.text)), await embed(chunks.map((c) => c.map((o) => o.text).join(' ')))];
  const { spans, baseline, mode } = alignCrossLingual(ov, tv, { margin: MARGIN });
  let n = 0;
  for (const sp of spans || []) {
    if (baseline != null && sp.sim < baseline + MARGIN) continue;
    for (let a = sp.ours[0]; a < sp.ours[1]; a++) for (let b = sp.theirs[0]; b < sp.theirs[1]; b++) for (const o of chunks[b]) {
      results.push({ trans_id: T[a].id, orig_id: o.id, trans_doc: transDoc, orig_doc: origDoc, basis: 'xl-pair', score: +sp.sim.toFixed(3) }); n++;
    }
  }
  return { transDoc, origDoc, targets: T.length, originals: O.length, chunk: k, mode, baseline, spans: spans?.length || 0, links: n };
}

// eval scoring: same original TEXT counts (the same original exists in several documents)
const norm = (t) => strip(t).replace(/[ً-ٰٟـ]/g, '').replace(/[^\p{L}]/gu, '');
const overlap = (a, b) => { const g = (t) => { const s = new Set(); for (let i = 0; i + 6 <= t.length; i += 2) s.add(t.slice(i, i + 6)); return s; };
  const A = g(norm(a)), B = g(norm(b)); let k = 0; for (const x of A) if (B.has(x)) k++; return k / Math.max(1, Math.min(A.size, B.size)); };

// ── which books ──────────────────────────────────────────────────────────────────────────────────────────────────────
let books = (arg('docs') || '').split(',').filter(Boolean).map(Number);
if (EVAL.length && !arg('pair')) books = EVAL;
if (!books.length && arg('top')) {
  books = db.prepare(`SELECT doc_id FROM content WHERE deleted_at IS NULL AND authors_model LIKE 'reader-%' AND original_text IS NULL
    AND json_extract(authors, '$[0].name') IN ('The Báb', 'Bahá’u’lláh', '‘Abdu’l-Bahá') GROUP BY doc_id ORDER BY COUNT(*) DESC LIMIT ?`).pluck().all(Number(arg('top')));
}
const perBook = [];
for (const d of books) { const r = await linkBook(d); perBook.push(r); console.log(JSON.stringify(r)); }

for (const pr of (arg('pair') || '').split(',').filter(Boolean)) {
  const [t, o] = pr.split(':').map(Number);
  if (EVAL.length === 0 && process.argv.some((a) => a.startsWith('--eval-pair'))) { /* noop */ }
  const r = await linkPair(t, o); perBook.push(r); console.log(JSON.stringify(r));
}
let inherit = [];
if (INHERIT) {
  // identical copies (normalized_hash) and whole quotations of linked paragraphs → the same original
  const origOf = new Map(db.prepare('SELECT trans_id, orig_id FROM content_alignment WHERE retired_at IS NULL').all().map((r) => [r.trans_id, r.orig_id]));
  for (const r of results) origOf.set(r.trans_id, r.orig_id);
  const hashOrig = new Map();
  // identical text only when long enough to be ONE passage: "He is God!" opens hundreds of different Tablets
  const hashQ = db.prepare('SELECT normalized_hash h, length(text) n FROM content WHERE id = ?');
  for (const [tid, oid] of origOf) { const r = hashQ.get(tid); if (r?.h && r.n >= 80) hashOrig.set(r.h, [tid, oid]); }
  const sameHash = db.prepare('SELECT id, doc_id FROM content WHERE normalized_hash = ? AND deleted_at IS NULL');
  for (const [h, [tid, oid]] of hashOrig) for (const c of sameHash.all(h)) if (!origOf.has(c.id)) { inherit.push({ trans_id: c.id, orig_id: oid, trans_doc: c.doc_id, orig_doc: null, basis: 'inherit-twin', score: null, via: tid }); origOf.set(c.id, oid); }
  const quotes = db.prepare('SELECT quote_id, quote_doc, source_id, coverage, share FROM content_source_links WHERE source_id = ?');
  for (const [tid, oid] of [...origOf]) for (const q of quotes.all(tid)) if (!origOf.has(q.quote_id) && q.coverage >= 0.8 && (q.share ?? 1) >= 0.6) {
    inherit.push({ trans_id: q.quote_id, orig_id: oid, trans_doc: q.quote_doc, orig_doc: null, basis: 'inherit-quote', score: null, via: tid }); origOf.set(q.quote_id, oid);
  }
  console.log(JSON.stringify({ inherit: inherit.length, twins: inherit.filter((x) => x.basis === 'inherit-twin').length, quotes: inherit.filter((x) => x.basis === 'inherit-quote').length }));
}

if (EVAL.length) {
  // per English paragraph: correct when its proposed original(s) contain the known original's text (copies count);
  // partial when the proposal overlaps it (n:m spans) — precision is over paragraphs, not link rows
  const per = new Map();
  for (const r of results) if (known.has(r.trans_id)) (per.get(r.trans_id) || per.set(r.trans_id, []).get(r.trans_id)).push(r.orig_id);
  const scoreOf = new Map(); for (const r of results) if (known.has(r.trans_id)) scoreOf.set(r.trans_id, Math.max(scoreOf.get(r.trans_id) ?? -1, r.score ?? 0));
  const okOf = new Map();
  let ok = 0, part = 0;
  for (const [tid, origs] of per) {
    const ks = knownSet.get(tid), kt = [...ks].map((o) => textOf.get(o)?.text || '').join(' ');
    // correct = shares a stored original row with the known link, or its text lies inside the known original passage
    const best = origs.some((o) => ks.has(o)) ? 1 : Math.max(...origs.map((o) => overlap(textOf.get(o)?.text, kt)));
    if (best >= 0.5) ok++; else if (best >= 0.15) part++;
    okOf.set(tid, best >= 0.5);
  }
  const sims = [...scoreOf.values()].sort((a, b) => a - b);
  for (const q of [0, 0.25, 0.5, 0.75, 0.9]) {
    const cut = sims[Math.floor(q * (sims.length - 1))] ?? 0;
    const sel = [...okOf].filter(([tid]) => (scoreOf.get(tid) ?? 0) >= cut);
    console.log(JSON.stringify({ sim_at_or_above: +cut.toFixed(3), quantile: q, n: sel.length, precision: +(sel.filter(([, v]) => v).length / Math.max(1, sel.length)).toFixed(3) }));
  }
  console.log(JSON.stringify({ eval: { known: known.size, paragraphs_linked: per.size, recall: +(per.size / Math.max(1, known.size)).toFixed(3),
    correct: ok, partial: part, wrong: per.size - ok - part, precision: +(ok / Math.max(1, per.size)).toFixed(3) } }));
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
