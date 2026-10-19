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
      create: async () => ({ choices: [{ message: { content: 'THEME: private property | SEARCH: private property | WORKS: God Passes By\nTHEME: socialism | SEARCH: socialism | WORKS:' } }] }),
      search: async ({ query, plan }) => { searched.push([query, plan.defaults.religion]); return { passages: query.includes('property')
        ? [{ id: 10, author: 'Shoghi Effendi', title: 'God Passes By', text: 'the institution of private property' }, { id: 11, author: 'Jane Scholar', text: 'secondary' }]
        : [{ id: 12, author: '‘Abdu’l-Bahá', title: 'Promulgation', text: 'socialism' }] }; },
      authorityOf: async () => 5,
    });
    expect(searched.every(([, religion]) => religion === "Baha'i")).toBe(true);
    expect(r.themes.map((t) => t.theme)).toEqual(['private property', 'socialism']);
    expect(r.passages[0]).toMatchObject({ id: 10, theme: 'private property', standing: 'doctrine' });
    expect(r.passages.find((p) => p.id === 11)).toMatchObject({ standing: 'opinion' });   // a writer's view, labelled
    expect(r.passages.map((p) => p.id)).toContain(12);
  });
});

describe('doctrine vs opinion (Chad 10-19)', () => {
  it('a pilgrim note recording Shoghi Effendi is not doctrine; his own letter is', async () => {
    const { isDoctrine, parseBrief } = await import('../../api/lib/assistant/position.js');
    expect(isDoctrine({ author: 'Shoghi Effendi', collection: 'Shoghi Effendi', title: 'The Promised Day is Come' })).toBe(true);
    expect(isDoctrine({ author: 'Shoghi Effendi', collection: 'Pilgrim Notes', title: 'Plans for the Ten Year Plan' })).toBe(false);
    expect(isDoctrine({ author: 'Udo Schaefer', collection: 'Papers' })).toBe(false);
    expect(parseBrief('THEME: property | SEARCH: private property; ownership | WORKS: God Passes By; "The Promised Day is Come"')[0])
      .toEqual({ theme: 'property', queries: ['private property', 'ownership'], works: ['God Passes By', '"The Promised Day is Come"'] });
  });
});

describe('parseBrief tolerates dressing', () => {
  it('bullets, numbers and bold', async () => {
    const { parseBrief } = await import('../../api/lib/assistant/position.js');
    const t = '- **THEME:** private property | **SEARCH:** institution of private property | **WORKS:** God Passes By\n2. THEME : taxation | SEARCH: burden of taxes | WORKS:';
    expect(parseBrief(t).map((x) => x.theme)).toEqual(['private property', 'taxation']);
  });
});
