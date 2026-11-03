// "What I understood" (W3, Chad 11-03): the three-part reply opens with the assistant's OWN restatement of the resolved request —
// target and language named ("the original Arabic of the second Arabic Hidden Word") — never an echo of the reader's words, never
// keywords. System One answers only typed questions (no free text — 400 on 'text', verified 11-03), so the words come from a
// tiny Haiku call (thinking off, ~25 output tokens) CONDITIONED on Jev's decision (strategy, sides, triage kind); it runs
// beside the search and is emitted the moment it returns. Until then the reader sees only a neutral progress word.
// Deps: ai chatCompletion, model-roles ('anis-understood').
import { modelFor } from '../model-roles.js';

export const NEUTRAL = 'Thinking…';
const MAX_WORDS = 18;

const PROMPT = ({ thread, decision }) => `Restate, in ONE short noun phrase, what the reader's LATEST message asks for — as the assistant resolved it from the whole thread.
Rules: at most 14 words; no preamble, no quotation marks, no question mark, no "you asked"; never copy the reader's sentence — resolve it:
name the target (the passage, book, prayer, topic, person) and the traditions or sides; name the language when one is wanted or implied.
Examples: "the original Arabic of the second Arabic Hidden Word" · "how Buddhism and Christianity each treat forgiveness" · "a prayer for healing" ·
"the House of Justice's current guidance on social media" · "John 3:16 in the King James Bible" · "what ‘Abdu’l-Bahá taught about the education of children".
${decision ? `Decision already taken by the router: ${decision}.\n` : ''}Thread:
${thread}
Answer with the phrase only.`;

/** The router's decision in words for the restatement prompt. Pure. */
export const decisionLine = ({ strategy = null, sides = [], kind = null, features = null } = {}) => [
  strategy ? `strategy ${strategy}` : null, sides?.length ? `sides ${sides.join(', ')}` : null, kind ? `kind ${kind}` : null,
  features?.language ? `answer language ${features.language}` : null, features?.original ? `original wanted (${features.original})` : null,
].filter(Boolean).join('; ') || null;

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** One clean phrase from the model's text, or null when it echoes the reader or is not a phrase. Pure. */
export function cleanRestatement(raw, userText = '') {
  let t = String(raw ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
  t = t.replace(/^[-•*"“”'‘’]+|["“”'‘’.]+$/g, '').replace(/^(?:you asked(?: for| about)?|understood|the reader (?:asks|wants)|restatement)[:\s-]+/i, '').trim();
  if (!t || t.split(/\s+/).length > MAX_WORDS || /\?$/.test(t)) return null;
  const u = norm(userText), p = norm(t);
  if (u && (p === u || (u.length > 20 && u.includes(p)) || (p.length > 20 && p.includes(u)))) return null;   // an echo, not an understanding
  return t;
}

/** The tarpit's stand-in phrase (strikes.js path: templates, no model) — generic, so the shape matches a real turn. Pure. */
const TARPIT = ['what the writings say on the matter raised', 'the passage behind the question asked', 'the teaching asked about, in its own sources', 'where the library speaks to this question'];
export const tarpitPhrase = (seed = '') => TARPIT[[...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TARPIT.length];

/** The "what I understood" line for the reader. Pure. */
export const understoodText = (phrase) => (phrase ? `Understood — ${phrase}.` : null);

/**
 * @returns {Promise<null | { phrase, text, ms }>} null = nothing to show (keep the neutral word); never throws.
 */
export async function restate(messages, decision = {}, { complete = null, timeoutMs = 2500 } = {}) {
  const user = [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
  const thread = (messages || []).slice(-4).map((m) => `${m.role}: ${String(m.content || '').slice(0, 600)}`).join('\n');
  if (!thread.trim()) return null;
  const t0 = Date.now();
  let timer;
  try {
    const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-understood'), temperature: 0, maxTokens: 40, thinking: false, caller: 'anis-understood' }));
    const out = await Promise.race([call([{ role: 'user', content: PROMPT({ thread, decision: decisionLine(decision) }) }]),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), timeoutMs); timer.unref?.(); })]);
    const phrase = cleanRestatement(out?.content ?? out, user);
    return phrase ? { phrase, text: understoodText(phrase), ms: Date.now() - t0 } : null;
  } catch { return null; } finally { clearTimeout(timer); }
}
