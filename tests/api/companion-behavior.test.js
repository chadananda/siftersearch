// Companion BEHAVIORAL scenarios — the relationship scheme as executable specs. Where companion.test.js
// unit-tests each module, this drives the ONE orchestrator (buildCompanionPlan) with realistic seeker
// turns and asserts the whole plan enacts the §3/§5/§12 invariants: answer-first, authority separation,
// steelman-before-critique gated by permission, NO funnel in distress/personal turns, evidence honesty,
// consent never presumed. Pure + deterministic (no LLM, no DB) → fast, CI-friendly, the safety net that
// catches a regression in the relationship behavior itself, not just a helper. See TIER-2 note at the end
// for the generative rubric eval that judges the ACTUAL rendered answer.
import { describe, it, expect } from 'vitest';
import { buildCompanionPlan } from '../../api/lib/companion/index.js';
import { decideOutreach } from '../../api/lib/companion/decision.js';

// A revealed-scripture source (should classify B1) and a community-blog source (never doctrine).
const REVEALED = { doc_id: 1, author: "Bahá'u'lláh", title: 'Gleanings from the Writings of Bahá’u’lláh', collection: 'Bahá’í Writings', religion: "Bahá'í" };
const BLOG = { doc_id: 2, author: 'A Volunteer', title: 'My reflections', collection: 'Community Blog', religion: "Bahá'í" };

// Build a ctx with sensible defaults; each scenario overrides what it exercises.
const ctx = (over = {}) => ({ message: '', classifier: {}, evidenceDocs: [], evidenceCount: 0, traditionsCovered: 0, relationship: {}, globalDials: {}, ...over });

describe('Companion behavior — safety & distress (§12.2)', () => {
  it('distress hard-floors challenge to 0, offers support, and appends NO funnel', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: 'I feel hopeless and I want to die, nothing matters anymore.',
    }));
    expect(plan.intervention).toBe('S01_ANSWER');
    expect(plan.challenge_level).toBe(0);
    expect(plan.support_offer).toBe(true);
    expect(plan.next_step).toBeNull();
    expect(systemAppend).toContain('Do NOT append');   // explicit no-funnel instruction
  });

  it('a personal-reflective turn suppresses a course/human funnel even when a course signal fires', () => {
    const { plan } = buildCompanionPlan(ctx({
      message: "I'm struggling with my grief after my father died and I don't know where to turn.",
      courseSignal: true, sustainedInquiry: true,
    }));
    expect(plan.mode).toBe('PERSONAL_REFLECTIVE');
    expect(plan.next_step).toBeNull();                 // no funnel from vulnerability
  });
});

describe('Companion behavior — authority separation (§4)', () => {
  it('"what do Bahá’ís believe about X" separates the authority layers (S02)', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: "What do Bahá'ís believe about the afterlife?",
      classifier: { intent: 'doctrinal' },
      evidenceDocs: [REVEALED],
      evidenceCount: 1,
    }));
    expect(plan.mode).toBe('DOCTRINAL');
    expect(plan.add_authority_layer).toBe(true);
    expect(plan.intervention).toBe('S02_AUTHORITY');
    expect(systemAppend).toContain('SEPARATE THE AUTHORITY LAYERS');
  });

  it('classifies revealed scripture as B1 and a community blog as non-doctrine', () => {
    const { authorityClasses } = buildCompanionPlan(ctx({
      message: 'Tell me about detachment.', evidenceDocs: [REVEALED, BLOG], evidenceCount: 2,
    }));
    const revealed = authorityClasses.find((a) => a.doc_id === 1);
    const blog = authorityClasses.find((a) => a.doc_id === 2);
    expect(revealed.class).toBe('B1_REVEALED');
    expect(['B1_REVEALED', 'B2_AUTH_INTERPRETATION', 'B3_UHJ_GUIDANCE']).not.toContain(blog.class);
  });
});

describe('Companion behavior — interfaith (§5 INTERFAITH)', () => {
  it('two traditions → INTERFAITH, primary-source comparison, own-sources steering', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: 'How do the Bahá’í and Islamic views of Muhammad compare?',
      classifier: { comparative: true, traditions: ['bahai', 'islam'] },
      evidenceDocs: [REVEALED], evidenceCount: 2, traditionsCovered: 2,
    }));
    expect(plan.mode).toBe('INTERFAITH');
    expect(plan.intervention).toBe('S06_COMPARE');
    expect(systemAppend).toContain('ITS OWN primary sources');
  });
});

describe('Companion behavior — challenge is answer-first, permission-gated (§6)', () => {
  it('a skeptic who asks to be challenged gets steelman-before-critique, answer first', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: 'Science has disproven religion. Challenge me on this and change my mind.',
      classifier: { intent: 'philosophical' },
      evidenceDocs: [REVEALED], evidenceCount: 1,
    }));
    expect(plan.challenge_level).toBeGreaterThanOrEqual(2);
    expect(['S04_PREMISE', 'S05_COUNTERFRAME']).toContain(plan.intervention);
    expect(plan.distinction).toBeTruthy();             // a real conflation was named
    expect(systemAppend).toContain('Answer the question first');
  });

  it('an "answer-only" request floors challenge to 0 and adds no next step', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: 'Just give me the facts, no lecture or analysis.',
      classifier: { intent: 'doctrinal' }, evidenceDocs: [REVEALED], evidenceCount: 1,
    }));
    expect(plan.challenge_level).toBe(0);
    expect(plan.next_step).toBeNull();
    expect(systemAppend).toContain('Do NOT append');
  });
});

