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
const ANALYZE = args.includes('--analyze'); // generate AI analysis after writing report
const TOP_K = parseInt(args.find(a => a.startsWith('--top-k='))?.split('=')[1] || '10', 10);
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1] || null;
const OCEAN = args.includes('--ocean'); // run ocean-fixtures.json instead of search-fixtures.json
const ALL = args.includes('--all');     // run both fixture sets combined

const API_BASE = process.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const API_KEY = process.env.PUBLIC_SIFTER_API_KEY;

const coreFixtures = JSON.parse(readFileSync(join(__dirname, 'search-fixtures.json'), 'utf-8'));
let oceanFixtures = [];
try { oceanFixtures = JSON.parse(readFileSync(join(__dirname, 'ocean-fixtures.json'), 'utf-8')); } catch {}
const rawFixtures = ALL ? [...coreFixtures, ...oceanFixtures] : OCEAN ? oceanFixtures : coreFixtures;
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
  const outName = ALL ? 'all-results-latest.json' : OCEAN ? 'ocean-results-latest.json' : 'results-latest.json';
  const outPath = join(__dirname, outName);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (!JSON_ONLY) console.log(`\nReport written to tests/quality/${outName}`);

  // Append summary to history file (no per-result data — just headline metrics)
  const histName = ALL ? 'all-history.json' : OCEAN ? 'ocean-history.json' : 'history.json';
  const histPath = join(__dirname, histName);
  let history = [];
  try { history = JSON.parse(readFileSync(histPath, 'utf8')); } catch {}
  const snapshot = { run_at: report.run_at, total: report.total, passed: report.passed, pass_rate: report.pass_rate, mrr: report.mrr, latency_p50_ms: report.latency_p50_ms, latency_p95_ms: report.latency_p95_ms, categories: Object.fromEntries(Object.entries(report.categories).map(([k,v]) => [k, {passed: v.passed, total: v.total, pass_rate: v.pass_rate}])) };
  history.push(snapshot);
  writeFileSync(histPath, JSON.stringify(history, null, 2));
  if (!JSON_ONLY) console.log(`History appended to tests/quality/${histName}`);
}

