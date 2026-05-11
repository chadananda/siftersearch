#!/usr/bin/env node
// Debug mode chat with Jafar — emits all SSE debug events so we can see
// exactly what research is retrieved and what the crafter receives.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const CHAT_API = 'https://api.siftersearch.com/api/chat/stream';

async function chatDebug(messages) {
  const res = await fetch(CHAT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Chat': '1' },
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  const debugEvents = [];

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
        // 'chunk' is the final re-emit from the route after pipeline completes;
        // 'text' is the streaming crafter output. Use only 'chunk' to avoid doubles.
        if (evt.type === 'chunk') text += evt.text || '';
        else if (evt.type !== 'chunk') {
          debugEvents.push(evt);
        }
      } catch { /* skip malformed */ }
    }
  }
  return { text: text.trim(), debugEvents };
}

// ── Test questions ────────────────────────────────────────────────────────────
const questions = [
  process.argv[2] || 'What do the world\'s scriptures say about how believers should relate to people outside their faith?'
];

const history = [];
for (const q of questions) {
  history.push({ role: 'user', content: q });
  console.log(`\n${'='.repeat(70)}`);
  console.log(`USER: ${q}\n`);

  const { text, debugEvents } = await chatDebug(history);

  console.log('── DEBUG EVENTS ──');
  for (const evt of debugEvents) {
    if (evt.type === 'debug_intent') {
      console.log(`  [intent] ${JSON.stringify(evt.intent)} | entities: ${JSON.stringify(evt.entities)}`);
    } else if (evt.type === 'debug_research') {
      console.log(`  [research] ${evt.retrieved_count} quotes retrieved:`);
      for (const q of evt.quotes) {
        const langTag = q.source_lang ? ` lang=${q.source_lang}` : '';
        const translated = q.translation ? ` [TRANSLATED: "${q.translation.slice(0, 60)}"]` : '';
        console.log(`    via=${q.via} religion=${q.religion} tier=${q.authority_tier}${langTag} author="${q.source_author}"`);
        console.log(`      "${q.text.slice(0, 80)}"${translated}`);
        console.log(`      url: ${q.citation_url || 'NONE'}`);
      }
    } else if (evt.type === 'stage') {
      console.log(`  [stage] ${evt.stage}`);
    } else if (evt.type === 'debug_research_call') {
      console.log(`  [call] ${evt.name} ${JSON.stringify(evt.args || {}).slice(0, 100)}`);
    } else {
      console.log(`  [${evt.type}] ${JSON.stringify(evt).slice(0, 120)}`);
    }
  }

  console.log(`\n── JAFAR REPLY ──`);
  console.log(text);
  history.push({ role: 'assistant', content: text });
}
