#!/usr/bin/env node
/**
 * Segmentation Calibration Test
 *
 * Runs pass 1 (words→phrases) with multiple configurations on a test file
 * and outputs comparison results for human review.
 *
 * Usage:
 *   node scripts/segment-calibrate.js <file-path> [--words <n>]
 *
 * Options:
 *   --words <n>   Number of words to test with (default: 500, from start of doc)
 *
 * Tests:
 *   - GPT-4o vs Claude Sonnet
 *   - Chunk sizes: 200, 300, 500
 *   - Context carry: 0, 3, 5
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { aiService } from '../api/lib/ai-services.js';
import { logger } from '../api/lib/logger.js';

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const testWords = parseInt(args[args.indexOf('--words') + 1] || '500');

if (!filePath) {
  console.error('Usage: node scripts/segment-calibrate.js <file-path> [--words 500]');
  process.exit(1);
}

const PASS1_SYSTEM = `You are an expert in classical Arabic and Farsi manuscripts. You segment unpunctuated text into natural phrases.

You will receive a JSON array of words from a classical text that has NO punctuation whatsoever — no commas, periods, or any markers. Your job is to identify where natural phrase breaks occur.

A phrase is the smallest unit of text that carries a coherent piece of meaning. In classical Arabic and Farsi, phrase boundaries occur where a reader would naturally pause — at the end of a grammatical construction (iḍāfa chain, verb + objects, conditional clause), a rhetorical unit, or a shift in subject/address. Phrases vary widely in length: a vocative like "yā ayyuhā" is a complete phrase, while an extended iḍāfa chain may be many words. Let the grammar and meaning dictate the length, not any fixed word count.

Example with Arabic-like structure:
Input: ["In", "the", "name", "of", "God", "the", "merciful", "the", "compassionate", "praise", "be", "to", "God", "lord", "of", "the", "worlds"]
Natural phrases: "In the name of God" | "the merciful the compassionate" | "praise be to God" | "lord of the worlds"
Output: [5, 9, 13]

Return ONLY a JSON array of integers — the 0-based indices of words that START a new phrase. Index 0 always starts a phrase, so never include it.

Rules:
- Return ONLY a JSON array of integers. No text, no explanation.
- Let grammar, meaning, and rhetorical structure determine phrase boundaries — a pause that a skilled reciter would make marks a phrase boundary.
- Do NOT include index 0.
- The last few words may be an incomplete phrase (chunk boundary) — segment them as best you can.`;

function parseIndices(text, maxIndex) {
  const match = text.match(/\[[\d\s,]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]).filter(n => Number.isInteger(n) && n > 0 && n < maxIndex);
  } catch { return []; }
}

async function testConfig(words, { provider, model, chunkSize, contextCarry }) {
  const label = `${provider}/${model} chunk=${chunkSize} ctx=${contextCarry}`;
  console.log(`\nTesting: ${label}`);

  const allBreaks = [];
  let totalCost = 0;
  let totalCalls = 0;
  let offset = 0;

  while (offset < words.length) {
    const end = Math.min(offset + chunkSize, words.length);
    const chunk = words.slice(offset, end);

    const service = aiService('quality', { forceRemote: true });
    const response = await service.chat([
      { role: 'system', content: PASS1_SYSTEM },
      { role: 'user', content: JSON.stringify(chunk) }
    ], {
      caller: 'segmentation:calibrate',
      provider,
      model,
      temperature: 0.1,
      maxTokens: 2000
    });

    totalCalls++;
    totalCost += response.usage?.estimated_cost_usd || 0;

    const indices = parseIndices(response.content, chunk.length);
    for (const idx of indices) {
      const globalIdx = offset + idx;
      if (!allBreaks.includes(globalIdx)) allBreaks.push(globalIdx);
    }

    offset = end;
  }

  allBreaks.sort((a, b) => a - b);

  // Build phrase display
  const phraseStarts = [0, ...allBreaks];
  const phrases = [];
  for (let i = 0; i < phraseStarts.length; i++) {
    const start = phraseStarts[i];
    const end = i + 1 < phraseStarts.length ? phraseStarts[i + 1] : words.length;
    phrases.push(words.slice(start, end).join(' '));
  }

  const avgPhraseLen = (words.length / phrases.length).toFixed(1);
  console.log(`  ${phrases.length} phrases (avg ${avgPhraseLen} words), ${totalCalls} calls, ~$${totalCost.toFixed(4)}`);

  return { label, breaks: allBreaks, phrases, cost: totalCost, calls: totalCalls, avgPhraseLen };
}

async function main() {
  const absolutePath = resolve(filePath);
  const raw = readFileSync(absolutePath, 'utf-8');

  // Strip frontmatter
  let body = raw;
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
  if (fmMatch) body = raw.slice(fmMatch[0].length);

  const allWords = body.split(/\s+/).filter(w => w.length > 0);
  const words = allWords.slice(0, testWords);
  console.log(`Calibration test: ${words.length} words from ${absolutePath}\n`);

  const configs = [
    { provider: 'openai', model: 'gpt-4o', chunkSize: 200, contextCarry: 0 },
    { provider: 'openai', model: 'gpt-4o', chunkSize: 300, contextCarry: 0 },
    { provider: 'openai', model: 'gpt-4o', chunkSize: 300, contextCarry: 3 },
    { provider: 'openai', model: 'gpt-4o', chunkSize: 500, contextCarry: 0 },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', chunkSize: 200, contextCarry: 0 },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', chunkSize: 300, contextCarry: 0 },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', chunkSize: 300, contextCarry: 3 },
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', chunkSize: 500, contextCarry: 0 },
  ];

  const results = [];
  for (const config of configs) {
    try {
      const result = await testConfig(words, config);
      results.push(result);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ label: `${config.provider}/${config.model} chunk=${config.chunkSize}`, error: err.message });
    }
  }

  // Write comparison output
  const outputPath = absolutePath.replace(/\.\w+$/, '.calibration.txt');
  let output = `Segmentation Calibration Results\n`;
  output += `Source: ${filePath}\n`;
  output += `Words tested: ${words.length}\n`;
  output += `Date: ${new Date().toISOString()}\n`;
  output += `${'='.repeat(80)}\n\n`;

  for (const r of results) {
    if (r.error) {
      output += `--- ${r.label} --- FAILED: ${r.error}\n\n`;
      continue;
    }
    output += `--- ${r.label} ---\n`;
    output += `Phrases: ${r.phrases.length} (avg ${r.avgPhraseLen} words/phrase)\n`;
    output += `Cost: ~$${r.cost.toFixed(4)} (${r.calls} calls)\n\n`;

    r.phrases.forEach((phrase, i) => {
      output += `  ${String(i + 1).padStart(3)}. ${phrase}\n`;
    });
    output += '\n';
  }

  writeFileSync(outputPath, output, 'utf-8');
  console.log(`\nCalibration results written to: ${outputPath}`);
  console.log('Review the file to compare phrase segmentation quality across configurations.');
}

main().catch(err => {
  console.error('Calibration failed:', err);
  process.exit(1);
});
