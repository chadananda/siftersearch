// Replay the 9-round dialog 051 conversation against the new pipeline.
// Uses tmp/wip/r051.json as the spine — same user pushbacks each round.
// Regenerates each Jafar reply through /api/v1/chat with conversation_id
// continuity, saves the new history to tmp/wip/051-regen.json.
//
// Usage: node scripts/wip/regen-051-replay.mjs

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const SPINE_PATH = join(ROOT, 'tmp/wip/r051.json');
const OUT_PATH = join(ROOT, 'tmp/wip/051-regen.json');
const API = 'https://api.siftersearch.com/api/v1/chat';
const KEY = process.env.PUBLIC_SIFTER_API_KEY;

const spine = JSON.parse(readFileSync(SPINE_PATH, 'utf-8'));
const userMessages = spine.filter(m => m.role === 'user').map(m => m.content);
console.log(`Spine: ${userMessages.length} user pushbacks loaded.`);

const REFUSAL_HINTS = [
  "couldn't locate text on this in the corpus",
  "I'm experiencing a technical issue"
];

let conversationId = null;

async function jafarReply(history, attempt = 1) {
  const body = JSON.stringify({
    messages: history.map(h => ({ role: h.role, content: h.content })),
    tenant: 'siftersearch',
    ...(conversationId ? { conversation_id: conversationId } : {})
  });

  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': KEY,
        Accept: 'text/event-stream'
      },
      body
    });
  } catch (err) {
    if (attempt < 5) {
      console.error(`    fetch failed (attempt ${attempt}): ${err.message} — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarReply(history, attempt + 1);
    }
    console.error(`    fetch failed after 5 attempts: returning empty`);
    return '';
  }
  if (!res.ok) {
    if (attempt < 5 && [502, 503, 504].includes(res.status)) {
      console.error(`    HTTP ${res.status} (attempt ${attempt}) — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarReply(history, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let finalReply = null;
  let citations = [];
  try {
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
          if (evt.type === 'session') conversationId = evt.conversation_id || conversationId;
          else if (evt.type === 'text' && typeof evt.content === 'string') text += evt.content;
          else if (evt.type === 'chunk' && typeof evt.text === 'string' && !text) text += evt.text;
          else if (evt.type === 'citations' && Array.isArray(evt.citations)) citations = evt.citations;
          else if (evt.type === 'complete' && Array.isArray(evt.citations) && !citations.length) citations = evt.citations;
          // Prefer the post-processed reply from the done event when available
          // (it has restating sentences stripped). Falls back to streamed text
          // if the stream cuts before the done event arrives.
          else if (evt.type === 'done' && typeof evt.final_reply === 'string' && evt.final_reply.length > 0) finalReply = evt.final_reply;
        } catch { /* skip */ }
      }
    }
  } catch (streamErr) {
    if (attempt < 5) {
      console.error(`    stream error (attempt ${attempt}): ${streamErr.message} — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarReply(history, attempt + 1);
    }
    console.error(`    stream error after 5 attempts: returning what we got (${text.length}c)`);
    return text.trim();
  }

  const reply = finalReply || text;
  const looksLikeRefusal = REFUSAL_HINTS.some(h => reply.includes(h));
  if ((reply.length < 200 || looksLikeRefusal) && attempt < 4) {
    console.error(`    short/refusal (${reply.length}c, attempt ${attempt}) — retry in 8s`);
    await new Promise(r => setTimeout(r, 8000));
    return jafarReply(history, attempt + 1);
  }
  return reply.trim();
}

// Resume support — if 051-regen.json already has some rounds, continue from there.
let history = [];
if (existsSync(OUT_PATH)) {
  history = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
  const existingUserCount = history.filter(m => m.role === 'user').length;
  console.log(`Resuming with ${existingUserCount}/${userMessages.length} rounds done.`);
}

for (let i = 0; i < userMessages.length; i++) {
  // If round i's user message is already in history, skip the user-add
  const haveUser = history.filter(m => m.role === 'user').length > i;
  const haveAssistant = history.length > 0 && history[history.length - 1].role === 'assistant' && history.filter(m => m.role === 'assistant').length > i;
  if (haveUser && haveAssistant) {
    console.log(`[R${i + 1}] already done, skipping`);
    continue;
  }
  if (!haveUser) {
    history.push({ role: 'user', content: userMessages[i] });
    writeFileSync(OUT_PATH, JSON.stringify(history, null, 2));
    console.log(`\n[R${i + 1}] user (${userMessages[i].length}c): ${userMessages[i].slice(0, 100)}...`);
  }
  console.log(`[R${i + 1}] calling Jafar...`);
  const t0 = Date.now();
  const reply = await jafarReply(history);
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  history.push({ role: 'assistant', content: reply });
  writeFileSync(OUT_PATH, JSON.stringify(history, null, 2));
  const quoteCount = (reply.match(/^>\s/gm) || []).length;
  console.log(`  jafar (${reply.length}c, ${quoteCount} block-quotes, ${t}s): ${reply.slice(0, 120)}${reply.length > 120 ? '...' : ''}`);
}

console.log(`\nAll ${userMessages.length} rounds complete. History saved to ${OUT_PATH}`);
console.log(`Conversation ID: ${conversationId || '(none — anonymous)'}`);
