// Companion §6 — premise & bias examination. RULE: profile the INQUIRY, not the person. We store
// contextual, EXPIRING hypotheses about a claim's reasoning — never fixed labels ("materialist",
// "fundamentalist", "closed"). Explicit correction overrides inference immediately. The distinction
// library is the heart: the Bahá'í frame joins material and spiritual advancement, so we reject BOTH
// reductive materialism AND evidence-free spiritualization — examined symmetrically. Pure logic.

// §6.1 Required distinction library — each entry: the conflation to watch for + the clarifying pair.
export const DISTINCTIONS = [
  { key: 'science_vs_scientism', a: 'science (a method)', b: 'scientism (the claim that only science yields truth)' },
  { key: 'methodological_vs_metaphysical_naturalism', a: 'methodological naturalism (a working assumption)', b: 'metaphysical naturalism (a claim that nature is all there is)' },
  { key: 'empirical_evidence_vs_only_empirical', a: 'valuing empirical evidence', b: 'the claim that only empirical knowledge is valid' },
  { key: 'secular_governance_vs_relativism', a: 'secular governance', b: 'moral relativism' },
  { key: 'material_remedies_vs_reductionism', a: 'material/political remedies', b: 'reducing all problems to institutions/incentives' },
  { key: 'pluralism_vs_truth_relativism', a: 'pluralism (respect across differences)', b: 'truth-relativism (no view is truer)' },
  { key: 'autonomy_vs_individualism', a: 'autonomy', b: 'atomized individualism' },
  { key: 'equality_vs_sameness', a: 'equality', b: 'sameness' },
  { key: 'faith_vs_fideism', a: 'faith', b: 'fideism (belief against/without reason)' },
  { key: 'revelation_vs_private_certainty', a: 'revelation', b: 'private spiritual certainty' },
  { key: 'unity_vs_uniformity', a: 'unity', b: 'uniformity' },
  { key: 'nonpartisanship_vs_indifference', a: 'nonpartisanship', b: 'indifference' },
  { key: 'spiritual_causation_vs_dismissing_material', a: 'spiritual causation', b: 'dismissal of material conditions' },
  { key: 'moral_conviction_vs_prejudice', a: 'moral conviction', b: 'prejudice / moralism' },
];

// §6.2 Challenge ladder. Each level has an eligibility gate. Level rises only with evidence + permission,
// and is REDUCED after pressure, misrepresentation, or correction. Never raised because a user is vulnerable.
export const CHALLENGE_LEVELS = [
  { level: 0, action: 'Answer only', eligible: 'Facts, distress, or challenge disabled' },
  { level: 1, action: 'Clarify term/category', eligible: 'Ambiguity affects the answer' },
  { level: 2, action: 'Offer a distinction', eligible: 'Likely conflation / category error' },
  { level: 3, action: 'Mirror the premise tentatively', eligible: 'Evidence sufficient; permission unless pre-authorized' },
  { level: 4, action: 'Steelman then counterframe', eligible: 'Trust and permission present' },
  { level: 5, action: 'Structured worldview comparison / thought experiment', eligible: 'Explicit depth/direct-challenge request' },
  { level: 6, action: 'Primary-text inquiry plan', eligible: 'Sustained examination requested' },
];

/**
 * Compute the permitted challenge level ceiling from dials + safety + consent.
 * @param {object} ctx { challenge_mode, challenge_intensity, distress, corrected, misrepresented, permission }
 */
export function permittedChallengeLevel(ctx = {}) {
  // Hard floor to 0 on safety: distress, an active correction, or answer-only mode.
  if (ctx.distress || ctx.challenge_mode === 'answer-only') return 0;
  if (ctx.corrected || ctx.misrepresented) return Math.min(1, Number(ctx.challenge_intensity) || 0);

  const intensity = Math.max(0, Math.min(5, Number(ctx.challenge_intensity ?? 2)));
  let ceiling;
  switch (ctx.challenge_mode) {
    case 'direct': ceiling = 5; break;         // explicit direct-challenge request
    case 'contextual': ceiling = 4; break;      // challenge woven in when relevant
    case 'ask-first': ceiling = ctx.permission ? 4 : 2; break;   // default: distinctions freely, deeper needs a yes
    default: ceiling = 2;
  }
  // Level 5/6 require an explicit depth/plan request regardless of intensity.
  if (!ctx.depthRequested && ceiling > 4) ceiling = 4;
  return Math.min(ceiling, intensity + (ctx.depthRequested ? 2 : 1));
}

// The challenge FORM (§6.2): the fixed, fair shape of any challenge above level 2.
export const CHALLENGE_FORM = [
  'Steelman the user’s position first.',
  'Name the premise tentatively (a hypothesis, never a label about the person).',
  'Explain why the premise matters to the answer.',
  'Present a credible alternative and its cost.',
  'Show the Bahá’í reframing.',
  'Leave disagreement open; offer a source or to stop.',
];

// A premise hypothesis record (§6). Confidence + expiry; correction history. Never a fixed personal label.
export function makePremiseHypothesis({ statement, category, confidence = 0.5, context = '', ttlHours = 72 }) {
  return {
    statement: String(statement || '').slice(0, 300),
    category: category || 'unspecified',
    status: 'hypothesis',
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    context: String(context || '').slice(0, 200),
    expires_at_hours: ttlHours,   // caller stamps an absolute time
  };
}

// Detect a likely conflation the answer should clarify (lightweight keyword pass over the user message).
// Returns the matching distinction or null. NOT a personal label — a claim-level signal.
export function detectConflation(message = '') {
  const m = String(message || '').toLowerCase();
  if (/science\b.{0,20}\bdisprov|science\b.{0,20}\b(has )?prov(ed|en)?\b.{0,20}\b(no |isn'?t a |there is no )?god|science\b.{0,20}\bno god|science shows there is no|science says (there is )?no god/.test(m)) return DISTINCTIONS[0];
  if (/only (what is |things )?(measurable|empirical|physical|material)|nothing beyond the physical/.test(m)) return DISTINCTIONS[2];
  if (/all (truth|morality) is relative|no religion is truer|who's to say/.test(m)) return DISTINCTIONS[5];
  if (/religion is just|faith is believing without/.test(m)) return DISTINCTIONS[8];
  if (/all religions are the same|every religion says the same/.test(m)) return DISTINCTIONS[10];
  return null;
}
