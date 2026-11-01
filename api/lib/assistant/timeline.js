// Per-turn stage timeline: timed(name, fn, describe?) pushes {name, start, ms, ...describe(result)} onto the open turn scope's
// `timeline` (ai-context); no-op outside one. timelineOf() → [{name, at (ms since turn start), ms, ...}] for the stored path (route.timeline).
import { currentAIContext } from '../ai-context.js';

export async function timed(name, fn, describe) {
  const tl = currentAIContext().timeline;
  if (!Array.isArray(tl)) return fn();
  const start = Date.now();
  let out;
  try { out = await fn(); return out; } finally {
    let extra = null;
    try { extra = describe && out !== undefined ? describe(out) : null; } catch { extra = null; }
    tl.push({ name, start, ms: Date.now() - start, ...(extra || {}) });
  }
}

export const timelineOf = (tl, t0) => (tl || []).map(({ name, start, ms, ...rest }) => ({ name, at: start - t0, ms, ...rest })).sort((a, b) => a.at - b.at);
