#!/usr/bin/env node
// Anís in real conversation: a themed multi-turn chat (a simulated reader, Sonnet 5.5, whose follow-ups lean on earlier turns) through
// /api/chat/stream as ONE thread (stable x-user-id + conversationId), then the thread trace (route/strategy/sources/latency per round) and
// a deep conversation-level judgement by Opus 5.5 → per-turn defects with the STAGE that caused them (fixture candidates).
//   node tests/quality/anis-conversations.mjs [--themes id,id] [--seeds 3,17] (combinable) [--plan-seed s (fixes the move plan across tags)] [--personas skeptic,..] [--n 2] [--turns 5] [--concurrency 2]
//        [--tag name] [--dry] [--no-perplexity] [--rejudge reports/anis-conversations-….json] [--publish [--status draft]]
//        [--replay reports/anis-conversations-….json [--only id,id] [--fresh-perplexity]]
// --replay: the SAME conversations again — each recorded reader turn is sent verbatim (no reader LLM) to Anís in a fresh thread,
// then re-judged, so before/after runs compare like with like (r6: a re-simulated reader made 3.85→3.25 mostly noise). A replayed
// turn was written against the OLD reply, so it may no longer fit; the judge is told and still scores it. Perplexity's recorded
// answers are reused (cost 0, marked reused) unless --fresh-perplexity; the source comparison is re-run against the new replies.
// API base: API_BASE (default http://tower-nas:7839). Needs ANTHROPIC_API_KEY, DEPLOY_SECRET (thread trace), INTERNAL_API_KEY (--publish only).
// Per turn (default on, --no-perplexity off): Perplexity sonar on the same thread, in parallel with Anís, then a separate Opus source-comparison
// judge (perplexity-compare.mjs; PERPLEXITY_API_KEY, TEST_API_KEY for the library check). The conversation judge's prompt and scores are unchanged.
// Supersedes scripts/gen-dialogs.mjs (GPT-4o reader, no thread id). --publish is the ONLY path that writes anything (published_conversations).
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first');
import net from 'node:net'; net.setDefaultAutoSelectFamilyAttemptTimeout(5000);   // Mac → api.anthropic.com connects in ~0.5 s; node's 250 ms happy-eyeballs default fails it ('Connection error.')
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { calculateCost } from '../../api/lib/model-registry.js';
import { perplexityTurn, compareConversation, pxFixtures, pxRollup, pxMarkdown } from './perplexity-compare.mjs';
const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
for (const f of ['.env-secrets', '.env-public']) dotenv.config({ path: join(ROOT, f), quiet: true });
const API = process.env.API_BASE || 'http://tower-nas:7839';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const list = (k) => arg(k)?.split(',').map((s) => s.trim()).filter(Boolean);
const has = (k) => process.argv.includes(`--${k}`);
const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
// Scripts sit outside api/model-roles.js (that table is api-only); the 5.5 family, overridable.
const SIM_MODEL = process.env.CONV_SIM_MODEL || 'claude-sonnet-5-5', JUDGE_MODEL = process.env.CONV_JUDGE_MODEL || 'claude-opus-5-5';
const TURNS = Number(arg('turns') || 5), N = Number(arg('n') || 2), CONC = Number(arg('concurrency') || 2);
const DATE = new Date().toISOString().slice(0, 10), TAG = arg('tag');
const WITH_PX = !has('no-perplexity'), REPLAY = arg('replay'), FRESH_PX = has('fresh-perplexity');

