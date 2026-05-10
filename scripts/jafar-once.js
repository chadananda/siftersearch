#!/usr/bin/env node
// One-shot Jafar call. Reads a JSON conversation history from stdin (an array
// of {role, content} objects) and prints Jafar's next reply text to stdout.
// Used for conversation drivers that maintain history externally — e.g. when
// Claude Code itself is acting as the user agent + judge.
//
// Usage:
//   echo '[{"role":"user","content":"What is the Tablet of Wisdom?"}]' | node scripts/jafar-once.js
//
// The reply text is on stdout; tool calls + diagnostics go to stderr.

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const API = process.env.JAFAR_API_URL || 'https://api.siftersearch.com/api/chat/stream';

const stdin = await new Promise((resolve, reject) => {
  let buf = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', d => buf += d);
  process.stdin.on('end', () => resolve(buf));
  process.stdin.on('error', reject);
});

const messages = JSON.parse(stdin.trim());
if (!Array.isArray(messages)) { console.error('input must be a JSON array of {role, content}'); process.exit(1); }

const res = await fetch(API, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages })
});
if (!res.ok) {
  const err = await res.text().catch(() => '');
  console.error(`HTTP ${res.status}: ${err.slice(0, 400)}`);
  process.exit(2);
}

const decoder = new TextDecoder('utf-8');
let buffer = '';
let text = '';
const tools = [];

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
      if (evt.type === 'chunk' && typeof evt.text === 'string') text += evt.text;
      else if (evt.type === 'tool_use' || evt.type === 'tool_call' || evt.type === 'tool') {
        tools.push(evt.tools || evt.name || evt.tool || JSON.stringify(evt).slice(0, 80));
      } else if (evt.type === 'error') { console.error(`stream error: ${evt.message}`); process.exit(3); }
    } catch { /* skip malformed sse lines */ }
  }
}

if (tools.length) console.error(`tools: ${JSON.stringify(tools)}`);
process.stdout.write(text);
