#!/usr/bin/env node
// Test 1: send para 248 ALONE with full window context — does the model do better?
// Test 2: same paragraph, /no_think OFF (thinking enabled)
// Test 3: send paragraph 248 ALONE with NO surrounding window — pure paragraph
//
// If single-batch produces correct questions, the issue is batch confusion.
// If thinking-on produces correct questions, the issue is /no_think.
// If isolated paragraph produces correct questions, the issue is window dilution.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'sifter.db');
const LOCAL_LLM = process.env.LOCAL_LLM || 'http://boss:49804/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'Qwen/Qwen3-32B-AWQ';

const TARGET_DOC = 8300;
const TARGET_PARA = 248;

async function callLLM(systemPrompt, userPrompt, { thinking = false } = {}) {
  const t0 = Date.now();
  const response = await fetch(`${LOCAL_LLM}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: thinking ? 4000 : 500,
      temperature: 0.5,
      chat_template_kwargs: { enable_thinking: thinking }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) {
    throw new Error(`LLM call failed: ${response.status} ${await response.text().catch(() => '')}`);
  }
  const data = await response.json();
  const elapsedMs = Date.now() - t0;
  return { content: data.choices?.[0]?.message?.content || '', elapsedMs };
}

const db = new Database(DB_PATH, { readonly: true });
const doc = db.prepare('SELECT id, title, author, religion, collection, year, description FROM docs WHERE id = ?').get(TARGET_DOC);
const paragraphs = db.prepare('SELECT id, paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(TARGET_DOC);

console.log(`=== Para ${TARGET_PARA} actual content ===`);
const targetPara = paragraphs.find(p => p.paragraph_index === TARGET_PARA);
console.log(targetPara.text.slice(0, 400));
console.log();

// ---- TEST 3: ISOLATED paragraph, no window, no batch, /no_think ----
{
  const sys = `"${doc.title}" by ${doc.author}\n${doc.religion} / ${doc.collection}`;
  const user = `/no_think\nGenerate 5 search queries that someone would type to find this exact passage. One per line. No numbering. Each query 5-15 words.

Passage:
${targetPara.text}`;
  console.log(`=== TEST 3: ISOLATED paragraph, batch_size=1, /no_think ===`);
  const { content, elapsedMs } = await callLLM(sys, user, { thinking: false });
  console.log(`(${elapsedMs}ms)\n${content.slice(0, 800)}\n`);
}

// ---- TEST 2: ISOLATED paragraph, thinking ENABLED ----
{
  const sys = `"${doc.title}" by ${doc.author}\n${doc.religion} / ${doc.collection}`;
  const user = `Generate 5 search queries that someone would type to find this exact passage. One per line. No numbering. Each query 5-15 words.

Passage:
${targetPara.text}`;
  console.log(`=== TEST 2: ISOLATED paragraph, batch_size=1, THINKING ENABLED ===`);
  const { content, elapsedMs } = await callLLM(sys, user, { thinking: true });
  // Strip think block for display
  const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '[THINK STRIPPED]\n').trim();
  console.log(`(${elapsedMs}ms)\n${clean.slice(0, 1500)}\n`);
}

// ---- TEST 1: SAME WINDOW as production but only ASK FOR ONE TARGET ----
{
  const windowParas = paragraphs.slice(150, 250); // window 4
  let windowText = '';
  for (let i = 0; i < windowParas.length; i++) {
    windowText += `[P${i + 1}] ${windowParas[i].text}\n`;
  }
  const sys = `"${doc.title}" by ${doc.author}\n${doc.religion} / ${doc.collection}\n\n<window>\n${windowText}</window>`;
  const user = `/no_think\nGenerate search queries for paragraph: [P99]

Output:
[P99]
- 5 natural search queries someone would type to find THIS specific passage
- Each query specific enough that THIS paragraph would be the best result
- Max 15 words per query
- Include the specific names, concepts, and topics from THIS paragraph

Domain: ${doc.religion}.`;
  console.log(`=== TEST 1: SAME 100-paragraph window but only 1 target ([P99] = para 248) ===`);
  const { content, elapsedMs } = await callLLM(sys, user, { thinking: false });
  console.log(`(${elapsedMs}ms)\n${content.slice(0, 800)}\n`);
}

db.close();