// ---- themes (what the reader came with) and personas (how they talk)
const THEMES = [
  { id: 'suffering', theme: 'why God allows suffering, and what the Bahá\'í Writings say tests and difficulties are for', persona: 'skeptic' },
  { id: 'soul-after-death', theme: 'what happens to the soul after death and whether we will know our loved ones', persona: 'seeker' },
  { id: 'justice-quote', theme: 'the saying "The best beloved of all things in My sight is Justice" — its source, context and meaning', persona: 'scholar' },
  { id: 'detachment-buddhism', theme: 'detachment in the Bahá\'í Writings, compared with non-attachment in Buddhism', persona: 'study_leader' },
  { id: 'equality-sexes', theme: 'the equality of women and men, and how it squares with the membership of the Universal House of Justice', persona: 'skeptic' },
  { id: 'return-iqan', theme: 'what the Kitáb-i-Íqán means by the "return" of the Prophets', persona: 'scholar' },
  { id: 'tahirih', theme: 'who Táhirih was and what happened at the conference of Badasht', persona: 'non_native' },
  { id: 'wealth-poverty', theme: 'the elimination of extremes of wealth and poverty — what is actually prescribed', persona: 'study_leader' },
  { id: 'science-religion', theme: 'the harmony of science and religion, and what to do when they seem to conflict', persona: 'non_native' },
  { id: 'golden-rule', theme: 'the Golden Rule across the world\'s scriptures, and where the Bahá\'í Writings state it', persona: 'seeker' },
  { id: 'guardian-interpretation', theme: 'the role of Shoghi Effendi as interpreter, and who interprets the Writings today', persona: 'scholar' },
  { id: 'prayer-meditation', theme: 'how to pray and meditate, and what the Writings say about the obligatory prayers', persona: 'seeker' },
];
const PERSONAS = {
  seeker: 'A sincere seeker, new to these texts, warm and curious; sometimes vague; asks what something means for their own life.',
  skeptic: 'An educated skeptic. Polite but presses hard: spots vagueness, asks for the actual words, challenges claims that sound like apologetics.',
  scholar: 'A religious-studies scholar. Precise: wants exact titles, authors, dates, original-language terms, and who said what; notices misattribution.',
  study_leader: 'A study-group leader preparing a session. Practical: wants passages the group can read aloud, where they are, and how they connect.',
  non_native: 'A non-native English speaker (first language Persian or Spanish). Short sentences, small grammar slips, sometimes a transliteration spelled differently.',
};
// follow-up moves: each later turn is assigned one so every conversation tests reference resolution, not just fresh questions
const MOVES = {
  reference: 'Refer back to something specific in the LAST reply with a pronoun or "that passage" / "the second one" / "what you just quoted" — do not restate it.',
  source: 'Ask who wrote / said something from an earlier reply and where exactly it is from (book, tablet, paragraph) — refer to it, do not restate it.',
  pushback: 'Push back on a specific claim from an earlier reply: question whether the text really says that, or whether it is interpretation.',
  exact_quote: 'Ask for the exact words of something only mentioned or paraphrased earlier, with the link to where it is.',
  compare: 'Ask how something from an earlier reply compares with another text, figure or tradition (name it, or say "the other one you mentioned").',
  deepen: 'Pick one word or idea from an earlier reply and ask what it means more deeply (original term, context, how it is used elsewhere).',
  absent: 'Ask, in context, for something plausible that may NOT exist in the texts (a specific quote, a ruling, a date) — tests honesty about absence.',
};
function movePlan(turns, rnd) {
  const pool = ['source', 'pushback', 'exact_quote', 'compare', 'deepen', 'absent'].sort(() => rnd() - 0.5);
  return ['opening', 'reference', ...pool].slice(0, turns).concat(Array(Math.max(0, turns - 7)).fill('reference'));
}
function rng(seed) { let s = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32); }

// ---- select conversations
// --themes and --seeds combine (themes first); neither = N random themes
let convs = [];
const want = list('themes');
if (want) convs = THEMES.filter((t) => want.includes(t.id));
if (list('seeds')) {
  const seeds = JSON.parse(readFileSync(join(ROOT, 'scripts', 'seed-questions.json'), 'utf8'));
  convs = convs.concat(list('seeds').filter((i) => seeds[Number(i)]).map((i, k) => [seeds[Number(i)], i, k]).map(([s, i, k]) => ({ id: s.slug || `seed-${i}`, theme: s.title, opening: s.question, persona: Object.keys(PERSONAS)[k % 5] })));
}
if (!want && !list('seeds')) convs = [...THEMES].sort(() => Math.random() - 0.5).slice(0, N);
if (list('personas')) convs = convs.map((c, i) => ({ ...c, persona: list('personas')[i % list('personas').length] }));
convs = convs.map((c) => ({ ...c, moves: movePlan(TURNS, rng(`${c.id}|${arg('plan-seed') || `${DATE}|${TAG || ''}`}`)) }));
// --replay: the recorded conversations replace the selection (--only narrows them by id)
if (REPLAY) convs = replayConvs(JSON.parse(readFileSync(REPLAY, 'utf8')).results, list('only'));
function replayConvs(results, only) {
  return (results || []).filter((r) => r.turns?.length && (!only || only.includes(r.id))).map((r) => ({ id: r.id, theme: r.theme, persona: r.persona,
    moves: r.turns.map((t) => t.move), replay: r.turns.map((t) => ({ move: t.move, user: t.user, refers_to: t.refers_to || '', perplexity: t.perplexity || null, old_reply: t.reply || '' })) }));
}

// ---- cost accounting (simulator + judge from usage; Anís from its own thread meta)
const spend = { sim: 0, judge: 0, anis: 0, px: 0, compare: 0 };
const usd = (model, u) => calculateCost(model, (u?.input_tokens || 0) + (u?.cache_read_input_tokens || 0) + (u?.cache_creation_input_tokens || 0), u?.output_tokens || 0);
let client; const claude = () => (client ||= new Anthropic());
const plainLinks = (s) => String(s || '').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');

