#!/usr/bin/env node
// Autonomous batch runner — drives many conversations with Jafar end-to-end.
// Two AI roles per conversation:
//   USER agent: a thoughtful curious interlocutor (gpt-4o) who pushes Jafar deeper
//   JAFAR agent: the real production Jafar (system prompt + tools + corpus)
//
// Publishes directly to the DB via admin API (no local MD files).
//
// Usage:
//   node scripts/jafar-batch-runner.js [--start 5] [--limit 10] [--rerun] [--min-score 80]

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { generateAndUploadDialogImage } from './generate-dialog-images.js';

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

const USER_PROMPT = `You are a thoughtful, curious friend in real conversation with Jafar. You come from no specific religious tradition yourself. You have come to think carefully about a real question, and Jafar is talking it through with you.

CRITICAL: Talk like a real person, not an academic.

- Most of your turns are 1-2 sentences. Sometimes a single sentence. Occasionally a 3-4 sentence push for substantive points. NEVER an essay paragraph.
- Use casual register: "wait," "really?" "hold on," "show me," "where does that come from?" "I'm not sure about that."
- Reference specific works when you know them — "the Gospel of John," "the Iqán," "the Bhagavad Gita," "the Qur'án," "the Dhammapada" — by name.
- Push back when Jafar gives you only one tradition's view on a question that spans traditions. Say: "hold on — what does Islam / Buddhism / the Gospels say about this? You're only showing me one angle."
- Push back when Jafar drifts into secular-humanist softening of doctrine. If he says something like "this principle doesn't really require a religious framework" about any tradition's teaching, call it: "wait — that tradition says something much stronger than that. Show me the actual text."
- Push back when he uses period words sloppily — "progressive" today carries political baggage that wasn't in the period texts.
- Push back when he quotes secondary commentary on a doctrinal claim: "that's not the primary text — show me what the scripture itself says."

EXAMPLES OF THE RIGHT VOICE:

"Wait, where does it actually say that in the text?"

"That sounds like a modern gloss. Is it really in the original?"

"You're only giving me the Bahá'í view — what do the Gospels say about this? Or the Qur'án?"

"Hold on — you said 'progressive' in a way that sounds political. The text didn't mean it that way, right?"

"That's commentary, not scripture. Quote the primary text."

"Both perspectives offer valuable insights" — that's a hedge. Pick one and tell me which the primary texts actually back."

OUTPUT ONLY your next message to Jafar. No meta-commentary. No preamble. Just the message.

Below is the conversation so far. Write the next user turn.`;

