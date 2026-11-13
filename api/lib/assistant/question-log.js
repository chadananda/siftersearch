// Question log glue: embedding page → host (privacy: hostname only), similarity → outcome, fire-and-forget row. Deps: answer-cache (hash), question-log-repo
import { questionHash } from '../answer-cache.js';
import { SAME_QUESTION, RESEARCH_THRESHOLD } from './research-cache.js';

/** Request headers → the embedding page's hostname (Origin, else Referer), never path/query; junk → null. Pure. */
export function siteOf(headers = {}) {
  for (const v of [headers.origin, headers.referer, headers.referrer]) {
    try { const h = new URL(String(v)).hostname.toLowerCase(); if (h && /^[a-z0-9.-]+$/.test(h) && h !== 'null') return h.slice(0, 120); } catch { /* next */ }
  }
  return null;
}
/** hit = same question (≥ 0.88), related ≥ 0.75, else miss. Pure. */
export const outcomeOf = (similarity) => (similarity >= SAME_QUESTION ? 'hit' : similarity >= RESEARCH_THRESHOLD ? 'related' : 'miss');

/** Record one researched question; never throws, never blocks (returns the promise for tests). */
export function logTurnQuestion({ question, hit = null, channel = null, site = null, format = null, ms = null }, { repo = null } = {}) {
  return (async () => {
    const q = String(question || '').trim();
    if (!q) return null;
    const similarity = hit?.similarity ?? null;
    const r = repo || await import('../repos/question-log-repo.js');
    await r.logQuestion({ question: q.slice(0, 500), hash: questionHash(q), format, researchSetId: hit?.setId ?? null, similarity, outcome: similarity == null ? 'miss' : outcomeOf(similarity), channel, site, ms });
    return true;
  })().catch((err) => { console.warn(`[anis] question log failed: ${err.message}`); return null; });
}