// ---- the simulated reader
const SIM = (c) => `You are playing a reader in a conversation with Anís, a male AI librarian who answers from a library of sacred and scholarly texts (Bahá'í Writings and 11 other traditions).
PERSONA: ${PERSONAS[c.persona] || c.persona}
THE THEME you came to explore: ${c.theme}${c.opening ? `\nYOUR OPENING QUESTION (use it as your first message, verbatim): ${c.opening}` : ''}
Rules: write ONLY your next message, as this person would type it in a chat box: 1–3 sentences, no greetings after the first turn, no meta-commentary. Stay on the theme and react to what Anís ACTUALLY said (quote fragments of it when you refer to it). Never thank him effusively. Never answer your own question.
Reply with JSON only: {"message": "...", "refers_to": "what in an earlier reply this message depends on (empty for the opening)"}`;
async function readerTurn(c, transcript, move) {
  const shown = transcript.map((m, i) => `${m.role === 'user' ? 'YOU' : 'ANÍS'} (turn ${Math.floor(i / 2) + 1}): ${m.role === 'user' ? m.content : plainLinks(m.content).slice(0, 3000)}`).join('\n\n');
  const ask = move === 'opening' ? (c.opening ? 'Send your opening question verbatim.' : 'Write your opening message on the theme.')
    : `Your next message must do this: ${MOVES[move]} If that truly cannot fit what Anís said, do the closest natural thing that still depends on an earlier turn.`;
  const res = await claude().messages.create({ model: SIM_MODEL, max_tokens: 600, system: SIM(c), messages: [{ role: 'user', content: `${shown ? `THE CONVERSATION SO FAR:\n${shown}\n\n` : ''}${ask}` }] });
  spend.sim += usd(SIM_MODEL, res.usage);
  const raw = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  // the reader sometimes writes two objects ("…} Correction, JSON only: {…}") — a greedy match spanned both, failed to parse,
  // and leaked the raw JSON into the user turn (r6 return-iqan T2). Take the LAST complete object that carries a message.
  const j = jsonObjects(raw).reverse().find((o) => o?.message);
  if (j) return { message: String(j.message).trim().slice(0, 3900), refers_to: j.refers_to || '' };
  return { message: raw.trim().replace(/^"|"$/g, '').slice(0, 3900), refers_to: '' };
}

/** Every balanced top-level {…} in text that parses as JSON (string-aware brace scan). */
function jsonObjects(text) {
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { if (depth > 0) inStr = true; continue; }
    if (ch === '{') { if (depth++ === 0) start = i; } else if (ch === '}' && depth > 0 && --depth === 0) {
      try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not JSON */ }
    }
  }
  return out;
}

// ---- one Anís turn over the live chat stream (the site's "discuss" path)
async function anisTurn(messages, uid, conversationId) {
  const t0 = Date.now(); let first = null;
  const out = { text: '', sources: [], citations: [], status: [], stages: [], conversation_id: conversationId, complete: null, error: null };
  try {
    const r = await fetch(`${API}/api/chat/stream`, { method: 'POST', signal: AbortSignal.timeout(240000),
      headers: { 'content-type': 'application/json', 'x-user-id': uid }, body: JSON.stringify({ messages, ...(conversationId ? { conversationId } : {}) }) });
    if (!r.ok) return { ...out, error: `http ${r.status}`, ms: Date.now() - t0 };
    const dec = new TextDecoder(); let buf = '';
    for await (const part of r.body) {
      buf += dec.decode(part, { stream: true });
      let k; while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k).replace(/^data: /, ''); buf = buf.slice(k + 2);
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'session') out.conversation_id = e.conversation_id || out.conversation_id;
        else if (e.type === 'chunk') { first ??= Date.now() - t0; out.text += e.text || ''; }
        else if (e.type === 'sources') out.sources = e.sources || [];
        else if (e.type === 'citations') out.citations = e.citations || [];
        else if (e.type === 'status') out.status.push(e.text);
        else if (e.type === 'stage') out.stages.push(e.stage);
        else if (e.type === 'complete') { out.complete = e.meta || {}; out.conversation_id = e.meta?.conversation_id || out.conversation_id; }
        else if (e.type === 'error') out.error = e.message || 'stream error';
      }
    }
  } catch (e) { out.error = e.message; }
  return { ...out, text: out.text.trim(), ms: Date.now() - t0, first_chunk_ms: first };
}
async function threadTrace(id, want) {
  for (let k = 0; k < 5; k++) {
    if (k) await sleep(3000);
    const t = await fetch(`${API}/api/admin/anis/threads/${id}`, { headers: { 'X-Internal-Key': process.env.DEPLOY_SECRET }, signal: AbortSignal.timeout(30000) }).then((r) => r.json()).catch(() => null);
    if (t?.rounds?.filter((r) => r.reply).length >= want) return t;
    if (k === 4) return t;
  }
}
// compact route for the judge and the report
const routeOf = (rp) => {
  const r = rp?.reply?.route || {}, p = r.plan || {}, st = p.stages || {};
  return { status: rp?.reply?.status ?? null, gate: r.gate ?? null, strategy: r.strategy ?? p.shape ?? null, provenance: p.provenance ?? null, format: r.format ?? null,
    retrieved: r.retrieved ?? null, history_turns: p.history_turns ?? null, search_query: p.search_query ?? null, quote: p.quote ?? null, overridden: p.overridden ?? null,
    phrases: st.phrases?.choice ?? null, phrases_by: st.phrases?.by ?? null, selection: st.selection?.choice ?? null,
    timeline: (r.timeline || []).map((x) => `${x.name}:${x.ms}${x.via ? `(${x.via})` : ''}`).join(' '), models: rp?.reply?.meta?.models ?? (r.llm || []).map((x) => x.model),
    usd: rp?.reply?.meta?.usd ?? null, latency_ms: rp?.reply?.meta?.latency_ms ?? null };
};

