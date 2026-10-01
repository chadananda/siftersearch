#!/usr/bin/env node
// P2 load test for the phrase index (planning/phrase-index-plan.md): fills a THROWAWAY Meili index (or, with
// --engine qdrant, a Qdrant collection: vectors on disk, binary quantization in RAM, groups + rescoring) with N synthetic
// phrase entries (random ±c vectors — binary quantization keeps only signs, so cost matches real data) and measures
// indexing rate, disk, RSS and filtered query latency every checkpoint. Never touches any other index.
//   MEILI_KEY=… [LIVE_MEILI_KEY=…] node scripts/phrase-index/load-test.mjs --meili http://127.0.0.1:7701 [--n 10000000] [--dims 3072]
//        [--batch 2000] [--every 1000000] [--pid <meili pid for RSS>] [--live http://127.0.0.1:7700]
//   QDRANT_KEY=… node scripts/phrase-index/load-test.mjs --engine qdrant --qdrant http://127.0.0.1:6333 --storage /fast/qdrant-next/storage
//   Bulk mode (Qdrant's recommended bulk load: no graph while uploading, one parallel build at the end):
//     --bulk create              create the collection with indexing off
//     --bulk upload --offset K --n N   upload ids [K, K+N) (run several in parallel)
//     --bulk finalize --n TOTAL   turn indexing on, time the graph build, then probe latency
// Keys come from the environment, never argv (argv shows up in ps and in logs).
// Output: one JSON line per checkpoint (stdout). Stop with Ctrl-C; --drop deletes the test index at the end.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MEILI = arg('meili', 'http://127.0.0.1:7701'), KEY = process.env.MEILI_KEY || '', INDEX = arg('index', 'phrases_loadtest');
const N = +arg('n', 10_000_000), DIMS = +arg('dims', 3072), BATCH = +arg('batch', 2000), EVERY = +arg('every', 1_000_000);
const ENGINE = arg('engine', 'meili'), QD = arg('qdrant', 'http://127.0.0.1:6333'), QKEY = process.env.QDRANT_KEY || '', STORAGE = arg('storage');
const PID = arg('pid'), LIVE = arg('live'), LIVE_KEY = process.env.LIVE_MEILI_KEY || '';
// language mix from the 2026-10-01 census (paragraph-weighted)
const LANGS = [['en', 0.66], ['ar', 0.25], ['he', 0.05], ['fa', 0.03], ['zh', 0.01]];
const C = +(1 / Math.sqrt(DIMS)).toPrecision(4);   // short JSON; Meili's payload cap is 100 MB

