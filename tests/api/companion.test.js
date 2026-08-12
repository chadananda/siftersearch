// Seeker Companion — pure-logic tests for the PRD invariants (§3, §4, §5, §6, §10) + §14 acceptance
// scenarios. No DB/network — the store layer is integration-tested separately; here we prove the
// decision core is correct and the invariants hold.
import { describe, it, expect } from 'vitest';
import { classifyAuthority, labelForClass, NON_DOCTRINE_LABELS } from '../../api/lib/companion/authority.js';
import { classifyMode, meetsEvidenceBar } from '../../api/lib/companion/modes.js';
import { resolveDials, validateDial, SEED_DIALS } from '../../api/lib/companion/dials.js';
import { permittedChallengeLevel, detectConflation } from '../../api/lib/companion/premise.js';
import { decide, decideOutreach } from '../../api/lib/companion/decision.js';
import { buildConstitution, MUST_RULES, FORBIDDEN } from '../../api/lib/companion/personality.js';
import { recommendTracks } from '../../api/lib/companion/courses.js';
import { relationshipStage, detectDistress, buildCompanionPlan } from '../../api/lib/companion/index.js';

describe('§4 authority classes — the distinctions that prevent opinion becoming doctrine', () => {
  it('classifies the Central Figures and institutions correctly', () => {
    expect(classifyAuthority({ author: 'Bahá’u’lláh', title: 'Gleanings', religion: "Baha'i" })).toBe('B1_REVEALED');
    expect(classifyAuthority({ title: 'The Hidden Words', religion: "Baha'i" })).toBe('B1_REVEALED');
    expect(classifyAuthority({ author: 'Shoghi Effendi', title: 'God Passes By', religion: "Baha'i" })).toBe('B2_AUTH_INTERPRETATION');
    expect(classifyAuthority({ author: '‘Abdu’l-Bahá', title: 'Some Answered Questions', religion: "Baha'i" })).toBe('B2_AUTH_INTERPRETATION');
    expect(classifyAuthority({ title: 'Ridvan Message 2020', author: 'Universal House of Justice', religion: "Baha'i" })).toBe('B3_UHJ_GUIDANCE');
  });
  it('separates history and scholarship from doctrine', () => {
    expect(classifyAuthority({ title: 'The Dawn-Breakers', collection: 'History', religion: "Baha'i" })).toBe('H1_PRIMARY_HISTORY');
    expect(classifyAuthority({ title: 'A Note on Numbers', collection: 'Bahai Studies papers', religion: "Baha'i" })).toBe('H2_SCHOLARSHIP');
  });
  it('represents other traditions from their own primary sources', () => {
    expect(classifyAuthority({ title: 'The Gospel of John', religion: 'Christian' })).toBe('I1_TRADITION_PRIMARY');
    expect(classifyAuthority({ title: 'The Bhagavad Gita', religion: 'Hindu' })).toBe('I1_TRADITION_PRIMARY');
  });
  it('B3 (House of Justice) is guidance, NEVER authorized interpretation', () => {
    expect(labelForClass('B3_UHJ_GUIDANCE')).toBe('INSTITUTIONAL_GUIDANCE');
    expect(labelForClass('B2_AUTH_INTERPRETATION')).toBe('AUTHORIZED_INTERPRETATION');
    expect(labelForClass('B1_REVEALED')).toBe('EXPLICIT_TEXT');
  });
  it('community practice + AI synthesis can never be doctrine', () => {
    expect(NON_DOCTRINE_LABELS.has('COMMUNITY_PRACTICE')).toBe(true);
    expect(NON_DOCTRINE_LABELS.has('ASSISTANT_SYNTHESIS')).toBe(true);
  });
});

describe('§5 conversation modes', () => {
  it('routes each mode from classifier + message', () => {
    expect(classifyMode({ comparative: true }, 'compare Bahá’í and Buddhist views')).toBe('INTERFAITH');
    expect(classifyMode({ traditions: ['Baha\'i', 'Islam'] }, 'x')).toBe('INTERFAITH');
    expect(classifyMode({}, 'I am struggling with grief after my father died')).toBe('PERSONAL_REFLECTIVE');
    expect(classifyMode({}, 'help me read the Kitáb-i-Íqán chapter')).toBe('STUDY');
    expect(classifyMode({}, 'does god exist and is it rational to believe')).toBe('PHILOSOPHICAL');
    expect(classifyMode({ named_persons: ['Mullá Husayn'] }, 'who was he and when did he die')).toBe('HISTORICAL');
    expect(classifyMode({}, 'what do Bahá’ís believe about the soul')).toBe('DOCTRINAL');
  });
  it('doctrinal needs authoritative evidence; interfaith needs ≥2 traditions', () => {
    expect(meetsEvidenceBar('DOCTRINAL', { retrievedCount: 3, hasAuthoritative: false })).toBe(false);
    expect(meetsEvidenceBar('DOCTRINAL', { retrievedCount: 1, hasAuthoritative: true })).toBe(true);
    expect(meetsEvidenceBar('INTERFAITH', { retrievedCount: 3, traditionsCovered: 1 })).toBe(false);
    expect(meetsEvidenceBar('INTERFAITH', { retrievedCount: 3, traditionsCovered: 2 })).toBe(true);
  });
});

