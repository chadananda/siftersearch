#!/usr/bin/env node
// THE BAR (Chad 10-19: "we should always be more helpful and informative than Perplexity"): real study questions put to
// today's Anís, the researcher (two writers) and Perplexity; Opus judges them BLIND (shuffled labels) for helpfulness,
// substance and faithfulness to authority. Anís through the internal API (/api/v1/anis/draft — logs as battery@), Perplexity
// and the judge directly. Usage: node scripts/anis/research-battery.mjs [--only 1,3] [--variants current,haiku,sonnet]
//   --immerse tmp/immerse/<feed>.json: the questions people put to bahaiwritings.app, judged against Immerse's own answer
//   (Chad 10-19: "make sure we can give a more detailed, doctrinal, nuanced and interesting answer to each")
//   --no-perplexity  --concurrency N
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { competitorQuery } from '../../api/lib/audit/auditor.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env-secrets', '.env-public', '.env']) dotenv.config({ path: join(ROOT, f), quiet: true });
const API = process.env.SIFTER_API || 'https://api.siftersearch.com';
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };

const CHAMBER = 'What is the original word used for "chamber"?\n\nWhoso reciteth, in the privacy of his *chamber*, the verses revealed by God, ......\n\nKitab\'i-Aqdas\n\nP.S.\n\nI am NOT asking for translation of the word.  Only for the original word used.';
const LILIANE_PRAYER = 'this is a translation of a prayer can you find the original for me\n\n“He is God. O Divine Providence! Render thou the friends successful, and make them confidants and intimates of Thy servitude. Make Thou their hearts luminous, and their faces merciful: so that the edifice of love and kindness may be founded in the human world, and all mankind become enthralled and enamoured with each other; that the East may embrace the West, and the Western peoples choose without hesitation the pathway of love; that the Turks may regard the Persians as confidants, and esteem them as their fellows and well-wishers; that all may in the utmost amity consort and mingle with one another; that no estrangement may remain, and there may be no mention of ‘others’; and that all may comport themselves as friends, companions, and comforters. O Divine Providence! Turn Thou this darksome night into a brilliant day, and convert this rancour and enmity among the nations into fellowship and love: so that the world of creation may find repose, and the prideful earth may obtain an ample portion of the Divine realm. Thou art the Powerful and the Mighty; and Thou art the Giver, the Refulgent, and the Seer. ‘Ayn, ‘Ayn”';
const CASES = [
  { id: 1, kind: 'original word', messages: [{ role: 'user', content: CHAMBER }] },
  { id: 2, kind: 'language follow-up', messages: [{ role: 'user', content: CHAMBER },
    { role: 'assistant', content: 'The original is Arabic: «من بيته وحده» (min baytihi waḥdahu), "from his house, alone" — rendered by Shoghi Effendi as "in the privacy of his chamber" (Gleanings CXXXVI).' },
    { role: 'user', content: 'Thank you.\n\nIs this   من بيته وحدة (*min baytihi* not mean "his (or from his ) house? I was looking for the word for "Chamber".' }] },
  { id: 3, kind: 'language follow-up', messages: [{ role: 'user', content: 'Is this من بيته وحدة (*min baytihi*) not mean "his (or from his) house"? I was looking for the word for "Chamber".' },
    { role: 'assistant', content: 'You are right that bayt means house; Shoghi Effendi rendered the phrase "in the privacy of his chamber".' },
    { role: 'user', content: 'Thank you so much for the info!\n\nWould you agree if "Fi baytuhu" be used for "Chamber" instead of "Bayt" although they are outwardly two words of one and the same?' }] },
  { id: 4, kind: 'meaning of an image', messages: [{ role: 'user', content: 'Who is a "black-eyed" damsel?' }] },
  { id: 5, kind: 'position (doctrine vs opinion)', messages: [{ role: 'user', content: "Hi, can you give me a summary of the Baha'i Position on Socialism and egalitarianism and property rights? I'm trying to understand where the Baha'i faith fits in." }] },
  { id: 6, kind: 'doctrinal text', messages: [{ role: 'user', content: 'What does Shoghi Effendi mean by the "worship of the state" in The Promised Day Is Come?' }] },
  { id: 7, kind: 'word study', messages: [{ role: 'user', content: "What does the word 'irfán mean in the Bahá'í Writings, and how did Shoghi Effendi translate it?" }] },
  { id: 8, kind: 'source of a quotation', messages: [{ role: 'user', content: 'Where does "The earth is but one country, and mankind its citizens" come from, and what is the original?' }] },
  { id: 9, kind: 'history / people', messages: [{ role: 'user', content: 'Did Ṭáhirih ever meet the Báb in person?' }] },
  { id: 10, kind: 'comparison', messages: [{ role: 'user', content: "How does the Bahá'í idea of progressive revelation compare with the Islamic idea of the seal of the prophets?" }] },
  // Liliane's letters (10-23 reviews, planning/anis-liliane-reviews.md). `must`: what a right answer contains (checked, printed)
  { id: 11, kind: 'examples of a word (ʿilm)', must: /علم|ʿilm/, messages: [{ role: 'user', content: "What is Irfan in the Baha'i faith?" },
    { role: 'assistant', content: 'ʿIrfán (عرفان) is knowing by recognition; Shoghi Effendi rendered it knowledge, recognition, understanding. The writings also use ʿilm (علم), often rendered knowledge too.' },
    { role: 'user', content: 'please give me some example of ILM in the writings' }] },
  { id: 12, kind: 'original of an unpublished English prayer', must: /AB05355|ترک تاجیک|ترک و تاجیک/, messages: [{ role: 'user', content: LILIANE_PRAYER }] },
];

