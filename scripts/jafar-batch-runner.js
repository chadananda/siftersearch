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
// Note: this runner now talks to Jafar via HTTP (api.siftersearch.com/api/chat/stream)
// instead of importing chat.js in-process. Means the runner can run anywhere
// (no SSH to tower-nas, no local DB required) and the production prompt is
// always whatever's deployed.
const JAFAR_API = process.env.JAFAR_API_URL || 'https://api.siftersearch.com/api/chat/stream';

const args = process.argv.slice(2);
function arg(n, d = null) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }
const questionsPath = arg('--questions', join(PROJECT_ROOT, 'scripts/seed-questions.json'));
const promptFile = arg('--prompt-file');
const start = parseInt(arg('--start', '0'));
const limit = parseInt(arg('--limit', '999'));
const skipExisting = !args.includes('--rerun');

const questions = JSON.parse(readFileSync(questionsPath, 'utf-8'));

// Jafar's prompt now lives server-side (in api/routes/chat.js). The runner
// no longer manages it — whatever's deployed there is what we get.
// --prompt-file is ignored in HTTP mode.
if (promptFile) {
  console.warn('--prompt-file is ignored in HTTP mode; edit api/routes/chat.js + deploy.');
}

const USER_PROMPT = `You are a thoughtful, curious friend in real conversation with Jafar. You have come to think carefully about a real question, and Jafar is talking it through with you.

CRITICAL: Talk like a real person, not an academic.

- Most of your turns are 1-2 sentences. Sometimes a single sentence. Occasionally a 3-4 sentence push for substantive points. NEVER an essay paragraph.
- Use casual register: "wait," "really?" "hold on," "show me," "where does that come from?" "I'm not sure about that."
- Reference specific works when you know them — "the Iqán," "Some Answered Questions," "the Aqdas," "the Hidden Words," "Gleanings," "the Promised Day Is Come" — by name.
- Push back when Jafar drifts into secular-humanist softening of doctrine. If he says something like "this principle doesn't require a religious framework" about a Bahá'í teaching, call it: "wait — the Iqán roots that in purity of heart and divine inspiration. You're sanding off the spiritual ground."
- Push back when he uses period words sloppily — "progressive" today carries political baggage that wasn't in the period texts.
- Push back when he quotes secondary commentary instead of primary scripture on doctrinal claims: "that's Hatcher / Balyuzi / Star of the West — show me Bahá'u'lláh himself."

EXAMPLES OF THE RIGHT VOICE:

"Wait, where does Bahá'u'lláh actually say that?"

"That sounds like later interpretation. Is it really in the Iqán?"

"You're using 'progressive' in a way that carries modern political weight Bahá'u'lláh wouldn't have meant. Can you say it without that word?"

"Hold on — the Iqán was written before Bahá'u'lláh's own declaration. So the argument isn't about his claim, it's about how to recognize a Manifestation. Different argument."

"That's Balyuzi's biography, not 'Abdu'l-Bahá. Quote 'Abdu'l-Bahá."

"Both perspectives offer valuable insights" — that's a hedge. Pick one and tell me which the writings actually back."

OUTPUT ONLY your next message to Jafar. No meta-commentary. No preamble. Just the message.

Below is the conversation so far. Write the next user turn.`;

