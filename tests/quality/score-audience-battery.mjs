#!/usr/bin/env node
// Scores a research-battery run (scripts/anis/research-battery.mjs --questions …) against its registry jsonl:
// right linked work (a markdown link in Anís's reply reaches the expected book), invented quotations (a quoted
// ≥6-word run not found verbatim in the library via /api/v1/search), wins/ties vs Perplexity per type (bar ≥85%).
// Usage: node tests/quality/score-audience-battery.mjs <battery.json> <questions.jsonl> [--variant current] [--md out.md]
// Env: SIFTER_API (default http://tower-nas:7839), TEST_API_KEY. Pure helpers exported for tests/api/score-audience-battery.test.js.
// 'invented' is a FLAG to check by hand (10-hit search + the expected work's text): elided quotes, external citations and
// encumbered books all land here. First run (11-03): 17 flags, 0 real inventions — planning/anis-w8-audience-20261103.md.
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { quoteCoverage } from './perplexity-compare.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public', '.env']) dotenv.config({ path: join(ROOT, f), quiet: true });

export const BAR = 0.85;
export const FOUND = 0.5;        // quoteCoverage at/above this = the quote exists in the library
export const VERBATIM = 0.9;

// How a link reaches a work: URL fragments (oceanlibrary / siftersearch slugs, oceanoflights mirrors) or a doc id in #pN / doc= links.
export const WORKS = {
  'dawn-breakers': { doc: 21308, title: /dawn[- ]breakers/i, url: /dawn-breakers/i },
  'gate-of-the-heart': { doc: 8632, title: /gate of the heart/i, url: /gate-of-the-heart|\/8632(\b|#)/i },
};

/** Markdown links [label](url) in a reply. Pure. */
export function links(text = '') {
  return [...text.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ label: m[1], url: m[2] }));
}

/** Does the reply link (or at least name) the expected work? Pure. */
export function linkedWork(text = '', work) {
  const w = WORKS[work];
  if (!w) return { linked: false, named: false, status: 'no-expectation' };
  const linked = links(text).some((l) => w.url.test(l.url) || w.title.test(l.label));
  const named = w.title.test(text);
  return { linked, named, status: linked ? 'linked' : named ? 'named-only' : 'missing' };
}

/** Quoted runs of ≥6 words (curly or straight quotes), link labels stripped so titles never count. Pure. */
export function quotes(text = '') {
  const plain = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, ' ');
  const out = [];
  for (const m of plain.matchAll(/[“"]([^“”"\n]*)[”"]/g)) {   // every pair is consumed, so a short quote's closing mark never opens a fake one
    const q = m[1].replace(/\s+/g, ' ').trim();
    if (q.split(' ').length >= 6 && q.length <= 600 && !/\*\*|^- /.test(q)) out.push(q);
  }
  return [...new Set(out)];
}

/** Win/tie per the judge's scores: Anís ≥ Perplexity. Pure. */
export function winTie(verdict, variant = 'current') {
  const a = verdict?.scores?.[variant]?.score, p = verdict?.scores?.perplexity?.score;
  if (typeof a !== 'number' || typeof p !== 'number') return null;
  return a > p ? 'win' : a === p ? 'tie' : 'loss';
}

/** Per-type rollup of scored cases. Pure. */
export function rollup(rows) {
  const by = {};
  for (const r of rows) {
    const t = (by[r.type] ||= { type: r.type, n: 0, judged: 0, winTie: 0, anis: [], px: [], linked: 0, named: 0, quotes: 0, invented: 0 });
    t.n++;
    if (r.outcome) { t.judged++; if (r.outcome !== 'loss') t.winTie++; t.anis.push(r.anisScore); t.px.push(r.pxScore); }
    if (r.link.linked) t.linked++;
    if (r.link.named) t.named++;
    t.quotes += r.quotes.length;
    t.invented += r.quotes.filter((q) => q.status === 'invented').length;
  }
  const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null);
  return Object.values(by).map((t) => ({ ...t, anis: mean(t.anis), px: mean(t.px), winTiePct: t.judged ? +(t.winTie / t.judged).toFixed(2) : null, linkedPct: +(t.linked / t.n).toFixed(2) }));
}

