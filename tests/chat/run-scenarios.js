#!/usr/bin/env node
/**
 * Jafar Conversation Quality Test Runner v2
 *
 * Runs test scenarios against the live Jafar API, scores each response
 * using an LLM judge against a 12-dimension rubric, and writes results
 * to timestamped report files.
 *
 * Usage:
 *   node tests/chat/run-scenarios.js                    # Run all 100
 *   node tests/chat/run-scenarios.js --category factual # Run one category
 *   node tests/chat/run-scenarios.js --ids 1,2,3        # Run specific IDs
 *   node tests/chat/run-scenarios.js --resume            # Resume from last run
 *   node tests/chat/run-scenarios.js --tag v6            # Tag results for comparison
 */

import { SCENARIOS } from './scenarios.js';
import { RUBRIC, WEIGHTS, calculateOverallScore, THRESHOLDS, getQuestionType, getAdjustedThresholds } from './rubric.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(__dirname, 'runs');
if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });

const API_URL = process.env.JAFAR_API_URL || 'http://tower-nas:7839/api/chat/stream';
const JUDGE_API_KEY = process.env.OPENAI_API_KEY;
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-4o-mini';

// Parse args
const args = process.argv.slice(2);
const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
const idFilter = args.includes('--ids') ? args[args.indexOf('--ids') + 1].split(',').map(Number) : null;
const resumeMode = args.includes('--resume');
const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const concurrency = parseInt(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : '2');

const RESULTS_FILE = join(RUNS_DIR, `results-${tag}.json`);
const REPORT_FILE = join(RUNS_DIR, `report-${tag}.md`);

// ── Call Jafar API (SSE) ────────────────────────────────────────────────────

async function callJafar(query, retries = 2) {
  const startTime = Date.now();
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min timeout

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return parseSSE(text, startTime);
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
}

function parseSSE(text, startTime) {
  const lines = text.split('\n').filter(l => l.startsWith('data: '));

  let fullText = '';
  let toolsUsed = [];
  let toolArgs = [];
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
    toolCallCount: toolsUsed.length,
    citations,
    durationMs: Date.now() - startTime
  };
}

// ── LLM Judge ───────────────────────────────────────────────────────────────

function buildJudgePrompt() {
  const dims = Object.entries(RUBRIC).map(([key, r]) => {
    let section = `### ${r.name} (${key}) [weight: ${r.weight}]\n${r.description}\n`;
    section += Object.entries(r.scoring).map(([score, desc]) => `  ${score}: ${desc}`).join('\n');
    if (r.examples) {
      section += `\n  GOOD: ${r.examples.good}\n  BAD: ${r.examples.bad}`;
    }
    return section;
  }).join('\n\n');

  return `You are a strict, expert evaluator for a research assistant named "Jafar" that serves the Ocean Library — a multi-religion digital library with 7,900+ documents and 3.5M+ paragraphs.

## Your Task
Score the assistant's response on each dimension below (1-5). Be rigorous. A 5 is exceptional. A 3 is merely acceptable.

## Scoring Dimensions

${dims}

## Critical Rules for Judging

1. **Quotes must be REAL text from search results.** If the assistant quotes text that wasn't in its search results, that's hallucination (noHallucination = 1).
2. **General knowledge is NOT acceptable.** If the assistant provides information that didn't come from search results — even if factually correct — score noGeneralKnowledge low.
3. **Source authority matters.** Scripture > authorized translation > canonical commentary > academic. For Bahá'í: Bahá'u'lláh > 'Abdu'l-Bahá > Shoghi Effendi > UHJ > scholars.
4. **The QUESTION TYPE affects expectations:**
   - Research/factual/comparative: full citations expected
   - Author lookup: listing titles is fine, quoting content is bonus
   - Browsing/stats: citations not expected, but accuracy matters
   - Social ("thank you", "?", vague): warmth matters most, tools optional
   - Reading ("read me the opening of..."): must use read mode and return actual text
5. **One brilliant quote beats five mediocre ones.** Score quoteEconomy based on selection quality, not quantity.
6. **Brevity means tight prose between quotes**, not short quotes. Long quotes are fine if relevant.

Return ONLY a JSON object:
{
  "toolUsage": <1-5>,
  "citationPresence": <1-5>,
  "citationAccuracy": <1-5>,
  "sourceAuthority": <1-5>,
  "topicCoverage": <1-5>,
  "logicalCoherence": <1-5>,
  "brevity": <1-5>,
  "quoteEconomy": <1-5>,
  "instructionFollowing": <1-5>,
  "warmth": <1-5>,
  "noHallucination": <1-5>,
  "noGeneralKnowledge": <1-5>,
  "diagnosis": "<2-3 sentence diagnosis: what's the #1 thing wrong with this response, and what would fix it>"
}`;
}

const JUDGE_PROMPT = buildJudgePrompt();