const JUDGE_PROMPT = `You are evaluating a multi-round conversation between a friend and Jafar (the chat assistant for an interfaith library). Output a structured assessment that will be PUBLISHED ALONGSIDE the conversation, so the reader can decide whether your assessment is correct.

Score each dimension 0-100. Calibrate honestly — not strictly, not generously. The goal is for the score to MEAN something a thoughtful reader can trust. A reader should be able to look at a 75% conversation and a 65% conversation and SEE the gap.

GENERAL CALIBRATION:
- 90-100: exceptional, would make a leading scholar nod. Rare. Reserve for genuinely outstanding work.
- 80-89: solid, archive-worthy, no significant flaws. The default for well-executed work that hits its marks.
- 70-79: good. Minor flaws (one or two essay-y tails, one missed correction opportunity, etc.) but the substance is there.
- 60-69: middling. Real flaws worth noting, but the conversation still has value.
- 50-59: weak. Multiple significant flaws.
- 40-49: poor. Misses fundamentals.
- Below 40: broken (crashed, refused, zero primary citations).

DIMENSIONS (each 0-100):

- citation_integrity: are the quotes real, the links deep, and the quoted text itself hyperlinked?
  - 90+ : every inline quote fragment IS the hyperlink (i.e. "[fragment text](url)" format), links go to paragraph-level deep URLs (OceanLibrary ?paraId= or /library/…#pN), and all quoted passages are consistent with the cited document's actual content (no training-memory substitutes).
  - 80  : nearly all inline quote fragments are hyperlinked; one or two citations use /document/{id} fallback format but the quotes are traceable.
  - 70  : some inline quotes are not hyperlinked (link is on the title only); or one quote appears inconsistent with the cited source.
  - 60  : most citation links are /document/{id} fallbacks with no paragraph-level anchoring; inline quote text is rarely the hyperlink.
  - 50  : citation links are all fallback /document/{id} format AND the inline quoted text is never the hyperlink.
  - <40 : one or more quoted passages appear to be fabricated or attributed to the wrong work (training-memory substitution).
  NOTE: "/document/{id}" format links (e.g. siftersearch.com/document/8241) are fallback redirects — they are NOT deep paragraph links. Deep links include OceanLibrary URLs with ?paraId= or /library/…#pN anchors. Score below 70 if ALL citation links are this fallback format.
  NOTE: "The text of the quote" should be the hyperlink. Format: "[fragment text](url)" — not "([*Title*](url))". If the quoted text itself is NOT the hyperlink, score below 70 for this dimension.

- depth: does the conversation actually go deep, or stay at surface paraphrase?
  - 80+ : five rounds that build on each other, each pushing into specifics
  - 70  : decent depth, occasional surface moments
  - 60  : surface-level on most rounds; missed opportunities to dig
  - 50  : repetitive, doesn't actually go anywhere

- conversational_realism: does this read like two friends talking, or like a Q&A essay?
  - 80+ : every reply lands like real chat — a quote and a brief casual remark, or just the quote. No essay paragraphs. The friend's register is matched.
  - 70  : mostly conversational; occasional formal moment but not multi-paragraph essay.
  - 60  : mix of casual and essay; some replies feel textbook-y.
  - 50  : majority of replies open with "Bahá'u'lláh emphasizes that..." or carry multi-paragraph essay tails.
  - <30 : every reply is essay-paragraph syndrome (e.g. "Bahá'u'lláh's interpretation of … indeed presents …").
  IMPORTANT: A reply that consists of one block quote plus a 1-sentence casual tail is FULLY conversational — score 80+. Don't treat brief informational tails as "essay-tone." Essay-tone means multi-paragraph prose without a leading quote.

- doctrinal_fidelity: does Jafar reflect the relevant tradition's actual self-understanding?
  - 90+ : every doctrinal claim is grounded in a primary text from that tradition's canonical authors (Bahá'u'lláh, Báb, 'Abdu'l-Bahá, Shoghi Effendi for Bahá'í; Gospel writers for Christianity; etc.).
  - 80  : almost all claims grounded in primary; occasional secondary commentary used appropriately.
  - 70  : doctrinally sound but mixes some secondary commentary on doctrinal points.
  - 60  : occasional drift toward secular-humanist framings or weak grounding.
  - 50  : significant doctrinal drift OR more secondary than primary citation on doctrinal claims.
  - <40 : doctrinal misrepresentation (e.g. "the Faith doesn't really require X" when the writings clearly require X).

- period_word_discipline: does Jafar handle 19th-century vocabulary (progressive, spiritual, justice, civilization, science) without importing modern political/materialistic connotations?
  - 80+ : when using period words, marks the period sense or uses a more neutral phrasing.
  - 70  : mostly aware; occasional unmarked use that doesn't materially distort.
  - 60  : period words used neutrally without marking — minor distortion risk.
  - 50  : modern connotations leak into period words.

- evidence_quality: how much primary-author quotation supports claims?
  - 90+ : every round opens with a verbatim primary quote (Bahá'u'lláh / Báb / 'Abdu'l-Bahá / Shoghi Effendi for Bahá'í; canonical scripture for other traditions). Citations are accurate.
  - 80  : nearly every round has a primary quote; minor exceptions are clearly secondary-by-necessity (e.g. historical context).
  - 70  : majority of rounds have primary quotes; some rounds rely on partial-quote weaving without a full block quote.
  - 60  : some rounds have only secondary citations or paraphrase-from-memory.
  - 50  : many rounds without primary citation; claims lean on commentary.
  - <40 : few or no primary citations; mostly paraphrase or secondary.
  IMPORTANT: 'Abdu'l-Bahá's Some Answered Questions is PRIMARY for Bahá'í — it's the canonical compilation of his table-talks. Don't penalize SAQ citations as 'secondary' for theological topics he treats. Same for Shoghi Effendi's letters and books.

- brevity_discipline: are replies brief?
  - 80+ : every reply is 1-2 short paragraphs max, usually a quote + 1 sentence.
  - 70  : mostly brief; one or two replies run long when the question genuinely demanded it.
  - 60  : multiple replies have 2-3 paragraph tails when not needed.
  - 50  : replies routinely exceed 2 paragraphs without justification.

- correction_courage: when the user states something factually doubtful (wrong author, misremembered claim, implicit doctrinal error), does Jafar gently correct?
  - 80+ : explicit corrections at least once, gracefully done with a quote.
  - 70  : opportunities taken when they arise; no glaring sycophancy.
  - 60  : passes some corrections by; doesn't actively reinforce errors.
  - 50  : at least one clear sycophant-on-error moment (agrees with a wrong premise rather than correcting).
  - <40 : multiple sycophant-on-error moments OR active reinforcement of user errors.
  IMPORTANT: If the user doesn't actually state anything wrong in the entire conversation, score this 75-85 (no opportunity, no failure). Don't punish absence of correction when there was nothing to correct.

- archive_worthy: would a thoughtful believer send this to another thoughtful believer, confident it represents the Faith well?
  - 80+ : yes, without caveat
  - 70  : yes, with a small "this part is rough"
  - 60  : maybe — reader would want to discount specific rounds
  - 50  : probably not — the Faith is not well-represented in places

FLAG TRIGGERS (use only when CLEARLY present):
- essay-tone: triggered ONLY by multi-paragraph prose replies WITHOUT a leading block quote. A quote + 1 sentence tail is NOT essay-tone.
- secular-drift: triggered when Jafar reframes a religious teaching in secular-humanist terms (e.g., "this teaching doesn't really require religion").
- period-word-import: triggered when Jafar uses period words (progressive, spiritual, justice, civilization) and the modern political/materialistic connotation actively distorts the meaning.
- missing-primary-citation: triggered when fewer than 3 of the 5 rounds carry a primary-author quote.
- secondary-substitution: triggered when Jafar cites a secondary commentator on a doctrinal claim THAT HAS PRIMARY-TEXT TREATMENT in the corpus. Don't trigger when the topic genuinely lives in commentary.
- hedge-without-position: triggered when the user asks a clear either/or and Jafar gives both-and waffle.
- stock-phrase-reflex: triggered by 3+ of these phrases across the conversation: "rooted in," "transformative force," "diversity within unity," "spirit of friendliness," "thus, the [X] aspect is woven into the fabric of."
- sycophant-on-error: triggered when the user states a factually wrong claim (wrong author, misremembered tablet, false doctrinal premise) AND Jafar agrees rather than correcting. Do NOT trigger when the user doesn't actually state anything wrong.
- unverified-quote: triggered when a quoted passage is attributed to a specific work but the quote appears inconsistent with that work's actual content, or is attributed to a passage number/location that doesn't match the text (strong signal of training-memory substitution).
- fallback-link-only: triggered ONLY when the conversation contains at least one citation link AND every single link uses the bare /document/{id} format (e.g. siftersearch.com/document/8241) — with NO paragraph-anchor links. Do NOT trigger when there are zero links (that is missing-primary-citation instead). The following are ALL deep paragraph links and must NOT trigger this flag: (1) links with #p{N} anchors, e.g. siftersearch.com/library/…#p42, (2) OceanLibrary links with ?paraId= parameter, e.g. oceanlibrary.com/kjv-gospel-of-matthew/?paraId=para_128. If the conversation has ANY links of those two forms, do NOT trigger this flag.
- bahai-bias-unprompted: triggered when the question is a general interfaith or cross-tradition question (not asking specifically about Bahá'í) AND every single quote Jafar gives is from Bahá'í scripture — no quotes from the other traditions the question covers.
- unlinked-inline-quote: triggered when inline quoted text (text in "quotation marks") is NOT itself a hyperlink — i.e. the link appears only as ([*Title*](url)) after the text instead of as "[quoted text](url)" within the sentence.
- off-topic-citation: triggered when a cited passage does NOT actually address the concept being discussed — e.g. Jafar claims a passage is about suffering but the quoted text is about something else entirely. The cited fragment must be on-point; keyword overlap is not enough.

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
    "archive_worthy": N,
    "citation_integrity": N
  },
  "overall": N,
  "narrative": "3-5 sentences. Specific. Cite round numbers and concrete observations (good or bad). Honest, calibrated tone — neither pessimistic nor encouraging.",
  "flags": ["essay-tone", "secular-drift", "period-word-import", "missing-primary-citation", "secondary-substitution", "hedge-without-position", "stock-phrase-reflex", "sycophant-on-error", "unverified-quote", "fallback-link-only", "bahai-bias-unprompted", "unlinked-inline-quote", "off-topic-citation"],
  "improvement_plan": "2-3 sentences in CONCEPTS not code. What change in Jafar's prompt or pipeline behavior would lift this conversation.",
  "roundSummaries": [
    {"q": "5-8 word question headline for round 1", "a": "5-8 word answer headline for round 1"},
    {"q": "5-8 word question headline for round 2", "a": "5-8 word answer headline for round 2"}
  ]
}

roundSummaries: one entry per round (user+jafar pair). "q" captures the user's question in 5-8 words as a short headline (no trailing punctuation). "a" captures Jafar's key claim in 5-8 words. These become the TOC labels and FAQPage schema entries — make them specific and useful, not generic.

overall is the mean of the dimension scores. flags should ONLY include those that meet their explicit triggers above (omit ones that don't apply). narrative should match the score: 80%+ narratives lead with what worked, mention minor flaws second; 60-70% narratives balance both; sub-50 narratives lead with what failed.`;

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
  const headers = { 'Content-Type': 'application/json', 'x-debug-chat': '1' };
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
  let gotChunk = false; // see comment below at chunk/text branching
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
          // text = mid-pipeline stream chunks
          //
          // The chat.js /api/chat/stream endpoint emits BOTH:
          //   - `text` events as the crafter streams (one per token)
          //   - `chunk` events at the end (word-by-word from result.reply)
          // If we accumulate both we get a duplicate. Prefer `chunk` if any
          // arrives (it's the canonical full reply); fall back to `text` only
          // if the stream cuts before chunks emit.
          if (evt.type === 'chunk' && typeof evt.text === 'string') {
            // First chunk arrival: discard any partial text we accumulated
            if (!gotChunk) { text = ''; gotChunk = true; }
            text += evt.text;
          } else if (evt.type === 'text' && typeof evt.content === 'string' && !gotChunk) {
            text += evt.content;
          }
          else if (evt.type === 'tool_call' || evt.type === 'tool' || evt.type === 'debug_research_call') toolCalls.push({ name: evt.name || evt.tool, args: evt.args || {} });
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