export function markdown(rows, roll) {
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const total = rollup(rows.map((r) => ({ ...r, type: 'all' })))[0];
  const L = ['| type | n | wins+ties | Anís | Perplexity | linked work | quotes | invented |', '|---|---|---|---|---|---|---|---|'];
  for (const t of [...roll, total]) L.push(`| ${t.type} | ${t.n} | ${t.winTie}/${t.judged} (${pct(t.winTiePct)})${t.winTiePct != null && t.winTiePct < BAR ? ' ⚠' : ''} | ${t.anis ?? '—'} | ${t.px ?? '—'} | ${t.linked}/${t.n} (${pct(t.linkedPct)}) | ${t.quotes} | ${t.invented} |`);
  L.push('', '## Defects', '');
  for (const r of rows) {
    const d = [];
    if (r.outcome === 'loss') d.push(`loss ${r.anisScore} vs ${r.pxScore}`);
    if (!r.link.linked) d.push(`linked work ${r.link.status}`);
    for (const q of r.quotes.filter((q) => q.status !== 'verbatim')) d.push(`${q.status} quote (cov ${q.coverage}): “${q.text.slice(0, 90)}…”`);
    if (d.length) L.push(`- **${r.id}** (${r.type}) ${r.text}\n  - ${d.join('\n  - ')}${r.gaps ? `\n  - judge: ${r.gaps.slice(0, 300)}` : ''}`);
  }
  return L.join('\n');
}

async function searchQuote(q, { api, key }) {
  const query = q.split(' ').slice(0, 40).join(' ').slice(0, 480);   // the API caps query at 500 chars; 40 words is enough to place a quote
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {   // tower answers 503/403/429 under load; back off, never give up on one quote
    r = await fetch(`${api}/api/v1/search`, { method: 'POST', headers: { 'X-API-Key': key, 'content-type': 'application/json' }, body: JSON.stringify({ query, limit: 10, analyze: false }) });
    if (r.ok || r.status < 500 && r.status !== 403 && r.status !== 429) break;
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  if (!r.ok) throw new Error(`search ${r.status} for “${q.slice(0, 60)}”: ${(await r.text()).slice(0, 200)}`);
  const hits = (await r.json()).results || [];
  let best = { coverage: 0 };
  for (const h of hits) { const c = quoteCoverage(q, h.text || ''); if (c > best.coverage) best = { coverage: c, doc: h.documentId, title: h.title }; }
  return best;
}

/** Full text of a work through the internal document endpoint (paged; cached in tmp/). Secondary works rank low in
 *  search, so a quote from the expected book is also checked against the book itself. */
export async function workText(doc, { api, cacheDir }) {
  const file = cacheDir && join(cacheDir, `w8-doc-${doc}.txt`);
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  const parts = [];
  for (let off = 0; ; off += 500) {
    const r = await fetch(`${api}/api/library/documents/${doc}?includeParagraphs=true&paragraphOffset=${off}&paragraphLimit=500`);
    if (!r.ok) throw new Error(`document ${doc} ${r.status}`);
    const ps = (await r.json()).paragraphs || [];
    parts.push(...ps.map((p) => p.text || ''));
    if (ps.length < 500) break;
  }
  const text = parts.join('\n');
  if (file) writeFileSync(file, text);
  return text;
}

export async function scoreCase(c, q, { variant = 'current', search, work } = {}) {
  const text = c.answers?.[variant]?.text || '';
  const link = linkedWork(text, q?.extra?.work);
  const qs = [];
  for (const t of quotes(text)) {
    let best = await search(t);
    if (best.coverage < VERBATIM && work) { const cov = quoteCoverage(t, work); if (cov > best.coverage) best = { coverage: cov, doc: WORKS[q?.extra?.work]?.doc }; }
    qs.push({ text: t, coverage: +best.coverage.toFixed(2), doc: best.doc, status: best.coverage >= VERBATIM ? 'verbatim' : best.coverage >= FOUND ? 'partial' : 'invented' });
  }
  const outcome = winTie(c.verdict, variant);
  return { id: c.id, type: q?.type || c.kind, text: c.messages?.[0]?.content || q?.text, link, quotes: qs, outcome, anisScore: c.verdict?.scores?.[variant]?.score ?? null, pxScore: c.verdict?.scores?.perplexity?.score ?? null, gaps: c.verdict?.gaps || null, authorityErrors: c.verdict?.authority_errors || [] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [batteryFile, questionsFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  const variant = arg('variant') || 'current';
  const api = (process.env.SIFTER_API || 'http://tower-nas:7839').replace(/\/$/, '');
  const key = process.env.TEST_API_KEY;
  const battery = JSON.parse(readFileSync(batteryFile, 'utf8'));
  const reg = Object.fromEntries(readFileSync(questionsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((q) => [q.id, q]));
  const rows = [], texts = {};
  for (const c of battery.cases) {
    const w = reg[c.id]?.extra?.work, doc = WORKS[w]?.doc;
    const work = doc ? (texts[doc] ||= await workText(doc, { api, cacheDir: join(ROOT, 'tmp') })) : null;
    rows.push(await scoreCase(c, reg[c.id], { variant, work, search: (t) => searchQuote(t, { api, key }) }));
  }
  const roll = rollup(rows);
  const md = markdown(rows, roll);
  console.log(md);
  if (arg('md')) writeFileSync(arg('md'), md);
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ rows, roll }, null, 1));
}
