#!/usr/bin/env node
// Batch dialog generator — runs seed questions through Jafar with a simulated
// user agent (GPT-4o), then saves each finished conversation to the
// published_conversations table via POST /api/v1/admin/conversations/save.
//
// Usage:
//   node scripts/gen-dialogs.mjs                          # seeds 20-29
//   node scripts/gen-dialogs.mjs --seeds 30-39            # specific range
//   node scripts/gen-dialogs.mjs --seeds 20,22,25,30      # specific indices
//   node scripts/gen-dialogs.mjs --rounds 7               # 7 rounds (default 5)

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const JAFAR_API = process.env.JAFAR_API_URL || 'https://api.siftersearch.com/api/chat/stream';
const SAVE_API = 'https://api.siftersearch.com/api/v1/admin/conversations/save';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const TMP_DIR = join(ROOT, 'tmp/dialogs');
mkdirSync(TMP_DIR, { recursive: true });

if (!ADMIN_KEY) { console.error('INTERNAL_API_KEY not set'); process.exit(1); }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const seeds = JSON.parse(readFileSync(join(ROOT, 'scripts/seed-questions.json'), 'utf-8'));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let seedIndices = [];
let TARGET_ROUNDS = 5;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seeds' && args[i + 1]) {
    const spec = args[++i];
    if (spec.includes('-')) {
      const [a, b] = spec.split('-').map(Number);
      for (let j = a; j <= b; j++) seedIndices.push(j);
    } else {
      seedIndices = spec.split(',').map(Number);
    }
  } else if (args[i] === '--rounds' && args[i + 1]) {
    TARGET_ROUNDS = parseInt(args[++i]);
  }
}
if (!seedIndices.length) {
  // Default: seeds 20-29
  for (let i = 20; i <= 29; i++) seedIndices.push(i);
}

// ── User-simulator prompt ─────────────────────────────────────────────────────
const USER_SYSTEM = `You are a thoughtful, intellectually curious person engaged in a focused conversation with Jafar, a scripture-first research assistant. The topic was set by a specific seed question — stay close to it.

Rules:
- Ask for specific textual evidence: "Where does Bahá'u'lláh actually say that?", "Can you quote from the Aqdas directly?"
- Push back when Jafar is vague or paraphrases: "That sounds like interpretation — what does the text say?"
- Dig one level deeper into what Jafar just said — don't jump to a new sub-topic
- Stay on the stated topic of the seed question; resist broadening to "all world religions" unless the seed itself asked for comparison
- 1-2 sentences maximum. Real conversation, not an essay.

OUTPUT: Just your next question or pushback. No preamble, no "Great point!"`;

async function simulateUser(history, seedQuestion, round) {
  const transcript = history.map(h =>
    `${h.role === 'user' ? 'USER' : 'JAFAR'}: ${h.content.slice(0, 600)}`
  ).join('\n\n');

  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: USER_SYSTEM },
      { role: 'user', content: `Seed topic: "${seedQuestion.slice(0, 200)}"\n\nThis is round ${round}. Conversation so far:\n\n${transcript}\n\nWrite your next follow-up question or pushback (1-3 sentences).` }
    ],
    temperature: 0.75,
    max_tokens: 180
  });
  return r.choices[0].message.content.trim();
}

// ── Jafar caller (with retry) ─────────────────────────────────────────────────
async function callJafar(history, attempt = 1) {
  let res;
  try {
    res = await fetch(JAFAR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.map(h => ({ role: h.role, content: h.content })) })
    });
  } catch (err) {
    if (attempt < 4) {
      console.error(`  jafar fetch err (attempt ${attempt}): ${err.message} — retry 10s`);
      await new Promise(r => setTimeout(r, 10000));
      return callJafar(history, attempt + 1);
    }
    throw err;
  }
  if (!res.ok) {
    if (attempt < 4 && [502, 503, 504].includes(res.status)) {
      console.error(`  jafar HTTP ${res.status} (attempt ${attempt}) — retry 10s`);
      await new Promise(r => setTimeout(r, 10000));
      return callJafar(history, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  const decoder = new TextDecoder();
  let buf = '', text = '', finalReply = null;
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'text' && typeof evt.content === 'string') text += evt.content;
        else if (evt.type === 'chunk' && typeof evt.text === 'string' && !text) text += evt.text;
        else if (evt.type === 'done' && typeof evt.final_reply === 'string' && evt.final_reply.length > 50) finalReply = evt.final_reply;
      } catch { /* skip */ }
    }
  }
  const reply = (finalReply || text).trim();
  if (reply.length < 200 && attempt < 4) {
    console.error(`  jafar reply short (${reply.length}c, attempt ${attempt}) — retry 10s`);
    await new Promise(r => setTimeout(r, 10000));
    return callJafar(history, attempt + 1);
  }
  return reply;
}

const STYLE_SUFFIX = ' Watercolor — indigo and cobalt washes with warm gold accents, loose brushwork, paper texture visible, soft bleeding edges. Wide cinematic 16:9 composition. No text, no labels, no people.';

