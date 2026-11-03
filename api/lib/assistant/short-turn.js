// Resolves an elliptical turn ("more", "and the Báb?", "in Persian", a bare name) into ONE self-contained library query,
// from the history and the reader card — Jev has decided the turn is a search; this writes the words. Haiku, cheap tier,
// thinking off, a few dozen output tokens. Deps: role-client (injectable llm). Never throws → null (caller keeps its query).
import { roleCreate } from '../role-client.js';

export const RESOLVE_SYSTEM = `You turn the latest user message of a conversation with a library assistant into one self-contained search query for a library of sacred texts and their history. The message may be a word or two that only makes sense with the conversation ("more", "why?", "and the Báb?", "in Persian", a name). Write the query the person would have typed had they written it out: the subject carried over from the conversation plus what the new message adds. "more" / "another" = the same subject again, further passages. Keep the user's own words where they are specific; never answer the question; never add subjects they did not raise. Reply with JSON only: {"query":"…"} — at most 14 words, the subject and what is asked of it; no filler ("continued", "further", "more about").`;

const defaultLlm = async ({ system, user }) => {
  const r = await roleCreate('turn-resolver', { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 120, temperature: 0,
    response_format: { type: 'json_object' } }, { timeout: 6000 });
  return { text: r?.choices?.[0]?.message?.content || '' };
};

/** → { query, by: 'haiku' } | null */
export async function resolveQuery({ messages = [], card = null, llm = defaultLlm } = {}) {
  const history = messages.slice(-6).map((m) => `${m.role}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, 700)}`).join('\n');
  try {
    const r = await llm({ system: RESOLVE_SYSTEM, user: `READER: ${card || 'unknown'}\nCONVERSATION:\n${history}\n\nThe query for the latest user message:` });
    const text = r?.text ?? r?.json?.query ?? '';
    const q = typeof text === 'string' && text.trim().startsWith('{') ? JSON.parse(text).query : (r?.json?.query ?? text);
    const query = String(q || '').replace(/\s+/g, ' ').trim();
    return query && query.split(' ').length <= 40 ? { query, by: 'haiku' } : null;
  } catch { return null; }
}
