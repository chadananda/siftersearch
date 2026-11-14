// Follow-up pills, pure core: prompt + cleanup + the timed call over an injected `complete`. PURE — bundles for the edge Worker. followups.js adds the server default.
const PROMPT = ({ question, reply, reader }) => `A reader asked a research assistant about religious texts:
"${question}"

The assistant replied:
"""
${reply}
"""

Write the 3 questions this reader is most likely to ask next. Rules:
- stay on the subject of this exchange (the same text, figure or topic); never introduce another tradition, work or topic
- each a natural question in the reader's own words and language, at most 9 words
- answerable from the texts: the next passage, the original, another translation, who wrote or translated it, what a term means, related passages
- no question the reply already answered${reader ? `\n- suit them to what this reader has said of themselves (their level, interests, tradition); never mention it:\n${reader}` : ''}
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

export async function followupsWith(complete, question, reply, { timeoutMs = 4000, reader = '' } = {}) {
  const r = String(reply || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!r || !String(question || '').trim()) return [];
  let timer;
  try {
    const out = await Promise.race([complete([{ role: 'user', content: PROMPT({ question: String(question).slice(0, 600), reply: r.slice(0, 2500), reader: String(reader || '').slice(0, 600) }) }]),
      new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), timeoutMs); timer.unref?.(); })]);
    return cleanFollowups(out?.content ?? out, question);
  } catch { return []; } finally { clearTimeout(timer); }
}
