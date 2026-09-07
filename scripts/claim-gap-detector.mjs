#!/usr/bin/env node
// claim-gap-detector — find passages a book NARRATES but the archive never extracted.
//
// Why: the Karbilá episode that opens Balyuzi's "The Báb" is documented, published, high-authority —
// and produced no encounter claim, so "when did Mullá Ḥusayn first meet the Báb" falls back to the
// 1844 declaration. Chad, 2026-09-06: "if we missed a major episode of the Dawn Breakers, how would
// we be sure we capture every major episode in Balyuzi?" We would not. Nothing measured recall.
//
// This needs NO ground truth and NO human who has read the book: walk a document's paragraphs, mark
// which ones any entity drew a claim from, and report the unclaimed runs with their text. A long run
// of narrative prose that produced nothing is a candidate miss.
//
// ⚠ KNOWN LIMITS — read results with these in mind:
//   * Coverage % describes only the paragraphs that RESOLVED, not the whole book. The id range is
//     inferred from claim-bearing paragraphs, so a book's unclaimed tail may never be scanned. On
//     Balyuzi (865 paragraphs) the first good run resolved 417.
//   * A "run" is contiguous in SCANNED paragraphs, not in the book. Unscanned paragraphs inside a
//     run make its printed idx range wider than its paragraph count. The text is reliable; treat the
//     index range as approximate until every paragraph resolves.
//
// ⚠ APPROXIMATION, stated because it changes how results must be read: claims are reachable only
// per-entity, so coverage is computed over the top-N entities by importance. A paragraph marked
// "no claims" means no claim BY THOSE ENTITIES. Raising --entities lowers false positives. Measured
// on the Báb alone, Balyuzi looked like a 75-paragraph void; adding Mullá Ḥusayn filled much of it.
//
// Usage: node scripts/claim-gap-detector.mjs --doc 466 [--entities 200] [--min-run 4]
// Deps: none (global fetch). Read-only. Caches to tmp/gap-cache/.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SIFTER_URL || 'https://siftersearch.com';
const CACHE = 'tmp/gap-cache';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const DOC = Number(args.doc || 466);
const TOPN = Number(args.entities || 200);
const MINRUN = Number(args['min-run'] || 4);
const CONC = 6;