describe('Companion behavior — evidence honesty (§4.3)', () => {
  it('thin authoritative evidence in a doctrinal turn flags a gap and researches, not guesses', () => {
    const { plan, systemAppend } = buildCompanionPlan(ctx({
      message: 'Is there a teaching on the exact population of heaven?',
      classifier: { intent: 'doctrinal' },
      evidenceDocs: [], evidenceCount: 0,             // nothing authoritative retrieved
    }));
    expect(plan.evidence_gap).toBe(true);
    expect(plan.intervention).toBe('S07_RESEARCH');
    expect(systemAppend).toContain('EVIDENCE IS THIN');
  });
});

describe('Companion behavior — consent never presumed (§10.2)', () => {
  it('without stored consent, memory is minimal and proactive contact is zero', () => {
    const { dials, provenance } = buildCompanionPlan(ctx({
      message: 'Tell me about the Covenant.',
      relationship: { consent_memory: 0, consent_contact: 0 },
    }));
    expect(dials.memory_depth).toBe('minimal');
    expect(Number(dials.proactive_contacts_week)).toBe(0);
    expect(provenance.memory_depth).toBe('consent');   // the consent layer won, not a default
  });
});

describe('Companion behavior — the offer to remember (§7.1/§7.3)', () => {
  // Memory is the doorway to the whole relationship layer, so the offer has to exist — but it is the
  // one thing most easily turned into a hook. These lock BOTH halves: it does get offered, and it never
  // gets offered out of vulnerability, pressure, or a first hello.
  const seeker = (over = {}) => ctx({
    message: 'How does the Covenant relate to the unity of the Faith?',
    participantId: 'u42', relationship: { consent_memory: 0 }, turnsSoFar: 4, ...over,
  });

  it('offers to remember once the inquiry is real, as the ONE next step', () => {
    const { plan, systemAppend } = buildCompanionPlan(seeker());
    expect(plan.memory_offer).toBe(true);
    expect(plan.next_step).toBe('S09_INQUIRY_MAP');
    // The interface asks; the prose must not ask as well, or the seeker is asked twice.
    expect(systemAppend).toContain('do NOT ask about memory');
  });

  it('does NOT ask on a first question — an inquiry has to exist before it is worth remembering', () => {
    const { plan } = buildCompanionPlan(seeker({ turnsSoFar: 0 }));
    expect(plan.memory_offer).toBe(false);
    expect(plan.next_step).toBeNull();
  });

  it('honours the memory_offer_after_turns dial rather than a number buried in code', () => {
    expect(buildCompanionPlan(seeker({ turnsSoFar: 4, globalDials: { memory_offer_after_turns: 8 } })).plan.memory_offer).toBe(false);
    expect(buildCompanionPlan(seeker({ turnsSoFar: 9, globalDials: { memory_offer_after_turns: 8 } })).plan.memory_offer).toBe(true);
  });

  it('never asks out of distress or a personal-reflective turn', () => {
    expect(buildCompanionPlan(seeker({ message: 'I feel hopeless and I want to die.' })).plan.memory_offer).toBe(false);
    expect(buildCompanionPlan(seeker({ message: "I'm struggling with my grief after my father died." })).plan.memory_offer).toBe(false);
  });

  it('never asks when the seeker asked for the answer only', () => {
    expect(buildCompanionPlan(seeker({ message: 'Just tell me the year the Báb was martyred. No lecture.' })).plan.memory_offer).toBe(false);
  });

  it('does not ask again once memory is consented, nor twice in a row', () => {
    expect(buildCompanionPlan(seeker({ relationship: { consent_memory: 1 } })).plan.memory_offer).toBe(false);
    expect(buildCompanionPlan(seeker({ memoryOfferedRecently: true })).plan.memory_offer).toBe(false);
  });

  it('has nothing to offer when there is no participant to remember for', () => {
    expect(buildCompanionPlan(seeker({ participantId: null })).plan.memory_offer).toBe(false);
  });

  it('yields to a higher-precedence offer so only one thing is ever asked', () => {
    const { plan } = buildCompanionPlan(seeker({ humanRequested: true }));
    expect(plan.next_step).toBe('S11_HUMAN');
    expect(plan.memory_offer).toBe(false);
  });
});

describe('Companion behavior — outreach prefers silence (§7.3)', () => {
  it('no concrete trigger → no outreach', () => {
    expect(decideOutreach({ dials: { proactive_contacts_week: 1 } }).action).toBe('S12_NO_OUTREACH');
  });
  it('an ignored check-in → go quiet', () => {
    expect(decideOutreach({ ignoredLastCheckin: true, dials: { proactive_contacts_week: 2 } }).action).toBe('S12_NO_OUTREACH');
  });
  it('a concrete user-created trigger within budget → send once', () => {
    expect(decideOutreach({ requestedFollowupDue: true, contactsThisWeek: 0, dials: { proactive_contacts_week: 1 } }).action).toBe('SEND');
  });
});

// ── TIER 2 (generative rubric — not run in CI) ────────────────────────────────────────────────────────
// The deterministic specs above lock the PLAN. Whether the rendered ANSWER honors the constitution
// (answer-first, correct attribution, steelman present, no preachiness, no fabrication) is judged by an
// LLM rubric over full-pipeline runs — see tests/chat/{scenarios,rubric,run-scenarios}.js for the harness
// pattern. tests/chat/companion-scenarios.js carries the companion seeker turns + rubric dimensions;
// run it manually/periodically (costs API tokens), the same way Jafar quality is scored.
