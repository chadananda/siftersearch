// Companion §5.1 + §10.1 — the decision engine. Given the resolved state (mode, dials, evidence,
// consent, safety) it chooses ONE intervention, including NONE / NO_OUTREACH. More intervention is
// NOT always better: the score rewards truth, understanding, autonomy, accompaniment and PENALISES
// uncertainty, misrepresentation, interruption, pressure, dependency. Pure logic, unit-testable.

import { permittedChallengeLevel, detectConflation } from './premise.js';

export const INTERVENTIONS = [
  'S01_ANSWER', 'S02_AUTHORITY', 'S03_CONTEXT', 'S04_PREMISE', 'S05_COUNTERFRAME',
  'S06_COMPARE', 'S07_RESEARCH', 'S08_READING', 'S09_INQUIRY_MAP', 'S10_COURSE',
  'S11_HUMAN', 'S12_NO_OUTREACH', 'NONE',
];

/**
 * Decide the response plan skeleton for a turn.
 * @param {object} state {
 *   mode, dials, message, evidenceCount, hasAuthoritative, traditionsCovered,
 *   distress, corrected, misrepresented, permission, depthRequested,
 *   authorityConflated,   // "what do Bahá'ís believe" style → needs S02
 *   evidenceGap,          // retrieval thin/conflicting → S07
 *   sustainedInquiry,     // multi-session → S09 eligible
 *   courseSignal,         // course_invite_threshold met
 *   humanRequested,       // explicit request or offer accepted
 *   memoryOfferable,      // unconnected seeker, real inquiry, not asked recently → S09 (invite to connect)
 * }
 * @returns {object} { intervention, challengeLevel, distinction, addAuthorityLayer, nextStep, reasons }
 */
export function decide(state = {}) {
  const d = state.dials || {};
  const reasons = [];

  // ── Hard gates first (safety/consent) — §10.1 "if blocks: narrow answer or NONE" ──
  if (state.distress) {
    reasons.push('distress → answer + support only, no challenge/funnel');
    return plan('S01_ANSWER', { challengeLevel: 0, supportOffer: true, reasons });
  }

  // ── The stated question is always answered first (§3 answer order). Start from ANSWER. ──
  let intervention = 'S01_ANSWER';

  // Authority conflation ("what do Bahá'ís believe about X") → separate the authority layers.
  const addAuthorityLayer = !!state.authorityConflated || state.mode === 'DOCTRINAL';
  if (state.authorityConflated) { intervention = 'S02_AUTHORITY'; reasons.push('authority conflation → separate text/interpretation/guidance/practice/synthesis'); }

  // Evidence gap or conflict → research rather than a confident guess.
  if (state.evidenceGap) { intervention = 'S07_RESEARCH'; reasons.push('evidence gap/conflict → deeper source investigation'); }

  // Interfaith mode → primary-source comparison.
  if (state.mode === 'INTERFAITH') { intervention = 'S06_COMPARE'; reasons.push('interfaith → each tradition from its own primary sources'); }

  // Challenge: only up to the permitted ceiling, only when a conflation is actually present.
  const challengeLevel = permittedChallengeLevel({
    challenge_mode: d.challenge_mode, challenge_intensity: d.challenge_intensity,
    distress: state.distress, corrected: state.corrected, misrepresented: state.misrepresented,
    permission: state.permission, depthRequested: state.depthRequested,
  });
  const distinction = detectConflation(state.message);
  if (distinction && challengeLevel >= 2 && !state.evidenceGap && state.mode !== 'PERSONAL_REFLECTIVE') {
    intervention = challengeLevel >= 4 ? 'S05_COUNTERFRAME' : 'S04_PREMISE';
    reasons.push(`conflation (${distinction.key}) + challenge L${challengeLevel} → ${intervention}`);
  }

  // ── A single optional next step (never a funnel). Precedence: human request > course signal > reading. ──
  let nextStep = null;
  if (state.humanRequested) { nextStep = 'S11_HUMAN'; reasons.push('human connection requested/accepted'); }
  else if (state.courseSignal && (d.relationship_mode === 'study' || state.sustainedInquiry)) { nextStep = 'S10_COURSE'; reasons.push('sustained interest → offer 1–2 tracks (not vulnerability-triggered)'); }
  else if (state.sustainedInquiry && state.mode === 'STUDY') { nextStep = 'S08_READING'; reasons.push('study → one exact passage advances inquiry'); }
  // The invitation to connect IS the one voluntary step for this turn — it never rides along with
  // another, so the seeker is asked for at most one thing at a time (§3 answer order, §7.3 no pressure).
  else if (state.memoryOfferable) { nextStep = 'S09_INQUIRY_MAP'; reasons.push('sustained inquiry, not connected → invite to connect (declinable, asked once)'); }

  // Never attach a course/human step in a personal-reflective/distress turn (§3 FORBIDDEN).
  if (state.mode === 'PERSONAL_REFLECTIVE' && ['S10_COURSE', 'S11_HUMAN', 'S09_INQUIRY_MAP'].includes(nextStep) && !state.humanRequested) {
    nextStep = null; reasons.push('suppressed funnel in personal-reflective turn');
  }

  return plan(intervention, { challengeLevel, distinction: distinction?.key || null, addAuthorityLayer, nextStep, reasons });
}

function plan(intervention, extra) {
  return { intervention, challengeLevel: 0, distinction: null, addAuthorityLayer: false, nextStep: null, supportOffer: false, ...extra };
}

/**
 * Proactive-contact decision (§7.3). Returns 'SEND' only with a concrete trigger + budget + no fatigue;
 * otherwise 'S12_NO_OUTREACH'. Silence over weak contact (no_outreach_bias).
 */
export function decideOutreach(ctx = {}) {
  const d = ctx.dials || {};
  const reasons = [];
  if (ctx.ignoredLastCheckin) { reasons.push('ignored check-in → quiet'); return { action: 'S12_NO_OUTREACH', reasons }; }
  if ((ctx.contactsThisWeek || 0) >= (d.proactive_contacts_week ?? 0)) { reasons.push('weekly contact budget reached'); return { action: 'S12_NO_OUTREACH', reasons }; }
  if (ctx.withinCooldownHours) { reasons.push('within follow-up cooldown'); return { action: 'S12_NO_OUTREACH', reasons }; }
  const hasTrigger = ctx.requestedFollowupDue || ctx.userPlanDue || ctx.meaningfulCourseEvent || ctx.explicitCadenceDue;
  if (!hasTrigger) { reasons.push('no concrete trigger → silence (no_outreach_bias)'); return { action: 'S12_NO_OUTREACH', reasons }; }
  reasons.push('concrete user-created trigger + budget available → send once');
  return { action: 'SEND', reasons };
}
