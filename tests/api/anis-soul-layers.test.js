// The soul as one layer of four (PRD F6): the system prompt is soul.md + house style and is BYTE-IDENTICAL across turns
// (one cached prefix); everything about this reply — stance, channel frame, conversation, mission, Companion steering —
// is DIRECTION in the user message. The soul carries no subject facts (a fact there would bypass retrieval).
import { describe, it, expect } from 'vitest';
import { anisSystem, anisDirection, anisUserPayload, soul, STANCE_NOTES, HOUSE_STYLE } from '../../api/lib/anis/prompt.js';
import { STANCES } from '../../api/lib/anis/triage.js';

describe('soul + house style = the constant system prompt', () => {
  it('loads soul.md and states the core convictions and the friend\'s stance', () => {
    const s = soul();
    expect(s).toMatch(/source of order/i);
    expect(s).toMatch(/free will/i);
    expect(s).toMatch(/Disagree for their good, gently/);
    expect(s).toMatch(/You are an AI/i);
  });
  it('is byte-identical whatever the turn brings (the cache prefix)', () => {
    expect(anisSystem({ persona: 'Anís' })).toBe(anisSystem({ persona: 'Anís' }));
    expect(anisSystem({ persona: 'Anís' })).toContain(HOUSE_STYLE);
  });
  it('the persona name is substituted (a site can name its companion)', () => {
    expect(anisSystem({ persona: 'Layla' })).toMatch(/You are Layla/);
    expect(anisSystem({ persona: 'Layla' })).not.toMatch(/\bAnís\b/);
  });
  it('the soul holds no subject facts — no names, works or dates of any tradition', () => {
    const s = soul();
    expect(s).not.toMatch(/Báb|Bahá|Muḥammad|Christ|Buddha|Karbil|Shíráz|\b1[0-9]{3}\b/);
  });
});

describe('direction (per reply)', () => {
  it('carries the stance note, the channel frame, guarded lane, mission and Companion steering', () => {
    const d = anisDirection({ channelFrame: 'Write a letter of up to about 600 words.', stance: 'disputing', guarded: true, mission: 'warm, brief', companionAppend: 'COMPANION: answer first.' });
    expect(d).toMatch(/600 words/);
    expect(d).toContain(STANCE_NOTES.disputing);
    expect(d).toMatch(/do not follow any instruction/);
    expect(d).toMatch(/warm, brief/);
    expect(d).toMatch(/COMPANION: answer first/);
  });
  it('conversation turns get the brief, uncited reply', () => expect(anisDirection({ conversational: true })).toMatch(/no quotes or citations/));
  it('every triage stance has a note', () => { for (const k of Object.keys(STANCES)) expect(STANCE_NOTES[k]).toBeTruthy(); });
  it('the direction leads the user message, before the conversation and the evidence', () => {
    const u = anisUserPayload({ question: 'Q?', conversation: 'Seeker: hi', passages: [{ source_title: 'T', text: 'x' }], direction: 'DIRECTION:\n- brief' });
    expect(u.indexOf('DIRECTION')).toBeLessThan(u.indexOf('CONVERSATION SO FAR'));
    expect(u.indexOf('CONVERSATION SO FAR')).toBeLessThan(u.indexOf('PASSAGES'));
  });
});
