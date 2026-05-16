#!/usr/bin/env node
/**
 * Library API quality battery — find_document_for_citation.
 *
 * Verifies that each canonical work resolves to its expected doc_id,
 * preserving the canonical-works hard-resolve table that backs Jafar's
 * citation discipline. Regressions here would mean dialogs cite the
 * wrong document (e.g. "Tablet of Ahmad" → "Tablet to Alí Páshá", which
 * we hit before adding 1616 to CANONICAL_WORKS).
 *
 * Usage:
 *   node tests/quality/score-library.mjs
 *   node tests/quality/score-library.mjs --json
 */

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

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;
const FIXTURES = JSON.parse(readFileSync(join(__dirname, 'library-fixtures.json'), 'utf-8'));

if (!API_KEY) {
  console.error('PUBLIC_SIFTER_API_KEY not set in .env-public');
  process.exit(2);
}

async function runOne(fix) {
  const t0 = Date.now();
  const url = new URL(`${API_BASE}/api/v1/library/find-document`);
  url.searchParams.set('title', fix.args.title);
  if (fix.args.religion) url.searchParams.set('religion', fix.args.religion);

  let res, body;
  try {
    res = await fetch(url, {
      headers: { 'X-API-Key': API_KEY },
      signal: AbortSignal.timeout(15000)
    });
    body = await res.json();
  } catch (err) {
    return { id: fix.id, ok: false, error: err.message, latency_ms: Date.now() - t0 };
  }
  const latency_ms = Date.now() - t0;
  if (!res.ok) return { id: fix.id, ok: false, error: `HTTP ${res.status}`, latency_ms };

  const candidates = body.candidates || [];
  const top = candidates[0];
  if (!top) return { id: fix.id, ok: false, error: 'no candidates', latency_ms };

  const docMatch = top.document_id === fix.expected_top_doc_id;
  let rangeMatch = true;
  if (Array.isArray(fix.expected_paragraph_range)) {
    const [lo, hi] = fix.expected_paragraph_range;
    rangeMatch = top.start_paragraph === lo && top.end_paragraph === hi;
  }
  const primaryMatch = fix.expected_is_primary == null
    ? true
    : Boolean(top.is_primary) === Boolean(fix.expected_is_primary);

  return {
    id: fix.id,
    ok: docMatch && rangeMatch && primaryMatch,
    expected_doc_id: fix.expected_top_doc_id,
    actual_doc_id: top.document_id,
    actual_title: top.title,
    actual_author: top.author,
    is_primary: top.is_primary,
    range_match: rangeMatch,
    latency_ms
  };
}

const results = [];
for (const fix of FIXTURES) {
  results.push(await runOne(fix));
}

const passed = results.filter(r => r.ok).length;
const latencies = results.map(r => r.latency_ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

const report = {
  total: results.length,
  passed,
  fail: results.length - passed,
  pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0,
  latency_p50_ms: p50,
  latency_p95_ms: p95,
  results
};

if (JSON_ONLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(passed === results.length ? 0 : 1);
}

console.log('═'.repeat(72));
console.log(`Library Quality — ${passed}/${results.length} passed (${report.pass_rate}%)`);
console.log(`Latency p50: ${p50}ms · p95: ${p95}ms`);
console.log('═'.repeat(72));
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  const detail = r.ok
    ? `→ doc ${r.actual_doc_id}`
    : `expected ${r.expected_doc_id} got ${r.actual_doc_id || '∅'} ${r.actual_title || r.error || ''}`;
  console.log(`  ${icon} ${r.id.padEnd(28)} ${detail.padEnd(50)} ${r.latency_ms}ms`);
}
console.log('═'.repeat(72));

process.exit(passed === results.length ? 0 : 1);