const VARIANTS = {
  current: { research: false },
  haiku: { research: true },
  sonnet: { research: true, writer: 'anthropic:claude-sonnet-5-5' },
};

async function anis(messages, v) {
  const t0 = Date.now();
  // a network failure is recorded as this answer's error, never the end of the run (10-19: one ETIMEDOUT killed 61 cases)
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await anisOnce(messages, v, t0); } catch (e) { if (attempt) return { text: `(error: ${e.message})`, error: e.message, ms: Date.now() - t0 }; await new Promise((z) => setTimeout(z, 5000)); }
  }
}
// as a JOB (docs/architecture/continuous-deploy.md): start, then poll — no request stays open, so Cloudflare's ~125 s edge
// limit (10-19: 40 of 61 answers were 524s) and API reloads (the old instance finishes its jobs) cannot touch it
const RUN = Date.now().toString(36);
let seq = 0;
async function anisOnce(messages, v, t0) {
  const headers = { 'content-type': 'application/json', 'X-Internal-Key': process.env.INTERNAL_API_KEY };
  const job = `battery-${RUN}-${++seq}`;
  const r = await fetch(`${API}/api/v1/anis/draft`, { method: 'POST', signal: AbortSignal.timeout(30000), headers,
    body: JSON.stringify({ messages, email: 'battery@siftersearch.com', async: true, job, ...v }) });
  if (!r.ok) return { text: `(error ${r.status} starting the job)`, error: `start ${r.status}`, ms: Date.now() - t0 };
  for (;;) {
    await new Promise((z) => setTimeout(z, 5000));
    const g = await fetch(`${API}/api/v1/anis/draft/job/${job}`, { headers, signal: AbortSignal.timeout(30000) }).then((x) => x.json()).catch(() => ({ status: 'poll-failed' }));
    if (g.status === 'done') { const j = g.result || {}; return { text: j.reply || '(empty reply)', format: j.format, research: j.research, ms: Date.now() - t0 }; }
    if (g.status === 'failed' || g.status === 'lost') return { text: `(error: job ${g.status} ${g.error || ''})`, error: g.status, ms: Date.now() - t0 };
    if (Date.now() - t0 > 600000) return { text: '(error: job still running after 10 min)', error: 'timeout', ms: Date.now() - t0 };
  }
}

async function perplexity(messages) {
  const q = competitorQuery(messages.at(-1).content, messages.slice(0, -1));
  const t0 = Date.now();
  const r = await fetch('https://api.perplexity.ai/chat/completions', { method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: q }], max_tokens: 900 }) });
  const j = await r.json().catch(() => ({}));
  return { text: j.choices?.[0]?.message?.content || `(error ${r.status})`, ms: Date.now() - t0 };
}

