// Concept-sense quality battery — measures the lexicon against the gold standard in
// concept-senses.fixtures.json (ground truth: Shoghi Effendi's own usage, which IS authoritative
// interpretation, so the senses are read off the source rather than invented).
//
//   node tests/quality/score-concepts.mjs            score every fixture
//   node tests/quality/score-concepts.mjs --json     machine-readable
//   node tests/quality/score-concepts.mjs --symbol="the clouds"
//
// TWO AXES, because a single "accuracy" number would hide the actual defect:
//
//   RECALL       — of the distinct senses a symbol genuinely carries, how many did we capture?
//                  This is the polysemy doctrine made measurable: a symbolic work means several
//                  things at once, so missing a sense is a real error even when what we stored is
//                  perfectly defensible.
//
//   DISTINCTNESS — of the entries we stored, how many are genuinely different senses rather than
//                  restatements or per-passage instantiations of one? Found 2026-08-25: "the Sun of
//                  Truth" held 7 entries that are one metaphor's phases (rising = revelation,
//                  eclipse = banishment, setting = ascension), and promote.js carries all 7 into
//                  concept_entities. High sense-count with low distinctness is WORSE than a low
//                  count: it inflates the graph and shows the reader near-duplicates.
//
// Deliberately deterministic. Sense-matching uses content-word overlap, which is a floor, not an
// understanding — it will under-credit a correct sense worded very differently. Every score is
// therefore reported WITH its method so nobody reads it as ground truth about meaning.
// Deps: .env-secrets (DEPLOY_SECRET), a reachable API.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env-secrets' });
dotenv.config({ path: '.env-public' });

const JSON_OUT = process.argv.includes('--json');
const ONLY = (process.argv.find((a) => a.startsWith('--symbol=')) || '').split('=').slice(1).join('=') || null;
const BASE = process.env.AUDIT_API_BASE || 'http://127.0.0.1:7839';
const KEY = process.env.DEPLOY_SECRET || process.env.INTERNAL_API_KEY;

const FIX = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/quality/concept-senses.fixtures.json'), 'utf8'));

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'and', 'or', 'is', 'are', 'that', 'which', 'as', 'by',
  'for', 'its', 'his', 'her', 'their', 'it', 'this', 'with', 'from', 'on', 'at', 'be', 'was', 'were', 'not',
  'but', 'they', 'them', 'has', 'have', 'had', 'who', 'whose', 'what', 'when', 'all', 'one', 'own', 'into']);

const words = (s) => new Set(String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z']+/).filter((w) => w.length > 2 && !STOP.has(w)));

// Jaccard-ish containment: how much of the SHORTER phrase is present in the longer one. Containment
// beats symmetric Jaccard here because a stored gloss is often a longer sentence wrapping the sense.
function overlap(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

const MATCH = 0.34;   // a third of the shorter phrase's content words shared

async function fetchLexicon(symbol) {
  const url = `${BASE}/api/admin/concepts/lexicon?symbol=${encodeURIComponent(symbol)}`;
  const r = await fetch(url, { headers: { 'X-Internal-Key': KEY || '' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const body = await r.json();
  return body.entries || body.lexicon || body.rows || [];
}

const results = [];
for (const f of FIX.fixtures) {
  if (ONLY && f.symbol !== ONLY) continue;
  let stored = [];
  let error = null;
  try { stored = await fetchLexicon(f.symbol); } catch (err) { error = err.message; }
  const glosses = stored.map((r) => r.interpretation || r.gloss || '').filter(Boolean);

  // RECALL — which expected senses does at least one stored entry express?
  const found = f.senses.map((s) => ({
    id: s.id,
    gloss: s.gloss,
    matched: glosses.find((g) => overlap(g, s.gloss) >= MATCH) || null,
  }));
  const recall = f.senses.length ? found.filter((x) => x.matched).length / f.senses.length : null;

  // DISTINCTNESS — greedily bucket stored glosses; a gloss landing in an existing bucket is a restatement.
  const buckets = [];
  const collapsed = [];
  for (const g of glosses) {
    const hit = buckets.find((b) => overlap(b[0], g) >= MATCH);
    if (hit) { hit.push(g); collapsed.push(g); } else buckets.push([g]);
  }
  const distinctness = glosses.length ? buckets.length / glosses.length : null;

  results.push({
    symbol: f.symbol,
    error,
    expectedSenses: f.senses.length,
    storedEntries: glosses.length,
    distinctBuckets: buckets.length,
    recall,
    distinctness,
    missing: found.filter((x) => !x.matched).map((x) => ({ id: x.id, gloss: x.gloss })),
    collapsedExamples: collapsed.slice(0, 3),
  });
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ranAt: new Date().toISOString(), method: 'content-word containment ≥0.34 (a floor, not semantic understanding)', results }, null, 2));
} else {
  const pct = (v) => (v == null ? ' n/a ' : `${(v * 100).toFixed(0)}%`.padStart(5));
  console.log('\nConcept sense quality — recall vs the gold standard, distinctness within what we stored\n');
  console.log('  symbol                    expect  stored  distinct   recall  distinctness');
  for (const r of results) {
    if (r.error) { console.log(`  ${r.symbol.padEnd(24)}  ERROR: ${r.error}`); continue; }
    console.log(`  ${r.symbol.padEnd(24)}  ${String(r.expectedSenses).padStart(6)}  ${String(r.storedEntries).padStart(6)}  ${String(r.distinctBuckets).padStart(8)}   ${pct(r.recall)}         ${pct(r.distinctness)}`);
  }
  console.log('');
  for (const r of results) {
    if (r.error || !r.missing.length) continue;
    console.log(`  ${r.symbol} — senses NOT captured:`);
    for (const m of r.missing) console.log(`     · ${m.gloss}`);
  }
  for (const r of results) {
    if (r.error || !r.collapsedExamples.length) continue;
    console.log(`  ${r.symbol} — stored entries that restate a sense already covered:`);
    for (const c of r.collapsedExamples) console.log(`     · ${c.slice(0, 92)}`);
  }
  console.log('\n  Method: content-word containment ≥0.34. A floor, not an understanding of meaning —');
  console.log('  it under-credits a correct sense worded very differently. Read it as a regression');
  console.log('  signal across runs, never as an absolute grade.\n');
}

const failed = results.filter((r) => r.error);
process.exit(failed.length ? 1 : 0);
