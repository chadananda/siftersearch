// Per-turn stage timeline: timed(name, fn) pushes {name, start, ms} onto the open turn scope's `timeline` (ai-context); no-op outside one.
// timelineOf() turns it into [{name, at (ms since turn start), ms}] for the stored path (route.timeline in the thread view).
import { currentAIContext } from '../ai-context.js';

export async function timed(name, fn) {
  const tl = currentAIContext().timeline;
  if (!Array.isArray(tl)) return fn();
  const start = Date.now();
  try { return await fn(); } finally { tl.push({ name, start, ms: Date.now() - start }); }
}

export const timelineOf = (tl, t0) => (tl || []).map(({ name, start, ms }) => ({ name, at: start - t0, ms })).sort((a, b) => a.at - b.at);
