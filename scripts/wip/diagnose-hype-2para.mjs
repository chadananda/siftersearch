#!/usr/bin/env node
// Test 2-paragraph context (preceding + target) vs current 5-para baseline.
// Same depth-demanding prompt, same paragraphs.

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
const TARGETS = [200, 220, 240, 248, 260];

async function callLLM(systemPrompt, userPrompt, { thinking = false, maxTokens = 600 } = {}) {
  const t0 = Date.now();
  const response = await fetch(`${LOCAL_LLM}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOCAL_LLM_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens: maxTokens,
      temperature: 0.3,
      chat_template_kwargs: { enable_thinking: thinking }
    }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return { content: data.choices?.[0]?.message?.content || '', elapsedMs: Date.now() - t0 };
}

const db = new Database(DB_PATH, { readonly: true });
const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(TARGET_DOC);
const allParas = db.prepare('SELECT paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(TARGET_DOC);
const byIndex = new Map(allParas.map(p => [p.paragraph_index, p]));

console.log(`=== 2-paragraph context test (preceding + target) ===`);
console.log(`Doc: "${doc.title}" by ${doc.author}\n`);

for (const targetIdx of TARGETS) {
  const target = byIndex.get(targetIdx);
  if (!target) continue;

  // Just 2 paragraphs: target - 1, target
  const windowParas = [];
  if (byIndex.has(targetIdx - 1)) windowParas.push(byIndex.get(targetIdx - 1));
  windowParas.push(target);
  const targetPos = windowParas.length; // target is the last one

  const systemPrompt = `You are generating hypothetical questions that capture the *doctrinal substance* of a passage from sacred or scholarly literature.

Document: "${doc.title}" by ${doc.author}
Tradition: ${doc.religion} / ${doc.collection}
${doc.description ? 'About: ' + doc.description.slice(0, 200) : ''}

You will see ${windowParas.length} paragraph${windowParas.length === 1 ? '' : 's'}. The TARGET is [P${targetPos}] (the last one). The preceding paragraph is provided ONLY to disambiguate pronouns and references in the TARGET.

<context>
${windowParas.map((p, i) => `[P${i + 1}]${i + 1 === targetPos ? ' (TARGET)' : ' (preceding context)'} ${p.text}`).join('\n\n')}
</context>`;

  const userPrompt = `Generate exactly 5 hypothetical questions for [P${targetPos}] (the TARGET paragraph), one per line, no numbering.

Cover these 5 angles:
1. Conversational — how a thoughtful friend would ask about it (8-15 words, casual register)
2. Topical concept — academic framing of the central idea (8-15 words)
3. Philosophical implication — the doctrinal stake or what follows from this teaching
4. Cross-tradition / connection — to which broader debates, traditions, or fields does this passage speak?
5. Distinctive phrase — a striking phrase from the passage someone might search literally

Use ONLY content from the TARGET paragraph (the preceding paragraph is for pronoun resolution only — do not generate questions about it).

Output 5 lines. Nothing else.`;

  console.log(`──── Para ${targetIdx} ────`);
  console.log(`TARGET: ${target.text.slice(0, 200)}...`);
  try {
    const noThink = await callLLM(systemPrompt, userPrompt, { thinking: false, maxTokens: 600 });
    console.log(`\n[/no_think, ${noThink.elapsedMs}ms]\n${noThink.content.trim()}\n`);
  } catch (err) { console.log(`failed: ${err.message}\n`); }
}

db.close();
