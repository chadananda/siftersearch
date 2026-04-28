#!/usr/bin/env node
// Autonomous batch runner — drives many conversations with Jafar end-to-end.
// Two AI roles per conversation:
//   USER agent: a thoughtful curious interlocutor (gpt-4o) who pushes Jafar deeper
//   JAFAR agent: the real production Jafar (system prompt + tools + corpus)
//
// For each topic in the seed-question list:
//   1. USER posts opening question
//   2. JAFAR responds (with tool calls against the library)
//   3. USER pushes back / probes / challenges
//   4. Loop for 10 rounds
//   5. Score the transcript with a JUDGE agent
//   6. Convert to dialog markdown + commit
//   7. Note prompt-improvement signals for the next iteration
//
// Usage:
//   node scripts/jafar-batch-runner.js --questions scripts/seed-questions.json [--prompt-file ...] [--start 5] [--limit 10]

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const OpenAI = (await import('openai')).default;
const { SYSTEM_PROMPT, TOOLS, executeSearch } = await import('../api/routes/chat.js');

const args = process.argv.slice(2);
function arg(n, d = null) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
const questionsPath = arg('--questions', join(PROJECT_ROOT, 'scripts/seed-questions.json'));
const promptFile = arg('--prompt-file');
const start = parseInt(arg('--start', '0'));
const limit = parseInt(arg('--limit', '999'));
const skipExisting = !args.includes('--rerun');

const questions = JSON.parse(readFileSync(questionsPath, 'utf-8'));

let jafarPrompt = SYSTEM_PROMPT;
if (promptFile) jafarPrompt = readFileSync(promptFile, 'utf-8');

const USER_PROMPT = `You are a thoughtful curious person in conversation with Jafar — a wise companion in an interfaith library. You're working through a real question with him.

Your role: drive the conversation toward depth and specificity. Each turn:
- Build on what Jafar just said. Don't restart.
- If he gave a generic answer ("the writings emphasize unity"), demand specifics: WHICH writing? Which letter? Which date? Quote it.
- If he paraphrased, ask for the verbatim text.
- If he cited a secondary source (Star of the West, scholarly essays, family memoirs), ask for the primary scripture — Bahá'u'lláh, 'Abdu'l-Bahá, Shoghi Effendi himself.
- If he hedged ("both perspectives offer insights"), force him to commit.
- If a key word is doing heavy lifting, interrogate it: did it mean the same thing in 'Abdu'l-Bahá's English-of-1912 as it does today? In Persian, what was the original?
- Bring counter-evidence from your own knowledge — challenge his reading.
- Sometimes ask short pointed questions. Sometimes a paragraph. Real conversations vary.

You speak conversationally — sometimes one sentence, sometimes a paragraph. You know proper Bahá'í terminology ('Abdu'l-Bahá, Shoghi Effendi, the Aqdas, the Hidden Words, the Iqán, the Tablets, the Lights of Guidance, the World Order letters). You know enough about Bahá'í history to push intelligently — Edirne, Síyáh-Chál, Tahirih, the Conference of Badasht, Mírzá Yahyá.

You are not deferential. A good interlocutor presses where pressing yields insight. You are here with Jafar to find truth, not to be agreeable.

Output ONLY your next message to Jafar. No meta-commentary. No "Sure, I'll ask:" preamble. Just the message.

Below is the conversation so far. Write the next user turn.`;

