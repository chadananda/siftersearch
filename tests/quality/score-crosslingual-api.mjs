#!/usr/bin/env node
// Cross-lingual battery END TO END: English query → the Arabic/Persian original, through live /api/search/multi (the real
// planned engine), judged by hit TEXT the same way as crosslingual/battery.py (letter-normalised n-grams, ≥30% of the
// shorter side). The A/B switch for the Qdrant layers: --qdrant[=phrase,keyword|only] --weights=phrase:1.5 --no-plan.
//   node tests/quality/score-crosslingual-api.mjs [--qdrant] [--limit=N] [--kinds=phrase,sentence] [--top-k=10] [--scope=library] [--out=file]
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });
const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;
if (!KEY && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { console.error('needs DEPLOY_SECRET (or INTERNAL_API_KEY)'); process.exit(2); }
const TOP_K = Number(arg('top-k') || 10);
// default scope = originals: the case's own language (ar/fa), as battery.py's 'originals' scope. Unfiltered live search
// returns the English translation first, which the text judge (rightly) never counts. --scope=library drops the filter.
const LIBRARY = arg('scope') === 'library';
const QD = args.find((a) => a === '--qdrant' || a.startsWith('--qdrant='));
const qdrant = QD ? (QD === '--qdrant=only' ? 'only' : QD.includes('=') ? { phrase: /phrase/.test(QD), keyword: /keyword/.test(QD), hype: /hype/.test(QD) } : true) : false;
const weights = (arg('weights') || '').split(',').filter(Boolean).reduce((o, kv) => { const [k, v] = kv.split(':'); o[k] = Number(v); return o; }, {});

let cases = JSON.parse(readFileSync(join(__dirname, 'crosslingual-fixtures.json'), 'utf8')).cases;
if (arg('kinds')) cases = cases.filter((c) => arg('kinds').split(',').includes(c.kind));
// --limit takes an even spread across the fixture file (it is grouped by work), not its head
if (arg('limit')) { const n = Number(arg('limit')), step = cases.length / n; cases = Array.from({ length: Math.min(n, cases.length) }, (_, i) => cases[Math.floor(i * step)]); }

// same folding as battery.py: harakat/tatweel/ZWNJ dropped, letter variants unified
const DROP = /[ً-ٰٟۡـ‌‏‎]/g;
const MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ؤ': 'و', 'ئ': 'ی', 'ٱ': 'ا' };
export const toks = (s) => String(s || '').replace(/⁅\/?s\d+⁆|<[^>]+>|\[[^\]]*\]/g, ' ').replace(DROP, '').replace(/[يىكةأإآؤئٱ]/g, (c) => MAP[c])
  .replace(/[^\p{L}\p{N}_\s]/gu, ' ').split(/\s+/).filter(Boolean);
const grams = (w, n) => new Set(w.length ? Array.from({ length: Math.max(1, w.length - n + 1) }, (_, i) => w.slice(i, i + n).join(' ')) : []);
export function correct(hitText, target) {
  const a = toks(hitText), b = toks(target), n = Math.min(a.length, b.length) >= 8 ? 4 : 2;
  const ga = grams(a, n), gb = grams(b, n); if (!ga.size || !gb.size) return false;
  const [small, big] = ga.size <= gb.size ? [ga, gb] : [gb, ga];
  let k = 0; for (const g of small) if (big.has(g)) k++;
  return k / small.size >= 0.3;
}

// run only when executed directly — score-sourcehunt.mjs imports correct() and must not start this battery
const MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// An API restart (deploy) refuses connections / answers 502 for ~30 s — retry ~70 s instead of recording an error
// (10-10: every Qdrant-arm case errored inside one restart window).
async function one(c) {
  for (let attempt = 0; ; attempt++) {
    const r = await oneOnce(c);
    if (!r.error || !/fetch failed|ECONNREFUSED|HTTP 50[234]/.test(r.error) || attempt >= 8) return r;
    await new Promise((res) => setTimeout(res, Math.min(15000, 2000 * (attempt + 1))));
  }
}
async function oneOnce(c) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/search/multi`, { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', 'X-Sifter-Test': '1', 'X-Internal-Key': KEY },
      body: JSON.stringify({ query: c.query, limit: TOP_K, qdrant, ...(LIBRARY ? {} : { filters: { language: c.lang } }), ...(Object.keys(weights).length ? { weights } : {}), ...(args.includes('--no-plan') ? { plan: false } : {}) }) });
    if (!res.ok) return { id: c.id, kind: c.kind, error: `HTTP ${res.status}` };
    const data = await res.json(), hits = (data.hits || []).slice(0, TOP_K);
    const i = hits.findIndex((h) => correct(h.text || h.content || '', c.target));
    return { id: c.id, kind: c.kind, rank: i < 0 ? null : i + 1, ms: Date.now() - t0, layers: i < 0 ? null : hits[i]._layerRanks || null };
  } catch (e) { return { id: c.id, kind: c.kind, error: e.message.slice(0, 120) }; }
}
const rows = [];
if (MAIN) for (let i = 0; i < cases.length; i += 4) rows.push(...await Promise.all(cases.slice(i, i + 4).map(one)));

const agg = (rs) => {
  const ok = rs.filter((r) => !r.error); if (!ok.length) return { n: 0, errors: rs.length };
  const at = (k) => +(ok.filter((r) => r.rank && r.rank <= k).length / ok.length).toFixed(3);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  return { n: ok.length, 'hit@1': at(1), 'hit@5': at(5), [`hit@${TOP_K}`]: at(TOP_K),
    mrr: +(ok.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / ok.length).toFixed(3), p50ms: ms[ms.length >> 1], p95ms: ms[Math.floor(ms.length * 0.95)], errors: rs.length - ok.length };
};
const groups = { ALL: agg(rows) };
for (const k of [...new Set(rows.map((r) => r.kind))].sort()) groups[k] = agg(rows.filter((r) => r.kind === k));
const report = { at: new Date().toISOString(), scope: LIBRARY ? 'library' : 'originals', qdrant, weights, plan: !args.includes('--no-plan'), groups };
if (MAIN) for (const [g, v] of Object.entries(groups)) console.log(g.padEnd(10), JSON.stringify(v));
if (MAIN && arg('out')) writeFileSync(arg('out'), JSON.stringify({ report, rows }, null, 1));