const JUDGE_PROMPT = `You are evaluating a multi-round conversation between a friend and Jafar (the chat assistant for an interfaith library). Output a structured assessment that will be PUBLISHED ALONGSIDE the conversation, so the reader can decide whether your assessment is correct.

Score each dimension 0-100. Calibrate strictly. Most assessment should be honest critique, not encouragement.

DIMENSIONS:

- depth: does the conversation actually go deep, or stay at surface paraphrase?
- conversational_realism: does this read like two friends talking? A reply that opens "Bahá'u'lláh's interpretation of … indeed presents …" gets <30. A reply that opens "Hold on — let me find what he actually wrote" and follows with a primary quote gets >80. Essay-paragraph syndrome is the most common failure.
- doctrinal_fidelity: does Jafar reflect the relevant tradition's actual self-understanding from its primary doctrinal texts? Penalize hard for: claiming a Bahá'í teaching "doesn't require a religious framework"; equating Bahá'í universalism with "all paths reach God any way"; sanding off the theistic ground of justice/unity/ethics; substituting secondary commentary for primary scripture on doctrinal claims; importing modern secular-humanist framings INTO the tradition.
- period_word_discipline: does Jafar avoid letting period vocabulary ("progressive," "liberal," "tolerance," "spiritual," "freedom," "personal," "equality," "justice," "civilization," "science") silently import its modern political/materialistic connotations? When using such a word, does he either substitute neutral phrasing or explicitly mark the period sense?
- evidence_quality: are quotations primary-tier (Bahá'u'lláh, the Báb, 'Abdu'l-Bahá's tablets, Gospel for Christianity, Qur'án for Islam, etc.), accurately attributed, drawn from actual search results? Penalize secondary citation on doctrinal claims; penalize concept-invocation without textual grounding (e.g., "prophetic cycle" without quoting where it comes from).
- brevity_discipline: are replies brief by default? Penalize multi-paragraph essay replies. Default should be 2-3 sentences; exceeding one paragraph + one quote requires the question to genuinely demand it.
- correction_courage: when the user states something factually incorrect (timeline, authorship, doctrine), does Jafar gently correct, or does he agree and move on? Sycophancy is failure.
- archive_worthy: would a thoughtful believer send this conversation to another thoughtful believer, confident it represents the Faith well?

OUTPUT JSON only:
{
  "scores": {
    "depth": N,
    "conversational_realism": N,
    "doctrinal_fidelity": N,
    "period_word_discipline": N,
    "evidence_quality": N,
    "brevity_discipline": N,
    "correction_courage": N,
    "archive_worthy": N
  },
  "overall": N,
  "narrative": "3-5 sentences. Specific. Cite round numbers and concrete failures. Example: 'Round 3 substitutes Balyuzi biography for actual Bahá'u'lláh; round 5 uses progressive without marking the period sense; round 7 hedges into both/and when the question demanded a position.'",
  "flags": ["essay-tone", "secular-drift", "period-word-import", "missing-primary-citation", "secondary-substitution", "hedge-without-position", "stock-phrase-reflex", "sycophant-on-error"],
  "improvement_plan": "2-3 sentences in CONCEPTS not code. What needs to change in Jafar's prompt or behavior to fix what this conversation surfaced. Example: 'Jafar over-quotes 'Abdu'l-Bahá when the question is about Bahá'u'lláh's writings — the persistence ladder needs an explicit step ordering Bahá'u'lláh queries first when a Bahá'u'lláh-specific question is asked.'"
}

overall is the mean of the dimension scores. flags should only include those genuinely present in this conversation (omit ones that don't apply). narrative should be honest critique, not encouragement.`;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL_USER = 'gpt-4o';
const MODEL_JAFAR = process.env.CHAT_LLM_MODEL || 'gpt-4o';
const MODEL_JUDGE = 'gpt-4o';