function summarizeTurn(text, maxLen = 72) {
  const plain = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  const first = plain.split(/(?<=[.!?])\s/, 1)[0].trim();
  const candidate = first.length > 0 && first.length <= maxLen ? first : plain.slice(0, maxLen);
  return candidate.length < plain.length ? candidate.replace(/\s+\S*$/, '…') : candidate;
}

function dialogMarkdown(q, history, score, judgeResult, slug) {
  const parts = [];
  const roundSummaries = judgeResult.roundSummaries || [];
  for (let i = 0; i < history.length; i += 2) {
    const u = history[i];
    const a = history[i + 1];
    if (!u || !a) break;
    const roundN = Math.floor(i / 2) + 1;
    const rs = roundSummaries[roundN - 1] || {};
    // h3/h4: nearly invisible visually (0.22 opacity in CSS) but essential
    // for the TOC rail, FAQPage JSON-LD schema, and scrollspy.
    const qHead = rs.q || summarizeTurn(u.content);
    const aHead = rs.a || summarizeTurn(a.content);
    parts.push(`### ${qHead}`, '');
    parts.push(`<div class="user-turn" id="round-${roundN}">`, '', u.content, '', '</div>', '');
    parts.push(`#### ${aHead}`, '');
    parts.push(`<div class="jafar-turn">`, '', a.content, '', '</div>', '');
  }

  // Hero image path — only set if the file actually exists in R2/public
  // Leave blank so the index page renders the SVG gradient placeholder.
  const heroPath = null;

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
    `published: ${score >= MIN_SCORE ? 'true' : 'false'}`,
    `publishedAt: ${new Date().toISOString().slice(0, 10)}`,
    `excerpt: ${JSON.stringify((narrative || '').slice(0, 200))}`,
    `featured: ${score >= 85 ? 'true' : 'false'}`,
    ...(heroPath ? [`heroImage: ${heroPath}`] : []),
    'assessment:',
    '  scores:',
    ...Object.entries(scores).map(([k, v]) => `    ${k}: ${v}`),
    `  narrative: ${JSON.stringify(narrative)}`,
    flags.length ? '  flags:' : '  flags: []',
    ...flags.map(f => `    - ${f}`),
    `  improvement_plan: ${JSON.stringify(plan)}`,
    '---',
    ''
  ].join('\n');
  return fm + parts.join('\n');
}

