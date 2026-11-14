// Dawn-Breakers battery, first 10 live questions (11-14: 3 pass, 3 weak, 4 fail). Every case here is a real excerpt from those replies.
// 1 Nabíl is THE narrative source (dbp:004 "The library does not give me Nabíl's own chapter" — doc 21308 is in the library): his own tier,
//   after the Guardian, never dropped by core-first; a history search looks inside the work. 2 Clean cards: no [pg N]/[^N], no PDF page,
//   no file-name title. 3 Layout: no lead-in without its card, no cut-off sentence, one card per passage. 4 Length is judgement, not a cap.
import { describe, it, expect } from 'vitest';
import { sourceTier, coreFirst, byTier, isNarrative, TIER_ORDER } from '../../api/lib/assistant/source-tier.js';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { cleanCardText, isPdfDump, readableTitle } from '../../api/lib/assistant/widgets/card-text.js';
import { fromRefs as quoteFrom } from '../../api/lib/assistant/widgets/quote.js';
import { fromRefs as sceneFrom } from '../../api/lib/assistant/widgets/scene.js';
import { expandTemplates } from '../../api/lib/assistant/widgets/templates.js';
import { dropDanglingLeadIn, dropCutOff, unholdTexts, dropNarration } from '../../api/lib/assistant/lint.js';
import { agentAnswer, AGENT_SYSTEM } from '../../api/lib/assistant/agent-core.js';

const B = "Baha'i";
const NABIL = { id: 165, document_id: 21308, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', religion: B, source_url: 'https://oceanlibrary.com/dawn-breakers#p165',
  text: 'On that very day, a few hours before sunset, whilst walking outside the gate of the city, his eyes fell suddenly upon a Youth of radiant countenance, who wore a green turban and who, advancing towards him, greeted him with a smile of loving welcome.' };
const NABIL_MH = { ...NABIL, id: 166, author: 'Mullá Ḥusayn' };   // some of the work's paragraphs carry the narrator's name
const NABIL_SLUG = { id: 167, document_id: 21310, title: 'shoghi-effendi-trans-011-the-dawn-breakers_en', author: 'Shoghi Effendi', religion: B, text: 'x' };
const UHJ = { id: 9, title: 'Letters of Living, Dawn-Breakers, Quddús, Terraces', author: 'Universal House of Justice', religion: B, text: 'y' };
const GPB = (n) => ({ id: 300 + n, document_id: 3, title: 'God Passes By', author: 'Shoghi Effendi', book_author: 'Shoghi Effendi', religion: B, collection: 'Core Publications', source_url: `https://oceanlibrary.com/gpb#p${n}`, text: `The people of Shíráz were by that time wild with excitement ${n}` });
const BALYUZI = { id: 4, document_id: 4, title: 'The Báb', author: 'H. M. Balyuzi', book_author: 'H. M. Balyuzi', religion: B, collection: "Baha'i Books", source_url: 'https://oceanlibrary.com/balyuzi#p1', text: 'Mullá Ḥusayn reached Shíráz' };

