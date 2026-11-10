#!/usr/bin/env node
// DataForSEO enrichment for the question bank: monthly search volumes (Google Ads, batched ≤1000 kw/task) + People-Also-Ask questions (SERP). Prints the plan first; --yes to spend. Hard cap --budget (default $10).
//   node enrich.mjs --env /path/.env-secrets [--yes] [--budget 10] [--vol-top 400] [--paa-seeds 20]   reads tmp/question-bank/candidates + tests/quality/question-bank; writes tmp/question-bank/{volumes,paa}.json
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BUDGET = Number(arg('budget', 10)), VOLTOP = Number(arg('vol-top', 400)), SEEDS = Number(arg('paa-seeds', 20)), GO = process.argv.includes('--yes');
const env = Object.fromEntries(readFileSync(arg('env', '.env-secrets'), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const auth = 'Basic ' + Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64');
const jread = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const T = 'tmp/question-bank', ids = readdirSync('tests/quality/question-bank').map((f) => f.replace('.json', ''));
const VOL = jread(`${T}/volumes.json`, {}), PAA = jread(`${T}/paa.json`, {}), SEEDDONE = jread(`${T}/paa-seeds-done.json`, {});
const cand = Object.fromEntries(ids.map((i) => [i, jread(`${T}/candidates/${i}.json`, []).slice(0, VOLTOP)]));
const need = [...new Set(Object.values(cand).flat())].filter((q) => !(q in VOL) && q.split(' ').length <= 10 && q.length <= 80);   // Google Ads rejects >10 words
const seeds = ids.flatMap((i) => jread(`tests/quality/question-bank/${i}.json`, { questions: [] }).questions.slice(0, SEEDS).map((x) => [i, x.q])).filter(([, q]) => !SEEDDONE[q]);
const tasks = Math.ceil(need.length / 1000);
// cost per DataForSEO price list: Google Ads search_volume/live $0.075 per task; SERP organic/live/advanced $0.002 per SERP + $0.00015 per PAA click (depth 2 ≈ up to 4 clicks, so ≤ $0.0026)
const estVol = tasks * 0.075, estPaa = seeds.length * 0.0026;
console.log(`PLAN\n  1. POST /v3/keywords_data/google_ads/search_volume/live — ${need.length} keywords in ${tasks} task(s) (≤1000 each) ≈ $${estVol.toFixed(2)}\n  2. POST /v3/serp/google/organic/live/advanced (People Also Ask, click depth 2) — ${seeds.length} seed SERPs ≈ $${estPaa.toFixed(2)}\n  expected total ≈ $${(estVol + estPaa).toFixed(2)}; hard cap $${BUDGET}`);
if (!GO) process.exit(0);
let spent = 0;
async function call(path, body) {
  const r = await fetch(`https://api.dataforseo.com/v3/${path}`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j = await r.json(); spent += j.cost || 0;
  if (spent > BUDGET) { console.error(`budget cap reached ($${spent.toFixed(3)})`); save(); process.exit(1); }
  return j;
}
const save = () => { mkdirSync(T, { recursive: true }); writeFileSync(`${T}/volumes.json`, JSON.stringify(VOL)); writeFileSync(`${T}/paa.json`, JSON.stringify(PAA)); writeFileSync(`${T}/paa-seeds-done.json`, JSON.stringify(SEEDDONE)); };
for (let i = 0; i < need.length; i += 1000) {
  const kw = need.slice(i, i + 1000), j = await call('keywords_data/google_ads/search_volume/live', [{ keywords: kw, language_code: 'en', location_code: 2840 }]);
  const res = j.tasks?.[0]?.result; if (!res) { console.error('volume task failed:', j.tasks?.[0]?.status_message); continue; }
  const got = new Map(res.map((x) => [x.keyword?.toLowerCase(), x.search_volume]));
  for (const q of kw) VOL[q] = got.get(q) ?? 0;
  console.log(`volume batch ${i / 1000 + 1}: ${res.filter((x) => x.search_volume).length}/${kw.length} with volume; spent $${spent.toFixed(3)}`); save();
}
const walk = (items, out) => { for (const it of items || []) { if (it.type === 'people_also_ask_element' && it.title) out.push(it.title); walk(it.items, out); walk(it.expanded_element, out); } };
for (const [id, q] of seeds) {
  const j = await call('serp/google/organic/live/advanced', [{ keyword: q, language_code: 'en', location_code: 2840, depth: 10, people_also_ask_click_depth: 2 }]);
  const out = []; walk(j.tasks?.[0]?.result?.[0]?.items, out);
  PAA[id] = [...new Set([...(PAA[id] || []), ...out])]; SEEDDONE[q] = out.length;
  if (Object.keys(SEEDDONE).length % 20 === 0) { console.log(`paa ${Object.keys(SEEDDONE).length}: spent $${spent.toFixed(3)}`); save(); }
}
save(); console.log(`done; spent $${spent.toFixed(3)} (cap $${BUDGET})`);