const call = async (base, key, method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const meili = (m, p, b) => call(MEILI, KEY, m, p, b);
const qdrant = async (method, path, body) => {
  const r = await fetch(QD + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': QKEY }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const diskGb = () => { try { return +(+execSync(`du -sk ${STORAGE}`).toString().split(/\s/)[0] / 1e6).toFixed(2); } catch { return null; } };
const waitTask = async (uid) => { for (;;) { const t = await meili('GET', `/tasks/${uid}`); if (!['enqueued', 'processing'].includes(t.status)) return t; await new Promise((r) => setTimeout(r, 500)); } };
const lang = () => { let x = Math.random(); for (const [l, p] of LANGS) if ((x -= p) <= 0) return l; return 'en'; };
const vec = () => Array.from({ length: DIMS }, () => (Math.random() < 0.5 ? -C : C));
const pct = (a, q) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))];
const rssMb = () => { try { return Math.round(+readFileSync(`/proc/${PID}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024); } catch { return null; } };

async function probe(n) {
  const lat = [];
  for (let i = 0; i < 100; i++) {
    const docs = Array.from({ length: 5 }, () => Math.floor(Math.random() * (n / 500)));
    const kind = i % 3;    // 0: language = ar · 1: five doc_ids · 2: no filter
    const t0 = performance.now();
    if (ENGINE === 'qdrant') {
      const filter = kind === 0 ? { must: [{ key: 'language', match: { value: 'ar' } }] } : kind === 1 ? { must: [{ key: 'doc_id', match: { any: docs } }] } : undefined;
      await qdrant('POST', `/collections/${INDEX}/points/query/groups`, { query: vec(), group_by: 'paragraph_id', group_size: 1, limit: 10, with_payload: false,
        params: { quantization: { rescore: true, oversampling: 4.0 } }, ...(filter && { filter }) });
    } else {
      const filter = kind === 0 ? 'language = ar' : kind === 1 ? `doc_id IN [${docs.join(',')}]` : undefined;
      await meili('POST', `/indexes/${INDEX}/search`, { vector: vec(), hybrid: { embedder: 'literal', semanticRatio: 1 }, limit: 10, ...(filter && { filter }) });
    }
    lat.push(performance.now() - t0);
  }
  let live = null;
  if (LIVE) { const t0 = performance.now(); await call(LIVE, LIVE_KEY, 'POST', '/indexes/paragraphs/search', { q: 'justice', limit: 10 }); live = Math.round(performance.now() - t0); }
  const disk = ENGINE === 'qdrant' ? diskGb() : +((await meili('GET', '/stats')).databaseSize / 1e9).toFixed(2);
  return { p50: Math.round(pct(lat, 0.5)), p99: Math.round(pct(lat, 0.99)), live_ms: live, disk_gb: disk, rss_mb: rssMb() };
}

const BULK = arg('bulk'), OFFSET = +arg('offset', 0);
// fast JSON for a ±c vector (JSON.stringify of 3072 numbers per point was the uploader's bottleneck)
const PC = String(C), NC = String(-C);
const vecJson = () => { let s = '['; for (let i = 0; i < DIMS; i++) s += (i ? ',' : '') + (Math.random() < 0.5 ? NC : PC); return s + ']'; };
const pointJson = (id) => `{"id":${id},"vector":${vecJson()},"payload":{"paragraph_id":${Math.floor(id / 8)},"doc_id":${Math.floor(id / 500)},"language":"${lang()}","religion":"Baha'i","entity_ids":[${id % 5000}]}}`;
if (ENGINE === 'qdrant' && BULK) {
  if (BULK === 'create') {
    await qdrant('DELETE', `/collections/${INDEX}`).catch(() => {});
    await qdrant('PUT', `/collections/${INDEX}`, { vectors: { size: DIMS, distance: 'Cosine', on_disk: true }, quantization_config: { binary: { always_ram: true } },
      optimizers_config: { indexing_threshold: 0 } });
    for (const [field_name, field_schema] of [['paragraph_id', 'integer'], ['doc_id', 'integer'], ['language', 'keyword'], ['entity_ids', 'integer']])
      await qdrant('PUT', `/collections/${INDEX}/index?wait=true`, { field_name, field_schema });
    console.log(JSON.stringify({ phase: 'create', ok: true }));
  } else if (BULK === 'upload') {
    const start = Date.now();
    for (let done = 0; done < N; done += 1000) {
      const ids = Array.from({ length: Math.min(1000, N - done) }, (_, k) => OFFSET + done + k);
      const r = await fetch(`${QD}/collections/${INDEX}/points?wait=true`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'api-key': QKEY }, body: `{"points":[${ids.map(pointJson).join(',')}]}` });
      if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`);
    }
    console.log(JSON.stringify({ phase: 'upload', offset: OFFSET, n: N, hours: +((Date.now() - start) / 3.6e6).toFixed(3) }));
  } else if (BULK === 'finalize') {
    const t0 = Date.now();
    await qdrant('PATCH', `/collections/${INDEX}`, { optimizers_config: { indexing_threshold: 20000 } });
    for (;;) { const c = (await qdrant('GET', `/collections/${INDEX}`)).result; if (c.status === 'green' && c.indexed_vectors_count >= c.points_count * 0.99) break; await new Promise((r) => setTimeout(r, 5000)); }
    console.log(JSON.stringify({ phase: 'build', n: N, build_hours: +((Date.now() - t0) / 3.6e6).toFixed(3), ...(await probe(N)) }));
  }
  process.exit(0);
}

if (ENGINE === 'qdrant') {
  await qdrant('DELETE', `/collections/${INDEX}`).catch(() => {});
  await qdrant('PUT', `/collections/${INDEX}`, { vectors: { size: DIMS, distance: 'Cosine', on_disk: true }, quantization_config: { binary: { always_ram: true } } });
  for (const [field_name, field_schema] of [['paragraph_id', 'integer'], ['doc_id', 'integer'], ['language', 'keyword'], ['entity_ids', 'integer']])
    await qdrant('PUT', `/collections/${INDEX}/index?wait=true`, { field_name, field_schema });
  const start = Date.now(), QB = Math.min(BATCH, 1000);   // Qdrant's default request cap is 32 MB
  for (let done = 0; done < N; done += QB) {
    const points = Array.from({ length: Math.min(QB, N - done) }, (_, k) => {
      const id = done + k;
      return { id, vector: vec(), payload: { paragraph_id: Math.floor(id / 8), doc_id: Math.floor(id / 500), language: lang(), religion: "Baha'i", entity_ids: [id % 5000] } };
    });
    await qdrant('PUT', `/collections/${INDEX}/points?wait=true`, { points });
    const n = done + points.length;
    if (n % EVERY === 0 || n === N) {
      for (;;) { const c = (await qdrant('GET', `/collections/${INDEX}`)).result; if (c.status === 'green') break; await new Promise((r) => setTimeout(r, 2000)); }   // graph built
      const hours = (Date.now() - start) / 3.6e6;
      console.log(JSON.stringify({ engine: 'qdrant', n, hours: +hours.toFixed(2), per_hour: Math.round(n / hours), ...(await probe(n)) }));
    }
  }
  if (process.argv.includes('--drop')) await qdrant('DELETE', `/collections/${INDEX}`);
  process.exit(0);
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