async function judgeResponse(query, response, toolsUsed, questionType) {
  if (!JUDGE_API_KEY) {
    console.error('OPENAI_API_KEY required for LLM judge');
    process.exit(1);
  }

  const judgeInput = `## Context
QUESTION TYPE: ${questionType}
USER QUERY: "${query}"
TOOLS USED: ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'NONE'}
TOOL CALL COUNT: ${toolsUsed.length}

## Assistant Response
${response || '(empty response)'}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JUDGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: judgeInput }
      ],
      temperature: 0.1,
      max_tokens: 500
    })
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Judge returned no JSON: ' + content.substring(0, 200));

  return JSON.parse(jsonMatch[0]);
}

// ── Runner ──────────────────────────────────────────────────────────────────

async function runScenario(scenario) {
  const { id, category, query } = scenario;
  const questionType = getQuestionType(query, category);
  const adjustedThresholds = getAdjustedThresholds(questionType);

  process.stdout.write(`  [${String(id).padStart(3)}] ${category.padEnd(13)} "${query.substring(0, 45).padEnd(45)}..." `);

  try {
    const response = await callJafar(query);
    const scores = await judgeResponse(query, response.text, response.toolsUsed, questionType);
    const overall = calculateOverallScore(scores);

    // Check against ADJUSTED thresholds for this question type
    const failures = Object.entries(adjustedThresholds)
      .filter(([dim, min]) => (scores[dim] || 0) < min)
      .map(([dim]) => dim);

    const status = failures.length === 0 ? 'PASS' : 'FAIL';
    const symbol = status === 'PASS' ? '✓' : '✗';

    // Show key scores inline
    const cite = scores.citationPresence ?? '?';
    const auth = scores.sourceAuthority ?? '?';
    const hall = scores.noHallucination ?? '?';
    console.log(`${symbol} ${overall} cite=${cite} auth=${auth} hall=${hall} | ${(scores.diagnosis || '').substring(0, 60)}`);

    return {
      id, category, query, questionType, status,
      response: response.text.substring(0, 3000),
      toolsUsed: response.toolsUsed,
      toolCallCount: response.toolCallCount,
      citationCount: response.citations.length,
      durationMs: response.durationMs,
      scores,
      overall: parseFloat(overall),
      failures,
      diagnosis: scores.diagnosis
    };
  } catch (err) {
    console.log(`ERROR: ${err.message.substring(0, 80)}`);
    return {
      id, category, query, questionType, status: 'ERROR',
      error: err.message, scores: {}, overall: 0, failures: ['error']
    };
  }
}

async function runBatch(scenarios, batchSize = 2) {
  const results = [];
  for (let i = 0; i < scenarios.length; i += batchSize) {
    const batch = scenarios.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(runScenario));
    results.push(...batchResults);
    if (i + batchSize < scenarios.length) await new Promise(r => setTimeout(r, 500));
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
    const scores = results.filter(r => r.scores?.[dim] != null).map(r => r.scores[dim]);
    avgScores[dim] = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : 'N/A';
  }

  // Average by category
  const categories = [...new Set(results.map(r => r.category))].sort();
  const catScores = {};
  for (const cat of categories) {
    const catResults = results.filter(r => r.category === cat && r.overall > 0);
    catScores[cat] = catResults.length > 0
      ? (catResults.reduce((a, b) => a + b.overall, 0) / catResults.length).toFixed(2)
      : 'N/A';
  }

  // Average by question type
  const qTypes = [...new Set(results.map(r => r.questionType))].sort();
  const qtScores = {};
  for (const qt of qTypes) {
    const qtResults = results.filter(r => r.questionType === qt && r.overall > 0);
    qtScores[qt] = qtResults.length > 0
      ? (qtResults.reduce((a, b) => a + b.overall, 0) / qtResults.length).toFixed(2)
      : 'N/A';
  }

  let report = `# Jafar Quality Report — ${tag}\n\n`;
  report += `> Generated: ${new Date().toISOString()}\n`;
  report += `> Judge model: ${JUDGE_MODEL}\n\n`;

  report += `## Summary\n\n`;
  report += `| Metric | Value |\n|--------|-------|\n`;
  report += `| Total | ${total} |\n`;
  report += `| Passed | **${passed} (${(passed / total * 100).toFixed(0)}%)** |\n`;
  report += `| Failed | ${failed} |\n`;
  report += `| Errors | ${errors} |\n\n`;

  report += `## Scores by Dimension\n\n`;
  report += `| Dimension | Avg | Weight | Threshold | Status |\n|-----------|-----|--------|-----------|--------|\n`;
  for (const [dim, rubric] of Object.entries(RUBRIC)) {
    const score = avgScores[dim];
    const status = parseFloat(score) >= rubric.threshold ? '✓' : `**BELOW** (need ${rubric.threshold})`;
    report += `| ${rubric.name} | ${score} | ${rubric.weight} | ${rubric.threshold} | ${status} |\n`;
  }

  report += `\n## Scores by Question Type\n\n`;
  report += `| Type | Avg Score | Count |\n|------|-----------|-------|\n`;
  for (const [qt, score] of Object.entries(qtScores)) {
    const count = results.filter(r => r.questionType === qt).length;
    report += `| ${qt} | ${score} | ${count} |\n`;
  }

  report += `\n## Scores by Category\n\n`;
  report += `| Category | Avg Score |\n|----------|-----------|\n`;
  for (const [cat, score] of Object.entries(catScores)) {
    report += `| ${cat} | ${score} |\n`;
  }

  // Diagnoses for failures
  const failedResults = results
    .filter(r => r.status === 'FAIL' && r.diagnosis)
    .sort((a, b) => a.overall - b.overall);

  if (failedResults.length > 0) {
    report += `\n## Failure Diagnoses (worst first)\n\n`;
    for (const r of failedResults.slice(0, 20)) {
      const dims = (r.failures || []).join(', ');
      report += `- **[${r.id}] ${r.category}** (${r.questionType}) "${r.query.substring(0, 50)}" — overall=${r.overall}\n`;
      report += `  Failed: ${dims}\n`;
      report += `  Diagnosis: ${r.diagnosis}\n\n`;
    }
  }

  // Pattern analysis — which dimensions fail most
  const failureCounts = {};
  for (const r of results) {
    for (const f of (r.failures || [])) {
      failureCounts[f] = (failureCounts[f] || 0) + 1;
    }
  }
  if (Object.keys(failureCounts).length > 0) {
    report += `\n## Failure Frequency\n\n`;
    report += `| Dimension | Failures | % of Total |\n|-----------|----------|------------|\n`;
    for (const [dim, count] of Object.entries(failureCounts).sort((a, b) => b[1] - a[1])) {
      const name = RUBRIC[dim]?.name || dim;
      report += `| ${name} | ${count} | ${(count / total * 100).toFixed(0)}% |\n`;
    }
  }

  // Top diagnoses — pattern extraction
  const diagWords = {};
  for (const r of failedResults) {
    const words = (r.diagnosis || '').toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 4) diagWords[w] = (diagWords[w] || 0) + 1;
    }
  }
  const topDiagWords = Object.entries(diagWords)
    .filter(([_, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (topDiagWords.length > 0) {
    report += `\n## Common Diagnosis Themes\n\n`;
    report += topDiagWords.map(([w, c]) => `\`${w}\` (${c}x)`).join(', ') + '\n';
  }

  return report;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Jafar Quality Assessment — Run "${tag}"`);
  console.log('='.repeat(50) + '\n');

  let scenarios = SCENARIOS;
  if (categoryFilter) {
    scenarios = scenarios.filter(s => s.category === categoryFilter);
    console.log(`Category filter: ${categoryFilter} (${scenarios.length} scenarios)`);
  }
  if (idFilter) {
    scenarios = scenarios.filter(s => idFilter.includes(s.id));
    console.log(`ID filter: ${idFilter.join(', ')} (${scenarios.length} scenarios)`);
  }

  let existingResults = [];
  if (resumeMode && existsSync(RESULTS_FILE)) {
    existingResults = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));
    const doneIds = new Set(existingResults.map(r => r.id));
    scenarios = scenarios.filter(s => !doneIds.has(s.id));
    console.log(`Resuming: ${existingResults.length} done, ${scenarios.length} remaining`);
  }

  if (scenarios.length === 0) {
    console.log('No scenarios to run.');
    if (existingResults.length > 0) {
      const report = generateReport(existingResults);
      writeFileSync(REPORT_FILE, report);
      console.log(`Report: ${REPORT_FILE}`);
    }
    return;
  }

  console.log(`Running ${scenarios.length} scenarios (concurrency=${concurrency})...\n`);

  const newResults = await runBatch(scenarios, concurrency);
  const allResults = [...existingResults, ...newResults];

  writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2));
  const report = generateReport(allResults);
  writeFileSync(REPORT_FILE, report);

  // Also write to canonical latest location
  writeFileSync(join(__dirname, 'results.json'), JSON.stringify(allResults, null, 2));
  writeFileSync(join(__dirname, 'report.md'), report);

  const passed = allResults.filter(r => r.status === 'PASS').length;
  const avgOverall = allResults.filter(r => r.overall > 0);
  const avg = avgOverall.length > 0 ? (avgOverall.reduce((a, b) => a + b.overall, 0) / avgOverall.length).toFixed(2) : 0;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${passed}/${allResults.length} passed (${(passed / allResults.length * 100).toFixed(0)}%) | Avg: ${avg}`);
  console.log(`Report: ${REPORT_FILE}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