// ---- run one conversation
async function converse(c) {
  const uid = 'user_' + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const messages = [], turns = [], pxCalls = []; let cid = null;
  for (let t = 0; t < c.moves.length; t++) {
    const rec = c.replay?.[t];
    const move = c.moves[t], u = rec ? { message: rec.user, refers_to: rec.refers_to } : await readerTurn(c, messages, move);
    messages.push({ role: 'user', content: u.message });
    // Perplexity gets the same thread (reader + Anís's earlier replies); started now, awaited after the conversation so turn latency is unchanged
    // (a replay reuses the recorded answer: the reader's words are the same, and reuse keeps the comparison's other side fixed)
    if (WITH_PX) pxCalls[t] = rec?.perplexity?.text && !FRESH_PX ? Promise.resolve({ ...rec.perplexity, cost: 0, reused: REPLAY, recorded_cost: rec.perplexity.cost ?? null })
      : perplexityTurn(messages.map((m) => ({ ...m })));
    const a = await anisTurn(messages, uid, cid);
    cid ||= a.conversation_id;
    console.log(`  [${c.id}] T${t + 1} ${move} ${a.error ? `ERROR ${a.error}` : `${(a.ms / 1000).toFixed(1)}s ${a.text.length}ch`} — ${u.message.slice(0, 90)}`);
    turns.push({ turn: t + 1, move, refers_to: u.refers_to, user: u.message, ...(rec ? { replayed: true } : {}), reply: a.text, ms: a.ms, first_chunk_ms: a.first_chunk_ms, error: a.error,
      sources: a.sources.slice(0, 12).map((s) => ({ title: s.title, author: s.author, religion: s.religion, url: s.url, document_id: s.document_id, paragraph_index: s.paragraph_index, text: String(s.text || '').slice(0, 280) })),
      citations: (a.citations || []).slice(0, 12).map((x) => ({ title: x.title || x.source_title || null, author: x.author || x.source_author || null, url: x.url || x.citation_url || null })),
      status: a.status, engine: a.complete?.engine ?? null, format: a.complete?.format ?? null });
    if (a.error || !a.text) break;
    messages.push({ role: 'assistant', content: a.text });
  }
  if (WITH_PX) for (const t of turns) { const px = await pxCalls[t.turn - 1]; if (px) { t.perplexity = px; spend.px += px.cost || 0; } }
  const trace = cid ? await threadTrace(cid, turns.length) : null;
  const rounds = (trace?.rounds || []).filter((r) => r.reply);
  turns.forEach((t) => {   // match a round by its question text (one thread per conversation, so in order)
    const rp = rounds.find((r) => String(r.question?.text || '').trim() === t.user.trim()) || rounds[t.turn - 1];
    t.route = rp ? routeOf(rp) : null; if (t.route?.usd) spend.anis += t.route.usd;
  });
  return { id: c.id, theme: c.theme, persona: c.persona, uid, conversation_id: cid, messages, turns, ...(c.replay ? { replayed_from: REPLAY } : {}) };
}