describe('§10 dials — precedence + validation', () => {
  it('defaults come from the seed set', () => {
    const { values } = resolveDials({});
    expect(values.candor).toBe(4);
    expect(values.challenge_mode).toBe('ask-first');
    expect(values.grounding_threshold).toBe(0.90);
  });
  it('safety beats preference beats global (challenge_mode)', () => {
    const { values, provenance } = resolveDials({
      global: { challenge_mode: 'contextual' },
      preference: { challenge_mode: 'direct' },
      safety: { challenge_mode: 'answer-only' },
    });
    expect(values.challenge_mode).toBe('answer-only');
    expect(provenance.challenge_mode).toBe('safety');
  });
  it('invalid dial values fall through, valid ones clamp', () => {
    const { values } = resolveDials({ global: { candor: 99, challenge_mode: 'nonsense' } });
    expect(values.candor).toBe(5);                 // clamped to max
    expect(values.challenge_mode).toBe('ask-first'); // invalid enum ignored → default
    expect(validateDial('candor', 3)).toEqual({ ok: true, value: 3 });
    expect(validateDial('candor', 'x').ok).toBe(false);
    expect(validateDial('nope', 1).ok).toBe(false);
  });
});

describe('§6 challenge ladder — evidence + permission gated, never vulnerability-raised', () => {
  it('distress and answer-only floor challenge to 0', () => {
    expect(permittedChallengeLevel({ distress: true, challenge_intensity: 5 })).toBe(0);
    expect(permittedChallengeLevel({ challenge_mode: 'answer-only', challenge_intensity: 5 })).toBe(0);
  });
  it('correction reduces challenge', () => {
    expect(permittedChallengeLevel({ corrected: true, challenge_intensity: 4 })).toBeLessThanOrEqual(1);
  });
  it('direct request permits deep challenge; ask-first without permission stays low', () => {
    expect(permittedChallengeLevel({ challenge_mode: 'direct', challenge_intensity: 5, depthRequested: true })).toBeGreaterThanOrEqual(4);
    expect(permittedChallengeLevel({ challenge_mode: 'ask-first', challenge_intensity: 2, permission: false })).toBeLessThanOrEqual(2);
  });
  it('detects the science/scientism conflation', () => {
    expect(detectConflation('science has disproved god')?.key).toBe('science_vs_scientism');
    expect(detectConflation('what time is the feast')).toBeNull();
  });
});

describe('§5.1 decision engine — §14 acceptance scenarios', () => {
  const dials = resolveDials({}).values;
  it('fact-only request → answer, no challenge/funnel', () => {
    const p = decide({ mode: 'HISTORICAL', dials, message: 'when did the Báb declare his mission', evidenceCount: 3 });
    expect(p.intervention).toBe('S01_ANSWER');
    expect(p.nextStep).toBeNull();
  });
  it('"what do Bahá’ís believe" → separate authority layers', () => {
    const p = decide({ mode: 'DOCTRINAL', dials, message: 'x', authorityConflated: true, hasAuthoritative: true, evidenceCount: 2 });
    expect(p.intervention).toBe('S02_AUTHORITY');
    expect(p.addAuthorityLayer).toBe(true);
  });
  it('"science disproved god" with permission → premise/counterframe, steelman-first', () => {
    const d2 = resolveDials({ preference: { challenge_mode: 'direct' } }).values;
    const p = decide({ mode: 'PHILOSOPHICAL', dials: d2, message: 'science has disproved god, change my mind', permission: true, depthRequested: true, evidenceCount: 2, hasAuthoritative: true });
    expect(['S04_PREMISE', 'S05_COUNTERFRAME']).toContain(p.intervention);
    expect(p.challengeLevel).toBeGreaterThanOrEqual(2);
  });
  it('grief/distress → answer + support only, no funnel, challenge 0', () => {
    const p = decide({ mode: 'PERSONAL_REFLECTIVE', dials, message: 'my wife died and I feel hopeless', distress: true, courseSignal: true });
    expect(p.intervention).toBe('S01_ANSWER');
    expect(p.challengeLevel).toBe(0);
    expect(p.nextStep).toBeNull();
    expect(p.supportOffer).toBe(true);
  });
  it('evidence gap → research, not a confident guess', () => {
    const p = decide({ mode: 'DOCTRINAL', dials, message: 'x', evidenceGap: true, evidenceCount: 0 });
    expect(p.intervention).toBe('S07_RESEARCH');
  });
  it('vulnerability never triggers a course funnel', () => {
    const p = decide({ mode: 'PERSONAL_REFLECTIVE', dials, message: 'going through a divorce', courseSignal: true, sustainedInquiry: true });
    expect(p.nextStep).toBeNull();
  });
});

