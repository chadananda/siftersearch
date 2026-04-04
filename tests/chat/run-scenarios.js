#!/usr/bin/env node
/**
 * Jafar Conversation Quality Test Runner
 *
 * Runs test scenarios against the live Jafar API, scores each response
 * using an LLM judge, and writes results to a report file.
 *
 * Usage:
 *   node tests/chat/run-scenarios.js                    # Run all 100
 *   node tests/chat/run-scenarios.js --category factual # Run one category
 *   node tests/chat/run-scenarios.js --ids 1,2,3        # Run specific IDs
 *   node tests/chat/run-scenarios.js --resume            # Resume from last run
 */

import { SCENARIOS } from './scenarios.js';
import { RUBRIC, WEIGHTS, calculateOverallScore, THRESHOLDS } from './rubric.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE = join(__dirname, 'results.json');
const REPORT_FILE = join(__dirname, 'report.md');

const API_URL = process.env.JAFAR_API_URL || 'http://tower-nas:7839/api/chat/stream';
const JUDGE_API_KEY = process.env.OPENAI_API_KEY;

// Parse args
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
const idFilter = args.includes('--ids') ? args[args.indexOf('--ids') + 1].split(',').map(Number) : null;
const resumeMode = args.includes('--resume');
const concurrency = parseInt(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : '3');

// ── Call Jafar API (SSE) ────────────────────────────────────────────────────

async function callJafar(query) {
  const startTime = Date.now();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: query }]
    })
  });

  if (!response.ok) {
    throw new Error(`Jafar API error: ${response.status} ${response.statusText}`);
  }

  // Parse SSE stream
  const text = await response.text();
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  let fullText = '';
  let toolsUsed = [];
  let citations = [];

  for (const line of lines) {
    try {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'chunk') fullText += data.text;
      if (data.type === 'tool_use') toolsUsed.push(...(data.tools || []));
      if (data.type === 'citations') citations = data.citations || [];
    } catch { /* skip malformed lines */ }
  }

  return {
    text: fullText,
    toolsUsed,
    citations,
    durationMs: Date.now() - startTime
  };
}

// ── LLM Judge ───────────────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are evaluating a research assistant named Jafar for the Ocean Library (a multi-religion digital library).

Score the response on these dimensions (1-5 each):

${Object.entries(RUBRIC).map(([key, r]) => `**${r.name}** (${key}): ${r.description}
${Object.entries(r.scoring).map(([score, desc]) => `  ${score}: ${desc}`).join('\n')}`).join('\n\n')}

CRITICAL EVALUATION RULES:
- Citations score: The user MUST receive actual quotes from the library to support claims. Title mentions alone are NOT sufficient — the response needs quoted text. If the assistant makes claims about what a text says without quoting it, that's a citations score of 2-3 at best.
- Tool usage: The assistant should ALWAYS use search tools before answering. Answering from general knowledge is a failure.
- Brevity: A terse response with citations is better than a verbose one without.

Return ONLY a JSON object with scores and a brief note:
{
  "brevity": <1-5>,
  "citations": <1-5>,
  "toolUsage": <1-5>,
  "accuracy": <1-5>,
  "warmth": <1-5>,
  "helpfulness": <1-5>,
  "note": "<one sentence summary of biggest issue>"
}`;

async function judgeResponse(query, response, toolsUsed) {
  if (!JUDGE_API_KEY) {
    console.error('OPENAI_API_KEY required for LLM judge');
    process.exit(1);
  }

  const judgeInput = `USER QUERY: "${query}"

TOOLS USED BY ASSISTANT: ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'NONE (answered without using tools)'}

ASSISTANT RESPONSE:
${response}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JUDGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: judgeInput }
      ],
      temperature: 0.1,
      max_tokens: 300
    })
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Judge returned no JSON');

  return JSON.parse(jsonMatch[0]);
}

// ── Runner ──────────────────────────────────────────────────────────────────

async function runScenario(scenario) {
  const { id, category, query } = scenario;
  process.stdout.write(`  [${id}/${SCENARIOS.length}] ${category}: "${query.substring(0, 50)}..." `);

  try {
    const response = await callJafar(query);
    const scores = await judgeResponse(query, response.text, response.toolsUsed);
    const overall = calculateOverallScore(scores);

    // Check thresholds
    const failures = Object.entries(THRESHOLDS)
      .filter(([dim, min]) => (scores[dim] || 0) < min)
      .map(([dim]) => dim);

    const status = failures.length === 0 ? 'PASS' : 'FAIL';
    const symbol = status === 'PASS' ? '✓' : '✗';

    console.log(`${symbol} overall=${overall} cite=${scores.citations} ${scores.note || ''}`);

    return {
      id, category, query, status,
      response: response.text.substring(0, 2000),
      toolsUsed: response.toolsUsed,
      citationCount: response.citations.length,
      durationMs: response.durationMs,
      scores,
      overall: parseFloat(overall),
      failures,
      note: scores.note
    };
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    return {
      id, category, query, status: 'ERROR',
      error: err.message, scores: {}, overall: 0, failures: ['error']
    };
  }
}

async function runBatch(scenarios, batchSize = 3) {
  const results = [];
  for (let i = 0; i < scenarios.length; i += batchSize) {
    const batch = scenarios.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(runScenario));
    results.push(...batchResults);
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < scenarios.length) await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

