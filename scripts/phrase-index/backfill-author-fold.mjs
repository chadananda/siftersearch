#!/usr/bin/env node
// One-time: add `author_fold` (authorKey of `author`) to every point in `phrases` + `paragraphs_kw`, so the Qdrant author
// filter matches spelling variants the way Meili's CONTAINS does (search A/B 2026-10-04: "Abdu'l-Bahá" ≠ "‘Abdu’l-Bahá" as an
// exact keyword). One set_payload per DISTINCT author (facet), never per point; no re-embedding. Idempotent — re-run after a
// build that predates author_fold (the indexers write it from 2026-10-04). Runs ON tower; dry run by default.
//   node scripts/phrase-index/backfill-author-fold.mjs [--apply] [--collection phrases]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { authorKey } from '../../api/lib/search/qdrant-layers.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env-secrets'), quiet: true });
const QD = process.env.QDRANT_URL || 'http://127.0.0.1:6333', QK = process.env.QDRANT_KEY || '';
const APPLY = process.argv.includes('--apply');
const ONLY = process.argv[process.argv.indexOf('--collection') + 1];
const COLLS = process.argv.includes('--collection') ? [ONLY] : ['phrases', 'paragraphs_kw'];

async function qd(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(QD + path, { method, headers: { 'Content-Type': 'application/json', 'api-key': QK }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw Object.assign(new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 200)}`), { http: true });
      return (await r.json()).result;
    } catch (e) { if (e.http || attempt >= 4) throw e; await new Promise((res) => setTimeout(res, 2000 * (attempt + 1))); }
  }
}

for (const coll of COLLS) {
  const { hits } = await qd('POST', `/collections/${coll}/facet`, { key: 'author', limit: 1000000, exact: false });
  const todo = hits.map((h) => ({ author: h.value, fold: authorKey(h.value), n: h.count })).filter((a) => a.fold);
  const keys = new Set(todo.map((a) => a.fold));
  console.log(JSON.stringify({ coll, authors: hits.length, keys: keys.size, points: todo.reduce((s, a) => s + a.n, 0), apply: APPLY,
    sample: todo.slice(0, 5).map((a) => `${a.author} → ${a.fold}`) }));
  if (!APPLY) continue;
  await qd('PUT', `/collections/${coll}/index?wait=false`, { field_name: 'author_fold', field_schema: 'keyword' }).catch(() => {});
  for (let i = 0; i < todo.length; i += 100) {
    const ops = todo.slice(i, i + 100).map((a) => ({ set_payload: { payload: { author_fold: a.fold }, filter: { must: [{ key: 'author', match: { value: a.author } }] } } }));
    await qd('POST', `/collections/${coll}/points/batch?wait=true`, { operations: ops });   // wait: one batch at a time keeps Qdrant's queue short beside a live build
    if ((i / 100) % 50 === 0) console.log(JSON.stringify({ coll, sent: Math.min(i + 100, todo.length), of: todo.length }));
  }
  console.log(JSON.stringify({ coll, done: todo.length }));
}
process.exit(0);
