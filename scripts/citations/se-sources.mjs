#!/usr/bin/env node
// Shoghi Effendi citations → their Arabic/Persian originals, in CTAI's handoff format (runs ON tower-nas).
// Input:  /tank/sifter/citations/se-citations.json (914 quotations, each with CTAI ids) + verified-export.json (spans
//         already verified). Output: /tank/sifter/citations/se-quotations-sources.jsonl — one record per CTAI id:
//         {id, quoted_author, work, ref, url, text|segments, src, content_id, confidence} or {id, status:'not_found'}.
//         Quotations found beyond CTAI's list (no CTAI id) go out under our id with new:true + the English quote.
// Steps:  resolve   — verified spans → their paragraph (content id, or exact folded match when only the file was known)
//         candidates— each English clause → Gemini-2 query vector → Qdrant `phrases` (originals); paragraphs scored
//                     across clauses (RRF), consecutive paragraphs kept together, link-graph candidate added
//         verify    — Opus 5.5 picks the candidate(s) and copies the exact span(s); kept only if verbatim in the text
//         emit      — the JSONL. Every step is resumable (results.db). Spend guard: --max-usd.
//   node scripts/citations/se-sources.mjs --resolve --candidates --verify --emit [--max-usd 40] [--limit N]
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { segment, cleanText } from '../../api/lib/phrases.js';
import { foldArabic } from '../../api/lib/arabic-script.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const DIR = arg('dir', '/tank/sifter/citations'), LIMIT = +arg('limit', 0), MAX_USD = +arg('max-usd', 40);
const QD = arg('qdrant-url', 'http://127.0.0.1:6333'), QK = process.env.QDRANT_KEY || '', COLL = arg('collection', 'phrases');
const log = (o) => console.log(JSON.stringify({ at: new Date().toISOString(), ...o }));
const PRICE = { in: 15, out: 75 };                       // Opus $/M tokens (as used for the 09-30 verification run)

const src = new Database(arg('db', join(ROOT, 'data', 'sifter.db')), { readonly: true, fileMustExist: true });
const out = new Database(join(DIR, 'results.db'));
out.exec(`CREATE TABLE IF NOT EXISTS cand (id TEXT PRIMARY KEY, cands TEXT);
CREATE TABLE IF NOT EXISTS verdict (id TEXT PRIMARY KEY, verdict TEXT, usage TEXT);
CREATE TABLE IF NOT EXISTS resolved (id TEXT PRIMARY KEY, segments TEXT)`);
const quotes = JSON.parse(readFileSync(join(DIR, 'se-citations.json'), 'utf8')).quotes;
const verified = JSON.parse(readFileSync(join(DIR, 'verified-export.json'), 'utf8'));
const para = src.prepare(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, d.title, d.author, d.slug FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id = ?`);
const ws = (s) => String(s || '').split(/\s+/).filter(Boolean).join(' ');
const fold = (s) => ws(foldArabic(cleanText(s)).replace(/[^\p{L}\p{N}\s]/gu, ' '));

// ── resolve: verified spans → paragraph; spans without a content id are found by exact folded match
function resolve() {
  const missing = Object.values(verified).some((v) => v.segments.some((s) => !s.content_id));
  let byText = null;
  if (missing) {
    byText = src.prepare(`SELECT c.id, c.text FROM content c JOIN docs d ON d.id = c.doc_id WHERE d.religion = 'Baha''i'
      AND c.deleted_at IS NULL AND LENGTH(c.text) > 0`).all().filter((p) => /[؀-ۿ]/.test(p.text)).map((p) => ({ id: p.id, f: fold(p.text) }));
    log({ phase: 'resolve-index', paragraphs: byText.length });
  }
  const put = out.prepare('INSERT OR REPLACE INTO resolved VALUES (?, ?)');
  let ok = 0, lost = 0;
  for (const [id, v] of Object.entries(verified)) {
    const segs = v.segments.map((s) => {
      let cid = s.content_id;
      if (!cid) { const f = fold(s.src); const hit = byText.find((p) => p.f.includes(f)); cid = hit?.id ?? null; }
      return { ...s, content_id: cid };
    });
    segs.every((s) => s.content_id) ? ok++ : lost++;
    put.run(id, JSON.stringify({ segments: segs, method: v.method, confidence: v.confidence }));
  }
  log({ phase: 'resolve', quotations: ok + lost, all_located: ok, some_unlocated: lost });
}

// ── candidates
async function gemQuery(texts) {
  const body = { requests: texts.map((t) => ({ model: 'models/gemini-embedding-2', content: { parts: [{ text: `task: search result | query: ${t}` }] }, outputDimensionality: 3072 })) };
  for (let a = 0; ; a++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) return (await r.json()).embeddings.map((e) => e.values);
    if (a >= 6) throw new Error(`gemini ${r?.status}`);
    await new Promise((res) => setTimeout(res, 2000 * 2 ** a));
  }
}
async function qd(path, body) {
  const r = await fetch(QD + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`qdrant ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).result;
}
async function candidates() {
  const done = new Set(out.prepare('SELECT id FROM cand').all().map((r) => r.id));
  const QURAN_DOC = +arg('quran-doc', 21380);            // the Arabic Qur'an: Qur'an quotations search only there
  const todo = quotes.filter((q) => !verified[q.id] && !done.has(q.id)).slice(0, LIMIT || undefined);
  const put = out.prepare('INSERT OR REPLACE INTO cand VALUES (?, ?)');
  for (const q of todo) {
    const clean = cleanText(q.quote);
    const clauses = segment(q.quote, 'en').map((s) => clean.slice(s.start, s.end)).filter((c) => c.split(' ').length >= 4).slice(0, 16);
    const vs = await gemQuery(clauses.length ? clauses : [q.quote.slice(0, 2000)]);
    const score = new Map();
    await Promise.all(vs.map(async (v) => {
      const res = await qd(`/collections/${COLL}/points/query/groups`, { query: v, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit: 10,
        with_payload: ['paragraph_id', 'doc_id'], params: { quantization: { rescore: true, oversampling: 4.0 } },
        ...(q.figure === 'Qur’án' && { filter: { must: [{ key: 'doc_id', match: { value: QURAN_DOC } }] } }) });
      res.groups.forEach((g, rank) => score.set(g.id, (score.get(g.id) || 0) + 1 / (60 + rank)));
    }));
    if (q.original?.content_id) score.set(Number(q.original.content_id), (score.get(Number(q.original.content_id)) || 0) + 0.02);
    const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, s]) => ({ pid, s: +s.toFixed(4) }));
    put.run(q.id, JSON.stringify(top));
  }
  log({ phase: 'candidates', quotations: todo.length });
}