describe('1 · Nabíl is the narrative source', () => {
  it('The Dawn-Breakers is its own tier, after the Guardian and before the scholars; the House letter that names it is not', () => {
    for (const p of [NABIL, NABIL_MH, NABIL_SLUG]) expect(sourceTier(p), p.author).toBe('narrative');
    expect(sourceTier(UHJ)).not.toBe('narrative');
    expect(isNarrative(UHJ)).toBe(false);
    expect(TIER_ORDER.indexOf('guardian')).toBeLessThan(TIER_ORDER.indexOf('narrative'));
    expect(TIER_ORDER.indexOf('narrative')).toBeLessThan(TIER_ORDER.indexOf('secondary'));
  });
  it('core-first keeps Nabíl beside three passages of God Passes By; tier order puts him after the Guardian and before Balyuzi', () => {
    const { kept, left } = coreFirst([GPB(1), GPB(2), GPB(3), BALYUZI, NABIL]);
    expect(kept.some(isNarrative)).toBe(true);
    expect(kept).not.toContain(BALYUZI);   // the scholar still waits for about: "history"
    expect(left).toBe(1);
    const order = byTier([BALYUZI, NABIL, GPB(1)]).map((p) => p.author);
    expect(order).toEqual(['Shoghi Effendi', 'Nabil Zarandi', 'H. M. Balyuzi']);
  });
  it('a history search the main search gave no Nabíl looks inside The Dawn-Breakers (doc 21308) and shows him', async () => {
    const asked = [];
    const run = toolRunner({ search: async () => [GPB(1), GPB(2), GPB(3), BALYUZI], writings: async () => [], translationsOf: async () => new Map(),
      searchIn: async (q, doc) => { asked.push(doc); return [NABIL]; } }).run;
    const out = await run.fused_search({ query: 'Mullá Ḥusayn meets the Báb at the gate of Shíráz', tradition: B, about: 'history' });
    expect(asked).toEqual([21308]);
    expect(out).toMatch(/Dawn-Breakers/);
    expect(out).toMatch(/Youth of radiant countenance/);
    expect(out).toMatch(/THE NARRATIVE/);
  });
  it('a teaching search does not search inside the narrative', async () => {
    const asked = [];
    await toolRunner({ search: async () => [GPB(1)], writings: async () => [], translationsOf: async () => new Map(), searchIn: async (q, d) => { asked.push(d); return [NABIL]; } })
      .run.fused_search({ query: 'the station of the Báb', tradition: B });
    expect(asked).toEqual([]);
  });
  it('the prompt names Nabíl as THE narrative source; the false "the library does not give me" sentence is removed (dbp:004)', () => {
    expect(AGENT_SYSTEM).toMatch(/Nabíl's The Dawn-Breakers \(Shoghi Effendi's translation\) is THE narrative source/);
    const r = dropNarration("Mullá Ḥusayn was the first to believe. The library does not give me Nabíl's own chapter on the enrolment of the Letters in a form I can quote. Shoghi Effendi names eighteen.");
    expect(r.text).not.toMatch(/library does not give/);
    expect(r.text).toMatch(/first to believe\. Shoghi Effendi names eighteen\./);
  });
});

