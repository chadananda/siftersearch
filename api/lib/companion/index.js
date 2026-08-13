// Companion orchestrator (§5, §9, §10). The ONE entry the chat pipeline calls: given a turn's context
// it resolves dials (with precedence), classifies mode, runs the decision engine, labels evidence by
// authority class, and returns a structured response_plan (§5.2) the crafter renders — plus the
// constitution system-prompt block. The LLM renders an APPROVED, evidenced plan; it does not improvise
// doctrine, persuasion policy, or hidden memory. Pure composition over the sibling pure modules + store.
import { classifyAuthority, labelForClass, attributionStem } from './authority.js';
import { buildConstitution } from './personality.js';
import { classifyMode, meetsEvidenceBar } from './modes.js';
import { resolveDials, POLICY_VERSION } from './dials.js';
import { decide } from './decision.js';
import { makePremiseHypothesis, CHALLENGE_FORM, detectConflation } from './premise.js';
import * as store from './store.js';

// Fold diacritics + curly apostrophes before matching so "Bahá’ís" matches an ASCII-written regex
// (baha'?is). Without this, every Bahá'í-name detector silently misses the app's own spelling.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’`´]/g, "'");
const has = (re, s) => re.test(norm(s));

// Compute relationship stage (§2.2) from consent + account + enrollment (never presumes consent).
export function relationshipStage({ authed, consentMemory, consentContact, hasPlan, enrolled, quiet } = {}) {
  if (quiet) return 'RQ_QUIET';
  if (enrolled) return 'R4_COURSE';
  if (hasPlan) return 'R3_PLAN';
  if (consentMemory) return 'R2_COMPANION';
  if (authed) return 'R1_RETURN';
  return 'R0_SESSION';
}

