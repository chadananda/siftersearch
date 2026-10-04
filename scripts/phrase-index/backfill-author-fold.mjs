#!/usr/bin/env node
// One-time: add `author_fold` (authorKey of `author`) to every point in `phrases` + `paragraphs_kw`, so the Qdrant author
// filter matches spelling variants the way Meili's CONTAINS does (search A/B 2026-10-04: "Abdu'l-Bahá" ≠ "‘Abdu’l-Bahá" as an
// exact keyword). One set_payload per DISTINCT author (facet), never per point; no re-embedding. Idempotent — re-run after a
// build that predates author_fold (the indexers write it from 2026-10-04). Runs ON tower; dry run by default.
//   node scripts/phrase-index/backfill-author-fold.mjs [--apply] [--collection phrases]
import dotenv from 'dotenv';
import http from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { authorKey } from '../../api/lib/search/qdrant-layers.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env-secrets'), quiet: true });
const QD = process.env.QDRANT_URL || 'http://127.0.0.1:6333', QK = process.env.QDRANT_KEY || '';
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv[process.argv.indexOf('--collection') + 1];
const COLLS = process.argv.includes('--collection') ? [ONLY] : ['phrases', 'paragraphs_kw'];

// node:http, not fetch: a set_payload over hundreds of thousands of points outlives fetch's fixed 5-min headers timeout
// (first run died on its first batch, 2026-10-04).
function qd(method, path, body) {
  const u = new URL(QD + path), data = body ? JSON.stringify(body) : null;
  return new Promise((ok, fail) => {
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', 'api-key': QK, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', (c) => { out += c; });
      res.on('end', () => (res.statusCode >= 300 ? fail(new Error(`${path} → ${res.statusCode} ${out.slice(0, 200)}`)) : ok(JSON.parse(out).result)));
    });
    req.on('error', fail); if (data) req.write(data); req.end();
  });
}

for (const coll of COLLS) {
  const { hits } = await qd('POST', `/collections/${coll}/facet`, { key: 'author', limit: 1000000, exact: false });
  const todo = hits.map((h) => ({ author: h.value, fold: authorKey(h.value), n: h.count })).filter((a) => a.fold);
  const keys = new Set(todo.map((a) => a.fold));
  console.log(JSON.stringify({ coll, authors: hits.length, keys: keys.size, points: todo.reduce((s, a) => s + a.n, 0), apply: APPLY,
    sample: todo.slice(0, 5).map((a) => `${a.author} → ${a.fold}`) }));
  if (!APPLY) continue;
  await qd('PUT', `/collections/${coll}/index?wait=false`, { field_name: 'author_fold', field_schema: 'keyword' }).catch(() => {});
  // batches by POINT budget (≤50k points per request), not author count: one author can hold 500k points
  const batches = []; let cur = [], pts = 0;
  for (const a of todo) { if (cur.length && (pts + a.n > 50000 || cur.length >= 100)) { batches.push(cur); cur = []; pts = 0; } cur.push(a); pts += a.n; }
  if (cur.length) batches.push(cur);
  let sent = 0;
  for (const [b, batch] of batches.entries()) {
    const ops = batch.map((a) => ({ set_payload: { payload: { author_fold: a.fold }, filter: { must: [{ key: 'author', match: { value: a.author } }] } } }));
    await qd('POST', `/collections/${coll}/points/batch?wait=true`, { operations: ops });   // wait: one batch at a time keeps Qdrant's queue short beside a live build
    sent += batch.length;
    if (b % 50 === 0) console.log(JSON.stringify({ coll, batch: b + 1, of: batches.length, authors: sent }));
  }
  console.log(JSON.stringify({ coll, done: todo.length }));
}
process.exit(0);
