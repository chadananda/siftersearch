#!/usr/bin/env node
/**
 * Search quality + performance battery.
 *
 * Runs each fixture in search-fixtures.json against the production search
 * (via /api/search/passages) and scores:
 *   - Did the expected doc appear in top-K? (precision@k binary)
 *   - At what rank? (lower is better; MRR aggregates)
 *   - Did the result text contain expected phrases? (recall on key terms)
 *   - Did anti-tests succeed? (e.g. primary author beats secondary)
 *   - Per-fixture latency (ms) + aggregate p50/p95
 *
 * Output: human-readable report + JSON (--json flag).
 *
 * Usage:
 *   node tests/quality/score-search.mjs            # full run, human report
 *   node tests/quality/score-search.mjs --json     # JSON only
 *   node tests/quality/score-search.mjs --top-k=5  # different K cutoff
 */

/* global AbortSignal */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const TOP_K = parseInt(args.find(a => a.startsWith('--top-k='))?.split('=')[1] || '10', 10);

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;
const FIXTURES = JSON.parse(readFileSync(join(__dirname, 'search-fixtures.json'), 'utf-8'));

if (!API_KEY) {
  console.error('PUBLIC_SIFTER_API_KEY not set in .env-public');
  process.exit(2);
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(15000)
    });
    body = await res.json();
  } catch (err) {
    return { id: fix.id, ok: false, error: err.message, latency_ms: Date.now() - t0 };
  }
  const latency_ms = Date.now() - t0;
  if (!res.ok) return { id: fix.id, ok: false, error: `HTTP ${res.status}`, latency_ms };

  const hits = body.results || body.hits || body.passages || [];
  let rank = -1;
  let textHit = false;
  let authorHit = true;
  let antiHit = true;

  // Find the rank of the expected doc (or expected author)
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const hDocId = h.document_id ?? h.doc_id;
    if (typeof fix.expected_doc_id === 'number' && hDocId === fix.expected_doc_id) {
      // Optional paragraph-range gate
      if (Array.isArray(fix.expected_passage_range)) {
        const [lo, hi] = fix.expected_passage_range;
        if (typeof h.paragraph_index !== 'number' ||
            h.paragraph_index < lo || h.paragraph_index > hi) continue;
      }
      rank = i + 1;
      // Text-contains check
      if (Array.isArray(fix.expected_text_contains)) {
        const t = normalize(h.text);
        textHit = fix.expected_text_contains.every(phrase => t.includes(normalize(phrase)));
      } else {
        textHit = true;
      }
      break;
    }
    if (fix.expected_author_contains) {
      const a = normalize(h.author);
      if (a.includes(normalize(fix.expected_author_contains))) {
        rank = i + 1;
        textHit = true; // not gated for author tests
        break;
      }
    }
  }

  // Anti-test: top hit must NOT be from a forbidden author
  if (fix.expected_author_not_contains && hits.length > 0) {
    const topAuthor = normalize(hits[0].author);
    if (topAuthor.includes(normalize(fix.expected_author_not_contains))) {
      antiHit = false;
    }
  }

  const found = rank > 0;
  const recipRank = found ? 1 / rank : 0;
  const ok = found && textHit && authorHit && antiHit;

  return {
    id: fix.id,
    ok,
    rank: found ? rank : null,
    recip_rank: recipRank,
    text_hit: textHit,
    anti_hit: antiHit,
    latency_ms,
    top_hit_doc_id: hits[0]?.document_id,
    top_hit_author: hits[0]?.author,
    top_hit_text: (hits[0]?.text || '').slice(0, 100),
    intent: fix.intent
  };
}

const results = [];
for (const fix of FIXTURES) {
  results.push(await runOne(fix));
}

// Aggregate
const passed = results.filter(r => r.ok).length;
const recipRanks = results.map(r => r.recip_rank);
const mrr = recipRanks.reduce((a, b) => a + b, 0) / recipRanks.length;
const latencies = results.map(r => r.latency_ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

const report = {
  total: results.length,
  passed,
  fail: results.length - passed,
  pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0,
  mrr: Math.round(mrr * 1000) / 1000,
  latency_p50_ms: p50,
  latency_p95_ms: p95,
  results
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

console.log('═'.repeat(72));
console.log(`Search Quality — ${passed}/${results.length} passed (${report.pass_rate}%)`);
console.log(`MRR: ${report.mrr.toFixed(3)} · latency p50: ${p50}ms · p95: ${p95}ms`);
console.log('═'.repeat(72));
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  const rankStr = r.rank ? `rank=${r.rank}` : 'NOT FOUND';
  const flags = [];
  if (!r.text_hit && r.rank) flags.push('text-mismatch');
  if (!r.anti_hit) flags.push('anti-test-failed');
  if (r.error) flags.push(`error=${r.error}`);
  const flagStr = flags.length ? ` [${flags.join(', ')}]` : '';
  console.log(`  ${icon} ${r.id.padEnd(36)} ${rankStr.padEnd(14)} ${r.latency_ms}ms${flagStr}`);
  if (!r.ok && r.top_hit_text) {
    console.log(`     top: ${r.top_hit_author} — "${r.top_hit_text}..."`);
  }
}
console.log('═'.repeat(72));

process.exit(passed === results.length ? 0 : 1);
