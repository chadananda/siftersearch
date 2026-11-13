// A letter's triage (email mode): does the writer ask Anís to stop writing, or is it mainly a personal disclosure? The mail
// Worker records either in mail_stop (no outreach). One Haiku call, read by the model, never by keywords. → { stop, kind, stance } or null.
const SYSTEM = 'You read a letter someone wrote to Anís, a research assistant. Answer with JSON only, no prose: {"stop": 1 if the writer asks not to be written to again (unsubscribe, stop, remove me), else 0, "personal": true if the letter is mainly a personal disclosure (grief, illness, a private struggle) rather than a question or conversation, else false}.';

export async function triageLetter(create, text) {
  const r = await create({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: String(text || '').slice(0, 6000) }], max_tokens: 40, thinking: false });
  const j = JSON.parse(/\{[^{}]*\}/.exec(r?.choices?.[0]?.message?.content || '')?.[0] || 'null');
  if (!j || typeof j !== 'object') return null;
  return { stop: j.stop ? 1 : 0, kind: j.personal === true ? 'personal' : 'question', stance: null };
}
