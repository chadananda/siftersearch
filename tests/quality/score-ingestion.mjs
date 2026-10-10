#!/usr/bin/env node
// INGESTION battery (runs ON tower: reads sifter.db read-only, counts Qdrant points, queries the local API). For a sample of
// documents across every tradition: can each document be FOUND by its own words? K sentences from its paragraphs are
// searched (/api/search/multi, the engine the site uses) and the document — or a same-title copy — must come back (rank 1,
// top 10). Also: the share of its paragraphs held in Qdrant (phrases / keyword), and metadata gaps. No hand-made answer key,
// so it runs over any batch of newly ingested books. Failures are grouped by likely cause.
//   node tests/quality/score-ingestion.mjs [--docs=300] [--per=3] [--religion=Baha'i] [--ids=1,2] [--out=file.json] [--qdrant=only]
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const N = Number(arg('docs', 300)), PER = Number(arg('per', 3)), API = process.env.SIFTER_API || 'http://127.0.0.1:7839';
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY, QDRANT = arg('qdrant', null);
const QURL = process.env.QDRANT_URL, QKEY = process.env.QDRANT_KEY;
const db = new Database(join(ROOT, 'data', 'sifter.db'), { readonly: true, fileMustExist: true });

// ── the sample: live primary documents with prose, stratified by tradition (seeded, so reruns compare) ──
let seed = 42; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const base = `SELECT d.id, d.title, d.author, d.religion, d.language, d.collection, d.file_path, d.paragraph_count FROM docs d
  WHERE d.deleted_at IS NULL AND d.duplicate_of IS NULL AND d.scope = 'primary' AND COALESCE(d.doc_role, '') <> 'metadata'
    AND d.paragraph_count >= 5`;
let docs;
if (arg('ids')) docs = db.prepare(`${base} AND d.id IN (${arg('ids').split(',').map(Number).join(',')})`).all();
else {
  const all = db.prepare(`${base}${arg('religion') ? ' AND d.religion = ?' : ''}`).all(...(arg('religion') ? [arg('religion')] : []));
  const by = new Map(); for (const d of all) (by.get(d.religion || '?') || by.set(d.religion || '?', []).get(d.religion || '?')).push(d);
  // proportional, but every tradition gets at least 8 (small traditions are where gaps hide)
  docs = [];
  for (const [, list] of by) {
    const k = Math.min(list.length, Math.max(8, Math.round((N * list.length) / all.length)));
    const shuffled = list.map((d) => [rand(), d]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    docs.push(...shuffled.slice(0, k));
  }
}
const sentencesOf = db.prepare(`SELECT id, text FROM content WHERE doc_id = ? AND deleted_at IS NULL AND COALESCE(is_duplicate, 0) = 0
  AND blocktype IN ('paragraph', 'quote') AND length(text) > 120 ORDER BY id LIMIT 400`);
const sameTitle = db.prepare(`SELECT id FROM docs WHERE title = ? AND deleted_at IS NULL`);

// a sentence of 12–40 words from the middle of a paragraph: its own words, not a heading or a citation line
function pickSentences(docId) {
  const paras = sentencesOf.all(docId);
  const out = [];
  for (const p of paras.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1])) {
    const clean = p.text.replace(/⁅\/?s\d+⁆|\[\^?[^\]]*\]|<[^>]+>|[*_>#]/g, ' ').replace(/\s+/g, ' ').trim();
    const s = (clean.match(/[^.!?؟]+[.!?؟]/g) || []).map((x) => x.trim()).find((x) => { const n = x.split(/\s+/).length; return n >= 12 && n <= 40; });
    if (s) out.push({ paragraphId: p.id, q: s });
    if (out.length >= PER) break;
  }
  return out;
}

async function qdrantCount(collection, docId) {
  if (!QURL) return null;
  const r = await fetch(`${QURL}/collections/${collection}/points/count`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', 'api-key': QKEY },
    body: JSON.stringify({ filter: { must: [{ key: 'doc_id', match: { value: docId } }] }, exact: true }) }).catch(() => null);
  return r?.ok ? (await r.json()).result.count : null;
}

