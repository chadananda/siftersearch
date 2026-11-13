// Anís edge: Haiku restates the reader's latest message as the canonical standalone question before the research cache lookup
// (11-13: raw wordings below the lookup threshold cost a round). Every call stays under the model's long-context price boundary.
import { longContextThreshold } from '../../api/lib/model-registry.js';

const SYSTEM = `Rewrite the reader's latest message as ONE standalone question in canonical form; it is used to find research already done.
- Resolve the conversation: a follow-up ("what about his sons?", "tell me more") becomes a full question naming its subject.
- The plain question with full proper names and diacritics (Bahá'u'lláh, 'Abdu'l-Bahá, the Báb, Shoghi Effendi, Kitáb-i-Aqdas, Kitáb-i-Íqán) and the subject's own title: "Who was Shoghi Effendi?" for "who was the guardian"; "What is the Kitáb-i-Aqdas?" for "what's the Most Holy Book about"; "Who was the Báb?" for "tell me about the bab".
- The most basic form of the SAME question — never broader or narrower than what is asked ("What laws are in the Kitáb-i-Aqdas?" stays that).
- No conversational wording; the same question asked in other words must come out the same.
- Not a question about a subject (a greeting, thanks, a request about format or length) → reply exactly NONE.
Reply with the question only.`;

const CLIP = { user: 1200, assistant: 600 }, TURNS = 6;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Pure: the Haiku messages — the last few turns, clipped, then the latest message. */
export function restateMessages(messages) {
  const last = messages.at(-1)?.content || '';
  const earlier = messages.slice(0, -1).slice(-TURNS).map((m) => `${m.role === 'assistant' ? 'Anís' : 'Reader'}: ${clip(m.content, CLIP[m.role] || 600)}`).join('\n\n');
  return [{ role: 'system', content: SYSTEM },
    { role: 'user', content: `${earlier ? `Conversation so far:\n${earlier}\n\n` : ''}Latest message: ${clip(last, 2000)}` }];
}

/** Pure: a high estimate of the prompt's tokens (3 chars a token) and whether it is safely under the price boundary (half of it). */
export function underPriceBoundary(model, msgs) {
  const tokens = Math.ceil(msgs.reduce((n, m) => n + String(m.content || '').length, 0) / 3);
  const threshold = longContextThreshold(model) ?? 100000;
  return { tokens, ok: tokens < threshold / 2 };
}

/** The canonical question, or null (NONE, failure, timeout, over budget → the caller uses the raw message). */
export async function restate(create, model, messages, { timeoutMs = 2500 } = {}) {
  const msgs = restateMessages(messages);
  if (!underPriceBoundary(model, msgs).ok) return null;
  const call = create({ messages: msgs, max_tokens: 80, thinking: false }).then((r) => String(r?.choices?.[0]?.message?.content || '').trim());
  const out = await Promise.race([call, new Promise((r) => setTimeout(() => r(null), timeoutMs))]).catch(() => null);
  if (!out || /^NONE\b/.test(out)) return null;
  const q = out.split('\n')[0].replace(/^["“]|["”]$/g, '').trim();
  return q.length >= 3 && q.length <= 300 ? q : null;
}