// ── verify (Opus 5.5) + exact-span check
const PROMPT = (fig, quote, cands) => `Shoghi Effendi quoted ${fig} in English — his own rendering, free, sometimes abridged with ellipses.
Below are candidate passages from the original Arabic/Persian writings.

QUOTATION:
“${quote}”

CANDIDATES:
${cands.map((c, k) => `[${k + 1}] ${c.title} ¶${c.paragraph_index} (content ${c.id}):\n${cleanText(c.text)}`).join('\n\n')}

Does the quotation render passage(s) among these? Judge sentence by sentence by meaning; a passage on a similar theme is
NOT a match. If it does, copy the EXACT original span(s) he translated — verbatim, character for character from the
candidate text (one span per contiguous stretch; a quotation may draw on several candidates). Reply with JSON only:
{"segments": [{"cand": <number>, "src": "<verbatim span>"}], "coverage": "full"|"partial", "confidence": <0..1>, "reason": "<one sentence>"}
or {"segments": [], "confidence": <0..1>, "reason": "<why none matches>"}`;
async function opus(body) {
  for (let a = 0; ; a++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 4000, thinking: { type: 'adaptive' }, output_config: { effort: 'low' }, messages: [{ role: 'user', content: body }] }) }).catch(() => null);
    if (r?.ok) { const j = await r.json(); return { text: j.content.find((b) => b.type === 'text')?.text || '', usage: j.usage || {} }; }
    if (a >= 4) throw new Error(`anthropic ${r?.status} ${r ? (await r.text()).slice(0, 200) : ''}`);
    await new Promise((res) => setTimeout(res, 3000 * 2 ** a));
  }
}
async function verify() {
  const done = new Set(out.prepare('SELECT id FROM verdict').all().map((r) => r.id));
  const jobs = out.prepare('SELECT id, cands FROM cand').all().filter((r) => !done.has(r.id)).map((r) => ({ id: r.id, cands: JSON.parse(r.cands).map((c) => para.get(String(c.pid))).filter(Boolean) }));
  const byId = Object.fromEntries(quotes.map((q) => [q.id, q]));
  const estIn = jobs.reduce((s, j) => s + (byId[j.id].quote.length + j.cands.reduce((t, c) => t + c.text.length, 0)) / 3 + 400, 0);
  const estUsd = +(estIn / 1e6 * PRICE.in + jobs.length * 800 / 1e6 * PRICE.out).toFixed(2);
  log({ phase: 'verify-estimate', quotations: jobs.length, est_usd: estUsd });
  if (estUsd > MAX_USD) { log({ phase: 'stopped', reason: `estimate $${estUsd} > --max-usd ${MAX_USD}` }); return; }
  const put = out.prepare('INSERT OR REPLACE INTO verdict VALUES (?, ?, ?)');
  let i = 0, spent = 0;
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++], q = byId[j.id];
      let v;
      try {
        const { text, usage } = await opus(PROMPT(q.figure, q.quote.slice(0, 4000), j.cands));
        spent += ((usage.input_tokens || 0) * PRICE.in + (usage.output_tokens || 0) * PRICE.out) / 1e6;
        v = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
        v.segments = (v.segments || []).map((s) => { const c = j.cands[s.cand - 1]; const ok = c && ws(cleanText(c.text)).includes(ws(s.src)); return { content_id: c?.id, src: s.src, verbatim: Boolean(ok) }; });
        put.run(j.id, JSON.stringify(v), JSON.stringify(usage));
      } catch (e) { put.run(j.id, JSON.stringify({ error: String(e.message || e) }), '{}'); }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  log({ phase: 'verify', quotations: jobs.length, spent_usd: +spent.toFixed(2) });
}

