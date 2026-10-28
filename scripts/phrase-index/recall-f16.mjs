#!/usr/bin/env node
// Recall + latency of a new phrases collection against the old one (storage plan R12). Qdrant-only client (no DB).
// Queries: --n stored-point vectors (random ids of the OLD collection) + the type-battery fixture queries embedded with Gemini
// ("task: search result | query:"), searched with the production params (binary + rescore, oversampling 4, limit 40).
//   node scripts/phrase-index/recall-f16.mjs --old http://127.0.0.1:6333 --oldColl phrases --new http://127.0.0.1:6343 --newColl phrases [--n 200] [--filters]
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets', quiet: true });
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OLD = arg('old', 'http://127.0.0.1:6333'), OLDC = arg('oldColl', 'phrases'), NEW = arg('new', 'http://127.0.0.1:6343'), NEWC = arg('newColl', 'phrases'), N = +arg('n', 200);
const K = process.env.QDRANT_KEY || '';
const qd = async (base, path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': K }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 150)}`); return r.json(); };
const params = { quantization: { rescore: true, oversampling: 4 } };
const search = async (base, coll, vector, filter) => { const t = performance.now(); const r = await qd(base, `/collections/${coll}/points/query`, { query: vector, using: 'literal', limit: 40, with_payload: ['paragraph_id'], params, ...(filter ? { filter } : {}) }); return { ms: performance.now() - t, pts: r.result.points }; };
const embed = async (q) => (await (await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'models/gemini-embedding-2', content: { parts: [{ text: `task: search result | query: ${q}` }] }, outputDimensionality: 3072 }) })).json()).embedding.values;

const queries = [];
const maxId = (await qd(OLD, `/collections/${OLDC}/points/scroll`, { limit: 1, order_by: { key: 'paragraph_id', direction: 'desc' }, with_payload: ['paragraph_id'] })).result.points[0].payload.paragraph_id;
for (let i = 0; i < N; i++) {
  const off = Math.floor(Math.random() * maxId) * 1000;
  const r = (await qd(OLD, `/collections/${OLDC}/points/scroll`, { offset: off, limit: 1, with_vector: true, with_payload: false })).result.points[0];
  if (r) queries.push({ kind: 'point', vector: r.vector.literal ?? r.vector });
}
try {
  const fx = JSON.parse(readFileSync('tests/quality/search-type-fixtures.json', 'utf8')).fixtures.filter((f) => f.query).slice(0, 90);
  for (const f of fx) queries.push({ kind: 'query', q: f.query, vector: await embed(f.query) });
} catch (e) { console.error('fixture queries skipped:', e.message); }

const stat = { point: { n: 0, o10: 0, p10: 0, p40: 0, top1: 0, a: [], b: [] }, query: { n: 0, o10: 0, p10: 0, p40: 0, top1: 0, a: [], b: [] } };
for (const [i, q] of queries.entries()) {
  const first = i % 2 ? [NEW, NEWC, OLD, OLDC] : [OLD, OLDC, NEW, NEWC];   // alternate order: page cache fairness
  const x = await search(first[0], first[1], q.vector), y = await search(first[2], first[3], q.vector);
  const [a, b] = i % 2 ? [y, x] : [x, y], s = stat[q.kind];
  const ids = (r, k) => new Set(r.pts.slice(0, k).map((p) => p.id)), pars = (r, k) => new Set(r.pts.slice(0, k).map((p) => p.payload.paragraph_id));
  const ov = (A, B) => [...A].filter((v) => B.has(v)).length / Math.max(1, A.size);
  s.n++; s.o10 += ov(ids(a, 10), ids(b, 10)); s.p10 += ov(pars(a, 10), pars(b, 10)); s.p40 += ov(pars(a, 40), pars(b, 40)); s.top1 += a.pts[0]?.id === b.pts[0]?.id ? 1 : 0; s.a.push(a.ms); s.b.push(b.ms);
}
const pct = (xs, p) => { const s = [...xs].sort((u, v) => u - v); return +(s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0).toFixed(1); };
const out = Object.fromEntries(Object.entries(stat).map(([k, s]) => [k, { n: s.n, top10_point_overlap: +(s.o10 / s.n).toFixed(4), top10_paragraph_overlap: +(s.p10 / s.n).toFixed(4), top40_paragraph_overlap: +(s.p40 / s.n).toFixed(4), top1_same: +(s.top1 / s.n).toFixed(3),
  old_ms: { p50: pct(s.a, 0.5), p95: pct(s.a, 0.95) }, new_ms: { p50: pct(s.b, 0.5), p95: pct(s.b, 0.95) } }]));
console.log(JSON.stringify(out, null, 1));
