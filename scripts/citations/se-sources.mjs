#!/usr/bin/env node
// Shoghi Effendi citations → their Arabic/Persian originals, in CTAI's handoff format (runs ON tower-nas).
// Input:  /tank/sifter/citations/se-citations.json (914 quotations, each with CTAI ids) + verified-export.json (spans
//         already verified). Output: /tank/sifter/citations/se-quotations-sources.jsonl — one record per CTAI id:
//         {id, quoted_author, work, ref, url, text|segments, src, content_id, confidence}. Unmatched quotations are HELD
//         (listed in held.json for review) — "none of these candidates" is not evidence that no original exists, so
//         status:'not_found' is never emitted automatically.
//         Quotations found beyond CTAI's list (no CTAI id) go out under our id with new:true + the English quote.
// Steps:  resolve   — verified spans → their paragraph (content id, or exact folded match when only the file was known)
//         candidates— each English clause → Gemini-2 query vector → Qdrant `phrases` (originals); paragraphs scored
//                     across clauses (RRF), consecutive paragraphs kept together, link-graph candidate added
//         verify    — Opus 5.5 picks the candidate(s) and copies the exact span(s); kept only if verbatim in the text
//         emit      — the JSONL. Every step is resumable (results.db). Spend guard: --max-usd.
//   node scripts/citations/se-sources.mjs --resolve --candidates --verify --emit [--max-usd 40] [--limit N] [--redo-held] [--ids file.json]
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
// The original may live ON a translation paragraph (bilingual layer, original_text): then that is the text we judge and send.
const ARAB = /[\u0600-\u06FF]/g;
const arabicShareOf = (t) => { const l = (String(t || '').match(/\p{L}/gu) || []).length; return l ? (String(t).match(ARAB) || []).length / l : 0; };
const paraRaw = src.prepare(`SELECT c.id, c.doc_id, c.paragraph_index, c.text, c.original_text, d.title, d.author, d.slug FROM content c JOIN docs d ON d.id = c.doc_id WHERE c.id = ?`);
const para = { get: (id) => { const p = paraRaw.get(id); if (!p) return p;
  return arabicShareOf(p.text) >= 0.5 || !p.original_text ? p : { ...p, text: p.original_text, on_translation: true }; } };
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
  if (has('redo-held')) {                                  // a new source of originals was indexed: re-search the held ones
    const ids = JSON.parse(readFileSync(join(DIR, 'held.json'), 'utf8')).map((h) => h.id);
    const del = out.transaction(() => ids.forEach((i) => { out.prepare('DELETE FROM cand WHERE id = ?').run(i); out.prepare('DELETE FROM verdict WHERE id = ?').run(i); }));
    del(); log({ phase: 'redo-held', quotations: ids.length });
  }
  const done = new Set(out.prepare('SELECT id FROM cand').all().map((r) => r.id));
  const QURAN_DOC = +arg('quran-doc', 21380);            // the Arabic Qur'an: Qur'an quotations search only there
  const todo = quotes.filter((q) => !verified[q.id] && !done.has(q.id)).slice(0, LIMIT || undefined);
  const put = out.prepare('INSERT OR REPLACE INTO cand VALUES (?, ?)');
  for (const q of todo) {
    const clean = cleanText(q.quote);
    const clauses = segment(q.quote, 'en').map((s) => clean.slice(s.start, s.end)).filter((c) => c.split(' ').length >= 4).slice(0, 16);
    const vs = await gemQuery(clauses.length ? clauses : [q.quote.slice(0, 2000)]);
    const score = new Map(), at = new Map();          // at: paragraph → offset of its best-ranked matching phrase
    await Promise.all(vs.map(async (v) => {
      const res = await qd(`/collections/${COLL}/points/query/groups`, { query: v, using: 'literal', group_by: 'paragraph_id', group_size: 1, limit: 10,
        with_payload: ['paragraph_id', 'doc_id', 'start'], params: { quantization: { rescore: true, oversampling: 4.0 } },
        ...(q.figure === 'Qur’án' && { filter: { must: [{ key: 'doc_id', match: { value: QURAN_DOC } }] } }) });
      res.groups.forEach((g, rank) => {
        score.set(g.id, (score.get(g.id) || 0) + 1 / (60 + rank));
        const st = g.hits?.[0]?.payload?.start;
        if (st != null && (!at.has(g.id) || rank < at.get(g.id).rank)) at.set(g.id, { start: st, rank });
      });
    }));
    if (q.original?.content_id) score.set(Number(q.original.content_id), (score.get(Number(q.original.content_id)) || 0) + 0.02);
    const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pid, s]) => ({ pid, s: +s.toFixed(4), at: at.get(pid)?.start ?? 0 }));
    put.run(q.id, JSON.stringify(top));
  }
  log({ phase: 'candidates', quotations: todo.length });
}

