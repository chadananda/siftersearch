#!/usr/bin/env node
// Regen the Badasht dialog with a natural, non-leading seed question.
// GPT-4o plays a historically curious user who probes Jafar's actual answers.
//
// Usage: node scripts/wip/regen-badasht.mjs

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const JAFAR_API = 'https://api.siftersearch.com/api/chat/stream';
const HISTORY_PATH = join(ROOT, 'tmp/wip/badasht-history.json');
const ADMIN_KEY = process.env.INTERNAL_API_KEY;

const SEED_QUESTION = `What actually happened at Badasht when Táhirih removed her veil, and why is it considered a foundational moment in the Bahá'í tradition? What does the gesture mean?`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const USER_PROMPT = `You are a historically curious reader who just heard about Táhirih's unveiling at Badasht for the first time. You find history fascinating and want to understand what really happened — concrete events, specific reactions, the actual human drama.

VOICE:
- Conversational, genuinely curious. Short questions (1-2 sentences).
- When Jafar gives you historical facts, ask about specifics: who did what, what were the immediate reactions, what happened next.
- When Jafar cites a source, ask what it actually says.
- If Jafar seems vague about what actually happened physically in the room, push: "But what actually happened? Who was there? How did people react?"
- Be especially curious about any Islamic prophetic dimension if it comes up.

Output: just your reply, no preamble.`;

async function userTurn(history, round) {
  const transcript = history.map(h => `${h.role === 'user' ? 'YOU' : 'JAFAR'}: ${h.content}`).join('\n\n');
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: USER_PROMPT },
      { role: 'user', content: `Seed: "${SEED_QUESTION}"\n\nRound ${round}. Transcript:\n\n${transcript}\n\nYour next question:` }
    ],
    temperature: 0.7,
    max_tokens: 150
  });
  return r.choices[0].message.content.trim();
}

async function jafarTurn(history, attempt = 1) {
  const body = JSON.stringify({ messages: history.map(h => ({ role: h.role, content: h.content })) });
  let res;
  try {
    res = await fetch(JAFAR_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch (err) {
    if (attempt < 4) {
      console.error(`  jafar fetch failed (attempt ${attempt}): ${err.message} — retrying`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    throw err;
  }
  if (!res.ok) {
    if (attempt < 4 && [502, 503, 504].includes(res.status)) {
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for await (const c of res.body) {
    buf += decoder.decode(c, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === 'chunk' && evt.text) text += evt.text;
        else if (evt.type === 'text' && evt.content && !text) text += evt.content;
      } catch { /* skip */ }
    }
  }
  if (text.length < 200 && attempt < 4) {
    console.error(`  jafar too short (${text.length}c, attempt ${attempt}) — retrying`);
    await new Promise(r => setTimeout(r, 8000));
    return jafarTurn(history, attempt + 1);
  }
  return text.trim();
}

mkdirSync(join(ROOT, 'tmp/wip'), { recursive: true });

let history = [];
if (existsSync(HISTORY_PATH)) {
  history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  console.log(`Resuming with ${history.length} messages`);
} else {
  history.push({ role: 'user', content: SEED_QUESTION });
  console.log(`Starting: ${SEED_QUESTION.slice(0, 80)}…`);
}

const TARGET_ROUNDS = 5;
const startRound = Math.ceil(history.filter(h => h.role === 'user').length);

for (let round = startRound; round <= TARGET_ROUNDS; round++) {
  if (round > 1 && history[history.length - 1].role === 'assistant') {
    console.log(`\n[R${round}] user turn...`);
    const q = await userTurn(history, round);
    history.push({ role: 'user', content: q });
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`  Q: ${q.slice(0, 120)}`);
  }
  console.log(`[R${round}] jafar...`);
  const t0 = Date.now();
  const reply = await jafarTurn(history);
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  history.push({ role: 'assistant', content: reply });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`  A (${reply.length}c, ${t}s): ${reply.slice(0, 120)}…`);
}

console.log(`\nDone. Saving via admin API...`);

// Save via admin save endpoint
const saveRes = await fetch('https://api.siftersearch.com/api/v1/admin/conversations/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
  body: JSON.stringify({
    messages: history,
    slug: 'what-happened-badasht-tahirih-removed-veil',
    status: 'published'
  })
});
const saveData = await saveRes.json().catch(() => ({}));
if (!saveRes.ok) {
  console.error(`Save failed ${saveRes.status}: ${JSON.stringify(saveData).slice(0, 200)}`);
} else {
  console.log(`Saved. Now run: node scripts/assess-dialogs.mjs --slug what-happened-badasht-tahirih-removed-veil`);
  console.log(JSON.stringify(saveData, null, 2).slice(0, 400));
}