if (ANALYZE && WRITE_REPORT) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const suiteName = ALL ? 'Combined (Core + Ocean)' : OCEAN ? 'Ocean (491 fixtures)' : 'Core (52 fixtures)';
  const analysisName = ALL ? 'all-analysis.json' : OCEAN ? 'ocean-analysis.json' : 'analysis.json';
  const histName = ALL ? 'all-history.json' : OCEAN ? 'ocean-history.json' : 'history.json';
  const changesPath = join(__dirname, 'changes.json');

  let prevAnalysis = null;
  try { prevAnalysis = JSON.parse(readFileSync(join(__dirname, analysisName), 'utf8')); } catch {}
  const analysisHistoryName = ALL ? 'all-analysis-history.json' : OCEAN ? 'ocean-analysis-history.json' : 'analysis-history.json';
  let analysisHistory = [];
  try { analysisHistory = JSON.parse(readFileSync(join(__dirname, analysisHistoryName), 'utf8')); } catch {}
  let histArr = [];
  try { histArr = JSON.parse(readFileSync(join(__dirname, histName), 'utf8')); } catch {}
  let changes = [];
  try { changes = JSON.parse(readFileSync(changesPath, 'utf8')); } catch {}

  // Top failing tests (by category, up to 20)
  const failingSample = results.filter(r => !r.ok).slice(0, 30).map(r => ({
    id: r.id, query: r.query, category: r.category,
    rank: r.rank, text_hit: r.text_hit, anti_hit: r.anti_hit, authority_hit: r.authority_hit,
    top_hit_author: r.top_hit_author, top_hit_title: r.top_hit_title, error: r.error || null
  }));

  const trendSummary = histArr.length > 1
    ? `Pass rate trend: ${histArr.map(h => `${h.pass_rate}%`).join(' → ')} (${histArr.length} runs)`
    : 'First run — no trend data yet.';

  const changeSummary = changes.length > 0
    ? changes.slice(-10).map(c => `- ${c.date}: ${c.description} → ${c.result}`).join('\n')
    : 'No change log entries yet.';

  // Last 5 prior analyses (oldest first), summarized for context
  const priorAnalysesSummary = analysisHistory.slice(-5).map((a, i) => {
    const actions = a.action_plan?.map(p => `    #${p.priority} ${p.title}`).join('\n') || '    (none)';
    return `Run ${i + 1} (${a.generated_at?.slice(0,10)}, pass_rate=${a.pass_rate}%):\n  Summary: ${a.summary}\n  Actions suggested:\n${actions}`;
  }).join('\n\n') || 'No prior analyses.';

  const prompt = `You are a search-quality engineer with full context on SifterSearch's improvement history. Your job is to analyze current test results, consider what has already been tried, and produce a specific, actionable improvement plan.

SifterSearch is a multi-tradition religious library search engine built on Meilisearch + pgvector-style hybrid search (BM25 keyword + 512-dim semantic vectors), with authority-weighted reranking.

## Architecture context
- Search stack: Meilisearch (BM25 keyword) + text-embedding-3-large @ 512 dims (semantic)
- Reranking: authority field (0–10) on paragraphs; applied post-retrieval in api/lib/authority.js
- Pipeline: api/lib/search.js hybridSearch → api/lib/jafar-pipeline.js (intent → research → craft)
- Scoring model: source authority (primary=3,secondary=2,general=1,supplemental=0) × match quality (exact=5, all_words=3, some_words=2, no_words=0)
- Test suite: ${suiteName}

## Current results
Pass rate: ${report.pass_rate}% (${report.passed}/${report.total})
MRR: ${report.mrr}
Latency p50: ${report.latency_p50_ms}ms · p95: ${report.latency_p95_ms}ms

Category breakdown:
${Object.entries(report.categories).map(([k, v]) => `  ${k}: ${v.pass_rate}% (${v.passed}/${v.total})`).join('\n')}

Failure breakdown:
${(() => {
  let notFound=0, textMiss=0, antiTest=0, authority=0, timeout=0;
  for (const r of results.filter(r => !r.ok)) {
    if (r.error) { timeout++; continue; }
    if (r.rank === null) notFound++;
    else if (!r.text_hit) textMiss++;
    if (!r.anti_hit) antiTest++;
    if (!r.authority_hit) authority++;
  }
  return `  Not found in top 10: ${notFound}\n  Text mismatch: ${textMiss}\n  Anti-test failed: ${antiTest}\n  Authority too low: ${authority}\n  API timeout: ${timeout}`;
})()}

## Trend
${trendSummary}

## Failing tests sample (up to 30)
${JSON.stringify(failingSample, null, 2)}

## Change log (what has been tried)
${changeSummary}

## Previous analyses (oldest → newest)
${priorAnalysesSummary}

## Most recent analysis (full)
${prevAnalysis ? `Generated: ${prevAnalysis.generated_at}\nPass rate at time: ${prevAnalysis.pass_rate}%\nSummary: ${prevAnalysis.summary}\nGaps identified: ${prevAnalysis.critical_gaps?.map(g => g.title).join(', ') || 'none'}\nAction plan:\n${prevAnalysis.action_plan?.map(a => `  #${a.priority} [${a.impact} impact/${a.effort} effort] ${a.title}: ${a.description}`).join('\n') || 'none'}\nNotes on previous: ${prevAnalysis.notes_on_previous || 'none'}` : 'No previous analysis.'}

## Your task
Analyze these results and produce a JSON object with this exact structure:
{
  "summary": "2-3 sentence executive summary of current state — strengths and biggest gap",
  "strengths": [
    { "title": "short title", "detail": "1-2 sentences with evidence from results" }
  ],
  "critical_gaps": [
    { "title": "short title", "detail": "what is failing and why", "evidence": "specific failing test IDs or patterns" }
  ],
  "action_plan": [
    {
      "priority": 1,
      "title": "concise action title",
      "impact": "high|medium|low",
      "effort": "high|medium|low",
      "description": "what to do and why — 2-3 sentences",
      "implementation": "specific technical steps — file paths, function names, config changes",
      "success_metric": "what test improvement to expect"
    }
  ],
  "notes_on_previous": "assessment of what the previous approach achieved, any dead ends to avoid"
}

Return ONLY the JSON object, no prose, no markdown fences.`;

  if (!JSON_ONLY) console.log('\nGenerating AI analysis with claude-opus-4-7...');
  const msg = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  let analysis;
  try {
    const raw = msg.content[0].text.trim();
    const jsonStr = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));
    analysis = JSON.parse(jsonStr);
  } catch (e) {
    analysis = { summary: 'Parse error — see raw.', raw: msg.content[0].text };
  }

  analysis.generated_at = new Date().toISOString();
  analysis.model = 'claude-opus-4-7';
  analysis.suite = suiteName;
  analysis.pass_rate = report.pass_rate;
  analysis.run_at = report.run_at;

  writeFileSync(join(__dirname, analysisName), JSON.stringify(analysis, null, 2));
  if (!JSON_ONLY) console.log(`Analysis written to tests/quality/${analysisName}`);

  // Append to analysis history (without full failing tests data)
  const historySnapshot = { ...analysis };
  analysisHistory.push(historySnapshot);
  writeFileSync(join(__dirname, analysisHistoryName), JSON.stringify(analysisHistory, null, 2));
  if (!JSON_ONLY) console.log(`Analysis history appended to tests/quality/${analysisHistoryName}`);
}

process.exit(passed === results.length ? 0 : 1);