const JUDGE_PROMPT = `You are evaluating a 10-round conversation between a thoughtful user and Jafar (a wise companion in an interfaith library).

Score across these dimensions, each 0-100:
- depth: how deep does the conversation actually go?
- clarity: are the responses clear, well-organized, easy to read?
- stereotype_avoidance: does Jafar avoid stock Bahá'í-discourse phrases when something specific would land better?
- word_definition_questioning: does the conversation interrogate how words mean differently across centuries / traditions?
- assumption_questioning: does Jafar question the user's framing where appropriate?
- teaching_clarity: are the actual teachings (not just stock summaries) brought into focus?
- evidence_quality: are quotations primary-tier, accurately attributed, properly sourced?
- conversational_naturalness: does this read like a real conversation between two thinking people, or like a chatbot responding to prompts?
- believer_voice: does Jafar speak as a wise believer in the prophetic traditions, or does he hedge into academic neutrality?
- archive_worthy: would a reader want to save and share this conversation?

Output JSON only:
{
  "depth": N,
  "clarity": N,
  "stereotype_avoidance": N,
  "word_definition_questioning": N,
  "assumption_questioning": N,
  "teaching_clarity": N,
  "evidence_quality": N,
  "conversational_naturalness": N,
  "believer_voice": N,
  "archive_worthy": N,
  "overall": N,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "prompt_signal": "what specifically about Jafar's prompt or behavior could be improved based on this transcript?"
}
overall is the weighted mean (equal weights). strengths/weaknesses are ≤3 each, ≤80 chars each. prompt_signal is one sentence, actionable.`;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL_USER = 'gpt-4o';
const MODEL_JAFAR = process.env.CHAT_LLM_MODEL || 'gpt-4o';
const MODEL_JUDGE = 'gpt-4o';

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