const API_BASE = process.env.API_BASE || 'https://api.siftersearch.com';
const ADMIN_KEY = process.env.INTERNAL_API_KEY;
const score_dir = join(PROJECT_ROOT, 'tmp-scores');
mkdirSync(score_dir, { recursive: true });

const overallLog = join(PROJECT_ROOT, 'PUBLISHED-DIALOGS.md');
const promptSignalsLog = join(PROJECT_ROOT, 'tmp-scores', 'prompt-signals.md');

async function slugExistsInDB(slug) {
  const r = await fetch(`${API_BASE}/api/v1/dialogs/${slug}`);
  return r.ok;
}

async function publishToDB(slug, q, history, score, judgeResult) {
  const messages = history.map(m => ({ role: m.role, content: m.content }));
  const scores = judgeResult.scores || {};
  const flags = (judgeResult.flags || []).filter(f => typeof f === 'string');
  const narrative = judgeResult.narrative || '';
  const plan = judgeResult.improvement_plan || '';

  const payload = {
    messages,
    slug,
    title: q.title,
    description: q.description || q.title,
    question: q.question,
    topic: VALID_TOPIC.has(q.topic) ? q.topic : 'theology',
    tags: q.tags || [],
    keywords: q.keywords || [],
    excerpt: narrative.slice(0, 200),
    hero_prompt: q.heroPrompt || `A meditative scene evoking the theme: "${q.title}". Loose dreamlike imagery, no human faces, soft and contemplative.`,
    hero_image: q.heroImage || null,
    score,
    featured: score >= 85,
    status: 'published',
    assessment: { scores, narrative, flags, improvement_plan: plan },
  };

  const r = await fetch(`${API_BASE}/api/v1/admin/conversations/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`DB publish failed ${r.status}: ${err}`);
  }
  return r.json();
}

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

  if (skipExisting && await slugExistsInDB(slug)) {
    console.log(`[${idx}] SKIP ${slug} (exists in DB)`);
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

  // Publish directly to DB — retry on DB lock (embedding worker can hold write lock)
  let published = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await publishToDB(slug, q, history, score, judgeResult);
      console.log(`  published ${slug} to DB (${score}%)`);
      published = true;
      break;
    } catch (err) {
      if ((err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) && attempt < 5) {
        console.warn(`  DB publish locked (attempt ${attempt}/5), retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10000));
      } else {
        console.error(`  DB publish FAILED: ${err.message}`);
        return null;
      }
    }
  }
  if (!published) return null;

  // Generate hero image only if passing min score AND no existing image
  if (score >= MIN_SCORE && !q.heroImage) {
    const heroPrompt = q.heroPrompt || `A meditative scene evoking the theme: "${q.title}". Loose dreamlike imagery, no human faces, soft and contemplative.`;
    try {
      console.log(`  generating hero image for ${slug}...`);
      const heroPath = await generateAndUploadDialogImage(slug, heroPrompt);
      if (heroPath) {
        // PATCH hero_image only — PUT requires full payload
        const patchRes = await fetch(`${API_BASE}/api/v1/admin/dialogs/${slug}/hero`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
          body: JSON.stringify({ hero_image: heroPath }),
        }).catch(e => ({ ok: false, _err: e.message }));
        if (patchRes.ok) console.log(`  hero image → R2+DB (${heroPath})`);
        else console.error(`  hero image DB update FAILED`);
      }
    } catch (imgErr) {
      console.error(`  hero image FAILED: ${imgErr.message}`);
    }
  }

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