// ── Generate conversation assessment ─────────────────────────────────────────
async function assessConversation(messages) {
  const transcript = messages.map((m, _i) => {
    const role = m.role === 'user' ? 'USER' : 'JAFAR';
    return `${role}: ${m.content.slice(0, 600)}`;
  }).join('\n\n');

  const sys = `You are an expert judge evaluating the educational quality of a theological research conversation.

Score each dimension 1-5 and provide specific justification:

1. citation_quality: Does Jafar quote primary sources (scripture, authorized texts) directly with links? 5=abundant direct quotes with links, 1=pure paraphrase/general claims
2. intellectual_depth: Does the conversation probe beneath the surface? 5=reaches genuine doctrinal complexity, 1=stays at introductory level
3. interfaith_scope: Does Jafar draw meaningful comparisons across traditions? 5=substantive cross-tradition analysis, 1=single-tradition only
4. educational_value: Would a thoughtful reader learn something specific? 5=highly informative with specific insight, 1=generic or obvious
5. conversation_authenticity: Does the user ask follow-ups that probe Jafar's actual answers? 5=tight reactive questioning, 1=unrelated follow-ups

Output ONLY JSON:
{"citation_quality":N,"intellectual_depth":N,"interfaith_scope":N,"educational_value":N,"conversation_authenticity":N,"overall":N,"summary":"one sentence verdict","strengths":"two specific strengths","weaknesses":"one specific weakness"}

"overall" is your holistic score (not the average). Be strict — 4+ means genuinely excellent.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: sys }, { role: 'user', content: transcript }],
    temperature: 0.2,
    max_tokens: 400,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(resp.choices[0].message.content);
}

// ── Save to DB ────────────────────────────────────────────────────────────────
async function saveDialog(messages, seedIdx) {
  const seed = seeds[seedIdx];
  const hero_prompt = `An evocative scene representing the spiritual question: "${seed.question.slice(0, 120)}".${STYLE_SUFFIX}`;

  // Generate assessment before saving
  console.log(`  assessing conversation quality...`);
  let assessment = null;
  try {
    assessment = await assessConversation(messages);
    console.log(`  assessment: overall=${assessment.overall} citations=${assessment.citation_quality} depth=${assessment.intellectual_depth}`);
  } catch (err) {
    console.error(`  assessment failed: ${err.message}`);
  }

  const res = await fetch(SAVE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY
    },
    body: JSON.stringify({
      messages,
      status: 'published',
      score: 0,
      hero_prompt,
      assessment
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Save failed ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// ── Generate one dialog ───────────────────────────────────────────────────────
async function generateDialog(seedIdx) {
  const seed = seeds[seedIdx];
  if (!seed) { console.log(`Seed ${seedIdx} not found`); return; }

  const histPath = join(TMP_DIR, `seed-${String(seedIdx).padStart(3, '0')}-history.json`);
  const donePath = join(TMP_DIR, `seed-${String(seedIdx).padStart(3, '0')}-done.json`);

  if (existsSync(donePath)) {
    console.log(`[${seedIdx}] already done — skipping`);
    return;
  }

  let history = [];
  if (existsSync(histPath)) {
    history = JSON.parse(readFileSync(histPath, 'utf-8'));
    console.log(`[${seedIdx}] resuming with ${history.length} messages`);
  } else {
    history.push({ role: 'user', content: seed.question });
    console.log(`\n[${seedIdx}] starting: ${seed.question.slice(0, 100)}…`);
  }

  const startRound = history.filter(m => m.role === 'user').length;
  for (let round = startRound; round <= TARGET_ROUNDS; round++) {
    // Add user turn for rounds > 1 (round 1 user turn already in history)
    if (round > 1 && history[history.length - 1]?.role === 'assistant') {
      console.log(`  [R${round}] generating user follow-up...`);
      const userMsg = await simulateUser(history, seed.question, round);
      history.push({ role: 'user', content: userMsg });
      writeFileSync(histPath, JSON.stringify(history, null, 2));
      console.log(`    user: ${userMsg.slice(0, 100)}`);
    }
    // Jafar turn
    if (history[history.length - 1]?.role === 'user') {
      console.log(`  [R${round}] calling Jafar...`);
      const t0 = Date.now();
      const reply = await callJafar(history);
      console.log(`    jafar (${reply.length}c, ${((Date.now()-t0)/1000).toFixed(1)}s): ${reply.slice(0, 100)}…`);
      history.push({ role: 'assistant', content: reply });
      writeFileSync(histPath, JSON.stringify(history, null, 2));
    }
  }

  // Save to DB
  console.log(`  saving to DB...`);
  try {
    const result = await saveDialog(history, seedIdx);
    console.log(`  ✓ saved: slug=${result.slug}, url=${result.url || 'n/a'}`);
    writeFileSync(donePath, JSON.stringify({ seedIdx, slug: result.slug, savedAt: new Date().toISOString() }, null, 2));
    return result.slug;
  } catch (err) {
    console.error(`  ✗ save failed: ${err.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`Generating dialogs for seeds: ${seedIndices.join(', ')} (${TARGET_ROUNDS} rounds each)`);
console.log(`Jafar API: ${JAFAR_API}\n`);

const results = [];
for (const idx of seedIndices) {
  const slug = await generateDialog(idx);
  results.push({ idx, slug });
  // Brief pause between dialogs to avoid hammering the API
  if (slug) await new Promise(r => setTimeout(r, 3000));
}

console.log('\n=== Results ===');
results.forEach(({ idx, slug }) => {
  console.log(`  [${idx}] ${slug ? '✓ ' + slug : '✗ failed'}`);
});
