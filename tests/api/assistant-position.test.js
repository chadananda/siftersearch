// Position questions (Chad 10-19: Anís answered the Bahá'í position on socialism, equality and property from pilgrim notes
// and secondary articles — "extremely shallow and wishy washy"): themes searched, authoritative texts first.
import { describe, it, expect } from 'vitest';
import { looksLikePositionQuestion, rankByAuthority, positionResearch } from '../../api/lib/assistant/position.js';

const CHAD = "Hi, can you give me a summary of the Baha'i Position on Socialism and egalitarianism and property rights?\n\nI'm trying to understand where the Baha'i faith fits in modern economic theories.";

describe('position questions', () => {
  it('are recognised', () => {
    expect(looksLikePositionQuestion(CHAD)).toBe(true);
    expect(looksLikePositionQuestion('What does the Bahá\'í Faith teach about war?')).toBe(true);
    expect(looksLikePositionQuestion('What is the stance of Shoghi Effendi on capitalism?')).toBe(true);
    expect(looksLikePositionQuestion('Who was Táhirih?')).toBe(false);
  });
  it('rank: authoritative authors first, pilgrim notes and secondary after, whole-book giants out', async () => {
    const ps = [
      { id: 1, author: 'Emeric Sala', collection: 'Pilgrim Notes', text: 'pilgrim note' },
      { id: 2, author: 'Shoghi Effendi', collection: 'Shoghi Effendi', text: 'The Promised Day Is Come: the Movement of the Left' },
      { id: 3, author: 'pdf-h-holley', collection: 'Books', text: 'x'.repeat(9000) },
      { id: 4, author: '‘Abdu’l-Bahá', collection: 'Core Talks', text: 'on socialism' },
      { id: 5, author: 'Jane Scholar', collection: 'Papers', text: 'secondary' },
    ];
    const r = await rankByAuthority(ps, async (p) => (p.collection === 'Papers' ? 6 : 1));
    expect(r.map((p) => p.id)).toEqual([2, 4, 5, 1]);
  });
  it('plans themes, searches each, and keeps the authoritative passages', async () => {
    const searched = [];
    const r = await positionResearch({
      question: CHAD,
      create: async () => ({ choices: [{ message: { content: '{"themes":[{"theme":"private property","queries":["private property"],"works":["God Passes By"]},{"theme":"socialism","queries":["socialism"],"works":[]}]}' } }] }),
      search: async ({ query, plan }) => { searched.push([query, plan.defaults.religion]); return { passages: query.includes('property')
        ? [{ id: 10, author: 'Shoghi Effendi', title: 'God Passes By', text: 'the institution of private property' }, { id: 11, author: 'Jane Scholar', text: 'secondary' }]
        : [{ id: 12, author: '‘Abdu’l-Bahá', title: 'Promulgation', text: 'socialism' }] }; },
      authorityOf: async () => 5,
    });
    expect(searched.every(([, religion]) => religion === "Baha'i")).toBe(true);
    expect(r.themes.map((t) => t.theme)).toEqual(['private property', 'socialism']);
    expect(r.passages[0]).toMatchObject({ id: 10, theme: 'private property' });
    expect(r.passages.map((p) => p.id)).toContain(12);
  });
});
