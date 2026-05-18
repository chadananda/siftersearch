#!/usr/bin/env node
// Direct conversation with Jafar — no simulated USER agent.
// I write the questions; Jafar responds via production API.
// At the end, save the conversation via the admin save endpoint.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const JAFAR_API = 'https://api.siftersearch.com/api/chat/stream';
const SAVE_API = 'https://api.siftersearch.com/api/v1/admin/conversations/save';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;

async function askJafar(history) {
  const body = JSON.stringify({ messages: history.map(h => ({ role: h.role, content: h.content })) });
  const res = await fetch(JAFAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  let gotChunk = false;

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'chunk' && typeof evt.text === 'string') {
          if (!gotChunk) { text = ''; gotChunk = true; }
          text += evt.text;
        } else if (evt.type === 'text' && typeof evt.content === 'string' && !gotChunk) {
          text += evt.content;
        }
      } catch { /* skip malformed */ }
    }
  }
  return text.trim();
}

async function saveConversation(history, slug) {
  const res = await fetch(SAVE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({
      messages: history,
      slug,
      status: 'published'
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Save failed: ${JSON.stringify(json)}`);
  return json;
}

// ── The conversation ──────────────────────────────────────────────────────────

const history = [];

const questions = [
  `What do the world's scriptures say about how believers should relate to people outside their faith — atheists, people of other religions, skeptics? I'm curious what guidance the texts themselves give.`,

  `There's something I find genuinely moving in passages like "love your neighbor" or the Buddhist emphasis on universal compassion — these seem to reach past any boundary of belief. Are there passages in the Gospels or the Qur'an that speak to that same spirit when it comes to non-believers?`,

  `I'd love to understand the range here. Do any traditions draw a distinction between daily life — how you actually treat your neighbor — and beliefs about the afterlife or salvation? Is there scriptural teaching that addresses that difference?`,

  `What does Buddhism bring to this question? And I've always been curious about the Jewish concept of the Noahide laws — what does that framework say about the relationship between Jews and non-Jews?`,

  `When I look across all these traditions, I keep wondering: what is it exactly that the texts invite us to judge or distance ourselves from — is it the person, their specific actions, or simply their different beliefs? Does scripture draw that distinction anywhere?`,
];

console.log('=== Conversation with Jafar: How Should We Treat Non-Believers? ===\n');

for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  history.push({ role: 'user', content: q });
  console.log(`\n--- Round ${i + 1} ---`);
  console.log(`USER: ${q}\n`);

  const reply = await askJafar(history);
  history.push({ role: 'assistant', content: reply });
  console.log(`JAFAR: ${reply}\n`);
}

// Save the conversation
console.log('\n=== Saving conversation... ===');
const result = await saveConversation(history, '018-how-should-we-treat-non-believers');
console.log('Saved:', result);