// ── Report Generation ───────────────────────────────────────────────────────

function generateReport(results) {
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  // Average scores per dimension
  const avgScores = {};
  for (const dim of Object.keys(RUBRIC)) {
    const scores = results.filter(r => r.scores?.[dim]).map(r => r.scores[dim]);
    avgScores[dim] = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
  }

  // Average scores per category
  const categories = [...new Set(results.map(r => r.category))];
  const catScores = {};
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat && r.overall > 0);
    catScores[cat] = catResults.length > 0
      ? (catResults.reduce((a, b) => a + b.overall, 0) / catResults.length).toFixed(2)
      : 'N/A';
  }

  // Worst performers
  const worst = results
    .filter(r => r.overall > 0)
    .sort((a, b) => a.overall - b.overall)
    .slice(0, 10);

  // Low citation scores
  const lowCitations = results
    .filter(r => (r.scores?.citations || 0) <= 2)
    .sort((a, b) => (a.scores?.citations || 0) - (b.scores?.citations || 0));

  let report = `# Jafar Quality Report\n\n`;
  report += `> Generated: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `| Metric | Value |\n|--------|-------|\n`;
  report += `| Total scenarios | ${total} |\n`;
  report += `| Passed | ${passed} (${(passed / total * 100).toFixed(0)}%) |\n`;
  report += `| Failed | ${failed} |\n`;
  report += `| Errors | ${errors} |\n\n`;

  report += `## Average Scores by Dimension\n\n`;
  report += `| Dimension | Score | Threshold | Status |\n|-----------|-------|-----------|--------|\n`;
  for (const [dim, rubric] of Object.entries(RUBRIC)) {
    const score = avgScores[dim];
    const threshold = THRESHOLDS[dim];
    const status = parseFloat(score) >= threshold ? '✓' : '✗ BELOW';
    report += `| ${rubric.name} | ${score} | ${threshold} | ${status} |\n`;
  }

  report += `\n## Average Scores by Category\n\n`;
  report += `| Category | Overall Score |\n|----------|---------------|\n`;
  for (const [cat, score] of Object.entries(catScores)) {
    report += `| ${cat} | ${score} |\n`;
  }

  if (lowCitations.length > 0) {
    report += `\n## Low Citation Scores (≤2)\n\n`;
    report += `These responses failed to back up claims with actual quotes:\n\n`;
    for (const r of lowCitations) {
      report += `- **[${r.id}] ${r.category}**: "${r.query}" — citations=${r.scores?.citations}, note: ${r.note}\n`;
    }
  }

  if (worst.length > 0) {
    report += `\n## Worst 10 Performers\n\n`;
    report += `| ID | Category | Query | Overall | Citations | Note |\n|-----|----------|-------|---------|-----------|------|\n`;
    for (const r of worst) {
      report += `| ${r.id} | ${r.category} | ${r.query.substring(0, 40)}... | ${r.overall} | ${r.scores?.citations || '?'} | ${(r.note || '').substring(0, 50)} |\n`;
    }
  }

  // Common failure patterns
  const failurePatterns = {};
  for (const r of results) {
    for (const f of (r.failures || [])) {
      failurePatterns[f] = (failurePatterns[f] || 0) + 1;
    }
  }
  if (Object.keys(failurePatterns).length > 0) {
    report += `\n## Failure Patterns\n\n`;
    report += `| Dimension | Failure Count |\n|-----------|---------------|\n`;
    for (const [dim, count] of Object.entries(failurePatterns).sort((a, b) => b[1] - a[1])) {
      report += `| ${dim} | ${count} |\n`;
    }
  }

  return report;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Jafar Conversation Quality Test Runner');
  console.log('======================================\n');

  // Filter scenarios
  let scenarios = SCENARIOS;
  if (categoryFilter) {
    scenarios = scenarios.filter(s => s.category === categoryFilter);
    console.log(`Filtering to category: ${categoryFilter} (${scenarios.length} scenarios)`);
  }
  if (idFilter) {
    scenarios = scenarios.filter(s => idFilter.includes(s.id));
    console.log(`Filtering to IDs: ${idFilter.join(', ')} (${scenarios.length} scenarios)`);
  }

  // Resume from previous run
  let existingResults = [];
  if (resumeMode && existsSync(RESULTS_FILE)) {
    existingResults = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
    const doneIds = new Set(existingResults.map(r => r.id));
    scenarios = scenarios.filter(s => !doneIds.has(s.id));
    console.log(`Resuming: ${existingResults.length} done, ${scenarios.length} remaining`);
  }

  if (scenarios.length === 0) {
    console.log('No scenarios to run.');
    return;
  }

  console.log(`Running ${scenarios.length} scenarios (concurrency=${concurrency})...\n`);

  const newResults = await runBatch(scenarios, concurrency);
  const allResults = [...existingResults, ...newResults];

  // Save results
  writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);

  // Generate report
  const report = generateReport(allResults);
  writeFileSync(REPORT_FILE, report);
  console.log(`Report saved to ${REPORT_FILE}`);

  // Print summary
  const passed = allResults.filter(r => r.status === 'PASS').length;
  const avgOverall = allResults.filter(r => r.overall > 0).reduce((a, b) => a + b.overall, 0) / allResults.filter(r => r.overall > 0).length;
  console.log(`\n${passed}/${allResults.length} passed | Average overall: ${avgOverall.toFixed(2)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
