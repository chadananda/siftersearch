#!/usr/bin/env node
// Test: small context window (target ± 2) + single target.
// Run on multiple paragraphs (including ones with anaphora that need context)
// and compare quality vs both the broken batched path and the no-window path.

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
const TARGETS = [200, 220, 240, 248, 260];  // mix of paragraphs that had bad HyPE

async function callLLM(systemPrompt, userPrompt, { thinking = false, maxTokens = 600 } = {}) {
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
      max_tokens: maxTokens,
      temperature: 0.4,
      chat_template_kwargs: { enable_thinking: thinking }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
  }
  const data = await response.json();
  return { content: data.choices?.[0]?.message?.content || '', elapsedMs: Date.now() - t0 };
}

const db = new Database(DB_PATH, { readonly: true });
const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(TARGET_DOC);
const allParas = db.prepare('SELECT paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(TARGET_DOC);

const byIndex = new Map(allParas.map(p => [p.paragraph_index, p]));

console.log(`=== HyPE generation test: small context window + single target ===`);
console.log(`Doc: "${doc.title}" by ${doc.author}\n`);

for (const targetIdx of TARGETS) {
  const target = byIndex.get(targetIdx);
  if (!target) continue;

  // Build 5-paragraph window centered on target: [target-2..target+2]
  const windowStart = Math.max(0, targetIdx - 2);
  const windowEnd = Math.min(allParas.length - 1, targetIdx + 2);
  const windowParas = [];
  for (let i = windowStart; i <= windowEnd; i++) {
    if (byIndex.has(i)) windowParas.push(byIndex.get(i));
  }
  const targetPositionInWindow = windowParas.findIndex(p => p.paragraph_index === targetIdx) + 1; // 1-indexed

  const systemPrompt = `"${doc.title}" by ${doc.author}
${doc.religion} / ${doc.collection}${doc.description ? '\nAbout: ' + doc.description.slice(0, 200) : ''}

These ${windowParas.length} surrounding paragraphs provide context for understanding the TARGET. The TARGET is [P${targetPositionInWindow}].

<context>
${windowParas.map((p, i) => `[P${i + 1}]${i + 1 === targetPositionInWindow ? ' (TARGET)' : ''} ${p.text}`).join('\n\n')}
</context>`;

  const userPrompt = `Generate exactly 5 search queries that someone would type to find the TARGET paragraph [P${targetPositionInWindow}].

Rules:
- Use ONLY content from the TARGET paragraph. Surrounding paragraphs are CONTEXT for understanding pronouns and references — they should NOT be the subject of your queries.
- Each query is a natural phrase or question, 5-15 words.
- Cover different ways someone might search: a literal phrase from the passage, the central concept, a paraphrase, an associated theme, and a question form.
- One query per line. No numbering, no preamble, no quotes.`;

  console.log(`─────────── Para ${targetIdx} ───────────`);
  console.log(`TARGET TEXT: ${target.text.slice(0, 200)}...`);
  try {
    const noThink = await callLLM(systemPrompt, userPrompt, { thinking: false });
    console.log(`(${noThink.elapsedMs}ms, /no_think)\n${noThink.content.trim()}\n`);
  } catch (err) {
    console.log(`/no_think FAILED: ${err.message}\n`);
  }
  try {
    const thinkOn = await callLLM(systemPrompt, userPrompt, { thinking: true, maxTokens: 4000 });
    const clean = thinkOn.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    console.log(`(${thinkOn.elapsedMs}ms, THINKING ON)\n${clean}\n`);
  } catch (err) {
    console.log(`THINKING FAILED: ${err.message}\n`);
  }
}

db.close();
