// The 'teachings' class check (research battery cases 19+, 11-04): on a social or legal question the reply cites the Writings
// proper (the draft job's `cited` tiers, source-tier.js), names any cited talk or pilgrim's note as spoken or recalled, and never
// offers a search it could run (lint.js search-offer). Reads the REPLY and the job's metadata, never the question. Pure.
import { LINT } from './lint.js';

const OFFER = LINT.find((x) => x.id === 'search-offer').re;
const SPOKEN = /\b(talks?|spoke|said|says|address(?:ed)?|recorded|reported|recalled|recollect\w*|pilgrims?['’]?\s+notes?)\b/i;

/** a: { text, cited: [{ tier }] } → { writings, reported_labelled, no_offer, pass, tiers }. */
export function teachingsCheck(a = {}) {
  const cited = Array.isArray(a.cited) ? a.cited : [];
  const writings = cited.some((c) => c.tier === 'writings');
  const reported = cited.some((c) => c.tier === 'reported');
  const out = { writings, reported_labelled: !reported || SPOKEN.test(a.text || ''), no_offer: !OFFER.test(a.text || '') };
  return { ...out, pass: out.writings && out.reported_labelled && out.no_offer,
    tiers: cited.reduce((m, c) => ({ ...m, [c.tier || 'other']: (m[c.tier || 'other'] || 0) + 1 }), {}) };
}