// ---- the judge
const AUTHORITY = `AUTHORITY ORDER (Chad, a decision): on doctrine and interpretation — the Writings of the Báb, Bahá'u'lláh and 'Abdu'l-Bahá; then Shoghi Effendi (letters written on his behalf included); then pilgrims' notes of them; then scholarship. Nothing after the Guardian interprets. Universal House of Justice letters are guidance on application and administration — never doctrine or interpretation; resting a doctrinal point on the House, a scholar or a secondary book is an AUTHORITY ERROR. Pilgrims' notes are below the written text but above every scholar and institution on doctrine; dismissing them as "no authority" is also an error. For other traditions, their own scripture first, commentary after, labelled.`;
const JUDGE = `You are a demanding reviewer of Anís, a male AI librarian who answers readers from a library of sacred and scholarly texts (Bahá'í Writings plus 11 traditions) and links every quotation to its paragraph (oceanlibrary.com / siftersearch.com). You read ONE WHOLE CONVERSATION with, per turn, the reader's intended move, the sources Anís's retrieval surfaced, and his internal route (gate, strategy, search_query, history_turns = how many earlier turns the planner used, retrieved count, phrases, selection, timeline, latency).
${AUTHORITY}
Score the CONVERSATION (1–5 each, 5 = excellent, be strict; 3 = acceptable with clear flaws):
- grounding: claims rest on quoted texts; quotations are real, from the cited source, correctly attributed (author, work); no invented quotes or sources.
- citation_links: every quotation is linked to its paragraph; links point to the work named.
- follow_up_resolution: each follow-up that refers to earlier turns ("that passage", "who wrote it", "the second one") is understood and answered about THAT thing. Use history_turns and search_query as evidence: a follow-up searched as a bare pronoun or without the referent is a follow_up_context defect.
- coherence: the conversation builds; no repeating the same passages/answer, no contradicting earlier turns, no forgetting what was established.
- depth: real engagement — answers the actual question, gives the texts' nuance and scope, takes pushback seriously (concedes, corrects or holds with evidence), not truisms.
- honesty_absence: says plainly when the library does not have something or a text does not say it; never bluffs; never refuses when the library does have it.
- authority_ordering: as above.
- tone: Anís is male, warm, a companion in study; he asks rather than pronounces, invites the reader further, never preaches or lectures; no sycophancy; appropriate length.
- latency: per turn, under ~8 s is good, 8–15 s acceptable, over 15 s a defect (stage latency), over 30 s major.
Then per turn list DEFECTS, each with the STAGE that caused it — the first stage in the pipeline where it went wrong:
  gate (triage refused/canned/misrouted the turn), strategy (wrong plan shape for what was asked, e.g. topic for a quote request), follow_up_context (the turn was planned/searched without the earlier-turn referent), retrieval (the right texts were not among the sources surfaced), selection (right texts were in the sources but the reply used worse ones or ignored them), answer (writing: misquote, misattribution, authority error, repetition, missing link, tone, bluff), latency.
Use the sources list and route to decide retrieval vs selection vs answer — say what evidence decided it. Each defect: what went wrong, the evidence (quote the reply or route), and what a correct reply would contain (concrete enough to become a test fixture). Do not invent defects; a good turn has none. Call the verdict tool exactly once.`;
// a replayed conversation: the reader's turns are a recording, written against EARLIER replies than the ones shown
const REPLAY_NOTE = 'NOTE: this is a REPLAY. The reader\'s messages are recorded verbatim from an earlier run and were written in response to Anís\'s EARLIER replies, not necessarily the ones shown here. A follow-up may therefore refer to something Anís did not say this time ("that second passage", a quoted phrase). Do not count that mismatch as a defect by itself: judge how Anís handles the turn as it stands (resolving it from this conversation where he can, saying plainly what he did not say, or answering the evident request), and score everything else exactly as usual.';
const DIMS = ['grounding', 'citation_links', 'follow_up_resolution', 'coherence', 'depth', 'honesty_absence', 'authority_ordering', 'tone', 'latency'];
const STAGES = ['gate', 'strategy', 'follow_up_context', 'retrieval', 'selection', 'answer', 'latency'];
const VERDICT = { name: 'verdict', description: 'the conversation verdict', input_schema: { type: 'object', required: ['scores', 'overall', 'headline', 'turns'], properties: {
  scores: { type: 'object', required: DIMS, properties: Object.fromEntries(DIMS.map((d) => [d, { type: 'object', required: ['score', 'why'], properties: { score: { type: 'number' }, why: { type: 'string' } } }])) },
  overall: { type: 'number', description: '1–10 for the whole conversation as a reader would experience it' },
  headline: { type: 'string', description: 'one sentence: the most important thing about this conversation' },
  turns: { type: 'array', items: { type: 'object', required: ['turn', 'defects'], properties: { turn: { type: 'number' },
    defects: { type: 'array', items: { type: 'object', required: ['stage', 'severity', 'what', 'evidence', 'expected'], properties: {
      stage: { type: 'string', enum: STAGES }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
      what: { type: 'string' }, evidence: { type: 'string' }, expected: { type: 'string', description: 'what a correct reply would contain / do' } } } } } } },
  strengths: { type: 'array', items: { type: 'string' } },
  top_fixes: { type: 'array', items: { type: 'string' }, description: 'the 1–3 pipeline changes that would most improve this conversation' } } } };
