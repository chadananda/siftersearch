// Anís's settings (W4, 11-03): companion / study companion / fireside. The setting is chosen from CONTEXT — by the writer
// from the ROLE_GUIDE in the cached house style, or explicitly by Jev / a reader card through direction.role — never by
// keyword matching on the person's message (Chad 11-03). Grounding and link rules are untouched by any setting.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROLES, ROLE_GUIDE, resolveRole } from '../../api/lib/assistant/roles.js';
import { anisDirection, anisSystem, HOUSE_STYLE } from '../../api/lib/assistant/prompt.js';

describe('the settings catalog', () => {
  it('names three settings; only the two non-default ones carry an instruction', () => {
    expect(Object.keys(ROLES)).toEqual(['companion', 'study_companion', 'fireside']);
    expect(ROLES.companion.how).toBeNull();
    expect(ROLES.study_companion.how).toMatch(/chapter, section or paragraph/);
    expect(ROLES.study_companion.how).toMatch(/who is speaking/i);
    expect(ROLES.fireside.how).toMatch(/never recruit/);
    expect(ROLES.fireside.how).toMatch(/their own tradition/);
  });
  it('resolveRole accepts an explicit choice in any spelling and rejects the default or junk', () => {
    expect(resolveRole('study_companion')?.id).toBe('study_companion');
    expect(resolveRole('Study-Companion')?.id).toBe('study_companion');
    expect(resolveRole({ id: 'fireside' })?.id).toBe('fireside');
    expect(resolveRole('companion')).toBeNull();
    expect(resolveRole('prophet')).toBeNull();
    expect(resolveRole(null)).toBeNull();
  });
  it('no keyword or regex selection of the setting from the message exists', () => {
    const src = readFileSync(new URL('../../api/lib/assistant/roles.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/roleFor|\.test\(question|keywords?\s*=/);
    expect(src.match(/new RegExp|\/[^/\n]{8,}\/[gimuy]*\.test/g) || []).toHaveLength(0);
  });
});

describe('where the setting reaches the writer', () => {
  it('the ROLE_GUIDE sits in the cached house style, so the writer chooses from the conversation', () => {
    expect(HOUSE_STYLE).toContain(ROLE_GUIDE);
    expect(ROLE_GUIDE).toMatch(/choose from CONVERSATION SO FAR/);
    expect(ROLE_GUIDE).toMatch(/Never announce the setting/);
    expect(anisSystem({})).toContain('SETTING (choose from');
  });
  it('an explicit setting adds one DIRECTION line; the default and a conversational turn add none', () => {
    const study = anisDirection({ question: 'What does chapter 3 say about the Letters of the Living?', role: 'study_companion' });
    expect(study).toMatch(/\n- Setting for this reply: STUDY COMPANION/);
    const fire = anisDirection({ question: 'What is this religion about?', role: { id: 'fireside' } });
    expect(fire).toMatch(/\n- Setting for this reply: FIRESIDE/);
    expect(anisDirection({ question: 'q', role: 'companion' })).not.toMatch(/Setting for this reply/);
    expect(anisDirection({ question: 'q' })).not.toMatch(/Setting for this reply/);
    expect(anisDirection({ question: 'hi', role: 'fireside', conversational: true })).not.toMatch(/Setting for this reply/);
  });
  it('a setting never loosens grounding: the house style keeps its grounding rules whatever the setting', () => {
    expect(ROLE_GUIDE).toMatch(/never grounding or links/);
    expect(HOUSE_STYLE).toMatch(/Ground every claim in the numbered PASSAGES/);
  });
});
