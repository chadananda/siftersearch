#!/usr/bin/env node
// Standalone: generate AI analysis from existing results-latest.json without running tests.
// Usage: node tests/quality/analyze-only.mjs [--ocean]

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const OCEAN = process.argv.includes('--ocean');
const resultsName = OCEAN ? 'ocean-results-latest.json' : 'results-latest.json';
const analysisName = OCEAN ? 'ocean-analysis.json' : 'analysis.json';
const analysisHistoryName = OCEAN ? 'ocean-analysis-history.json' : 'analysis-history.json';
const histName = OCEAN ? 'ocean-history.json' : 'history.json';
const changesPath = join(__dirname, 'changes.json');
const suiteName = OCEAN ? 'Ocean (fixture set)' : 'Core (52 fixtures)';

const report = JSON.parse(readFileSync(join(__dirname, resultsName), 'utf-8'));
const results = report.results || [];

let prevAnalysis = null;
try { prevAnalysis = JSON.parse(readFileSync(join(__dirname, analysisName), 'utf-8')); } catch {}
let analysisHistory = [];
try { analysisHistory = JSON.parse(readFileSync(join(__dirname, analysisHistoryName), 'utf-8')); } catch {}
let histArr = [];
try { histArr = JSON.parse(readFileSync(join(__dirname, histName), 'utf-8')); } catch {}
let changes = [];
try { changes = JSON.parse(readFileSync(changesPath, 'utf-8')); } catch {}

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

const priorAnalysesSummary = analysisHistory.slice(-5).map((a, i) => {
  const actions = a.action_plan?.map(p => `    #${p.priority} ${p.title}`).join('\n') || '    (none)';
  return `Run ${i + 1} (${a.generated_at?.slice(0,10)}, pass_rate=${a.pass_rate}%):\n  Summary: ${a.summary}\n  Actions suggested:\n${actions}`;
}).join('\n\n') || 'No prior analyses.';

const fb = report.failure_breakdown || (() => {
  let not_found=0, text_mismatch=0, anti_test=0, authority_low=0, timed_out=0, http_error=0, network_error=0;
  for (const r of results.filter(r => !r.ok)) {
    if (r.errorType === 'timeout') { timed_out++; continue; }
    if (r.errorType === 'http_error') { http_error++; continue; }
    if (r.errorType === 'network') { network_error++; continue; }
    if (r.rank === null) not_found++;
    else if (!r.text_hit) text_mismatch++;
    if (!r.anti_hit) anti_test++;
    if (!r.authority_hit) authority_low++;
  }
  return { not_found, text_mismatch, anti_test, authority_low, timed_out, http_error, network_error };
})();

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
  Not found in top 10: ${fb.not_found}
  Text mismatch: ${fb.text_mismatch}
  Anti-test failed: ${fb.anti_test}
  Authority too low: ${fb.authority_low}
  Timed out: ${fb.timed_out}
  HTTP error (5xx/4xx): ${fb.http_error}
  Network/other error: ${fb.network_error}

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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
console.log(`Generating AI analysis with claude-opus-4-7 for ${suiteName}...`);
console.log(`  Results: ${report.pass_rate}% (${report.passed}/${report.total}), run_at: ${report.run_at}`);

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
console.log(`Analysis written to tests/quality/${analysisName}`);

const historySnapshot = { ...analysis };
analysisHistory.push(historySnapshot);
writeFileSync(join(__dirname, analysisHistoryName), JSON.stringify(analysisHistory, null, 2));
console.log(`Analysis history appended to tests/quality/${analysisHistoryName}`);
console.log('\nSummary:', analysis.summary);