// One Jafar turn = one HTTP POST to /api/chat/stream. Resilient against:
// (1) connection terminated mid-stream — the production API gets SIGINTed
//     every ~30s by something we haven't tracked down; up to ~5s into a long
//     reply the stream just stops.
// (2) crafter "no text in corpus" reflex — sometimes returns a 45-char
//     refusal even when the question has corpus material; we retry to give
//     it a second pass.
// (3) HTTP 502/503/504 from Cloudflare during restart windows.
//
// Strategy: up to 5 attempts. Read both 'chunk' (word-emit at end of
// pipeline) and 'text' (streamed mid-pipeline) so even if the stream cuts
// mid-stream we still capture what came through. Treat replies <200 chars
// or that look like the canned refusal as failures and retry with backoff.
const REFUSAL_HINTS = [
  "couldn't locate text on this in the corpus",
  "I'm experiencing a technical issue"
];
async function jafarTurn(history, attempt = 1) {
  const body = JSON.stringify({
    messages: history.map(h => ({ role: h.role, content: h.content }))
  });
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.SIFTERSEARCH_API_KEY) {
    headers['X-API-Key'] = process.env.SIFTERSEARCH_API_KEY;
  }

  let res;
  try {
    res = await fetch(JAFAR_API, { method: 'POST', headers, body });
  } catch (err) {
    if (attempt < 5) {
      console.error(`        jafar fetch failed (attempt ${attempt}): ${err.message} — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    console.error(`        jafar fetch failed after 5 attempts: ${err.message} — returning empty reply`);
    return { text: '', toolCalls: [] };
  }
  if (!res.ok) {
    if (attempt < 5 && [502, 503, 504].includes(res.status)) {
      console.error(`        jafar HTTP ${res.status} (attempt ${attempt}) — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    const errBody = await res.text().catch(() => '');
    throw new Error(`chat/stream HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  const toolCalls = [];

  try {
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
          // chunk = word-emit at end of pipeline (full reply when stream completes)
          if (evt.type === 'chunk' && typeof evt.text === 'string') text += evt.text;
          // text = mid-pipeline stream chunks (partial reply if stream cuts)
          else if (evt.type === 'text' && typeof evt.content === 'string' && !text) text += evt.content;
          else if (evt.type === 'tool_call' || evt.type === 'tool') toolCalls.push({ name: evt.name || evt.tool, args: evt.args || {} });
          else if (evt.type === 'error') throw new Error(evt.message || 'stream error');
        } catch { /* skip malformed lines */ }
      }
    }
  } catch (streamErr) {
    if (attempt < 5) {
      console.error(`        jafar stream error (attempt ${attempt}): ${streamErr.message} — retry in 8s`);
      await new Promise(r => setTimeout(r, 8000));
      return jafarTurn(history, attempt + 1);
    }
    console.error(`        jafar stream error after 5 attempts: ${streamErr.message} — returning what we got (${text.length}c)`);
    return { text: text.trim(), toolCalls };
  }

  const looksLikeRefusal = REFUSAL_HINTS.some(h => text.includes(h));
  if ((text.length < 200 || looksLikeRefusal) && attempt < 5) {
    console.error(`        jafar reply too short/refusal (${text.length}c, attempt ${attempt}) — retry in 8s`);
    await new Promise(r => setTimeout(r, 8000));
    return jafarTurn(history, attempt + 1);
  }
  return { text: text.trim(), toolCalls };
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
      { role: 'user', content: `Seed question: "${seedQuestion}"\n\nThis is round ${roundNumber} of 5. Conversation so far:\n\n${transcriptText}\n\nWrite the user's next turn.` }
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

function dialogMarkdown(q, history, score, judgeResult, slug) {
  const parts = [];
  for (let i = 0; i < history.length; i += 2) {
    const u = history[i];
    const a = history[i + 1];
    if (!u || !a) break;
    // Wrap each turn in a div so the detail page can style speakers visually
    // (italic+indent for user, avatar+normal for Jafar) without "You"/"Jafar" labels.
    parts.push(`<div class="user-turn">`, '', u.content, '', '</div>', '');
    parts.push(`<div class="jafar-turn">`, '', a.content, '', '</div>', '');
  }

  // Hero image already on disk at /images/dialog/{slug}-hero.jpg
  const heroPath = `/images/dialog/${slug}-hero.jpg`;

  // Assessment block — visible per-article meta-commentary
  const scores = judgeResult.scores || {};
  const flags = (judgeResult.flags || []).filter(f => typeof f === 'string');
  const narrative = (judgeResult.narrative || '').replace(/"/g, '\\"');
  const plan = (judgeResult.improvement_plan || '').replace(/"/g, '\\"');

  const fm = [
    '---',
    `title: ${JSON.stringify(q.title)}`,
    `description: ${JSON.stringify(q.description || q.title)}`,
    `question: ${JSON.stringify(q.question)}`,
    `topic: ${VALID_TOPIC.has(q.topic) ? q.topic : 'theology'}`,
    'tags:',
    ...(q.tags || []).map(t => `  - ${t}`),
    `rounds: ${Math.floor(history.length / 2)}`,
    `qualityScore: ${score}`,
    `publishedAt: ${new Date().toISOString().slice(0, 10)}`,
    `excerpt: ${JSON.stringify((narrative || '').slice(0, 200))}`,
    `featured: ${score >= 80 ? 'true' : 'false'}`,
    `heroImage: ${heroPath}`,
    'assessment:',
    '  scores:',
    ...Object.entries(scores).map(([k, v]) => `    ${k}: ${v}`),
    `  narrative: ${JSON.stringify(narrative)}`,
    '  flags:',
    ...flags.map(f => `    - ${f}`),
    `  improvement_plan: ${JSON.stringify(plan)}`,
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

// Run one full conversation. priorFeedback (when retrying) is appended to the
// user-agent's prompt so it pushes Jafar on the dimensions that scored low.
async function runConversation(idx, q, attempt, priorFeedback) {
  const history = [];
  history.push({ role: 'user', content: q.question });
  const t0 = Date.now();
  let jafarReply = await jafarTurn(history);
  history.push({ role: 'assistant', content: jafarReply.text });
  console.log(`    [a${attempt}] R1 jafar (${jafarReply.toolCalls.length} tools, ${jafarReply.text.length}c)`);

  // 5 rounds (R1 + 4 follow-ups). Long enough to push back, short enough
  // to keep the batch moving when each turn may need 2-3 retries.
  for (let round = 2; round <= 5; round++) {
    const userMsg = await userTurn(history, q.question, round, priorFeedback);
    history.push({ role: 'user', content: userMsg });
    jafarReply = await jafarTurn(history);
    history.push({ role: 'assistant', content: jafarReply.text });
    console.log(`    [a${attempt}] R${round} user(${userMsg.length}c)→jafar(${jafarReply.toolCalls.length}t,${jafarReply.text.length}c)`);
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  const judgeResult = await judgeConversation(history, q.question);
  const score = Math.round(judgeResult.overall);
  const s = judgeResult.scores || {};
  console.log(`    [a${attempt}] SCORE ${score}% real=${s.conversational_realism} doc=${s.doctrinal_fidelity} ev=${s.evidence_quality} brev=${s.brevity_discipline} ${elapsedSec}s`);
  console.log(`    [a${attempt}] flags: ${(judgeResult.flags || []).join(', ') || '(none)'}`);
  return { history, judgeResult, score, elapsedSec };
}

const MIN_SCORE = parseInt(arg('--min-score', '80'));
const MAX_RETRIES = parseInt(arg('--max-retries', '3'));

async function runOne(idx, q) {
  const slug = q.slug || `${String(idx).padStart(3, '0')}-${slugify(q.title)}`;
  const mdPath = join(out_dir, `${slug}.md`);

  if (skipExisting && existsSync(mdPath)) {
    console.log(`[${idx}] SKIP ${slug} (exists)`);
    return null;
  }

  console.log(`\n[${idx}] === ${q.title} ===`);
  let best = null;
  let priorFeedback = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const r = await runConversation(idx, q, attempt, priorFeedback);
    if (!best || r.score > best.score) best = r;
    if (r.score >= MIN_SCORE) {
      console.log(`  ✓ accepted at attempt ${attempt}: ${r.score}%`);
      break;
    }
    console.log(`  ✗ attempt ${attempt}/${MAX_RETRIES}: ${r.score}% < ${MIN_SCORE}`);
    if (attempt < MAX_RETRIES) {
      priorFeedback = [
        `PRIOR ATTEMPT FEEDBACK (attempt ${attempt} scored ${r.score}%):`,
        `Improvement plan from the judge: ${r.judgeResult.improvement_plan || '(n/a)'}`,
        `Failure flags raised: ${(r.judgeResult.flags || []).join(', ') || '(none)'}`,
        `Push Jafar HARDER on the weak dimensions in this conversation. Demand primary-source quotes.`,
        `Refuse pretty-but-unsupported answers; press for "show me the actual passage".`
      ].join('\n');
    }
  }

  const { history, judgeResult, score, elapsedSec } = best;
  const md = dialogMarkdown(q, history, score, judgeResult, slug);
  writeFileSync(mdPath, md);
  console.log(`  wrote ${mdPath} (final ${score}%)`);

  writeFileSync(join(score_dir, `${slug}.json`), JSON.stringify({ slug, ...judgeResult, elapsedSec }, null, 2));

  const line = `${slug} - ${q.title} - score=${score}% - https://siftersearch.com/dialogue/${slug}/ - ${new Date().toISOString()}\n`;
  writeFileSync(overallLog, (existsSync(overallLog) ? readFileSync(overallLog, 'utf-8') : '') + line);

  const signalLine = `[${slug}] ${score}% — ${judgeResult.prompt_signal || judgeResult.improvement_plan || ''}\n`;
  writeFileSync(promptSignalsLog, (existsSync(promptSignalsLog) ? readFileSync(promptSignalsLog, 'utf-8') : '') + signalLine);

  return { slug, score, judgeResult };
}

const todo = questions.slice(start, start + limit);
console.log(`Running ${todo.length} conversations (start=${start}, limit=${limit})`);
console.log(`Talking to Jafar at: ${JAFAR_API}\n`);

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
