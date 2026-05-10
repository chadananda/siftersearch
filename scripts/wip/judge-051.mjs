// Run the judge prompt against tmp/wip/051-regen.json. Outputs the
// scoring JSON to tmp/wip/051-judge.json so test-publish.mjs can use it.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, '.env-secrets') });

const HISTORY_PATH = join(ROOT, 'tmp/wip/051-regen.json');
const OUT_PATH = join(ROOT, 'tmp/wip/051-judge.json');
const SEED_QUESTION = "The Tablet of Wisdom (Lawh-i-Hikmat) addresses the origins of philosophy and rejects pure materialism. How does Bahá'u'lláh distinguish his rejection of materialism from a rejection of science?";

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
  "narrative": "3-5 sentences. Specific. Cite round numbers and concrete failures.",
  "flags": ["essay-tone", "secular-drift", "period-word-import", "missing-primary-citation", "secondary-substitution", "hedge-without-position", "stock-phrase-reflex", "sycophant-on-error"],
  "improvement_plan": "2-3 sentences in CONCEPTS not code. What needs to change in Jafar's prompt or behavior to fix what this conversation surfaced."
}

overall is the mean of the dimension scores. flags should only include those genuinely present.`;

const history = JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
const text = history.map(h => h.role === 'user' ? `USER: ${h.content}` : `JAFAR: ${h.content}`).join('\n\n');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const r = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: JUDGE_PROMPT },
    { role: 'user', content: `Seed question: "${SEED_QUESTION}"\n\nConversation:\n\n${text}` }
  ],
  temperature: 0.2,
  response_format: { type: 'json_object' }
});
const result = JSON.parse(r.choices[0].message.content);
writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
console.log(`Overall score: ${Math.round(result.overall)}%`);
console.log('Scores:', JSON.stringify(result.scores));
console.log('Flags:', (result.flags || []).join(', ') || '(none)');
console.log('Narrative:', result.narrative);
console.log('Plan:', result.improvement_plan);
