// Companion §5 — conversation modes + response policy. Each mode requires different evidence and tone.
// The mode is derived from the existing intent/entity classification (jafar-pipeline) plus light signals,
// so we reuse the LLM classification we already do — no second model call. Pure logic, unit-testable.

export const MODES = {
  HISTORICAL: { evidence: 'Primary/authoritative history; scholarship for disputes', behavior: 'Chronology, source proximity, perspective, dispute, confidence' },
  DOCTRINAL: { evidence: 'Direct B1–B3 support per core claim + context', behavior: 'Direct answer, authority layer, text context, interpretation limits' },
  INTERFAITH: { evidence: '≥1 primary source per tradition (I1); I2 for diversity', behavior: 'Each tradition from its own sources; convergence, divergence, category difference' },
  PHILOSOPHICAL: { evidence: 'Define terms; separate premise / empirical / metaphysical / value', behavior: 'Claim, premise, evidence standard, alternatives, implications' },
  PERSONAL_REFLECTIVE: { evidence: 'Source principles + explicit uncertainty', behavior: 'Acknowledge stakes; no diagnosis/prescription; voluntary reflection' },
  STUDY: { evidence: 'The text itself + related authority', behavior: 'Text orientation, context, comprehension, interpretation, progress' },
  PRACTICAL_COMMUNITY: { evidence: 'Verified practical info; consented human route', behavior: 'Practical facts; AI is not a community authority' },
};

// Fold diacritics + curly apostrophes so "Bahá’í"/"Íqán"/"‘Abdu’l-Bahá" match ASCII-written regexes.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’`´]/g, "'");
const has = (re, s) => re.test(norm(s));

/**
 * Derive the conversation mode from the classifier's intent/entities + the message.
 * @param {object} c { intent, comparative, traditions, quoted_span, named_persons, topics }
 * @param {string} message the user's latest message
 * @returns {string} a MODES key
 */
export function classifyMode(c = {}, message = '') {
  const m = String(message || '').toLowerCase();
  const traditions = Array.isArray(c.traditions) ? c.traditions : [];

  // Interfaith: explicit comparison OR ≥2 traditions in play.
  if (c.comparative || traditions.length >= 2) return 'INTERFAITH';

  // Study FIRST (before personal): reading/understanding a specific text or being walked through one.
  // ("help me read…" is study, not distress — so the study check precedes the personal one.)
  if (has(/\b(read|reading|study|explain the (text|passage|chapter)|walk me through|help me (read|understand) .* (book|text|chapter|iqan|aqdas|gleanings)|what does .* chapter)\b/, m) || c.intent === 'study') {
    return 'STUDY';
  }

  // Personal-reflective: genuine first-person emotional/life stakes (NOT generic "help me").
  if (has(/\b(i feel|i am struggling|i'?m struggling|my (grief|loss|divorce|illness|marriage|father|mother|wife|husband|life)|i lost|going through|depressed|anxious|lonely|suffering|hopeless)\b/, m)) {
    return 'PERSONAL_REFLECTIVE';
  }

  // Practical/community: how to attend, join, contact, find a community, dates of events.
  if (has(/\b(how do i (attend|join|contact|find)|is there a (community|group|assembly)|feast|holy day date|nearest|local baha)\b/, m)) {
    return 'PRACTICAL_COMMUNITY';
  }

  // Philosophical: reasoning about existence/truth/meaning, "prove", "does god exist", premises.
  if (has(/\b(prove|proof|does god exist|meaning of life|free will|why (is there|does)|is it rational|epistemolog|metaphysic|consciousness|materialis|determinis|objective (truth|morality))\b/, m)) {
    return 'PHILOSOPHICAL';
  }

  // Historical: dates, events, who/when, named persons in a history frame.
  if (has(/\b(when did|what year|what happened at|history of|who was|martyr|episode|upheaval|born|died|persecution)\b/, m) || (c.named_persons?.length && !c.comparative)) {
    return 'HISTORICAL';
  }

  // Default doctrinal for "what do Bahá'ís believe / teach about X", definitions, and general asks.
  return 'DOCTRINAL';
}

// Minimum-evidence gate per mode (§4.3): does the retrieved evidence meet the bar for a confident answer?
export function meetsEvidenceBar(mode, { retrievedCount = 0, traditionsCovered = 0, hasAuthoritative = false } = {}) {
  switch (mode) {
    case 'DOCTRINAL': return hasAuthoritative && retrievedCount >= 1;
    case 'INTERFAITH': return traditionsCovered >= 2 && retrievedCount >= 2;
    case 'HISTORICAL': return retrievedCount >= 1;
    default: return retrievedCount >= 1;   // philosophical/personal/study/practical: answer + explicit uncertainty
  }
}
