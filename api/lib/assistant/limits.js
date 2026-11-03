// Anís chat rate caps + kill switch (F15). Env: ANIS_CHAT_PAUSED=1 (kill switch), ANIS_TURNS_PER_HOUR (per person, 60),
// ANIS_TURNS_GLOBAL_PER_HOUR (all, 1500). Server-side, in-process rolling hour; a restart forgives. Fixed reply, zero LLM. Pure apart from the Map.
const HOUR = 3600_000;
export const LIMITED_REPLY = "I'm answering a great many questions just now and need to pause for a little while. Please write again a bit later, and thank you for your patience.";
export const PAUSED_REPLY = "I'm resting for the moment while the library is looked after. Please come back a little later.";

export function makeLimits({ now = () => Date.now(), env = process.env } = {}) {
  const by = new Map(); let all = [];
  const prune = (a, t) => { while (a.length && t - a[0] >= HOUR) a.shift(); return a; };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  /** → null (go ahead, and counted) | { reason: 'paused'|'person'|'global', reply } */
  return (who) => {
    const t = now();
    if (env.ANIS_CHAT_PAUSED === '1') return { reason: 'paused', reply: PAUSED_REPLY };
    all = prune(all, t);
    if (all.length >= num(env.ANIS_TURNS_GLOBAL_PER_HOUR, 1500)) return { reason: 'global', reply: LIMITED_REPLY };
    const mine = prune(by.get(who) || [], t);
    if (mine.length >= num(env.ANIS_TURNS_PER_HOUR, 60)) { by.set(who, mine); return { reason: 'person', reply: LIMITED_REPLY }; }
    mine.push(t); all.push(t); by.set(who, mine);
    if (by.size > 5000) for (const [k, v] of by) if (!prune(v, t).length) by.delete(k);
    return null;
  };
}
