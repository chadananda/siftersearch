#!/usr/bin/env node
// P2 load test for the phrase index (planning/phrase-index-plan.md): fills a THROWAWAY Meili index with N synthetic
// phrase entries (random ±c vectors — binary quantization keeps only signs, so cost matches real data) and measures
// indexing rate, disk, RSS and filtered query latency every checkpoint. Never touches any other index.
//   node scripts/phrase-index/load-test.mjs --meili http://127.0.0.1:7701 --key KEY [--n 10000000] [--dims 3072]
//        [--batch 2000] [--every 1000000] [--pid <meili pid for RSS>] [--live http://127.0.0.1:7700 --live-key KEY]
// Output: one JSON line per checkpoint (stdout). Stop with Ctrl-C; --drop deletes the test index at the end.
import { readFileSync } from 'fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MEILI = arg('meili', 'http://127.0.0.1:7701'), KEY = arg('key', ''), INDEX = arg('index', 'phrases_loadtest');
const N = +arg('n', 10_000_000), DIMS = +arg('dims', 3072), BATCH = +arg('batch', 2000), EVERY = +arg('every', 1_000_000);
const PID = arg('pid'), LIVE = arg('live'), LIVE_KEY = arg('live-key', '');
// language mix from the 2026-10-01 census (paragraph-weighted)
const LANGS = [['en', 0.66], ['ar', 0.25], ['he', 0.05], ['fa', 0.03], ['zh', 0.01]];
const C = +(1 / Math.sqrt(DIMS)).toPrecision(4);   // short JSON; Meili's payload cap is 100 MB

const call = async (base, key, method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const meili = (m, p, b) => call(MEILI, KEY, m, p, b);
const waitTask = async (uid) => { for (;;) { const t = await meili('GET', `/tasks/${uid}`); if (!['enqueued', 'processing'].includes(t.status)) return t; await new Promise((r) => setTimeout(r, 500)); } };
const lang = () => { let x = Math.random(); for (const [l, p] of LANGS) if ((x -= p) <= 0) return l; return 'en'; };
const vec = () => Array.from({ length: DIMS }, () => (Math.random() < 0.5 ? -C : C));
const pct = (a, q) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
const rssMb = () => { try { return Math.round(+readFileSync(`/proc/${PID}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024); } catch { return null; } };

async function probe(n) {
  const lat = [];
  for (let i = 0; i < 100; i++) {
    const filter = i % 3 === 0 ? 'language = ar' : i % 3 === 1 ? `doc_id IN [${Array.from({ length: 5 }, () => Math.floor(Math.random() * (n / 500))).join(',')}]` : undefined;
    const t0 = performance.now();
    await meili('POST', `/indexes/${INDEX}/search`, { vector: vec(), hybrid: { embedder: 'literal', semanticRatio: 1 }, limit: 10, ...(filter && { filter }) });
    lat.push(performance.now() - t0);
  }
  let live = null;
  if (LIVE) { const t0 = performance.now(); await call(LIVE, LIVE_KEY, 'POST', '/indexes/paragraphs/search', { q: 'justice', limit: 10 }); live = Math.round(performance.now() - t0); }
  const st = await meili('GET', '/stats');
  return { p50: Math.round(pct(lat, 0.5)), p99: Math.round(pct(lat, 0.99)), live_ms: live, disk_gb: +(st.databaseSize / 1e9).toFixed(2), rss_mb: rssMb() };
}

await meili('DELETE', `/indexes/${INDEX}`).then((t) => waitTask(t.taskUid)).catch(() => {});
await waitTask((await meili('POST', '/indexes', { uid: INDEX, primaryKey: 'id' })).taskUid);
await waitTask((await meili('PATCH', `/indexes/${INDEX}/settings`, {
  distinctAttribute: 'paragraph_id', searchableAttributes: ['language'],
  filterableAttributes: ['paragraph_id', 'doc_id', 'language', 'religion', 'entity_ids', 'concept_ids'],
  embedders: { literal: { source: 'userProvided', dimensions: DIMS, binaryQuantized: true } },
})).taskUid);

const start = Date.now();
let pending = [];
for (let done = 0; done < N; done += BATCH) {
  const docs = Array.from({ length: Math.min(BATCH, N - done) }, (_, k) => {
    const id = done + k;
    return { id, paragraph_id: Math.floor(id / 8), doc_id: Math.floor(id / 500), language: lang(), religion: "Baha'i", entity_ids: [id % 5000], _vectors: { literal: vec() } };
  });
  pending.push((await meili('POST', `/indexes/${INDEX}/documents`, docs)).taskUid);
  if (pending.length >= 4) await waitTask(pending.shift());          // keep the queue short: measure, don't flood
  const n = done + docs.length;
  if (n % EVERY === 0 || n === N) {
    for (const uid of pending.splice(0)) await waitTask(uid);
    const hours = (Date.now() - start) / 3.6e6;
    console.log(JSON.stringify({ n, hours: +hours.toFixed(2), per_hour: Math.round(n / hours), ...(await probe(n)) }));
  }
}
if (process.argv.includes('--drop')) await meili('DELETE', `/indexes/${INDEX}`);
