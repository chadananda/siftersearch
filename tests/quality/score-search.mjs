#!/usr/bin/env node
/**
 * Search quality + performance battery.
 *
 * Adapted from ocean-search-testing (github.com/dnotes/ocean-search-testing).
 * Scoring model:
 *   - Did the expected doc appear in top-K? (precision@K binary)
 *   - At what rank? (MRR)
 *   - Did the result text contain expected phrases?
 *   - Did anti-tests succeed? (primary author beats secondary)
 *   - Was the authority tier high enough? (min_authority gate)
 *   - Per-fixture latency + aggregate p50/p95
 *
 * Usage:
 *   node tests/quality/score-search.mjs              # full run, human report
 *   node tests/quality/score-search.mjs --json       # JSON only
 *   node tests/quality/score-search.mjs --write-report  # write results-latest.json
 *   node tests/quality/score-search.mjs --top-k=5    # different K cutoff
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const WRITE_REPORT = args.includes('--write-report');
const TOP_K = parseInt(args.find(a => a.startsWith('--top-k='))?.split('=')[1] || '10', 10);
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || null;

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;

const rawFixtures = JSON.parse(readFileSync(join(__dirname, 'search-fixtures.json'), 'utf-8'));
const FIXTURES = CATEGORY ? rawFixtures.filter(f => f.category === CATEGORY) : rawFixtures;

if (!API_KEY) {
  console.error('PUBLIC_SIFTER_API_KEY not set in .env-public');
  process.exit(2);
}

function normalize(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // British/American spelling variants
    .replace(/neighbour/g, 'neighbor')
    .replace(/colour/g, 'color');
}

async function runOne(fix) {
  const t0 = Date.now();
  const filters = {};
  if (fix.religion_filter) filters.religion = fix.religion_filter;
  const reqBody = { query: fix.query, limit: TOP_K, filters };

  let res, body;
  try {
    res = await fetch(`${API_BASE}/api/v1/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(25000)
    });
    body = await res.json();
  } catch (err) {
    return { id: fix.id, category: fix.category || 'uncategorized', ok: false, error: err.message, latency_ms: Date.now() - t0, intent: fix.intent };
  }
  const latency_ms = Date.now() - t0;
  if (!res.ok) return { id: fix.id, category: fix.category || 'uncategorized', ok: false, error: `HTTP ${res.status}`, latency_ms, intent: fix.intent };

  const hits = body.results || body.hits || body.passages || [];
  let rank = -1;
  let textHit = false;
  let authorHit = true;
  let antiHit = true;
  let authorityHit = true;

  // Find first result matching expected doc or author
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const hDocId = h.documentId ?? h.document_id ?? h.doc_id;
    const hAuthor = normalize(h.author || '');

    let docMatch = false;
    if (typeof fix.expected_doc_id === 'number') {
      if (hDocId === fix.expected_doc_id) {
        if (Array.isArray(fix.expected_passage_range)) {
          const [lo, hi] = fix.expected_passage_range;
          const pIdx = h.paragraphIndex ?? h.paragraph_index;
          if (typeof pIdx === 'number' && pIdx >= lo && pIdx <= hi) {
            docMatch = true;
          }
        } else {
          docMatch = true;
        }
      }
    } else if (fix.expected_author_contains) {
      if (hAuthor.includes(normalize(fix.expected_author_contains))) {
        docMatch = true;
      }
    } else {
      // No doc/author gate — any hit qualifies; check authority and text below
      docMatch = true;
    }

    if (docMatch) {
      rank = i + 1;
      // Text contains check
      if (Array.isArray(fix.expected_text_contains)) {
        const t = normalize(h.text || '');
        textHit = fix.expected_text_contains.every(phrase => t.includes(normalize(phrase)));
      } else {
        textHit = true;
      }
      // Authority tier check
      if (typeof fix.min_authority === 'number') {
        const auth = h.authority ?? h.authorityTier ?? h.tier ?? 0;
        authorityHit = auth >= fix.min_authority;
      }
      break;
    }
  }

  // Anti-test: top hit must NOT be from a forbidden author
  if (fix.expected_author_not_contains && hits.length > 0) {
    const topAuthor = normalize(hits[0].author || '');
    if (topAuthor.includes(normalize(fix.expected_author_not_contains))) antiHit = false;
  }

  const found = rank > 0;
  const recipRank = found ? 1 / rank : 0;
  const ok = found && textHit && authorHit && antiHit && authorityHit;

  return {
    id: fix.id,
    category: fix.category || 'uncategorized',
    ok,
    rank: found ? rank : null,
    recip_rank: recipRank,
    text_hit: textHit,
    anti_hit: antiHit,
    authority_hit: authorityHit,
    latency_ms,
    top_hit_doc_id: hits[0]?.documentId ?? hits[0]?.document_id ?? hits[0]?.doc_id,
    top_hit_author: hits[0]?.author,
    top_hit_title: hits[0]?.title,
    top_hit_authority: hits[0]?.authority ?? hits[0]?.authorityTier ?? hits[0]?.tier,
    top_hit_text: (hits[0]?.text || '').slice(0, 120),
    query: fix.query,
    intent: fix.intent,
    religion_filter: fix.religion_filter
  };
}

const results = [];
for (const fix of FIXTURES) {
  if (!JSON_ONLY) process.stdout.write(`  … ${fix.id.padEnd(44)} `);
  const r = await runOne(fix);
  results.push(r);
  if (!JSON_ONLY) {
    const icon = r.ok ? '✓' : '✗';
    const flags = [];
    if (!r.text_hit && r.rank) flags.push('text');
    if (!r.anti_hit) flags.push('anti');
    if (!r.authority_hit) flags.push('auth');
    if (r.error) flags.push(`err`);
    const flagStr = flags.length ? ` [${flags.join(',')}]` : '';
    console.log(`${icon} rank=${r.rank ?? 'NF'} ${r.latency_ms}ms${flagStr}`);
  }
}

// Aggregate totals
const passed = results.filter(r => r.ok).length;
const recipRanks = results.map(r => r.recip_rank).filter(v => typeof v === 'number' && !isNaN(v));
const mrr = recipRanks.length > 0 ? recipRanks.reduce((a, b) => a + b, 0) / results.length : 0;
const latencies = results.map(r => r.latency_ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

// Per-category aggregation
const categoryMap = {};
for (const r of results) {
  const c = r.category;
  if (!categoryMap[c]) categoryMap[c] = { passed: 0, total: 0 };
  categoryMap[c].total++;
  if (r.ok) categoryMap[c].passed++;
}
const categories = Object.fromEntries(
  Object.entries(categoryMap).map(([k, v]) => [k, { ...v, pass_rate: Math.round(v.passed / v.total * 100) }])
);

const report = {
  run_at: new Date().toISOString(),
  total: results.length,
  passed,
  fail: results.length - passed,
  pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0,
  mrr: Math.round(mrr * 1000) / 1000,
  latency_p50_ms: p50,
  latency_p95_ms: p95,
  top_k: TOP_K,
  api_base: API_BASE,
  categories,
  results
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n' + '═'.repeat(72));
  console.log(`Search Quality — ${passed}/${results.length} passed (${report.pass_rate}%)`);
  console.log(`MRR: ${report.mrr.toFixed(3)} · latency p50: ${p50}ms · p95: ${p95}ms`);
  console.log('─'.repeat(72));
  for (const [cat, stats] of Object.entries(categories)) {
    console.log(`  ${cat.padEnd(20)} ${stats.passed}/${stats.total} (${stats.pass_rate}%)`);
  }
  console.log('═'.repeat(72));
  for (const r of results.filter(r => !r.ok)) {
    const flags = [];
    if (!r.text_hit && r.rank) flags.push('text-mismatch');
    if (!r.anti_hit) flags.push('anti-test-failed');
    if (!r.authority_hit) flags.push('authority-too-low');
    if (r.error) flags.push(`error=${r.error}`);
    console.log(`  ✗ ${r.id.padEnd(38)} rank=${String(r.rank ?? 'NF').padEnd(4)} [${flags.join(', ')}]`);
    if (r.top_hit_text) console.log(`     top: ${r.top_hit_author} (auth:${r.top_hit_authority}) — "${r.top_hit_text}"`);
  }
  if (results.filter(r => !r.ok).length === 0) console.log('  All tests passed!');
  console.log('═'.repeat(72));
}

if (WRITE_REPORT) {
  const outPath = join(__dirname, 'results-latest.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (!JSON_ONLY) console.log(`\nReport written to tests/quality/results-latest.json`);
}

process.exit(passed === results.length ? 0 : 1);