const JUDGE = `You judge answers from study assistants to a reader of the Bahá'í Writings (and other sacred texts). FIRST classify the question: DOCTRINAL (what the Faith teaches — God, the soul, the Manifestations, ethics, the meaning of a text), APPLICATION (how a law or the administrative order is applied — consent to marriage, elections, the Fund, the Plans), HISTORICAL (events and people), or PRACTICAL (programmes, compilations, devotional material).
AUTHORITY DECIDES (Chad 10-19 — "quoting a third party scholar or the house of justice on a doctrinal issue is an antipattern, not better"):
- DOCTRINAL: only the Revelation (Bahá'u'lláh, the Báb) and its authorised interpretation ('Abdu'l-Bahá, Shoghi Effendi) count as support. An answer that rests a doctrinal point on the Universal House of Justice, a scholar, a pilgrim's note or a secondary book is making an AUTHORITY ERROR — score it down hard, however polished; quoting them beside the texts adds nothing.
- APPLICATION: the Universal House of Justice is the right authority (after the texts it applies); scholars are not.
- HISTORICAL: primary accounts (the Central Figures, Shoghi Effendi's histories, Nabíl) first; scholars only as labelled context.
Then: the most HELPFUL and INFORMATIVE answer for this reader — takes up what they are reaching for, gives real substance from the right sources (their own words, originals where relevant, sound language knowledge), invites exploration, never declines or quibbles. Penalise errors, invented quotations or sources, misattribution, padding and evasion. Length is not substance. Judge each answer on its own merits — the labels are random.`;

async function judge(c, answers) {
  const labels = Object.keys(answers).sort(() => Math.random() - 0.5);
  const tag = Object.fromEntries(labels.map((k, i) => [k, String.fromCharCode(65 + i)]));
  const convo = c.messages.map((m) => `${m.role === 'user' ? 'Reader' : 'Assistant (earlier)'}: ${m.content}`).join('\n\n');
  const body = labels.map((k) => `=== ANSWER ${tag[k]} ===\n${answers[k].text}`).join('\n\n');
  const client = new Anthropic();
  const res = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 4000, system: JUDGE,
    tools: [{ name: 'verdict', description: 'scores for every answer', input_schema: { type: 'object', required: ['scores', 'best'], properties: {
      scores: { type: 'array', items: { type: 'object', required: ['label', 'score', 'why'], properties: { label: { type: 'string' }, score: { type: 'number', description: '1–10' }, why: { type: 'string', description: 'one or two sentences: strengths, errors, what is missing' } } } },
      best: { type: 'string' },
      question_kind: { type: 'string', enum: ['doctrinal', 'application', 'historical', 'practical'] },
      authority_errors: { type: 'array', items: { type: 'string' }, description: 'per answer label: an authority error (a doctrinal point rested on the House, a scholar or a pilgrim note), e.g. "B: rests the station of the Báb on Taherzadeh"' },
      anis_gaps: { type: 'string', description: 'what the best non-Anís answer gave that the Anís answers lacked (texts, facts, structure, depth) — concrete, or "none"' } } } }],
    tool_choice: { type: 'auto' },   // Opus 5.5 rejects a forced tool choice
    messages: [{ role: 'user', content: `THE CONVERSATION:\n${convo}\n\n${body}\n\nScore every answer (1–10) and name the best, by calling the verdict tool.` }] });
  const v = res.content.find((b) => b.type === 'tool_use')?.input || { scores: [] };
  const back = Object.fromEntries(Object.entries(tag).map(([k, t]) => [t, k]));
  // the judge sometimes writes "Answer B" for "B" (10-19: those scores were dropped as '?')
  const lab = (l) => String(l || '').replace(/^answer\s+/i, '').trim().toUpperCase();
  for (const sc of v.scores || []) sc.label = lab(sc.label);
  v.best = lab(v.best);
  return { scores: Object.fromEntries((v.scores || []).map((s) => [back[s.label] || s.label, { score: s.score, why: s.why }])), best: back[v.best] || v.best, gaps: v.anis_gaps || null, kind: v.question_kind || null,
    authority_errors: (v.authority_errors || []).map((e) => e.replace(/^\s*(?:answer\s+)?([A-Z])\s*:/i, (m, l) => `${back[l.toUpperCase()] || l}:`)) };
}