// ── verify (Opus 5.5) + exact-span check
// A candidate is sent as a ~1,500-character window around its best-matching phrase (whole paragraphs made a quotation
// cost ~$0.10); the verbatim check still runs against the FULL paragraph, and CTAI receives the full paragraph.
function windowed(text, at = 0) {
  const t = cleanText(text);
  if (t.length <= 1600) return t;
  let a = Math.max(0, at - 500), b = Math.min(t.length, at + 1100);
  a = a ? t.indexOf(' ', a) + 1 : 0; const sp = t.lastIndexOf(' ', b); b = b < t.length && sp > a ? sp : b;
  return `${a ? '… ' : ''}${t.slice(a, b)}${b < t.length ? ' …' : ''}`;
}
const PROMPT = (fig, quote, cands) => `Shoghi Effendi quoted ${fig} in English — his own rendering, free, sometimes abridged with ellipses.
Below are candidate passages from the original Arabic/Persian writings.

QUOTATION:
“${quote}”

CANDIDATES:
${cands.map((c, k) => `[${k + 1}] ${c.title} ¶${c.paragraph_index} (content ${c.id}):\n${windowed(c.text, c.at)}`).join('\n\n')}

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
  const only = arg('ids') ? new Set(JSON.parse(readFileSync(arg('ids'), 'utf8'))) : null;   // verify just these quotation ids
  const jobs = out.prepare('SELECT id, cands FROM cand').all().filter((r) => !done.has(r.id) && (!only || only.has(r.id)))
    .map((r) => ({ id: r.id, cands: JSON.parse(r.cands).map((c) => { const p = para.get(String(c.pid)); return p && { ...p, at: c.at }; }).filter(Boolean) }));
  const byId = Object.fromEntries(quotes.map((q) => [q.id, q]));
  const estIn = jobs.reduce((s, j) => s + (byId[j.id].quote.length + j.cands.reduce((t, c) => t + windowed(c.text, c.at).length, 0)) / 3 + 400, 0);
  const estUsd = +(estIn / 1e6 * PRICE.in + jobs.length * 250 / 1e6 * PRICE.out).toFixed(2);   // observed 113–162 output tokens per verdict
  log({ phase: 'verify-estimate', quotations: jobs.length, est_usd: estUsd });
  if (estUsd > MAX_USD) { log({ phase: 'stopped', reason: `estimate $${estUsd} > --max-usd ${MAX_USD}` }); return; }
  const put = out.prepare('INSERT OR REPLACE INTO verdict VALUES (?, ?, ?)');
  let i = 0, spent = 0, stopped = false;
  async function worker() {
    while (i < jobs.length) {
      if (spent > MAX_USD) { if (!stopped) log({ phase: 'stopped', reason: `spent $${spent.toFixed(2)} reached --max-usd ${MAX_USD}` }); stopped = true; return; }
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

// A span copied from another edition differs in spelling (ى/ی, ك/ک, vowel marks). Find it in the paragraph after folding
// both, and return the PARAGRAPH'S OWN characters for that stretch — so src always occurs verbatim in text. null = not found.
function realign(span, text) {
  const t = cleanText(text);
  if (ws(t).includes(ws(span))) return ws(span);
  let folded = '', map = [];
  for (let i = 0; i < t.length; i++) {
    const f = /\s/.test(t[i]) ? ' ' : foldArabic(t[i]);
    for (const ch of f) { if (ch === ' ' && folded.endsWith(' ')) continue; folded += ch; map.push(i); }
  }
  const q = ws(foldArabic(span));
  const at = folded.indexOf(q);
  if (at < 0) return null;
  return ws(t.slice(map[at], map[at + q.length - 1] + 1));
}

// ── emit CTAI JSONL (one record per CTAI id; only confident matches; verbatim spans only)
function emit() {
  const lines = [], held = [], stats = { verified: 0, matched: 0, held: 0, unprocessed: 0 };
  const rec = (q, segs, confidence, method, coverage = null) => {
    // several spans in ONE paragraph → one record (spans joined with " … "); segments only across paragraphs
    const byPara = new Map();
    for (const s of segs) { const k = String(s.content_id); byPara.set(k, [...(byPara.get(k) || []), s.src]); }
    const ps = [...byPara.entries()].map(([cid, srcs]) => {
      const p = para.get(cid), al = p && srcs.map((x) => realign(x, p.text));
      return p && al.every(Boolean) ? { src: al.join(' … '), p } : null;      // any span not found in the paragraph → hold
    }).filter(Boolean);
    if (!ps.length) return null;
    const base = (s) => ({ text: cleanText(s.p.text), src: s.src, content_id: Number(s.p.id), ref: `${s.p.title} ¶${s.p.paragraph_index}`,
      url: `https://siftersearch.com/library/view?doc=${s.p.doc_id}#p${s.p.paragraph_index}` });
    // quoted_author = our label. The source document may be a work that QUOTES the tablet (Ẓuhúru'l-Ḥaqq, a compilation),
    // so its author differing is normal → source_author. Only a source that is the OWN work of a DIFFERENT Central Figure
    // suggests a misattribution → attribution_check.
    const nm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/gi, '').toLowerCase();
    const CF = { bahaullah: 1, abdulbaha: 1, thebab: 1, bab: 1 };
    const sa = ps[0].p.author, diff = sa && nm(sa) !== nm(q.figure);
    const head = { quoted_author: q.figure, ...(diff && { source_author: sa }), ...(diff && CF[nm(sa)] && CF[nm(q.figure)] && { attribution_check: true }),
      work: ps[0].p.title, confidence, method, ...(coverage && { coverage }) };
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
      if (segs.length && v.confidence >= 0.7) { r = rec(q, segs, v.confidence, 'phrase-vector search (Gemini-2/Qdrant) + Opus 5.5 span extraction', v.coverage); stats.matched++; }
      else { stats.held++; held.push({ id: q.id, ctai_ids: q.ctai_ids, figure: q.figure, quote: q.quote.slice(0, 300), verdict: v }); continue; }
    }
    if (q.ctai_ids?.length) for (const cid of q.ctai_ids) lines.push({ id: cid, ...r });
    else lines.push({ id: q.id, new: true, quote: q.quote, quoted_in: q.quoted_in, ...r });   // found beyond CTAI's list
  }
  writeFileSync(join(DIR, 'se-quotations-sources.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(DIR, 'held.json'), JSON.stringify(held, null, 1));
  log({ phase: 'emit', records: lines.length, ...stats });
}

if (has('resolve')) resolve();
if (has('candidates')) await candidates();
if (has('verify')) await verify();
if (has('emit')) emit();
