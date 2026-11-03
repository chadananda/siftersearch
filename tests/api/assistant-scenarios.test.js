// Scenario guidance (11-03): book_study / newcomer are examples, not roles. Chosen from CONTEXT — by the writer from the
// SCENARIO_GUIDE in the cached house style, or explicitly by Jev / a reader card through direction.scenario — never by keywords.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCENARIOS, SCENARIO_GUIDE, resolveScenario } from '../../api/lib/assistant/scenarios.js';
import { anisDirection, anisSystem, HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';

describe('the scenario catalog', () => {
  it('names two example scenarios, each with an instruction', () => {
    expect(Object.keys(SCENARIOS)).toEqual(['book_study', 'newcomer']);
    expect(SCENARIOS.book_study.how).toMatch(/chapter, section or paragraph/);
    expect(SCENARIOS.book_study.how).toMatch(/who is speaking/i);
    expect(SCENARIOS.newcomer.how).toMatch(/never recruit/);
    expect(SCENARIOS.newcomer.how).toMatch(/their own tradition/);
  });
  it('resolveScenario accepts an explicit choice in any spelling and rejects the default or junk', () => {
    expect(resolveScenario('book_study')?.id).toBe('book_study');
    expect(resolveScenario('Study-Companion')?.id).toBe('book_study');
    expect(resolveScenario({ id: 'newcomer' })?.id).toBe('newcomer');
    expect(resolveScenario('study_companion')?.id).toBe('book_study');
    expect(resolveScenario({ id: 'fireside' })?.id).toBe('newcomer');
    expect(resolveScenario('companion')).toBeNull();
    expect(resolveScenario('prophet')).toBeNull();
    expect(resolveScenario(null)).toBeNull();
  });
  it('no keyword or regex selection of the scenario from the message exists', () => {
    const src = readFileSync(new URL('../../api/lib/assistant/scenarios.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/roleFor|\.test\(question|keywords?\s*=/);
    expect(src.match(/new RegExp|\/[^/\n]{8,}\/[gimuy]*\.test/g) || []).toHaveLength(0);
  });
});

describe('where the scenario reaches the writer', () => {
  it('the SCENARIO_GUIDE sits in the cached house style, so the writer chooses from the conversation', () => {
    expect(HOUSE_STYLE).toContain(SCENARIO_GUIDE);
    expect(SCENARIO_GUIDE).toMatch(/read which one fits from CONVERSATION SO FAR/);
    expect(SCENARIO_GUIDE).toMatch(/Never announce it/);
    expect(anisSystem({})).toContain('SCENARIOS (examples');
  });
  it('an explicit scenario adds one DIRECTION line; the default and a conversational turn add none', () => {
    const study = anisDirection({ question: 'What does chapter 3 say about the Letters of the Living?', scenario: 'book_study' });
    expect(study).toMatch(/\n- Scenario for this reply: BOOK STUDY/);
    const fire = anisDirection({ question: 'What is this religion about?', scenario: { id: 'newcomer' } });
    expect(fire).toMatch(/\n- Scenario for this reply: NEWCOMER/);
    expect(anisDirection({ question: 'q', scenario: 'companion' })).not.toMatch(/Scenario for this reply/);
    expect(anisDirection({ question: 'q' })).not.toMatch(/Scenario for this reply/);
    expect(anisDirection({ question: 'hi', scenario: 'newcomer', conversational: true })).not.toMatch(/Scenario for this reply/);
  });
  it('a scenario never loosens grounding: the house style keeps its grounding rules whatever the scenario', () => {
    expect(SCENARIO_GUIDE).toMatch(/never grounding or links/);
    expect(HOUSE_STYLE).toMatch(/Ground every claim in the numbered PASSAGES/);
  });
});
