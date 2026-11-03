// Deadline for slow library calls on the Anís path (search under load): past `ms` the call yields `fallback` instead of
// hanging the turn. The late result is dropped; a rejection also degrades. Pure. Deps: logger
import { logger } from '../logger.js';

export const TOOL_DEADLINE_MS = () => Number(process.env.ANIS_TOOL_DEADLINE_MS) || 15000;

/** → fn's result, or `fallback` (a value) when it takes longer than ms or throws. */
export async function withDeadline(fn, ms, fallback, label = 'tool') {
  let timer;
  const slow = new Promise((res) => { timer = setTimeout(() => res({ slow: true }), ms); });
  try {
    const r = await Promise.race([Promise.resolve().then(fn).then((v) => ({ v }), (e) => ({ e })), slow]);
    if (r.slow) { logger.warn({ label, ms }, 'anis: slow library call — degraded to empty'); return fallback; }
    if (r.e) { logger.warn({ label, err: r.e?.message }, 'anis: library call failed — degraded to empty'); return fallback; }
    return r.v;
  } finally { clearTimeout(timer); }
}

/** Wrap named async tools so each degrades to its fallback ([] for lists, null for a single result). */
export function withDeadlines(tools, spec, ms = TOOL_DEADLINE_MS()) {
  const out = { ...tools };
  for (const [name, fallback] of Object.entries(spec)) {
    const f = tools[name];
    if (typeof f === 'function') out[name] = (...a) => withDeadline(() => f(...a), ms, Array.isArray(fallback) ? [] : fallback, name);
  }
  return out;
}