const only = arg('only')?.split(',').map(Number);
const immerseFile = arg('immerse');
const cases = immerseFile
  ? JSON.parse(readFileSync(immerseFile, 'utf8')).map((x, i) => ({ id: i + 1, kind: `immerse: ${x.title || ''}`.slice(0, 60), url: x.url,
    messages: [{ role: 'user', content: x.question }], immerse: x.answer }))
  : CASES;
const variants = (arg('variants') || (immerseFile ? 'sonnet' : 'current,haiku,sonnet')).split(',');
const withPx = !process.argv.includes('--no-perplexity');
const clipA = (t) => (String(t || '').length > 14000 ? `${String(t).slice(0, 14000)}…` : String(t || ''));
async function runCase(c) {
  const answers = {};
  const [px, ...an] = await Promise.all([withPx ? perplexity(c.messages) : null, ...variants.map((v) => anis(c.messages, VARIANTS[v]))]);
  if (px) answers.perplexity = px;
  if (c.immerse) answers.immerse = { text: clipA(c.immerse) };
  variants.forEach((v, i) => { answers[v] = an[i]; });
  const verdict = await judge(c, answers).catch((e) => ({ error: e.message, scores: {} }));
  // a case with `must` also says whether each Anís answer holds what a right answer must (e.g. the tablet's PI number)
  const musts = c.must ? Object.fromEntries(variants.map((v) => [v, c.must.test(answers[v]?.text || '')])) : null;
  console.log(`#${c.id} ${c.kind.padEnd(34)} ${Object.keys(answers).map((k) => `${k} ${verdict.scores[k]?.score ?? '?'}`).join(' · ')}  best: ${verdict.best}${musts ? `  must: ${JSON.stringify(musts)}` : ''}`);
  return { ...c, must: c.must ? String(c.must) : undefined, musts, answers, verdict };
}
const out = [];
mkdirSync(join(ROOT, 'tmp'), { recursive: true });
// --rejudge <battery.json>: score saved answers again under the current rubric (no new answers)
const rejudge = arg('rejudge');
if (rejudge) {
  const prev = JSON.parse(readFileSync(rejudge, 'utf8')).cases;
  const N2 = Number(arg('concurrency') || 4);
  for (let i = 0; i < prev.length; i += N2) out.push(...await Promise.all(prev.slice(i, i + N2).map(async (c) => {
    const verdict = await judge(c, c.answers).catch((e) => ({ error: e.message, scores: {} }));
    console.log(`#${c.id} ${String(c.kind).padEnd(34)} [${verdict.kind}] ${Object.keys(c.answers).map((k) => `${k} ${verdict.scores[k]?.score ?? '?'}`).join(' · ')}  best: ${verdict.best}`);
    return { ...c, verdict };
  })));
}
const file = join(ROOT, 'tmp', `anis-battery-${immerseFile ? 'immerse-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const todo = rejudge ? [] : cases.filter((x) => !only || only.includes(x.id));
const N = Number(arg('concurrency') || (immerseFile ? 3 : 1));
for (let i = 0; i < todo.length; i += N) {
  out.push(...await Promise.all(todo.slice(i, i + N).map((c) => runCase(c).catch((e) => ({ ...c, answers: {}, verdict: { error: e.message, scores: {} } })))));
  writeFileSync(file, JSON.stringify({ partial: true, cases: out }, null, 1));   // saved as it goes
}
const mean = (k) => { const s = out.map((o) => o.verdict.scores[k]?.score).filter((x) => x != null); return s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) : null; };
const rivals = [...(withPx ? ['perplexity'] : []), ...(immerseFile ? ['immerse'] : [])];
const beatsOf = (k, r) => out.filter((o) => (o.verdict.scores[k]?.score ?? 0) > (o.verdict.scores[r]?.score ?? 99)).length;
const summary = Object.fromEntries([...rivals, ...variants].map((k) => [k, { mean: mean(k), best: out.filter((o) => o.verdict.best === k).length,
  ...(rivals.includes(k) ? {} : Object.fromEntries(rivals.map((r) => [`beats_${r}`, `${beatsOf(k, r)}/${out.length}`]))) }]));
console.log(JSON.stringify(summary, null, 1));
writeFileSync(file, JSON.stringify({ summary, cases: out }, null, 1));
console.log(file);
