#!/usr/bin/env node
// Qdrant layer latency vs accuracy (planning/search-ab-20261009.md, blocker #1). For each query × filter × parameter
// variant: latency (ms, after one warm-up) and overlap@10 with the REFERENCE variant (rescore on, oversampling 4 — today's
// production), so a faster setting cannot silently cost accuracy. Uses the layer module's own functions (qdrant-layers.js)
// with a `params` override — no query code copied. Runs ON tower (Qdrant on localhost); the query vector is memoized.
//   node scripts/search/qdrant-profile.mjs [--queries "a|b|c"] [--runs 3]
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const { searchPhrases, searchHypeQdrant, searchKeywordQdrant, geminiQueryVector } = await import('../../api/lib/search/qdrant-layers.js');

const opt = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const QUERIES = opt('--queries', 'Satya|Kauravas|Frashokereti|The earth is but one country|rectification of names|love your enemies|'
  + 'the world is in travail|equality of men and women|the station of the Manifestation|Conference of Badasht').split('|');
const RUNS = Number(opt('--runs', 3));
const FILTERS = { none: {}, bahai: { religion: "Baha'i" } };
const VARIANTS = {
  'ref rescore os4': { rescore: true, oversampling: 4, hnsw_ef: null },
  'rescore os2': { rescore: true, oversampling: 2, hnsw_ef: null },
  'rescore os1': { rescore: true, oversampling: 1, hnsw_ef: null },
  'no-rescore': { rescore: false, oversampling: 1, hnsw_ef: null },
  'rescore os2 ef64': { rescore: true, oversampling: 2, hnsw_ef: 64 },
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const timeIt = async (fn) => { const t = performance.now(); const r = await fn(); return { ms: performance.now() - t, ids: (r.hits || []).map((h) => h.paragraph_id) }; };
const overlap = (a, b) => (b.length ? a.slice(0, 10).filter((x) => b.slice(0, 10).includes(x)).length / Math.min(10, b.length) : 1);

const rows = [];
for (const q of QUERIES) {
  await geminiQueryVector(q);   // embed once; the layers share the memoized vector — we time Qdrant, not Gemini
  for (const [fname, filters] of Object.entries(FILTERS)) {
    const kw = []; for (let i = 0; i <= RUNS; i++) kw.push(await timeIt(() => searchKeywordQdrant(q, { limit: 30, filters, timeoutMs: 20000 })));
    rows.push({ q, filter: fname, layer: 'keyword', variant: 'bm25', ms: median(kw.slice(1).map((x) => x.ms)), overlap: 1 });
    for (const [layer, fn] of [['phrase', searchPhrases], ['hype', searchHypeQdrant]]) {
      let ref = null;
      for (const [vname, params] of Object.entries(VARIANTS)) {
        const runs = []; for (let i = 0; i <= RUNS; i++) runs.push(await timeIt(() => fn(q, { limit: 30, filters, timeoutMs: 20000, params })));
        if (!ref) ref = runs[1].ids;
        rows.push({ q, filter: fname, layer, variant: vname, ms: median(runs.slice(1).map((x) => x.ms)), overlap: overlap(runs[1].ids, ref) });
      }
    }
  }
}
// summary: per layer × filter × variant — median latency across queries, mean overlap@10 with the reference
const key = (r) => `${r.layer} | ${r.filter} | ${r.variant}`;
const groups = new Map();
for (const r of rows) (groups.get(key(r)) || groups.set(key(r), []).get(key(r))).push(r);
console.log('layer | filter | variant  →  median ms (p90 ms) · overlap@10 vs ref');
for (const [k, rs] of groups) {
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`${k.padEnd(40)} ${String(Math.round(median(ms))).padStart(6)} (${Math.round(ms[Math.floor(ms.length * 0.9)] ?? ms.at(-1))}) · ${(rs.reduce((a, r) => a + r.overlap, 0) / rs.length).toFixed(2)}`);
}
process.exit(0);
