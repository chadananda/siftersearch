#!/usr/bin/env node
/**
 * Biography meaning-search quality battery.
 *
 * Scores /api/v1/people/search (bioSearch) on the three axes the review cares about:
 *   1. ACCURACY  — expected people appear; no member whose own evidence NEGATES the query.
 *   2. EXPLANATION — a non-empty, coherent lead + per-person clause.
 *   3. LINKS     — every evidence point carries a source-paragraph URL (require_all_linked fixtures).
 *
 * Usage:
 *   node tests/quality/score-bio-search.mjs                 # human report
 *   node tests/quality/score-bio-search.mjs --json          # JSON only
 *   node tests/quality/score-bio-search.mjs --write-report  # write bio-search-results-latest.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const WRITE_REPORT = args.includes('--write-report');
const API_BASE = process.env.API_URL || process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const UA = 'Mozilla/5.0 (SifterSearch bio-search quality battery)';

// a member is a false positive if its own clause/quote negates the very thing the query asked about
const NEG = /\bno mention\b|\bnot (?:mention|meet|met|present|clear|established|recorded)\b|\bunclear\b|\bno (?:evidence|record|clear)\b|\bnone\b|\bdid not\b|\bcannot\b/i;
const fold = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FIXTURES = JSON.parse(readFileSync(join(__dirname, 'bio-search-fixtures.json'), 'utf-8'));

async function runOne(fix) {
  const t0 = Date.now();
  let d;
  try {
    const res = await fetch(`${API_BASE}/api/v1/people/search?q=${encodeURIComponent(fix.query)}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    d = await res.json();
  } catch (e) { return { ...fix, ok: false, ms: Date.now() - t0, fails: [`request: ${e.message}`] }; }
  const ms = Date.now() - t0;
  const ids = d.ids || [];
  const ev = d.reasoning?.evidence || {};
  const evVals = Object.values(ev);
  const summary = d.reasoning?.summary || '';
  const linked = evVals.filter((v) => v.url).length;
  const negMembers = Object.entries(ev).filter(([, v]) => NEG.test(v.clause || v.quote || '')).map(([id]) => id);

  const fails = [];
  // coverage
  if (ids.length < (fix.min_results || 1)) fails.push(`coverage: ${ids.length} < ${fix.min_results || 1}`);
  // accuracy — every expected name must appear in the explanation
  const missing = (fix.expect_names || []).filter((n) => !fold(summary).includes(fold(n)));
  if (missing.length) fails.push(`missing: ${missing.join(', ')}`);
  // accuracy — no self-negating member
  if (negMembers.length) fails.push(`neg-clause: ${negMembers.length} member(s) cited with negating evidence`);
  // explanation present (group answers legitimately have empty evidence)
  if (!d.group && !summary.trim()) fails.push('explanation: empty');
  // links — every point linked (skip group-only answers, which have no per-point evidence)
  if (fix.require_all_linked && evVals.length && linked < evVals.length) fails.push(`unlinked: ${evVals.length - linked}/${evVals.length} points without a source link`);

  return { ...fix, ok: !fails.length, ms, results: ids.length, linked, evTotal: evVals.length, group: d.group || null, fails, summary };
}

const results = [];
for (const fix of FIXTURES) results.push(await runOne(fix));

if (JSON_ONLY) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

const pass = results.filter((r) => r.ok).length;
const linkPts = results.reduce((a, r) => a + (r.evTotal || 0), 0);
const linkOk = results.reduce((a, r) => a + (r.linked || 0), 0);
for (const r of results) {
  console.log(`\n${r.ok ? '✅' : '⚠️ '} [${r.category}] ${r.query}`);
  if (r.fails.some((f) => f.startsWith('request:'))) { console.log(`   ${r.fails[0]}`); continue; }
  console.log(`   results=${r.results} linked=${r.linked}/${r.evTotal}${r.group ? ` group=${r.group}` : ''} ${r.ms}ms`);
  for (const f of r.fails) console.log(`   ⚠️  ${f}`);
  console.log(`   → ${(r.summary || '').replace(/\s+/g, ' ').slice(0, 240)}`);
}
console.log(`\n────── ${pass}/${results.length} clean · link coverage ${linkOk}/${linkPts} points (${linkPts ? Math.round((linkOk / linkPts) * 100) : 0}%) ──────`);

if (WRITE_REPORT) {
  const out = { at: new Date().toISOString(), api: API_BASE, pass, total: results.length, linkCoverage: { linked: linkOk, points: linkPts }, results };
  writeFileSync(join(__dirname, 'bio-search-results-latest.json'), JSON.stringify(out, null, 2));
  console.log('→ wrote bio-search-results-latest.json');
}
process.exit(pass === results.length ? 0 : 1);
