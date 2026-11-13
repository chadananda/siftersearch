// Follow-up pills, every one backed (Chad 11-13 "make sure all suggested search pills are backed by cached answers"): each pill is
// restated in the conversation (the same Haiku pass a click gets), its research set looked up, a miss researched now (tower search,
// no model call) and captured; a pill no research backs is never shown. The pill → question pin makes the click a cache hit.
// Pure: env + deps injected.
import { normalizeQuestion, questionHash, SAME_QUESTION } from './research-store.js';

const opening = (reply) => normalizeQuestion(String(reply || '').replace(/<!--[\s\S]*?-->/g, '').replace(/[*_>#[\]()]/g, ' ')).slice(0, 240);
export const pillKey = (reply, pill) => questionHash(`${opening(reply)}\n${normalizeQuestion(pill)}`);

/** The question a clicked pill was pinned to (the reader's last message is a pill under the last reply), or null. */
export async function pinnedQuestion(env, messages) {
  const last = messages.at(-1), prev = messages.at(-2);
  if (last?.role !== 'user' || prev?.role !== 'assistant') return null;
  const row = await env.ANIS_DB.prepare('SELECT question FROM anis_pills WHERE key = ?').bind(await pillKey(prev.content, last.content)).first().catch(() => null);
  return row?.question || null;
}

/** items → the backed ones, in order. deps: restate(messages) → question|null, lookup(q), research(q) → passages, capture(q, ps) → set|null. */
export async function backPills(env, { items, messages, reply }, { restate, lookup, research, capture, timeoutMs = 15000 }) {
  const one = async (pill) => {
    const q = await restate([...messages, { role: 'assistant', content: reply }, { role: 'user', content: pill }]);
    if (!q) return null;
    const hit = await lookup(q).catch(() => null);
    let set = hit && hit.similarity >= SAME_QUESTION ? hit.set : null;
    if (!set) { const ps = await research(q).catch(() => []); set = ps?.length ? await capture(q, ps).catch(() => null) : null; }
    if (!set) return null;
    await env.ANIS_DB.prepare('INSERT OR REPLACE INTO anis_pills (key, question, set_id, at) VALUES (?,?,?,?)')
      .bind(await pillKey(reply, pill), set.question || q, set.id ?? null, Date.now()).run();
    return pill;
  };
  const timeout = new Promise((r) => setTimeout(() => r(null), timeoutMs));
  const out = await Promise.all(items.map((p) => Promise.race([one(p).catch(() => null), timeout])));
  return out.filter(Boolean);
}
