// Follow-up pills (Chad 11-12): after a live reply, a fast model offers 2–3 short questions the reader may ask next, on the SAME
// subject — tapped, a pill is sent as the next message. Best effort: any failure or timeout → no pills. Deps: model-roles, ai.js.
import { modelFor } from '../model-roles.js';

const PROMPT = ({ question, reply }) => `A reader asked a research assistant about religious texts:
"${question}"

The assistant replied:
"""
${reply}
"""

Write the 3 questions this reader is most likely to ask next. Rules:
- stay on the subject of this exchange (the same text, figure or topic); never introduce another tradition, work or topic
- each a natural question in the reader's own words and language, at most 9 words
- answerable from the texts: the next passage, the original, another translation, who wrote or translated it, what a term means, related passages
- no question the reply already answered
Return only a JSON array of strings.`;

export function cleanFollowups(raw, question = '') {
  let arr;
  try { arr = JSON.parse(String(raw ?? '').replace(/^[^[]*/, '').replace(/[^\]]*$/, '')); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const asked = String(question).trim().toLowerCase();
  const seen = new Set();
  return arr.map((q) => String(q ?? '').replace(/\s+/g, ' ').trim())
    .filter((q) => q && q.length <= 90 && q.toLowerCase() !== asked && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
    .slice(0, 3);
}

export async function followups(question, reply, { complete = null, timeoutMs = 4000 } = {}) {
  const r = String(reply || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!r || !String(question || '').trim()) return [];
  let timer;
  try {
    const call = complete || (async (msgs) => (await import('../ai.js')).chatCompletion(msgs, { ...modelFor('anis-followups'), temperature: 0.3, maxTokens: 160, thinking: false, caller: 'anis-followups' }));
    const out = await Promise.race([call([{ role: 'user', content: PROMPT({ question: String(question).slice(0, 600), reply: r.slice(0, 2500) }) }]),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), timeoutMs); timer.unref?.(); })]);
    return cleanFollowups(out?.content ?? out, question);
  } catch { return []; } finally { clearTimeout(timer); }
}