// Detect the two safety/consent signals that hard-floor challenge + suppress funnels (§12.2).
export function detectDistress(message) {
  return has(/\b(suicid|kill myself|self-harm|hurt myself|want to die|abused|abusing me|can'?t go on|hopeless|hear voices|being persecuted|god (told|commanded) me)\b/, message);
}
function detectAuthorityConflation(message, mode) {
  return mode === 'DOCTRINAL' && has(/\bwhat do baha'?is (believe|think|say)|the baha'?i (position|view|belief) (on|about)|do baha'?is believe\b/, message);
}
function detectPermission(message) {
  return has(/\b(challenge me|push back|play devil'?s advocate|be honest|don'?t hold back|question my|examine my assumption|is that a fair|change my mind)\b/, message);
}
function detectDepthRequest(message) {
  return has(/\b(challenge me directly|go deep|really dig|thoroughly|steelman|strongest (case|argument|objection)|change my mind)\b/, message);
}
function detectAnswerOnly(message) {
  return has(/\b(just (answer|the facts|tell me)|don'?t (analy[sz]e|challenge|lecture)|no (lecture|sermon|analysis)|only the answer)\b/, message);
}

/**
 * Build the companion plan for a turn.
 * @param {object} ctx {
 *   participantId, authed, message, thread_id,
 *   classifier,     // { intent, comparative, traditions, quoted_span, named_persons, topics }
 *   evidenceDocs,   // [{ author, title, collection, religion, ... }] the retrieved passages' docs
 *   evidenceCount, traditionsCovered,
 *   relationship,   // the companion_relationship row (dials override + consent + stage)
 *   globalDials,    // admin global dial overrides
 *   sustainedInquiry, courseSignal, humanRequested,
 *   turnsSoFar,          // exposures logged for this participant — how real the inquiry already is
 *   connectOfferedRecently, // we already invited them to connect lately; asking again is pressure
 * }
 * @returns {object} { plan, systemAppend, authorityClasses, dials }
 */
export function buildCompanionPlan(ctx = {}) {
  const message = ctx.message || '';
  const classifier = ctx.classifier || {};
  const mode = classifyMode(classifier, message);

  // Authority-label the evidence (§4): each retrieved passage → class → claim label + attribution stem.
  const authorityClasses = (ctx.evidenceDocs || []).slice(0, 12).map((d) => {
    const cls = classifyAuthority(d);
    return { doc_id: d.doc_id || d.id, title: d.title || d.source_title, class: cls, label: labelForClass(cls), stem: attributionStem(cls) };
  });
  const hasAuthoritative = authorityClasses.some((a) => ['B1_REVEALED', 'B2_AUTH_INTERPRETATION', 'B3_UHJ_GUIDANCE'].includes(a.class));

  // Dial precedence layers (§10.2). safety/consent/source are computed; preference = participant override;
  // global = admin. Higher precedence wins in resolveDials.
  const distress = detectDistress(message);
  const answerOnly = detectAnswerOnly(message);
  const safetyLayer = {};
  if (distress || answerOnly) { safetyLayer.challenge_mode = 'answer-only'; safetyLayer.challenge_intensity = 0; }
  const consentLayer = {};
  if (!ctx.relationship?.consent_memory) consentLayer.memory_depth = 'minimal';
  if (!ctx.relationship?.consent_contact) consentLayer.proactive_contacts_week = 0;
  const preferenceLayer = (() => { try { return JSON.parse(ctx.relationship?.dials_json || '{}'); } catch { return {}; } })();
  if (detectPermission(message)) preferenceLayer.challenge_mode = preferenceLayer.challenge_mode || 'direct';

  const { values: dials, provenance } = resolveDials({
    safety: safetyLayer,
    consent: consentLayer,
    preference: preferenceLayer,
    global: ctx.globalDials || {},
  });

  // Evidence bar (§4.3) — thin/absent authoritative evidence in doctrinal/interfaith mode = a gap.
  const evidenceGap = !meetsEvidenceBar(mode, { retrievedCount: ctx.evidenceCount || authorityClasses.length, traditionsCovered: ctx.traditionsCovered || 0, hasAuthoritative });

  // Inviting them to CONNECT (§7.1/§7.3). Connecting — sharing an email through One Tap — IS the
  // permission to retain, so this offer only makes sense for a seeker who has not connected: an
  // account already granted it. Gated on a real, ongoing inquiry, not asked recently, and NEVER out of
  // a vulnerable turn, where any offer reads as a hook.
  const turnsNeeded = Number(dials.memory_offer_after_turns ?? 3);
  const connectOfferable = !!ctx.participantId
    && !ctx.authed
    && !ctx.relationship?.consent_memory
    && !ctx.connectOfferedRecently
    && (ctx.sustainedInquiry || (ctx.turnsSoFar ?? 0) >= turnsNeeded)
    && !distress && !answerOnly
    && mode !== 'PERSONAL_REFLECTIVE';

  const decision = decide({
    mode, dials, message,
    evidenceCount: ctx.evidenceCount || authorityClasses.length, hasAuthoritative, traditionsCovered: ctx.traditionsCovered || 0,
    distress, corrected: ctx.corrected, misrepresented: ctx.misrepresented,
    permission: detectPermission(message), depthRequested: detectDepthRequest(message),
    authorityConflated: detectAuthorityConflation(message, mode),
    evidenceGap, sustainedInquiry: ctx.sustainedInquiry, courseSignal: ctx.courseSignal, humanRequested: ctx.humanRequested,
    memoryOfferable: connectOfferable,
  });

  const plan = {
    mode,
    intervention: decision.intervention,
    challenge_level: decision.challengeLevel,
    add_authority_layer: decision.addAuthorityLayer,
    distinction: decision.distinction,
    next_step: decision.nextStep,
    support_offer: decision.supportOffer || false,
    connect_offer: decision.nextStep === 'S09_INQUIRY_MAP',   // the interface renders this choice, not the prose
    evidence_gap: evidenceGap,
    authority_classes: authorityClasses,
    reasons: decision.reasons,
    policy_version: POLICY_VERSION,
  };

  return { plan, dials, provenance, authorityClasses, systemAppend: renderSystemAppend(plan, dials, mode) };
}

// The crafter system-prompt block that enacts the plan (appended to the personality constitution).
function renderSystemAppend(plan, dials, mode) {
  const lines = [];
  if (plan.add_authority_layer) {
    lines.push('SEPARATE THE AUTHORITY LAYERS: distinguish revealed Scripture, authorized interpretation (‘Abdu’l-Bahá/Shoghi Effendi), Universal House of Justice guidance, official exposition, history, scholarship, community practice, and your own synthesis. Never present community practice or your synthesis as doctrine, and never call House of Justice guidance "authorized interpretation".');
  }
  if (plan.evidence_gap) {
    lines.push('EVIDENCE IS THIN for a confident claim here: answer narrowly, state plainly what is not established in the retrieved sources, and do not fill the gap with confident synthesis. Prefer "the sources here do not settle this" over a guess.');
  }
  if (plan.intervention === 'S04_PREMISE' || plan.intervention === 'S05_COUNTERFRAME') {
    lines.push(`A premise may be worth examining (challenge level ${plan.challenge_level}). If you do, use this exact shape: ${CHALLENGE_FORM.join(' → ')}. Frame it as a tentative hypothesis about the reasoning, never a label about the person. Answer the question first.`);
  }
  if (mode === 'INTERFAITH') lines.push('Represent EACH tradition from ITS OWN primary sources; show convergence, divergence, and category differences without caricature. Never compare from Bahá’í summaries alone.');
  if (mode === 'PERSONAL_REFLECTIVE') lines.push('Acknowledge the stakes with care. Do NOT diagnose or prescribe, and do NOT turn this into a teaching, course, or contact opportunity. Offer voluntary reflection or human support only.');
  if (plan.next_step === 'S09_INQUIRY_MAP') lines.push('The interface itself offers to connect an account (which is what permits remembering), so do NOT ask about signing in, saving, remembering, or creating an account in your answer — asking as well would be asking twice.');
  else if (plan.next_step) lines.push(`You MAY offer exactly ONE voluntary next step (${plan.next_step}) at the end — never a funnel, never urgent, always declinable.`);
  else lines.push('Do NOT append a course pitch, human-contact offer, or call to action this turn.');
  const qd = Number(dials.quote_density);
  lines.push(`Use at most ${qd} block quotation${qd === 1 ? '' : 's'}; cite sources so a reader can verify, but do not quote-dump.`);
  return lines.length ? `\n\nTHIS TURN:\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
}

// Re-export the constitution + store + hard rules for callers.
export { buildConstitution };
export { makePremiseHypothesis };
export { MUST_RULES, FORBIDDEN } from './personality.js';
export const companionStore = store;