// ── emit CTAI JSONL (one record per CTAI id; only confident matches; verbatim spans only)
function emit() {
  const lines = [], stats = { verified: 0, matched: 0, held: 0, not_found: 0, unprocessed: 0 };
  const rec = (q, segs, confidence, method) => {
    // several spans in ONE paragraph → one record (spans joined with " … "); segments only across paragraphs
    const byPara = new Map();
    for (const s of segs) { const k = String(s.content_id); byPara.set(k, [...(byPara.get(k) || []), s.src]); }
    const ps = [...byPara.entries()].map(([cid, srcs]) => ({ src: srcs.join(' … '), p: para.get(cid) })).filter((s) => s.p);
    if (!ps.length) return null;
    const base = (s) => ({ text: cleanText(s.p.text), src: s.src, content_id: Number(s.p.id), ref: `${s.p.title} ¶${s.p.paragraph_index}`,
      url: `https://siftersearch.com/library/view?doc=${s.p.doc_id}#p${s.p.paragraph_index}` });
    const head = { quoted_author: q.figure, work: ps[0].p.title, confidence, method };
    return ps.length === 1 ? { ...head, ...base(ps[0]) } : { ...head, ref: base(ps[0]).ref, url: base(ps[0]).url, segments: ps.map(base) };
  };
  for (const q of quotes) {
    let r = null;
    const res = out.prepare('SELECT segments FROM resolved WHERE id = ?').get(q.id);
    if (res) { const v = JSON.parse(res.segments); r = rec(q, v.segments.filter((s) => s.content_id), v.confidence, v.method); if (r) stats.verified++; }
    if (!r) {
      const vd = out.prepare('SELECT verdict FROM verdict WHERE id = ?').get(q.id);
      const v = vd && JSON.parse(vd.verdict);
      if (!v) { stats.unprocessed++; continue; }
      const segs = (v.segments || []).filter((s) => s.verbatim);
      if (segs.length && v.confidence >= 0.7) { r = rec(q, segs, v.confidence, 'phrase-vector search (Gemini-2/Qdrant) + Opus 5.5 span extraction'); stats.matched++; }
      else if (!segs.length && v.confidence >= 0.8 && !v.error) {
        for (const cid of q.ctai_ids?.length ? q.ctai_ids : [q.id]) lines.push({ id: cid, ...(q.ctai_ids?.length ? {} : { new: true }), status: 'not_found', reason: v.reason });
        stats.not_found++; continue;
      }
      else { stats.held++; continue; }
    }
    if (q.ctai_ids?.length) for (const cid of q.ctai_ids) lines.push({ id: cid, ...r });
    else lines.push({ id: q.id, new: true, quote: q.quote, quoted_in: q.quoted_in, ...r });   // found beyond CTAI's list
  }
  writeFileSync(join(DIR, 'se-quotations-sources.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  log({ phase: 'emit', records: lines.length, ...stats });
}

if (has('resolve')) resolve();
if (has('candidates')) await candidates();
if (has('verify')) await verify();
if (has('emit')) emit();