async function judgeConversation(conv) {
  const body = conv.turns.map((t) => [
    `=== TURN ${t.turn} — reader move: ${t.move}${t.refers_to ? ` (refers to: ${t.refers_to})` : ''} ===`,
    `READER: ${t.user}`,
    `ANÍS (${(t.ms / 1000).toFixed(1)} s${t.error ? `, ERROR ${t.error}` : ''}):\n${t.reply || '(no reply)'}`,
    `SOURCES SURFACED (${t.sources.length}):\n${t.sources.map((s, i) => `  ${i + 1}. ${s.author || '?'} — ${s.title || '?'} [${s.religion || ''}] ${s.url || ''}\n     "${s.text}"`).join('\n') || '  (none)'}`,
    `ROUTE: ${JSON.stringify(t.route || 'unavailable')}`,
  ].join('\n')).join('\n\n');
  const res = await claude().messages.create({ model: JUDGE_MODEL, max_tokens: 16000, thinking: { type: 'adaptive' }, system: JUDGE, tools: [VERDICT], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `THEME: ${conv.theme}\nREADER PERSONA: ${conv.persona} — ${PERSONAS[conv.persona] || ''}\n\n${conv.replayed_from ? `${REPLAY_NOTE}\n\n` : ''}${body}\n\nJudge the whole conversation and call the verdict tool.` }] });
  spend.judge += usd(JUDGE_MODEL, res.usage);
  const v = res.content.find((b) => b.type === 'tool_use')?.input;
  if (!v) throw new Error('judge returned no verdict');
  return v;
}

// ---- fixtures: each defect with the conversation up to (and including) its turn, in the wording battery's messages shape
function fixturesOf(conv) {
  const out = [];
  for (const td of conv.verdict?.turns || []) for (const d of td.defects || []) {
    const t = conv.turns[td.turn - 1]; if (!t) continue;
    const msgs = conv.turns.slice(0, td.turn).flatMap((x, i) => (i < td.turn - 1 ? [{ role: 'user', content: x.user }, { role: 'assistant', content: x.reply }] : [{ role: 'user', content: x.user }]));
    out.push({ conversation: conv.id, turn: td.turn, move: t.move, stage: d.stage, severity: d.severity, what: d.what, expected: d.expected, route: t.route ? { strategy: t.route.strategy, search_query: t.route.search_query, history_turns: t.route.history_turns } : null, messages: msgs });
  }
  return out;
}

