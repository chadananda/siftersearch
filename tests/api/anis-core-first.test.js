// Core texts first (Chad 11-14, "Who is the Evil One in Bahá'í writings?": the reply opened with a scholar's study, quoted
// 'Abdu'l-Bahá through it, then pilgrim notes, the Writings fourth, Paris Talks fifth with a "not a written text" caveat).
// The search a Bahá'í question runs hands the written core over first (English Writings, Shoghi Effendi, then the Persian/
// Arabic originals), talks kept after them, pilgrim notes after talks, commentary left out once the core is enough.
import { describe, it, expect } from 'vitest';
import { byTier, coreFirst, needsWritings, tierLabel, CORE_ENOUGH } from '../../api/lib/assistant/source-tier.js';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { agentAnswer, AGENT_SYSTEM } from '../../api/lib/assistant/agent-core.js';

const B = "Baha'i";
const SAVI = { id: 1, title: 'The Eternal Quest for God', author: 'Julio Savi', book_author: 'Julio Savi', religion: B, collection: "Baha'i Books", text: 'the evil one is the lower nature' };
const SAVI_QUOTING = { id: 2, title: 'The Eternal Quest for God', author: '‘Abdu’l-Bahá', book_author: 'Julio Savi', religion: B, collection: "Baha'i Books", text: 'Satan is the insistent self (quoted)' };
const MAXWELL = { id: 3, title: 'An Early Pilgrimage', author: 'May Maxwell', religion: B, collection: 'Pilgrim Notes', text: 'the Master said evil is non-existent' };
const GLEANINGS = { id: 4, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: 'the Evil One' };
const PARIS = { id: 5, title: 'Paris Talks', author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Talks', text: 'there is no evil spirit' };
const BAYAN = { id: 6, title: 'Súriy-i-Bayán (Gleanings)', author: 'Bahá’u’lláh', book_author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', text: 'the Evil One hath been' };
const SWAB = { id: 7, title: 'Selections from the Writings of ‘Abdu’l-Bahá', author: '‘Abdu’l-Bahá', book_author: '‘Abdu’l-Bahá', religion: B, collection: 'Core Tablets', text: 'the insistent self' };
const ORIG = { id: 8, title: 'Lawḥ-i-Shaytán', author: 'Bahá’u’lláh', religion: B, collection: 'Core Tablets', language: 'ar', document_id: 80, text: 'الشیطان' };

const heads = (out) => out.split('\n').filter((l) => /^\[P\d+\]/.test(l));
const evilOne = (over = {}) => {
  const asked = [];
  const { run } = toolRunner({ search: async () => [SAVI, SAVI_QUOTING, MAXWELL, GLEANINGS, PARIS],
    writings: async (q) => { asked.push(q); return [BAYAN, SWAB, GLEANINGS]; }, originals: async () => [ORIG], translationsOf: async () => new Map(), ...over });
  return { asked, run };
};

describe('core texts first: the Evil One search', () => {
  it('a study ranked first → the Writings are searched on the same point (not only when none is there)', async () => {
    const { asked, run } = evilOne();
    await run.combined_search({ query: 'the Evil One', tradition: B });
    expect(asked).toEqual(['the Evil One']);
    expect(needsWritings([GLEANINGS, BAYAN, SWAB])).toBe(false);
    expect(needsWritings([SAVI, GLEANINGS, BAYAN, SWAB])).toBe(true);    // a study ahead of the Writings
    expect(needsWritings([GLEANINGS, PARIS])).toBe(true);                // too few written passages
  });
  it('written Writings → the Arabic/Persian original → the talk → the pilgrim note; the study and the quote-through-a-scholar left out', async () => {
    const out = await evilOne().run.combined_search({ query: 'the Evil One', tradition: B });
    const h = heads(out);
    const at = (re) => h.findIndex((x) => re.test(x));
    expect(Math.max(at(/Gleanings from/), at(/Súriy-i-Bayán/), at(/Selections/))).toBe(2);   // the three written Writings lead
    expect(at(/Shaytán/)).toBe(3);
    expect(h[3]).toMatch(/\(ar\) .*not an authorized translation.*above any scholar/);
    expect(at(/Shaytán/)).toBeLessThan(at(/Paris Talks/));                // an original outranks any talk or scholar
    expect(at(/Paris Talks/)).toBeLessThan(at(/Early Pilgrimage/));      // talks kept (a preference, not an exclusion), before pilgrim notes
    expect(h.some((x) => /Eternal Quest/.test(x))).toBe(false);
    expect(out).toMatch(/2 passages of commentary left out/);
  });
  it('core too thin → the study stays, last, labelled as a point-only signpost', async () => {
    const { run } = toolRunner({ search: async () => [SAVI, PARIS, GLEANINGS], writings: async () => [] });
    const h = heads(await run.combined_search({ query: 'the Evil One', tradition: B }));
    expect(h.at(-1)).toMatch(/Eternal Quest .*SECONDARY .*only for a point no Writing here addresses/);
    expect(h[0]).toMatch(/Gleanings/);
  });
  it('the Arabic/Persian originals count toward the core', () => {
    expect(CORE_ENOUGH).toBe(3);
    expect(coreFirst([GLEANINGS, SAVI], 1).left).toBe(0);
    expect(coreFirst([GLEANINGS, BAYAN, SAVI], 1)).toEqual({ kept: [GLEANINGS, BAYAN], left: 1 });
  });
  it('tier order: talks before pilgrim notes; the talk label puts a written text in the lead', () => {
    expect(byTier([SAVI, MAXWELL, PARIS, GLEANINGS]).map((p) => p.id)).toEqual([4, 5, 3, 1]);
    expect(tierLabel(PARIS)).toMatch(/a written text on the same point leads the argument/);
  });
});

describe('core texts first: held research and the agent prompt', () => {
  it('held research reaches the agent in tier order (it was captured in search order, the study first)', async () => {
    const seen = [];
    const held = { same: true, status: 'answered', question: 'Who is the Evil One?', passages: [SAVI, MAXWELL, GLEANINGS] };
    await agentAnswer({ messages: [{ role: 'user', content: 'Who is the Evil One?' }], tools: { search: async () => [] }, held,
      create: async (p) => { seen.push(p); return { choices: [{ message: { content: 'x' } }] }; } });
    const turn = seen[0].messages.findLast((m) => m.role === 'user').content;
    expect(turn.indexOf('Gleanings')).toBeGreaterThan(-1);
    expect(turn.indexOf('Gleanings')).toBeLessThan(turn.indexOf('An Early Pilgrimage'));
    expect(turn.indexOf('An Early Pilgrimage')).toBeLessThan(turn.indexOf('Eternal Quest'));
  });
  it('the prompt: core texts lead, originals with their existing translation, talks beside, scholars only for an unaddressed point', () => {
    expect(AGENT_SYSTEM).toMatch(/CORE TEXTS FIRST/);
    expect(AGENT_SYSTEM).toMatch(/never through a scholar who quotes Him/);
    expect(AGENT_SYSTEM).toMatch(/originals_search/);
  });
});
