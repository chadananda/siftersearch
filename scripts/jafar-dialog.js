#!/usr/bin/env node
// Talk to Jafar (SifterSearch's chat) for one round.
// Reuses the actual SYSTEM_PROMPT, TOOLS, and executeSearch from
// api/routes/chat.js — so this is the *real* Jafar, not a simulation.
//
// Usage:
//   node scripts/jafar-dialog.js --conv path/to/transcript.json --user "..."
//
// Maintains a JSON transcript at the given path. Each invocation:
//   1. loads existing messages
//   2. appends the new user message
//   3. calls OpenAI with system prompt + tools, looping over tool calls
//   4. captures Jafar's final assistant response
//   5. writes the updated transcript back
//   6. prints Jafar's reply text to stdout

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const OpenAI = (await import('openai')).default;
const { SYSTEM_PROMPT, TOOLS, executeSearch } = await import('../api/routes/chat.js');

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const convPath = arg('--conv');
const userMsg = arg('--user');
if (!convPath || !userMsg) {
  console.error('Usage: --conv <path.json> --user "<message>"');
  process.exit(1);
}

// Local copy of executeLibraryOverview if not exported (small helper)
async function executeLibraryOverview() {
  const { queryAll, queryOne } = await import('../api/lib/db.js');
  const totals = await queryOne('SELECT (SELECT COUNT(*) FROM docs WHERE deleted_at IS NULL) AS docs, (SELECT COUNT(*) FROM content WHERE deleted_at IS NULL) AS passages');
  const religions = await queryAll('SELECT religion, COUNT(*) AS docs FROM docs WHERE deleted_at IS NULL GROUP BY religion ORDER BY docs DESC');
  return { totals, religions };
}

async function executeTool(name, args) {
  if (name === 'search') return executeSearch(args);
  if (name === 'library_overview') return executeLibraryOverview();
  return { error: `Unknown tool: ${name}` };
}

// Load or initialize transcript
let transcript = { messages: [], rounds: [] };
if (existsSync(convPath)) {
  transcript = JSON.parse(readFileSync(convPath, 'utf-8'));
}

// Build messages array for the API call
const messages = [
  { role: 'system', content: SYSTEM_PROMPT },
  ...transcript.messages,
  { role: 'user', content: userMsg }
];

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.CHAT_LLM_MODEL || 'gpt-4o';

const toolCallsLog = [];
let assistantText = '';
let safety = 0;

while (safety++ < 8) {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
    temperature: 0.7
  });

  const msg = completion.choices[0].message;
  messages.push(msg);

  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    assistantText = msg.content || '';
    break;
  }

  for (const tc of msg.tool_calls) {
    let parsed;
    try { parsed = JSON.parse(tc.function.arguments); } catch { parsed = {}; }
    const result = await executeTool(tc.function.name, parsed);
    toolCallsLog.push({ name: tc.function.name, args: parsed,
      result_summary: summarizeToolResult(tc.function.name, result) });
    messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 12000) });
  }
}

function summarizeToolResult(name, result) {
  if (result.error) return `error: ${result.error}`;
  if (name === 'search') {
    if (result.passages) return `${result.passages.length} passages`;
    if (result.documents) return `${result.documents.length} documents`;
    if (typeof result.count === 'number') return `count=${result.count}`;
    if (result.document) return `read doc ${result.document.id}`;
    return 'ok';
  }
  if (name === 'library_overview') return `${result?.totals?.docs ?? '?'} docs, ${result?.totals?.passages ?? '?'} passages`;
  return 'ok';
}

// Persist
transcript.messages.push({ role: 'user', content: userMsg });
transcript.messages.push({ role: 'assistant', content: assistantText });
transcript.rounds.push({
  user: userMsg,
  assistant: assistantText,
  toolCalls: toolCallsLog,
  timestamp: new Date().toISOString()
});
writeFileSync(convPath, JSON.stringify(transcript, null, 2));

// Print Jafar's response so the caller can read + decide the next turn
console.log('\n━━━━━━━━━━ JAFAR ━━━━━━━━━━');
console.log(assistantText);
console.log('\n--- tool calls ---');
for (const t of toolCallsLog) console.log(`${t.name}(${JSON.stringify(t.args)}) → ${t.result_summary}`);
console.log(`\nrounds so far: ${transcript.rounds.length}`);