async function search(q) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(`${API}/api/search/multi`, { method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', 'X-Internal-Key': KEY },
        body: JSON.stringify({ query: q, limit: 10, ...(QDRANT ? { qdrant: QDRANT === 'only' ? 'only' : true } : {}) }) });
      if (res.status >= 500) { await new Promise((r) => setTimeout(r, 3000 * (a + 1))); continue; }
      if (!res.ok) return null;                       // refused (auth, bad request): an ERROR, never a miss
      const b = await res.json();
      return (b.results || b.hits || b.passages || []).map((h) => ({ id: Number(h.document_id ?? h.doc_id ?? h.documentId), text: h.text || h.content || '' }));
    } catch { await new Promise((r) => setTimeout(r, 3000)); }
  }
  return null;
}

const rows = [];
for (const d of docs) {
  const twins = new Set(sameTitle.all(d.title).map((x) => x.id));
  const sents = pickSentences(d.id);
  const [phr, kw] = await Promise.all([qdrantCount('phrases', d.id), qdrantCount('paragraphs_kw', d.id)]);
  const tries = [];
  for (const s of sents) {
    const hits = await search(s.q);
    // found = the document itself (or a same-title copy) — or, for a compilation, another book holding the same words
    const fold = (t) => String(t).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const qf = fold(s.q).slice(0, 80);
    const rank = !hits ? -2 : hits.findIndex((h) => twins.has(h.id) || fold(h.text).includes(qf));
    tries.push({ q: s.q.slice(0, 120), rank, via: rank >= 0 ? (twins.has(hits[rank].id) ? 'self' : 'copy') : null });
  }
  const ok1 = tries.filter((t) => t.rank === 0).length, ok10 = tries.filter((t) => t.rank >= 0).length, err = tries.filter((t) => t.rank === -2).length;
  const issues = [];
  if (!sents.length) issues.push('no searchable prose');
  if (kw === 0) issues.push('not in Qdrant keyword index');
  if (phr === 0 && d.religion === "Baha'i") issues.push('not in Qdrant phrase index');
  if (!d.author) issues.push('no author');
  if (!d.language) issues.push('no language');
  if (sents.length && ok10 < sents.length - err) issues.push(ok10 === 0 ? 'NOT FINDABLE by its own words' : 'partly findable');
  rows.push({ id: d.id, title: d.title, religion: d.religion, language: d.language, paragraphs: d.paragraph_count,
    qdrant: { phrases: phr, keyword: kw }, tried: sents.length, top1: ok1, top10: ok10, errors: err, issues, tries });
  process.stderr.write(`\r${rows.length}/${docs.length}`);
}

const tried = rows.reduce((s, r) => s + r.tried - r.errors, 0), t1 = rows.reduce((s, r) => s + r.top1, 0), t10 = rows.reduce((s, r) => s + r.top10, 0);
const byRel = {};
for (const r of rows) { const k = r.religion || '?'; const x = (byRel[k] ||= { docs: 0, tried: 0, top1: 0, top10: 0, notFindable: 0 }); x.docs++; x.tried += r.tried - r.errors; x.top1 += r.top1; x.top10 += r.top10; if (r.issues.includes('NOT FINDABLE by its own words')) x.notFindable++; }
const issueCounts = {}; for (const r of rows) for (const i of r.issues) issueCounts[i] = (issueCounts[i] || 0) + 1;
const summary = { at: new Date().toISOString(), docs: rows.length, sentences: tried, self_top1: +(t1 / (tried || 1)).toFixed(3), self_top10: +(t10 / (tried || 1)).toFixed(3),
  issues: issueCounts, byReligion: Object.fromEntries(Object.entries(byRel).map(([k, x]) => [k, { ...x, top1: +(x.top1 / (x.tried || 1)).toFixed(2), top10: +(x.top10 / (x.tried || 1)).toFixed(2) }])) };
console.log('\n' + JSON.stringify(summary, null, 1));
for (const r of rows.filter((r) => r.issues.some((i) => /FINDABLE|Qdrant/.test(i))).slice(0, 25)) console.log(r.id, r.religion, '|', r.title.slice(0, 50), '|', r.issues.join('; '), '| qdrant', JSON.stringify(r.qdrant));
if (arg('out')) writeFileSync(arg('out'), JSON.stringify({ summary, rows }, null, 1));
process.exit(0);
