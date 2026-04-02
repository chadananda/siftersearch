#!/usr/bin/env node
/**
 * Benchmark KV/prefix cache effectiveness on local vLLM.
 *
 * Tests:
 * 1. Same system prompt, different user prompts → should show prefix cache speedup
 * 2. Different system prompts → should be slow (no cache)
 * 3. Jumping window pattern → should show cache reuse
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const ENDPOINT = (process.env.LOCAL_LLM || 'http://localhost:8004/v1').replace(/\/v1$/, '') + '/v1';
const MODEL = 'Qwen/Qwen3-32B-AWQ';

async function llmCall(systemPrompt, userPrompt) {
  const start = Date.now();
  const res = await fetch(`${ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 20,
      temperature: 0.1,
      chat_template_kwargs: { enable_thinking: false }
    })
  });
  const data = await res.json();
  const ms = Date.now() - start;
  const usage = data.usage || {};
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  return { ms, prompt, cached, completion, content: data.choices?.[0]?.message?.content?.slice(0, 50) };
}

// Generate a large prefix to make cache savings measurable
function bigPrefix(size = 2000) {
  const para = 'In the name of God, the Most Gracious, the Most Merciful. This is a passage from a sacred text about divine unity and the nature of spiritual reality. ';
  return para.repeat(Math.ceil(size / para.length)).slice(0, size);
}

async function main() {
  console.log(`=== KV Cache Benchmark ===`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Model: ${MODEL}\n`);

  // Test 1: Same system prompt, different user prompts
  console.log('--- Test 1: Same prefix, different user prompts ---');
  const prefix = bigPrefix(3000);
  const results1 = [];
  for (let i = 0; i < 5; i++) {
    const r = await llmCall(prefix, `Say the number ${i + 1}.`);
    results1.push(r);
    console.log(`  Call ${i + 1}: ${r.ms}ms | prompt:${r.prompt} cached:${r.cached} | "${r.content}"`);
  }
  const cold1 = results1[0].ms;
  const warmAvg1 = Math.round(results1.slice(1).reduce((a, b) => a + b.ms, 0) / (results1.length - 1));
  console.log(`  Cold: ${cold1}ms | Warm avg: ${warmAvg1}ms | Speedup: ${(cold1 / warmAvg1).toFixed(1)}x\n`);

  // Test 2: Different system prompt each time (no caching possible)
  console.log('--- Test 2: Different prefix each time (control) ---');
  const results2 = [];
  for (let i = 0; i < 3; i++) {
    const uniquePrefix = bigPrefix(3000) + ` Unique identifier: ${Date.now()}-${i}`;
    const r = await llmCall(uniquePrefix, `Say hello ${i}.`);
    results2.push(r);
    console.log(`  Call ${i + 1}: ${r.ms}ms | prompt:${r.prompt} cached:${r.cached}`);
  }
  const avgNocache = Math.round(results2.reduce((a, b) => a + b.ms, 0) / results2.length);
  console.log(`  Avg (no cache): ${avgNocache}ms\n`);

  // Test 3: Jumping window simulation
  console.log('--- Test 3: Jumping window (20 paragraphs, disambiguate back half) ---');
  const windowParas = Array.from({ length: 20 }, (_, i) =>
    `[P${i + 1}] This is paragraph ${i + 1} of a sacred text discussing the nature of divine revelation and the station of the prophets.`
  ).join('\n');
  const windowSystem = `Document: "Test Book" by Author\nBaha'i / Core Publications\n\n<window>\n${windowParas}\n</window>`;

  const results3 = [];
  for (let i = 10; i <= 20; i++) {
    const r = await llmCall(windowSystem, `Disambiguate [P${i}]. Output key→value pairs. NONE if nothing to resolve.`);
    results3.push(r);
    console.log(`  P${i}: ${r.ms}ms | prompt:${r.prompt} cached:${r.cached} | "${r.content}"`);
  }
  const cold3 = results3[0].ms;
  const warmAvg3 = Math.round(results3.slice(1).reduce((a, b) => a + b.ms, 0) / (results3.length - 1));
  console.log(`  Cold: ${cold3}ms | Warm avg: ${warmAvg3}ms | Speedup: ${(cold3 / warmAvg3).toFixed(1)}x\n`);

  // Summary
  console.log('=== Summary ===');
  console.log(`Prefix cache speedup (same prompt): ${(cold1 / warmAvg1).toFixed(1)}x`);
  console.log(`Jumping window speedup: ${(cold3 / warmAvg3).toFixed(1)}x`);
  console.log(`Cache reported by API: ${results1.some(r => r.cached > 0) ? 'YES' : 'NO (but timing may still show benefit)'}`);

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