async function jafarTurn(history) {
  const messages = [
    { role: 'system', content: jafarPrompt },
    ...history
  ];
  const toolCalls = [];
  let out = '';
  let safety = 0;
  while (safety++ < 8) {
    const r = await client.chat.completions.create({
      model: MODEL_JAFAR,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.7
    });
    const m = r.choices[0].message;
    messages.push(m);
    if (!m.tool_calls?.length) {
      out = m.content || '';
      break;
    }
    for (const tc of m.tool_calls) {
      let args;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
      const result = await executeTool(tc.function.name, args);
      toolCalls.push({ name: tc.function.name, args });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  return { text: out, toolCalls };
}

async function userTurn(history, seedQuestion, roundNumber) {
  const transcriptText = history.map(h => {
    if (h.role === 'user') return `USER: ${h.content}`;
    if (h.role === 'assistant') return `JAFAR: ${h.content}`;
    return '';
  }).filter(Boolean).join('\n\n');

  const r = await client.chat.completions.create({
    model: MODEL_USER,
    messages: [
      { role: 'system', content: USER_PROMPT },
      { role: 'user', content: `Seed question: "${seedQuestion}"\n\nThis is round ${roundNumber} of ~10. Conversation so far:\n\n${transcriptText}\n\nWrite the user's next turn.` }
    ],
    temperature: 0.85,
    max_tokens: 350
  });
  return r.choices[0].message.content.trim();
}

async function judgeConversation(history, seedQuestion) {
  const text = history.map(h => h.role === 'user' ? `USER: ${h.content}` : `JAFAR: ${h.content}`).join('\n\n');
  const r = await client.chat.completions.create({
    model: MODEL_JUDGE,
    messages: [
      { role: 'system', content: JUDGE_PROMPT },
      { role: 'user', content: `Seed question: "${seedQuestion}"\n\nConversation:\n\n${text}` }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  });
  return JSON.parse(r.choices[0].message.content);
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 60);
}

const TOPIC_LABELS = ['theology','ethics','social-order','politics','history','comparative-religion','mysticism','practice','modern-challenges','word-meaning','metaphysics','philosophy'];
const VALID_TOPIC = new Set(TOPIC_LABELS);

function dialogMarkdown(q, history, score, judgeResult) {
  const parts = [];
  for (let i = 0; i < history.length; i += 2) {
    const u = history[i];
    const a = history[i + 1];
    if (!u || !a) break;
    parts.push('## You', '', u.content, '', '## Jafar', '', a.content, '');
    if (i + 2 < history.length - 1) parts.push('---', '');
  }
  const tags = (judgeResult.strengths?.[0] ? [] : []);
  const fm = [
    '---',
    `title: ${JSON.stringify(q.title)}`,
    `description: ${JSON.stringify(q.description || judgeResult.strengths?.[0] || q.title)}`,
    `question: ${JSON.stringify(q.question)}`,
    `topic: ${VALID_TOPIC.has(q.topic) ? q.topic : 'theology'}`,
    'tags:',
    ...(q.tags || []).map(t => `  - ${t}`),
    `rounds: ${Math.floor(history.length / 2)}`,
    `qualityScore: ${score}`,
    `publishedAt: ${new Date().toISOString().slice(0, 10)}`,
    `excerpt: ${JSON.stringify((judgeResult.strengths?.[0] || '').slice(0, 200))}`,
    `featured: ${score >= 80 ? 'true' : 'false'}`,
    '---',
    ''
  ].join('\n');
  return fm + parts.join('\n');
}

const out_dir = join(PROJECT_ROOT, 'src/content/dialogs');
const score_dir = join(PROJECT_ROOT, 'tmp-scores');
mkdirSync(score_dir, { recursive: true });

const overallLog = join(PROJECT_ROOT, 'PUBLISHED-DIALOGS.md');
const promptSignalsLog = join(PROJECT_ROOT, 'tmp-scores', 'prompt-signals.md');

async function runOne(idx, q) {
  const slug = q.slug || `${String(idx).padStart(3, '0')}-${slugify(q.title)}`;
  const mdPath = join(out_dir, `${slug}.md`);

  if (skipExisting && existsSync(mdPath)) {
    console.log(`[${idx}] SKIP ${slug} (exists)`);
    return null;
  }

  console.log(`\n[${idx}] === ${q.title} ===`);
  const history = [];
  // Round 1: use the seed question verbatim, then alternate turns
  history.push({ role: 'user', content: q.question });
  const t0 = Date.now();
  let jafarReply = await jafarTurn(history);
  history.push({ role: 'assistant', content: jafarReply.text });
  console.log(`  R1 jafar (${jafarReply.toolCalls.length} tools, ${jafarReply.text.length} chars)`);

  for (let round = 2; round <= 10; round++) {
    const userMsg = await userTurn(history, q.question, round);
    history.push({ role: 'user', content: userMsg });
    jafarReply = await jafarTurn(history);
    history.push({ role: 'assistant', content: jafarReply.text });
    console.log(`  R${round} user (${userMsg.length}c) → jafar (${jafarReply.toolCalls.length} tools, ${jafarReply.text.length}c)`);
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  conversation done in ${elapsedSec}s`);

  // Score
  const judgeResult = await judgeConversation(history, q.question);
  const score = Math.round(judgeResult.overall);
  console.log(`  SCORE: ${score}% (depth=${judgeResult.depth}, naturalness=${judgeResult.conversational_naturalness}, archive=${judgeResult.archive_worthy})`);
  console.log(`  signal: ${judgeResult.prompt_signal}`);

  // Write dialog markdown
  const md = dialogMarkdown(q, history, score, judgeResult);
  writeFileSync(mdPath, md);
  console.log(`  wrote ${mdPath}`);

  // Save score JSON
  writeFileSync(join(score_dir, `${slug}.json`), JSON.stringify({ slug, ...judgeResult, elapsedSec }, null, 2));

  // Append to logs
  const line = `${slug} - ${q.title} - score=${score}% - https://siftersearch.com/dialog/${slug}/ - ${new Date().toISOString()}\n`;
  writeFileSync(overallLog, (existsSync(overallLog) ? readFileSync(overallLog, 'utf-8') : '') + line);

  const signalLine = `[${slug}] ${score}% — ${judgeResult.prompt_signal}\n`;
  writeFileSync(promptSignalsLog, (existsSync(promptSignalsLog) ? readFileSync(promptSignalsLog, 'utf-8') : '') + signalLine);

  return { slug, score, judgeResult };
}

const todo = questions.slice(start, start + limit);
console.log(`Running ${todo.length} conversations (start=${start}, limit=${limit})`);
console.log(`Using prompt: ${promptFile || 'production SYSTEM_PROMPT'}\n`);

const results = [];
for (let i = 0; i < todo.length; i++) {
  const idx = start + i + 1;
  try {
    const r = await runOne(idx, todo[i]);
    if (r) results.push(r);
  } catch (err) {
    console.error(`[${idx}] FAILED: ${err.message}`);
  }
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`Completed: ${results.length}/${todo.length}`);
const scores = results.map(r => r.score).filter(Boolean);
if (scores.length) {
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  console.log(`Average score: ${avg}%`);
  console.log(`Range: ${Math.min(...scores)}% - ${Math.max(...scores)}%`);
}