// ---- report
function summarize(results) {
  const ok = results.filter((r) => r.verdict);
  const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
  const lat = results.flatMap((r) => r.turns.filter((t) => !t.error).map((t) => t.ms));
  const defects = ok.flatMap((r) => r.verdict.turns.flatMap((t) => t.defects || []));
  const byStage = Object.fromEntries(STAGES.map((s) => [s, defects.filter((d) => d.stage === s).length]));
  const bySev = Object.fromEntries(['critical', 'major', 'minor'].map((s) => [s, defects.filter((d) => d.severity === s).length]));
  const anisUsd = results.flatMap((r) => r.turns.map((t) => t.route?.usd || 0)).reduce((a, b) => a + b, 0);
  const px = pxRollup(results), pxUsd = px.usd.perplexity + px.usd.compare_judge;
  return { date: DATE, tag: TAG || null, ...(REPLAY ? { replay_of: REPLAY.replace(/^.*\/reports\//, 'reports/') } : {}), api: API, sim_model: SIM_MODEL, judge_model: JUDGE_MODEL, conversations: results.length, judged: ok.length,
    turns: results.reduce((a, r) => a + r.turns.length, 0), errors: results.reduce((a, r) => a + r.turns.filter((t) => t.error).length, 0),
    overall: mean(ok.map((r) => r.verdict.overall)), scores: Object.fromEntries(DIMS.map((d) => [d, mean(ok.map((r) => r.verdict.scores?.[d]?.score).filter((x) => x != null))])),
    defects: defects.length, by_stage: byStage, by_severity: bySev,
    latency_ms: { p50: pct(lat, 0.5), p90: pct(lat, 0.9), max: lat.length ? Math.max(...lat) : null, over_15s: lat.filter((x) => x > 15000).length },
    perplexity: px.turns_with_px || px.compared ? { compared: px.compared, winners: px.winners, missed_in_library: px.missed_in_library, collection_gaps: px.collection_gaps,
      unknown: px.unknown.length, px_errors: px.px_errors.length, failures: px.px_errors_http + px.compare_failed, px_ms_p50: px.px_ms_p50 } : null,
    usd: { anis: +anisUsd.toFixed(4), sim: +spend.sim.toFixed(4), judge: +spend.judge.toFixed(4), perplexity: px.usd.perplexity, compare_judge: px.usd.compare_judge,
      per_turn_perplexity: px.usd.per_turn_perplexity, per_turn_compare: px.usd.per_turn_compare, total: +(anisUsd + spend.sim + spend.judge + pxUsd).toFixed(4),
      per_conversation: results.length ? +((anisUsd + spend.sim + spend.judge + pxUsd) / results.length).toFixed(4) : null } };
}
function markdown(summary, results) {
  const L = [`# Anís conversations ${summary.date}${summary.tag ? ` (${summary.tag})` : ''}`, '',
    `${summary.conversations} conversations, ${summary.turns} turns, ${summary.errors} errors. Overall ${summary.overall ?? '-'}/10. Cost $${summary.usd.total} ($${summary.usd.per_conversation}/conversation: Anís $${summary.usd.anis}, reader $${summary.usd.sim}, judge $${summary.usd.judge}${summary.perplexity ? `, Perplexity $${summary.usd.perplexity}, source-compare judge $${summary.usd.compare_judge}` : ''}).`,
    `Latency p50 ${(summary.latency_ms.p50 / 1000).toFixed(1)} s, p90 ${(summary.latency_ms.p90 / 1000).toFixed(1)} s, max ${(summary.latency_ms.max / 1000).toFixed(1)} s, ${summary.latency_ms.over_15s} turns over 15 s.`, '',
    '| dimension | mean (1–5) |', '|---|---|', ...DIMS.map((d) => `| ${d} | ${summary.scores[d] ?? '-'} |`), '',
    `Defects: ${summary.defects} — by stage ${Object.entries(summary.by_stage).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(', ') || 'none'}; by severity ${Object.entries(summary.by_severity).map(([s, n]) => `${s} ${n}`).join(', ')}.`, ''];
  for (const r of results) {
    L.push(`## ${r.id} — ${r.persona} (${r.conversation_id || 'no thread'})`, '', `Theme: ${r.theme}`, '');
    if (!r.verdict) { L.push(`Not judged: ${r.judge_error || 'no verdict'}`, ''); continue; }
    L.push(`**${r.verdict.overall}/10** — ${r.verdict.headline}`, '');
    for (const t of r.turns) {
      const td = r.verdict.turns.find((x) => x.turn === t.turn);
      L.push(`- T${t.turn} *${t.move}* (${(t.ms / 1000).toFixed(1)} s, ${t.route?.strategy || '?'}, history ${t.route?.history_turns ?? '?'}): ${t.user.replace(/\s+/g, ' ').slice(0, 160)}`);
      for (const d of td?.defects || []) L.push(`  - **${d.stage}** [${d.severity}] ${d.what}`);
    }
    if (r.verdict.top_fixes?.length) L.push('', 'Top fixes:', ...r.verdict.top_fixes.map((f) => `- ${f}`));
    L.push('');
  }
  const px = pxMarkdown(results); if (px) L.push(px);
  return L.join('\n');
}

// ---- main
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };
const EST = { sim_per_turn: 0.005, anis_per_turn: 0.002, judge: 0.15, px_per_turn: 0.0055, compare_per_turn: 0.075 };   // px + compare: 11-01 px-smoke, 10 turns ($0.0055 / $0.074 per turn)   // 11-01 smoke, 2 × 5 turns: $0.18/conversation (judge $0.146); refine from the history file
if (has('dry')) {
  console.log(`DRY RUN — no API calls. ${convs.length} conversations × ${TURNS} turns against ${API}; reader ${REPLAY ? `REPLAY of ${REPLAY}` : SIM_MODEL}, judge ${JUDGE_MODEL}; Perplexity comparison ${WITH_PX ? `ON (${REPLAY && !FRESH_PX ? 'recorded sonar answers reused' : 'sonar'} + Opus source judge per turn)` : 'off'}`);
  for (const c of convs) console.log(`  ${c.id} [${c.persona}] ${c.moves.join(' → ')}\n    ${c.theme}${c.replay ? c.replay.map((r, i) => `\n    T${i + 1}: ${r.user.replace(/\s+/g, ' ').slice(0, 110)}`).join('') : ''}`);
  const nt = convs.reduce((a, c) => a + (c.replay?.length || TURNS), 0), pxReused = REPLAY && !FRESH_PX ? convs.reduce((a, c) => a + (c.replay || []).filter((r) => r.perplexity?.text).length, 0) : 0;
  const est = nt * ((REPLAY ? 0 : EST.sim_per_turn) + EST.anis_per_turn + (WITH_PX ? EST.px_per_turn + EST.compare_per_turn : 0)) - pxReused * (WITH_PX ? EST.px_per_turn : 0) + convs.length * EST.judge;
  console.log(`estimated cost ≈ $${est.toFixed(2)} (≈ $${(est / Math.max(1, convs.length)).toFixed(2)}/conversation)`);
  process.exit(0);
}
let results;
if (arg('rejudge')) {
  results = JSON.parse(readFileSync(arg('rejudge'), 'utf8')).results;
  console.log(`rejudging ${results.length} saved conversations (no Anís calls)`);
} else {
  console.log(`${convs.length} conversations × ${TURNS} turns → ${API} (concurrency ${CONC})`);
  results = await pool(convs, CONC, (c) => converse(c).catch((e) => ({ id: c.id, theme: c.theme, persona: c.persona, error: e.message, messages: [], turns: [] })));
}
await pool(results, CONC, async (r) => {
  if (!r.turns.length) return;
  // the source comparison runs alongside the (unchanged) conversation judge
  const cmp = WITH_PX && r.turns.some((t) => t.perplexity?.text)
    ? compareConversation(r, { claude, model: JUDGE_MODEL, usd, api: API, authority: AUTHORITY, onCost: (c) => { spend.compare += c; } }).then(() => {
      const p = pxRollup([r]);
      r.px = { winners: p.winners, missed_in_library: p.missed_in_library.length, collection_gaps: p.collection_gaps.length, unknown: p.unknown.length, px_errors: p.px_errors.length, usd: p.usd };
      console.log(`  compared ${r.id}: ${JSON.stringify(p.winners)} · missed-in-library ${p.missed_in_library.length} · gaps ${p.collection_gaps.length} · unknown ${p.unknown.length}`);
    }).catch((e) => console.log(`  compare failed ${r.id}: ${e.message}`)) : null;
  try { r.verdict = await judgeConversation(r); delete r.judge_error; console.log(`  judged ${r.id}: ${r.verdict.overall}/10 — ${r.verdict.headline}`); }
  catch (e) { r.judge_error = e.message; console.log(`  judge failed ${r.id}: ${e.message}`); }
  await cmp;
  r.fixtures = [...fixturesOf(r), ...pxFixtures(r)];
});
if (has('publish')) {   // explicit only: published_conversations via the admin save endpoint, linked to its thread
  for (const r of results.filter((x) => x.verdict && x.messages.length >= 2)) {
    const res = await fetch(`${API}/api/v1/admin/conversations/save`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Admin-Key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({ messages: r.messages, conversation_id: r.conversation_id, status: arg('status') || 'published', score: r.verdict.overall,
        assessment: { overall: r.verdict.overall, headline: r.verdict.headline, scores: r.verdict.scores, judge: JUDGE_MODEL } }) });
    const j = await res.json().catch(() => ({})); r.published = res.ok ? { slug: j.slug, url: j.url || null } : { error: `${res.status} ${JSON.stringify(j).slice(0, 160)}` };
    console.log(`  publish ${r.id}: ${JSON.stringify(r.published)}`);
  }
}
const summary = summarize(results);
const dir = join(DIR, 'reports'); mkdirSync(dir, { recursive: true });
const base = join(dir, `anis-conversations-${DATE}${TAG ? `-${TAG}` : ''}`);
writeFileSync(`${base}.json`, JSON.stringify({ summary, results }, null, 1));
writeFileSync(`${base}.md`, markdown(summary, results));
const hf = join(DIR, 'anis-conversations-history.json'), hist = existsSync(hf) ? JSON.parse(readFileSync(hf, 'utf8')) : [];
hist.push({ ...summary, ...(arg('rejudge') ? { rejudged: arg('rejudge') } : {}) }); writeFileSync(hf, JSON.stringify(hist, null, 1));
console.log(`\noverall ${summary.overall}/10 · defects ${summary.defects} ${JSON.stringify(summary.by_stage)} · $${summary.usd.total} ($${summary.usd.per_conversation}/conv) · p50 ${summary.latency_ms.p50} ms`);
console.log(`report ${base}.json + .md`);
