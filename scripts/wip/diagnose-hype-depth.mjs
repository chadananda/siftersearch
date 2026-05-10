#!/usr/bin/env node
// Test depth-demanding HyPE prompt vs current prompt.
// Goal: questions that capture central doctrinal claim + philosophical
// implication + the challenge raised, not shallow search-phrases.

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
const TARGETS = [200, 240, 248, 260];

async function callLLM(systemPrompt, userPrompt, { thinking = false, maxTokens = 1500 } = {}) {
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

console.log(`=== Depth-demanding HyPE prompt test ===`);
console.log(`Doc: "${doc.title}" by ${doc.author} — ${doc.religion}\n`);

for (const targetIdx of TARGETS) {
  const target = byIndex.get(targetIdx);
  if (!target) continue;

  // Wider context window: target ± 4 (so 9 paragraphs total) — gives the
  // LLM enough to grasp the rhetorical movement around the target
  const windowStart = Math.max(0, targetIdx - 4);
  const windowEnd = Math.min(allParas.length - 1, targetIdx + 4);
  const windowParas = [];
  for (let i = windowStart; i <= windowEnd; i++) {
    if (byIndex.has(i)) windowParas.push(byIndex.get(i));
  }
  const targetPos = windowParas.findIndex(p => p.paragraph_index === targetIdx) + 1;

  const systemPrompt = `You are generating hypothetical questions that capture the *doctrinal substance* of a passage from sacred or scholarly literature.

Document: "${doc.title}" by ${doc.author}
Tradition: ${doc.religion} / ${doc.collection}
${doc.description ? 'About: ' + doc.description.slice(0, 250) : ''}

You will see ${windowParas.length} paragraphs of CONTEXT. The TARGET paragraph is [P${targetPos}]. Use the surrounding paragraphs ONLY to disambiguate pronouns and references in the TARGET — do not generate questions about them.

<context>
${windowParas.map((p, i) => `[P${i + 1}]${i + 1 === targetPos ? ' (TARGET)' : ''} ${p.text}`).join('\n\n')}
</context>`;

  const userPrompt = `Generate exactly 5 hypothetical questions for [P${targetPos}] (the TARGET paragraph), one per line, no numbering.

The 5 questions must cover ALL of these angles:

1. **Literal/lookup** — a phrase or distinctive vocabulary from the passage someone might search for verbatim.
2. **Central claim** — the core doctrinal/philosophical thesis the passage advances. State it as a proposition or "what does X teach about Y?"
3. **Implication / consequence** — what follows if this teaching is true? What practice, attitude, or worldview does it require?
4. **Challenge / opposition** — what intellectual position, common assumption, or rival view does this passage push back against? (Even if not named, infer it.)
5. **Connection / scope** — to which other concepts, traditions, debates, or fields does this passage speak? What broader conversation does it enter?

Each question 8-20 words. Specific. The deeper questions should engage the actual philosophical or doctrinal stake — not generic religious vocabulary.

Examples of GOOD vs BAD on a passage about "love or hate blocks truth":
- BAD: "How to detach from love and hate for spiritual growth" (shallow self-help framing)
- GOOD: "Does the Iqán teach that emotional bias is an epistemological barrier to truth?"
- GOOD: "How does Bahá'u'lláh's account of truth-seeking challenge rationalist claims to neutral inquiry?"

Output 5 lines. Nothing else.`;

  console.log(`──── Para ${targetIdx} ────`);
  console.log(`TARGET: ${target.text.slice(0, 200)}...`);
  try {
    const noThink = await callLLM(systemPrompt, userPrompt, { thinking: false, maxTokens: 600 });
    console.log(`\n[/no_think, ${noThink.elapsedMs}ms]\n${noThink.content.trim()}`);
  } catch (err) { console.log(`/no_think failed: ${err.message}`); }
  try {
    const thinkOn = await callLLM(systemPrompt, userPrompt, { thinking: true, maxTokens: 4000 });
    const clean = thinkOn.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    console.log(`\n[THINKING ON, ${thinkOn.elapsedMs}ms]\n${clean}\n`);
  } catch (err) { console.log(`thinking failed: ${err.message}\n`); }
}

db.close();
