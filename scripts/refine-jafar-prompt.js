#!/usr/bin/env node
// Read the prompt-signals log, analyze the patterns, and propose a refined prompt.
// Designed to run between batches — produces a new prompt file for the next batch.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const scoresDir = join(PROJECT_ROOT, 'tmp-scores');
const signalsLog = join(scoresDir, 'prompt-signals.md');

if (!existsSync(scoresDir)) {
  console.error('No tmp-scores directory yet — run the batch first.');
  process.exit(1);
}

const scoreFiles = readdirSync(scoresDir).filter(f => f.endsWith('.json'));
if (scoreFiles.length === 0) {
  console.error('No scores yet.');
  process.exit(1);
}

const scores = scoreFiles.map(f => JSON.parse(readFileSync(join(scoresDir, f), 'utf-8')));

// Aggregate stats
const dimensions = ['depth', 'clarity', 'stereotype_avoidance', 'word_definition_questioning',
  'assumption_questioning', 'teaching_clarity', 'evidence_quality',
  'conversational_naturalness', 'believer_voice', 'archive_worthy'];

console.log(`\n=== ANALYSIS OVER ${scores.length} CONVERSATIONS ===\n`);
console.log(`Average overall score: ${(scores.reduce((s, x) => s + x.overall, 0) / scores.length).toFixed(1)}%`);
console.log(`Range: ${Math.min(...scores.map(s => s.overall))}% – ${Math.max(...scores.map(s => s.overall))}%\n`);

console.log('Per-dimension averages:');
for (const d of dimensions) {
  const avg = scores.reduce((s, x) => s + (x[d] || 0), 0) / scores.length;
  const lo = Math.min(...scores.map(s => s[d] || 0));
  const hi = Math.max(...scores.map(s => s[d] || 0));
  const bar = '█'.repeat(Math.round(avg / 5));
  console.log(`  ${d.padEnd(32)} ${avg.toFixed(1).padStart(5)}% (range ${lo}-${hi})  ${bar}`);
}

// Find weakest dimensions
const weakest = dimensions
  .map(d => ({ d, avg: scores.reduce((s, x) => s + (x[d] || 0), 0) / scores.length }))
  .sort((a, b) => a.avg - b.avg)
  .slice(0, 3);
console.log(`\nThree weakest dimensions: ${weakest.map(w => `${w.d} (${w.avg.toFixed(0)}%)`).join(', ')}`);

// Aggregate weakness mentions
const weaknessTokens = new Map();
for (const s of scores) {
  for (const w of (s.weaknesses || [])) {
    const tokens = w.toLowerCase().split(/[\s,;.]+/).filter(t => t.length > 4);
    for (const t of tokens) weaknessTokens.set(t, (weaknessTokens.get(t) || 0) + 1);
  }
}
const topWeaknessTokens = Array.from(weaknessTokens.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
console.log(`\nMost-mentioned weakness tokens:`);
for (const [t, c] of topWeaknessTokens) console.log(`  ${c}x  ${t}`);

// Aggregate prompt signals
console.log(`\nPrompt signals (last 20):`);
const recentSignals = scores.slice(-20).map(s => `[${s.slug}] ${s.overall}% — ${s.prompt_signal}`);
for (const sig of recentSignals) console.log(`  ${sig}`);

console.log(`\n=== END ANALYSIS ===`);
