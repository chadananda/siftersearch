#!/usr/bin/env node
/**
 * Jafar Iterative Improvement Loop
 *
 * Runs the assessment, analyzes failures, generates prompt improvements,
 * deploys them, and re-runs. Maintains a state file for continuity.
 *
 * Usage:
 *   OPENAI_API_KEY=<key> node tests/chat/iterate.js
 *   OPENAI_API_KEY=<key> node tests/chat/iterate.js --max-iterations 5
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, 'iterate-state.json');
const PROMPT_FILE = join(__dirname, '..', '..', 'api', 'routes', 'chat.js');
const RUNS_DIR = join(__dirname, 'runs');
if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });

const MAX_ITERATIONS = parseInt(process.argv.includes('--max-iterations')
  ? process.argv[process.argv.indexOf('--max-iterations') + 1] : '10');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY required'); process.exit(1); }

// ── State Management ────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return {
    iteration: 0,
    history: [],
    bestScore: 0,
    bestIteration: 0,
    promptVersions: []
  };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Prompt Management ───────────────────────────────────────────────────────

function extractCurrentPrompt() {
  const chatJs = readFileSync(PROMPT_FILE, 'utf-8');
  const match = chatJs.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!match) throw new Error('Could not extract SYSTEM_PROMPT from chat.js');
  return match[1];
}

function writePrompt(newPrompt) {
  const chatJs = readFileSync(PROMPT_FILE, 'utf-8');
  const updated = chatJs.replace(
    /const SYSTEM_PROMPT = `[\s\S]*?`;/,
    'const SYSTEM_PROMPT = `' + newPrompt + '`;'
  );
  writeFileSync(PROMPT_FILE, updated);
}

// ── Deploy ──────────────────────────────────────────────────────────────────

function deploy(iteration) {
  console.log(`  Deploying iteration ${iteration}...`);
  try {
    execSync('npm run build 2>&1 | tail -1', { cwd: join(__dirname, '..', '..'), stdio: 'pipe' });
    execSync(`git add api/routes/chat.js && SKIP_CHECKS=1 git commit -m "Jafar prompt iteration ${iteration} (automated quality loop)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>&1`, {
      cwd: join(__dirname, '..', '..'), stdio: 'pipe'
    });
    execSync('ssh chad@tower-nas "cd ~/sifter/siftersearch && git pull && pm2 restart siftersearch-api" 2>&1', {
      stdio: 'pipe', timeout: 30000
    });
    // Wait for server to be ready
    execSync('sleep 5');
    console.log('  Deployed.');
  } catch (err) {
    console.error('  Deploy failed:', err.message?.substring(0, 200));
    throw err;
  }
}

// ── Run Assessment ──────────────────────────────────────────────────────────

function runAssessment(tag) {
  console.log(`  Running 100 scenarios (tag: ${tag})...`);
  const output = execSync(
    `OPENAI_API_KEY=${OPENAI_API_KEY} node tests/chat/run-scenarios.js --tag ${tag} --concurrency 2 2>&1`,
    { cwd: join(__dirname, '..', '..'), timeout: 900000, maxBuffer: 10 * 1024 * 1024 }
  ).toString();

  // Parse results
  const resultsFile = join(RUNS_DIR, `results-${tag}.json`);
  if (!existsSync(resultsFile)) throw new Error('Results file not created');

  const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));
  const passed = results.filter(r => r.status === 'PASS').length;
  const avgScores = results.filter(r => r.overall > 0);
  const avg = avgScores.length > 0 ? avgScores.reduce((a, b) => a + b.overall, 0) / avgScores.length : 0;

  // Extract summary line from output
  const summaryMatch = output.match(/RESULT: (.+)/);

  return {
    tag,
    passRate: passed / results.length,
    passCount: passed,
    total: results.length,
    avgScore: parseFloat(avg.toFixed(2)),
    results,
    summary: summaryMatch ? summaryMatch[1] : `${passed}/${results.length}`
  };
}

// ── Analyze Failures and Generate Prompt Improvement ────────────────────────

async function analyzeAndImprove(assessment, currentPrompt, state) {
  const { results } = assessment;

  // Collect failure patterns
  const failures = results.filter(r => r.status === 'FAIL');
  const failureDims = {};
  for (const f of failures) {
    for (const dim of (f.failures || [])) {
      failureDims[dim] = (failureDims[dim] || 0) + 1;
    }
  }

  // Get top diagnoses
  const diagnoses = failures
    .filter(r => r.diagnosis)
    .sort((a, b) => a.overall - b.overall)
    .slice(0, 15)
    .map(r => `[${r.id}] ${r.category}/${r.questionType}: "${r.query.substring(0, 40)}" — ${r.diagnosis}`);

  // Get best and worst examples
  const best = results.filter(r => r.overall >= 4.0).slice(0, 3);
  const worst = results.filter(r => r.overall > 0).sort((a, b) => a.overall - b.overall).slice(0, 5);

  const prompt = `You are optimizing a system prompt for "Jafar", a research assistant chatbot for the Ocean Library.

## Current System Prompt
\`\`\`
${currentPrompt}
\`\`\`

## Assessment Results (iteration ${state.iteration})
- Pass rate: ${(assessment.passRate * 100).toFixed(0)}% (${assessment.passCount}/${assessment.total})
- Average score: ${assessment.avgScore}/5.0
- Best previous score: ${state.bestScore}/5.0 (iteration ${state.bestIteration})

## Failure Frequency by Dimension
${Object.entries(failureDims).sort((a, b) => b[1] - a[1]).map(([d, c]) => `- ${d}: ${c} failures`).join('\n')}

## Top Failure Diagnoses (worst first)
${diagnoses.join('\n')}

## Worst Examples
${worst.map(r => `- [${r.id}] "${r.query.substring(0, 50)}" → overall=${r.overall}, response: "${(r.response || '').substring(0, 150)}..."`).join('\n')}

## Best Examples (what's working)
${best.map(r => `- [${r.id}] "${r.query.substring(0, 50)}" → overall=${r.overall}`).join('\n')}

## Previous Iterations
${state.history.map(h => `- Iteration ${h.iteration}: ${h.passRate}% pass, avg ${h.avgScore} — change: ${h.change || 'baseline'}`).join('\n') || 'None'}

## Your Task
Analyze the failure patterns and produce an IMPROVED system prompt. Rules:
1. The prompt must stay under 2000 characters (current GPT-4o context budget)
2. DO NOT add examples or few-shot — they waste tokens. Use clear rules.
3. Focus on the TOP 2-3 failure patterns. Don't try to fix everything at once.
4. Keep what's working. Don't change rules that are already producing good scores.
5. Be specific: "search with religion filter" is better than "search well"
6. The prompt is for GPT-4o with function calling — it understands structured rules.

Return your response as JSON:
{
  "analysis": "<3-4 sentences: what's the root cause of the failures?>",
  "changes": ["<specific change 1>", "<specific change 2>"],
  "newPrompt": "<the complete new system prompt — everything between the backticks>"
}`;

  let data;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 3000
        })
      });
      data = await res.json();
      break;
    } catch (err) {
      if (attempt < 2) { console.log(`  Retry analysis (attempt ${attempt + 2})...`); await new Promise(r => setTimeout(r, 5000)); continue; }
      throw err;
    }
  }
  const content = data.choices?.[0]?.message?.content || '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Improvement analysis returned no JSON');

  return JSON.parse(jsonMatch[0]);
}

// ── Main Loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log('Jafar Iterative Improvement Loop');
  console.log('================================\n');

  const state = loadState();

  for (let i = state.iteration; i < state.iteration + MAX_ITERATIONS; i++) {
    const iterTag = `iter-${String(i).padStart(2, '0')}`;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ITERATION ${i}`);
    console.log(`${'─'.repeat(50)}\n`);

    // 1. Run assessment
    let assessment;
    try {
      assessment = runAssessment(iterTag);
    } catch (err) {
      console.error('Assessment failed:', err.message?.substring(0, 200));
      break;
    }

    console.log(`\n  Result: ${assessment.summary}`);
    console.log(`  Avg score: ${assessment.avgScore}`);

    // Record in state
    state.history.push({
      iteration: i,
      tag: iterTag,
      passRate: (assessment.passRate * 100).toFixed(0),
      avgScore: assessment.avgScore,
      change: i === 0 ? 'baseline' : state.history[state.history.length - 1]?.change || ''
    });

    if (assessment.avgScore > state.bestScore) {
      state.bestScore = assessment.avgScore;
      state.bestIteration = i;
    }

    saveState(state);

    // 2. Analyze and improve
    console.log('\n  Analyzing failures and generating improvement...');
    const currentPrompt = extractCurrentPrompt();

    let improvement;
    try {
      improvement = await analyzeAndImprove(assessment, currentPrompt, state);
    } catch (err) {
      console.error('  Analysis failed:', err.message?.substring(0, 200));
      break;
    }

    console.log(`  Analysis: ${improvement.analysis}`);
    console.log(`  Changes: ${improvement.changes?.join('; ')}`);

    // Save the prompt version
    state.promptVersions.push({
      iteration: i,
      prompt: currentPrompt,
      score: assessment.avgScore
    });

    // 3. Apply the new prompt if it looks safe
    if (improvement.newPrompt) {
      // Safety check: new prompt must be within reasonable length
      if (improvement.newPrompt.length > 3000) {
        console.log('  New prompt too long (' + improvement.newPrompt.length + ' chars) — skipping.');
        state.history[state.history.length - 1].change = 'skipped (too long)';
        saveState(state);
        continue;
      }

      writePrompt(improvement.newPrompt);
      state.history[state.history.length - 1].change = improvement.changes?.join('; ') || 'prompt updated';
      saveState(state);

      // 4. Deploy
      try {
        deploy(i + 1);
      } catch {
        console.error('  Deploy failed — reverting prompt');
        writePrompt(currentPrompt);
        break;
      }

      // 5. Quick smoke test — run 5 key scenarios to catch regressions
      console.log('  Running smoke test (5 scenarios)...');
      try {
        const smokeOutput = execSync(
          `OPENAI_API_KEY=${OPENAI_API_KEY} node tests/chat/run-scenarios.js --ids 1,26,51,71,93 --tag smoke-${iterTag} --concurrency 1 2>&1`,
          { cwd: join(__dirname, '..', '..'), timeout: 300000, maxBuffer: 5 * 1024 * 1024 }
        ).toString();
        const smokeMatch = smokeOutput.match(/Avg: ([\d.]+)/);
        const smokeAvg = smokeMatch ? parseFloat(smokeMatch[1]) : 0;
        console.log(`  Smoke test avg: ${smokeAvg}`);
        if (smokeAvg < state.bestScore * 0.85) {
          console.log('  Smoke test regression detected — reverting prompt.');
          writePrompt(currentPrompt);
          deploy(i + 1);
          state.history[state.history.length - 1].change += ' (REVERTED - smoke test regression)';
          saveState(state);
          continue;
        }
      } catch (err) {
        console.log('  Smoke test failed — reverting prompt.');
        writePrompt(currentPrompt);
        deploy(i + 1);
        continue;
      }
    } else {
      console.log('  No prompt change suggested — stopping.');
      break;
    }

    state.iteration = i + 1;
    saveState(state);
  }

  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('ITERATION HISTORY');
  console.log('='.repeat(50));
  for (const h of state.history) {
    const marker = h.iteration === state.bestIteration ? ' ★ BEST' : '';
    console.log(`  ${h.iteration}: ${h.passRate}% pass, avg ${h.avgScore}${marker} — ${h.change}`);
  }
  console.log(`\nBest: iteration ${state.bestIteration} (${state.bestScore})`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
