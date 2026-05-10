// Drive a single 5-round dialog 051 conversation through the production
// chat API with retry-on-failure. Saves the history JSON as it goes so we
// don't lose progress on transient API issues. Then runs the judge,
// publishes the markdown, and prints the score.
//
// Usage: node scripts/wip/regen-051.mjs

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const API = 'https://api.siftersearch.com/api/chat/stream';
const HISTORY_PATH = join(ROOT, 'tmp/wip/051-history.json');
const SEED = JSON.parse(readFileSync(join(ROOT, 'scripts/seed-questions.json'), 'utf-8'))[50];
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const USER_PROMPT = `You are a thoughtful Bahá'í friend with primary-text knowledge, sitting with another friend asking hard questions. Your job: push back on Jafar like a real friend would.

VOICE:
- Most replies 1-2 sentences. Real conversation, not essay.
- Casual, direct: "wait — where does he actually say that?", "that sounds like later interpretation, is it really in the Iqán?", "show me the passage".
- When pushing back, name the specific work (the Iqán, Some Answered Questions, Aqdas, Hidden Words) and ask for the actual quote.
- Occasional 3-4 sentence challenges for substantive points. NEVER a paragraph.

GOAL across the conversation: drive Jafar toward primary scripture (Bahá'u'lláh, the Báb, 'Abdu'l-Bahá), refuse paraphrase from training memory, push for actual textual citations, catch any secular-humanist drift.

Output: just your reply, no preamble.`;

async function userTurn(history, round) {
  const transcript = history.map(h => `${h.role === 'user' ? 'YOU' : 'JAFAR'}: ${h.content}`).join('\n\n');
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: USER_PROMPT },
      { role: 'user', content: `Seed question: "${SEED.question}"\n\nThis is round ${round} of your conversation. Recent transcript:\n\n${transcript}\n\nWrite your next message.` }
    ],
    temperature: 0.7,
    max_tokens: 200
  });
  return r.choices[0].message.content.trim();
}

async function jafarTurn(history, attempt = 1) {
  const body = JSON.stringify({ messages: history.map(h => ({ role: h.role, content: h.content })) });
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
  } catch (err) {
    if (attempt < 4) {
      console.error(`  jafar fetch failed (attempt ${attempt}): ${err.message} — retrying in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    throw err;
  }
  if (!res.ok) {
    if (attempt < 4 && (res.status === 502 || res.status === 503 || res.status === 504)) {
      console.error(`  jafar HTTP ${res.status} (attempt ${attempt}) — retrying in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let chunkCount = 0;
  let textCount = 0;
  let sawComplete = false;
  try {
    for await (const c of res.body) {
      buf += decoder.decode(c, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === 'text' && evt.content) { text += evt.content; textCount++; }
          else if (evt.type === 'chunk' && evt.text) { chunkCount++; }
          else if (evt.type === 'complete') { sawComplete = true; }
        } catch { /* skip */ }
      }
    }
  } catch (streamErr) {
    if (attempt < 4) {
      console.error(`  jafar stream error (attempt ${attempt}): ${streamErr.message} — retrying in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    throw streamErr;
  }
  // If the stream ended cleanly but text is too short (common on mid-stream
  // server restart), retry. Real replies are 200+ chars.
  if (text.length < 200 && attempt < 4) {
    console.error(`  jafar reply too short (${text.length}c, complete=${sawComplete}, attempt ${attempt}) — retrying in 8s`);
    await new Promise(r => setTimeout(r, 8000));
    return jafarTurn(history, attempt + 1);
  }
  return text.trim();
}

// Load existing history if any (resumption support)
let history = [];
if (existsSync(HISTORY_PATH)) {
  history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  console.log(`Resuming with ${history.length} messages already saved.`);
} else {
  history.push({ role: 'user', content: SEED.question });
  console.log(`Starting from seed: ${SEED.question.slice(0, 100)}…`);
}

const TARGET_ROUNDS = 5;
const startRound = Math.ceil(history.filter(h => h.role === 'user').length);

for (let round = startRound; round <= TARGET_ROUNDS; round++) {
  // Add user turn (already there for round 1)
  if (round > 1 && history[history.length - 1].role === 'assistant') {
    console.log(`\n[R${round}] generating user pushback...`);
    const userMsg = await userTurn(history, round);
    history.push({ role: 'user', content: userMsg });
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`  user (${userMsg.length}c): ${userMsg.slice(0, 120)}${userMsg.length > 120 ? '…' : ''}`);
  }
  // Jafar turn
  if (history[history.length - 1].role === 'user') {
    console.log(`[R${round}] calling Jafar...`);
    const t0 = Date.now();
    const jafarMsg = await jafarTurn(history);
    const t = ((Date.now() - t0) / 1000).toFixed(1);
    history.push({ role: 'assistant', content: jafarMsg });
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`  jafar (${jafarMsg.length}c, ${t}s): ${jafarMsg.slice(0, 120)}${jafarMsg.length > 120 ? '…' : ''}`);
  }
}

console.log(`\nConversation complete. ${history.length} messages saved to ${HISTORY_PATH}`);
console.log(`Run the judge + publish next.`);
