#!/usr/bin/env node
// Spot-test HyPE generation across Sonnet 4.6 and Gemini 2.5 Pro on the
// same 5 Iqán paragraphs we've been measuring. Same depth-demanding prompt
// (5-register mix), same 5-paragraph context window (target ± 2). Side by
// side outputs let us judge which model produces more accurate + nuanced
// hypothetical questions for Bahá'í doctrinal text.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'sifter.db');
const TARGET_DOC = 8300;
const TARGETS = [200, 220, 240, 248, 260];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callSonnet(systemPrompt, userPrompt) {
  const t0 = Date.now();
  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });
  return { content: resp.content[0]?.text || '', elapsedMs: Date.now() - t0, usage: resp.usage };
}

async function callGemini(systemPrompt, userPrompt) {
  const t0 = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 2000 } },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    })
  });
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
  const data = await resp.json();
  const cand = data.candidates?.[0];
  const content = cand?.content?.parts?.map(p => p.text).join('\n') || '';
  return {
    content,
    elapsedMs: Date.now() - t0,
    usage: data.usageMetadata,
    finishReason: cand?.finishReason,
    safetyRatings: cand?.safetyRatings,
    thoughtsTokens: data.usageMetadata?.thoughtsTokenCount || 0
  };
}

function buildPrompts(doc, windowParas, targetPos) {
  const systemPrompt = `You are generating hypothetical questions that capture the *doctrinal substance* of a passage from sacred or scholarly literature.

Document: "${doc.title}" by ${doc.author}
Tradition: ${doc.religion} / ${doc.collection}
${doc.description ? 'About: ' + doc.description.slice(0, 200) : ''}

You will see ${windowParas.length} paragraphs. The TARGET is [P${targetPos}]. Surrounding paragraphs are CONTEXT (for resolving pronouns/references in the TARGET) — do NOT generate questions about them.

<context>
${windowParas.map((p, i) => `[P${i + 1}]${i + 1 === targetPos ? ' (TARGET)' : ''} ${p.text}`).join('\n\n')}
</context>`;

  const userPrompt = `For [P${targetPos}] (the TARGET paragraph), produce TWO things:

PART 1 — A single-sentence DOCTRINAL THESIS stating what this paragraph actually teaches as a proposition (not a question). Specific to this paragraph's actual claim — not a generic restatement. 25-50 words.

PART 2 — Exactly 5 hypothetical questions covering these 5 registers (one each):
  1. Conversational — how a thoughtful friend would ask, casual register, 8-15 words
  2. Topical concept — academic framing of the central idea, 8-15 words
  3. Philosophical implication — the doctrinal stake or what follows from this teaching
  4. Cross-tradition / connection — broader debates, traditions, or fields this passage speaks to
  5. Distinctive phrase — a striking phrase from the passage someone might search literally

Use ONLY content from the TARGET paragraph. Surrounding paragraphs are for pronoun resolution only.

Output format (exactly):
THESIS: <thesis sentence>
Q1: <conversational>
Q2: <topical>
Q3: <philosophical>
Q4: <cross-tradition>
Q5: <distinctive phrase>

Nothing else.`;

  return { systemPrompt, userPrompt };
}

const db = new Database(DB_PATH, { readonly: true });
const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(TARGET_DOC);
const allParas = db.prepare('SELECT paragraph_index, text FROM content WHERE doc_id = ? AND deleted_at IS NULL ORDER BY paragraph_index').all(TARGET_DOC);
const byIndex = new Map(allParas.map(p => [p.paragraph_index, p]));

console.log(`=== Spot test: Sonnet 4.6 vs Gemini 2.5 Pro on Iqán doctrinal paragraphs ===`);
console.log(`Doc: "${doc.title}" by ${doc.author}\n`);

let totalSonnetIn = 0, totalSonnetOut = 0;
let totalGeminiIn = 0, totalGeminiOut = 0, geminiThoughts = 0;

for (const targetIdx of TARGETS) {
  const target = byIndex.get(targetIdx);
  if (!target) continue;

  // 5-paragraph context: target ± 2
  const windowParas = [];
  for (let i = targetIdx - 2; i <= targetIdx + 2; i++) {
    if (byIndex.has(i)) windowParas.push(byIndex.get(i));
  }
  const targetPos = windowParas.findIndex(p => p.paragraph_index === targetIdx) + 1;

  const { systemPrompt, userPrompt } = buildPrompts(doc, windowParas, targetPos);

  console.log(`──── Para ${targetIdx} ────`);
  console.log(`TARGET: ${target.text.slice(0, 200)}...\n`);

  // Sonnet only — Gemini Pro mandatory thinking pushes it out of budget
  const sonnetResult = await callSonnet(systemPrompt, userPrompt).catch(e => ({ error: e.message }));
  const geminiResult = { error: 'skipped — not in budget' };

  if (sonnetResult.error) {
    console.log(`SONNET 4.6 ERROR: ${sonnetResult.error}`);
  } else {
    console.log(`[SONNET 4.6, ${sonnetResult.elapsedMs}ms, ${sonnetResult.usage?.input_tokens || '?'}→${sonnetResult.usage?.output_tokens || '?'} tokens]`);
    console.log(sonnetResult.content.trim());
    totalSonnetIn += sonnetResult.usage?.input_tokens || 0;
    totalSonnetOut += sonnetResult.usage?.output_tokens || 0;
  }
  console.log();

  if (geminiResult.error) {
    console.log(`GEMINI 2.5 PRO ERROR: ${geminiResult.error}`);
  } else {
    const inTok = geminiResult.usage?.promptTokenCount || 0;
    const outTok = geminiResult.usage?.candidatesTokenCount || 0;
    const thoughts = geminiResult.thoughtsTokens || 0;
    console.log(`[GEMINI 2.5 PRO, ${geminiResult.elapsedMs}ms, ${inTok}→${outTok}+${thoughts}thinking tokens, finish=${geminiResult.finishReason || '?'}]`);
    if (!geminiResult.content) console.log(`  (empty content; safety=${JSON.stringify(geminiResult.safetyRatings)})`);
    console.log(geminiResult.content.trim());
    totalGeminiIn += inTok;
    totalGeminiOut += outTok;
    geminiThoughts += thoughts;
  }
  console.log();
}

console.log('─'.repeat(60));
console.log(`Token totals across ${TARGETS.length} paragraphs:`);
console.log(`Sonnet 4.6:    in=${totalSonnetIn}  out=${totalSonnetOut}`);
console.log(`Gemini 2.5 Pro: in=${totalGeminiIn}  out=${totalGeminiOut}`);

// Project to 67K paragraphs (full P1-7)
const SCALE = 67000 / TARGETS.length;
const sonnetCost = (totalSonnetIn * SCALE / 1e6) * 1.50 + (totalSonnetOut * SCALE / 1e6) * 7.50;
// Gemini batch pricing (50% off): $0.625/M input, $5/M output. Thinking tokens billed as output.
const geminiCost = (totalGeminiIn * SCALE / 1e6) * 0.625 + ((totalGeminiOut + geminiThoughts) * SCALE / 1e6) * 5.00;
console.log(`\nProjected cost for 67K paragraphs (batch API, 50% off):`);
console.log(`  Sonnet 4.6 batch:     ~$${sonnetCost.toFixed(0)}`);
console.log(`  Gemini 2.5 Pro batch: ~$${geminiCost.toFixed(0)}`);

db.close();