describe('§7.3 proactive contact — silence over weak contact', () => {
  const dials = resolveDials({ consent: {} }).values;   // proactive_contacts_week default 0
  it('no consent/budget → NO_OUTREACH', () => {
    expect(decideOutreach({ dials, requestedFollowupDue: true }).action).toBe('S12_NO_OUTREACH');
  });
  it('ignored check-in → quiet', () => {
    expect(decideOutreach({ dials: { proactive_contacts_week: 2 }, ignoredLastCheckin: true }).action).toBe('S12_NO_OUTREACH');
  });
  it('concrete trigger + budget → send once', () => {
    expect(decideOutreach({ dials: { proactive_contacts_week: 1 }, requestedFollowupDue: true, contactsThisWeek: 0 }).action).toBe('SEND');
  });
});

describe('§3 personality constitution + §2.2 relationship stage + §8 courses', () => {
  it('constitution carries identity, non-role, answer-order, and the forbidden list', () => {
    const sys = buildConstitution({ persona: 'Anís', dials: { candor: 5, warmth: 2, directness: 5 } });
    expect(sys).toContain('Anís');
    expect(sys).toMatch(/AI/);
    expect(sys).toMatch(/Answer the stated question BEFORE/i);
    expect(sys).toMatch(/Never act as clergy/i);
    expect(sys).toMatch(/Never speak as "we Bahá’ís"/);
    expect(MUST_RULES.length).toBeGreaterThanOrEqual(9);
    expect(FORBIDDEN.length).toBeGreaterThanOrEqual(8);
  });
  it('relationship stage never presumes consent', () => {
    expect(relationshipStage({})).toBe('R0_SESSION');
    expect(relationshipStage({ authed: true })).toBe('R1_RETURN');
    expect(relationshipStage({ authed: true, consentMemory: true })).toBe('R2_COMPANION');
    expect(relationshipStage({ enrolled: true })).toBe('R4_COURSE');
    expect(relationshipStage({ quiet: true, consentMemory: true })).toBe('RQ_QUIET');
  });
  it('recommends the right track by goal', () => {
    expect(recommendTracks({ goal: 'I want to understand progressive revelation and prophecy' })[0].track.id).toBe('revelation');
    expect(recommendTracks({ recentQuestions: ['who were the martyrs', 'dawn-breakers history'] })[0].track.id).toBe('sacred_history');
  });
  it('detects distress signals', () => {
    expect(detectDistress('I want to die')).toBe(true);
    expect(detectDistress('what year was the Aqdas revealed')).toBe(false);
  });
});

describe('§5 full plan composition (buildCompanionPlan)', () => {
  it('produces an authority-labeled, dial-resolved plan with a system append', () => {
    const out = buildCompanionPlan({
      participantId: 'anon_1', message: 'what do Bahá’ís believe about the soul?',
      classifier: { intent: 'definition', traditions: ["Baha'i"] },
      evidenceDocs: [{ doc_id: 1, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', religion: "Baha'i" }],
      evidenceCount: 3, relationship: { consent_memory: 0, dials_json: '{}' }, globalDials: {},
    });
    expect(out.plan.mode).toBe('DOCTRINAL');
    expect(out.plan.add_authority_layer).toBe(true);
    expect(out.authorityClasses[0].class).toBe('B2_AUTH_INTERPRETATION');
    expect(out.systemAppend).toMatch(/SEPARATE THE AUTHORITY LAYERS/);
    expect(out.dials.policy_version || out.plan.policy_version).toBeTruthy();
  });
  it('answer-only message floors challenge + suppresses funnel', () => {
    const out = buildCompanionPlan({
      participantId: 'anon_2', message: 'just answer: when did the Báb declare, no analysis please',
      classifier: { intent: 'discuss' }, evidenceDocs: [{ doc_id: 2, title: 'The Dawn-Breakers', religion: "Baha'i", collection: 'History' }],
      evidenceCount: 2, relationship: { consent_memory: 0, dials_json: '{}' },
    });
    expect(out.dials.challenge_mode).toBe('answer-only');
    expect(out.plan.challenge_level).toBe(0);
    expect(out.systemAppend).toMatch(/Do NOT append/);
  });
});
