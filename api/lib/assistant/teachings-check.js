// The 'teachings' class check (research battery cases 19+, 11-04): on a social or legal question the reply cites the Writings
// proper (the draft job's `cited` tiers, source-tier.js), names any cited talk or pilgrim's note as spoken or recalled, and never
// offers a search it could run (lint.js search-offer); and the research reached the Writings in their original Persian/Arabic
// (a research step that showed an original — researcher.js steps[].originals — or an originals_search, or a cited original).
// Reads the REPLY and the job's metadata (cited, research.steps), never the question. Pure.
import { LINT } from './lint.js';

const OFFER = LINT.find((x) => x.id === 'search-offer').re;
const SPOKEN = /\b(talks?|spoke|said|says|address(?:ed)?|recorded|reported|recalled|recollect\w*|pilgrims?['’]?\s+notes?)\b/i;

const ORIGINAL_LANG = /^(ar|fa|per|pes)/i;
/** Did the research search the original-language Writings? From the job's steps and cited languages only. Pure. */
export const originalsSearched = (a = {}) => (a.research?.steps || []).some((s) => s.originals > 0 || s.tool === 'originals_search')
  || (Array.isArray(a.cited) ? a.cited : []).some((c) => ORIGINAL_LANG.test(String(c.language || '')));

/** a: { text, cited: [{ tier, language }], research: { steps } } → { writings, reported_labelled, no_offer, originals_searched, pass, tiers }. */
export function teachingsCheck(a = {}) {
  const cited = Array.isArray(a.cited) ? a.cited : [];
  const writings = cited.some((c) => c.tier === 'writings');
  const reported = cited.some((c) => c.tier === 'reported');
  const out = { writings, reported_labelled: !reported || SPOKEN.test(a.text || ''), no_offer: !OFFER.test(a.text || ''), originals_searched: originalsSearched(a) };
  return { ...out, pass: out.writings && out.reported_labelled && out.no_offer && out.originals_searched,
    tiers: cited.reduce((m, c) => ({ ...m, [c.tier || 'other']: (m[c.tier || 'other'] || 0) + 1 }), {}) };
}