function apiKey() {
  try {
    const m = fs.readFileSync('.env-public', 'utf8').match(/^PUBLIC_SIFTER_API_KEY=(.*)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}
const KEY = apiKey();

fs.mkdirSync(CACHE, { recursive: true });
async function get(url, { key = false } = {}) {
  const file = path.join(CACHE, encodeURIComponent(url).slice(-180) + '.json');
  if (fs.existsSync(file)) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} }
  const r = await fetch(url, {
    headers: key ? { 'X-API-Key': KEY } : {},
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (j) fs.writeFileSync(file, JSON.stringify(j));
  return j;
}
async function pool(items, fn, n = CONC) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ── 1. the document ────────────────────────────────────────────────────────────
const doc = await get(`${BASE}/api/v1/library/documents/${DOC}`, { key: true });
if (!doc || doc.error) { console.error(`cannot read document ${DOC}:`, doc); process.exit(1); }
const total = doc.paragraphCount || doc.paragraph_count || 0;
console.log(`\n${doc.title}\n  ${doc.author} · ${total} paragraphs · doc ${DOC}`);

// ── 2. which entities to consider ──────────────────────────────────────────────
// The export is NDJSON of every entity with its importance — one request for all 45k.
const expUrl = `${BASE}/api/v1/entities/export`;
const expFile = path.join(CACHE, 'export.ndjson');
if (!fs.existsSync(expFile)) {
  const r = await fetch(expUrl, { signal: AbortSignal.timeout(120000) });
  fs.writeFileSync(expFile, await r.text());
}
const ents = fs.readFileSync(expFile, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, TOPN);
console.log(`  considering top ${ents.length} entities by importance`);

// ── 3. every paragraph id those entities drew a claim from ─────────────────────
const claimed = new Map();   // paraId -> [{entity, relation, statement}]
await pool(ents, async (e) => {
  const d = await get(`${BASE}/api/v1/entities/${e.id}`);
  for (const c of d?.claims || []) {
    const m = String(c.paraId || '').match(/\d+/);
    if (!m) continue;
    const id = Number(m[0]);
    if (!claimed.has(id)) claimed.set(id, []);
    claimed.get(id).push({ entity: e.name, relation: c.relation, statement: c.statement });
  }
});
console.log(`  ${claimed.size.toLocaleString()} distinct paragraphs carry a claim (corpus-wide)`);

// ── 4. walk this document's paragraphs ─────────────────────────────────────────
// Paragraph ids are NOT contiguous (index 164 = id 6715850, index 171 = id 6715859), so the id
// range is probed rather than assumed, and only ids that resolve to THIS document are kept.
const seedIds = [...claimed.keys()].sort((a, b) => a - b);
// Stratify across the WHOLE id range. A prefix sample finds nothing: this document's paragraphs are
// a narrow band inside 76k claim-bearing paragraphs corpus-wide.
const stride = Math.max(1, Math.floor(seedIds.length / 600));
const sample = seedIds.filter((_, i) => i % stride === 0);
if (args.seed) sample.unshift(Number(args.seed));
const probes = await pool(sample, (id) => get(`${BASE}/api/v1/paragraph/${id}`, { key: true }), 8);
let mine = probes.filter((p) => p && p.documentId === DOC).map((p) => p.id);
if (!mine.length && args.seed) mine = [Number(args.seed)];
if (!mine.length) { console.error('no claim paragraphs resolve to this document'); process.exit(1); }
// Use the DENSEST CLUSTER, not min/max. A single outlier id — a re-ingested or duplicated paragraph
// living far from its siblings — turns min..max into millions of iterations, which is what happened
// on the first run: the process sat at 6% cpu walking empty id space.
mine.sort((a, b) => a - b);
const med = mine[Math.floor(mine.length / 2)];
const near = mine.filter((id) => Math.abs(id - med) < total * 6);
const span = Math.min(Math.max(...near) - Math.min(...near) + 800, total * 8);
const lo = Math.min(...near) - 400, hi = lo + span;
console.log(`  scanning id range ${lo}..${hi} (${hi - lo + 1} ids for ${total} paragraphs)`);

const scanned = (await pool(Array.from({ length: hi - lo + 1 }, (_, k) => lo + k),
  (id) => get(`${BASE}/api/v1/paragraph/${id}`, { key: true }), 8))
  .filter((p) => p && p.documentId === DOC && p.text)
  .sort((a, b) => a.paragraphIndex - b.paragraphIndex);
console.log(`  resolved ${scanned.length} of ${total} paragraphs in this document\n`);

// ── 5. unclaimed runs ──────────────────────────────────────────────────────────
const runs = [];
let cur = null;
for (const p of scanned) {
  const has = claimed.has(p.id);
  if (has) { cur = null; continue; }
  if (!cur) { cur = { from: p.paragraphIndex, to: p.paragraphIndex, paras: [p] }; runs.push(cur); }
  else { cur.to = p.paragraphIndex; cur.paras.push(p); }
}
// Front matter and back matter are legitimately claimless; narrative runs are the signal. Words per
// paragraph separates a table of contents from a narrated scene without needing a model.
const scored = runs.filter((r) => r.paras.length >= MINRUN).map((r) => {
  const words = r.paras.reduce((s, p) => s + (p.text.split(/\s+/).length), 0);
  return { ...r, words, avg: Math.round(words / r.paras.length) };
}).sort((a, b) => b.words - a.words);

console.log(`UNCLAIMED RUNS of ${MINRUN}+ paragraphs — longest first\n`);
for (const r of scored.slice(0, 12)) {
  const contig = (r.to - r.from + 1) === r.paras.length ? '' : '  [range approximate — gaps unscanned]';
  console.log(`  idx ${r.from}-${r.to}  (${r.paras.length} paras, ${r.words} words, ~${r.avg}/para)${contig}`);
  console.log(`    "${r.paras[0].text.replace(/\s+/g, ' ').slice(0, 150)}…"`);
}
const claimedHere = scanned.filter((p) => claimed.has(p.id)).length;
console.log(`\ncoverage: ${claimedHere}/${scanned.length} SCANNED paragraphs carry a claim ` +
            `(${Math.round(100 * claimedHere / scanned.length)}%)`);
if (scanned.length < total)
  console.log(`⚠ only ${scanned.length} of ${total} paragraphs resolved — this is a PARTIAL view ` +
              `of the document; the percentage above is not book-wide coverage`);
console.log(`unclaimed runs >=${MINRUN}: ${scored.length}, totalling ` +
            `${scored.reduce((s, r) => s + r.paras.length, 0)} paragraphs\n`);