// dbp:008 — a God Passes By page scraped from a PDF ("Shoghi-Effendi-TAF-10_en") became a card, beside the same words from the real GPB.
const DUMP = "God Passes By, Shoghi Effendi \nwww.oceanoflights.org \nthe space of forty-eight hours, verses had streamed that equalled in number those of the Qur’án, \nwhich  it  took  its  Author  twenty-three  years  to  reveal,  had  been  excommunicated,  chained, \ndisgraced, imprisoned, and, in all probability, done to death. Mullá Ṣádiq-i-Khurásání, impelled \nby the injunction of the Báb in the Khasá’il-i-Sab‘ih to alter the sacrosanct formula of the adhán, \nsounded  it  in  its  amended  form  before  a  scandalized  congregation";
// dbp:002 — Nabíl quoting Mullá Ḥusayn, with the library's footnote and page markers in the card.
const MARKED = '“Enter therein in peace, secure,”[^71] were His words as He crossed the threshold[pg 54] and motioned me to follow Him.';
describe('2 · clean cards', () => {
  it('page and footnote markers leave the card text', () => {
    expect(cleanCardText(MARKED)).toBe('“Enter therein in peace, secure,” were His words as He crossed the threshold and motioned me to follow Him.');
    expect(cleanCardText('House of God[^1]  On His return')).toBe('House of God On His return');
  });
  it('a PDF page is spotted and never becomes a card (quote or scene); a real paragraph is not', () => {
    expect(isPdfDump(DUMP)).toBe(true);
    expect(isPdfDump(NABIL.text)).toBe(false);
    expect(isPdfDump(GPB(1).text)).toBe(false);
    const found = new Map([['P1', { ...GPB(1), title: 'Shoghi-Effendi-TAF-10_en', text: DUMP, source_url: 'https://oceanoflights.org/file/Shoghi-Effendi-TAF-10_en.pdf' }], ['P2', NABIL]]);
    expect(quoteFrom(['P1'], { found })).toBeNull();
    const sc = sceneFrom(['P1', 'P2'], { found }, ['At the gate', 'Shíráz, 1844']);
    expect(sc.passages).toHaveLength(1);
    expect(sc.passages[0].text).toMatch(/radiant countenance/);
  });
  it('a file-name title becomes the work\'s real title; real titles stay as they are', () => {
    expect(readableTitle('shoghi-effendi-trans-011-the-dawn-breakers_en')).toBe('The Dawn-Breakers');
    expect(readableTitle('bab-khutab-10-en-notes')).not.toMatch(/[-_]|\ben\b/);
    for (const t of ['God Passes By', 'Lawḥ-i-Maqṣúd', 'Kitáb-i-Íqán']) expect(readableTitle(t)).toBe(t);
    const card = quoteFrom(['P1'], { found: new Map([['P1', { ...NABIL, title: 'shoghi-effendi-trans-011-the-dawn-breakers_en', text: MARKED }]]) });
    expect(card.title).toBe('The Dawn-Breakers');
    expect(card.text).not.toMatch(/\[pg|\[\^/);
  });
});

describe('3 · layout around cards', () => {
  it('dbp:001 — lead-ins with nothing after them go; one followed by its card stays', () => {
    const t = 'Shoghi Effendi sets the scene:\n\n\n\nAccording to Shoghi Effendi, the Báb declared His mission on the evening of 22 May 1844.\n\nHis own testimony of what it did to him:\n\n\n\nShoghi Effendi says what the Declaration contained:\n\n<!-- widget:quote-2 -->';
    const r = dropDanglingLeadIn(t);
    expect(r.dropped).toBe(2);
    expect(r.text).not.toMatch(/sets the scene:|testimony of what it did to him:/);
    expect(r.text).toMatch(/Declaration contained:\n\n<!-- widget:quote-2 -->/);
    expect(dropDanglingLeadIn('Shoghi Effendi sets the scene:', { final: false }).dropped).toBe(0);   // streaming: wait for the next piece
  });
  it('a sentence whose work vanished is cut off and goes (dbp:002 "… quotes this testimony in.")', () => {
    const t = 'Mullá Ḥusayn says the words galvanised him ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers#p253)). Shoghi Effendi also quotes this testimony in.\n\n<!-- widget:scene-2 -->';
    const r = dropCutOff(t);
    expect(r.dropped).toBe(1);
    expect(r.text).not.toMatch(/testimony in\./);
    expect(r.text).toMatch(/galvanised him \(\[The Dawn-Breakers\]/);
    expect(dropCutOff('He stayed in Shíráz. It was the year 1844.').dropped).toBe(0);
  });
  it('"the text I hold" becomes "these sources" (dbp:002), never inside a quotation', () => {
    expect(unholdTexts('**What is not settled by the text I hold**')).toBe('**What is not settled by these sources**');
    expect(unholdTexts('> the text I hold')).toBe('> the text I hold');
  });
  it('one card per passage: a second card of the same words goes, a scene keeps only its unseen passages', () => {
    const found = new Map([['P1', GPB(1)], ['P2', { ...GPB(1), id: 999 }], ['P3', NABIL]]);
    const refs = { found, carded: new Set() };
    const a = expandTemplates('{{quote P1}}', refs);
    const b = expandTemplates('Again:\n\n{{quote P2}}\n\n{{scene "At the gate" "Shíráz" P1 P3}}', refs, { start: 1 });
    expect(a.widgets).toHaveLength(1);
    expect(b.widgets.map((w) => w.kind)).toEqual(['scene']);
    expect(b.widgets[0].passages).toHaveLength(1);
  });
  it('streamed: a lead-in whose card cannot be built (a PDF page) is never sent; the reply carries no dangling colon', async () => {
    const found = [{ ...GPB(1), text: DUMP }];
    const draft = 'Mullá Ṣádiq sounded the amended call to prayer in Shíráz, and the city rose against him; the governor had him and his companions punished in the streets, as Shoghi Effendi recounts at length in his history of the period.\n\nShoghi Effendi tells what followed:\n\n{{quote P1}}\n\nThe Báb was then summoned from Búshihr to Shíráz.';
    const parts = draft.split(/(?<=\n)/);
    let n = 0;
    const create = async () => (n++ === 0
      ? { choices: [{ message: { content: '', tool_calls: [{ id: 's', function: { name: 'fused_search', arguments: JSON.stringify({ query: 'Mullá Ṣádiq Shíráz', tradition: B, about: 'history' }) } }] } }] }
      : { async *[Symbol.asyncIterator]() { for (const c of parts) yield { choices: [{ delta: { content: c } }] }; yield { choices: [], usage: {} }; } });
    const ev = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What happened to Mullá Ṣádiq in Shíráz?' }], tools: { search: async () => found, writings: async () => [] }, create, onEvent: (e) => ev.push(e) });
    const text = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(text + r.reply).not.toMatch(/tells what followed:/);
    expect(ev.filter((e) => e.type === 'widget')).toHaveLength(0);
    expect(text + r.reply).toMatch(/summoned from Búshihr/);
  });
});

describe('4 · length is judgement', () => {
  it('the prompt asks for the shortest complete answer for this reader, the rest as follow-ups — no word cap', () => {
    expect(AGENT_SYSTEM).toMatch(/LENGTH is your judgment, from the question and the reader/);
    expect(AGENT_SYSTEM).toMatch(/what you leave out is offered as follow-up questions/);
    expect(AGENT_SYSTEM).not.toMatch(/\b\d{3,4} words\b/);
  });
});
