// Dawn-Breakers battery, first 10 live questions (11-14: 3 pass, 3 weak, 4 fail). Every case here is a real excerpt from those replies.
// 1 Nabíl is THE narrative source (dbp:004 "The library does not give me Nabíl's own chapter" — doc 21308 is in the library): his own tier,
//   after the Guardian, never dropped by core-first; a history search looks inside the work. 2 Clean cards: no [pg N]/[^N], no PDF page,
//   no file-name title. 3 Layout: no lead-in without its card, no cut-off sentence, one card per passage. 4 Length is judgement, not a cap.
import { describe, it, expect } from 'vitest';
import { sourceTier, coreFirst, byTier, isNarrative, TIER_ORDER } from '../../api/lib/assistant/source-tier.js';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { cleanCardText, isPdfDump, readableTitle, isSiteRoot } from '../../api/lib/assistant/widgets/card-text.js';
import { fromRefs as quoteFrom } from '../../api/lib/assistant/widgets/quote.js';
import { fromRefs as sceneFrom } from '../../api/lib/assistant/widgets/scene.js';
import { expandTemplates } from '../../api/lib/assistant/widgets/templates.js';
import { dropDanglingLeadIn, dropCutOff, unholdTexts, dropNarration, unbackedAbsence, absenceClaims, unappliedCorrection, correctedRows, dropUncheckedDisclaimer } from '../../api/lib/assistant/lint.js';
import { HISTORY_WORKS, nameVariants } from '../../api/lib/assistant/history-sweep.js';
import { agentAnswer, AGENT_SYSTEM, renderRefs } from '../../api/lib/assistant/agent-core.js';

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

// db-battery 11-14, retrieval gap: a library-wide search on the bare name found nothing for Bajistání, Khu'í, Ibdál, Ardibílí, Qumí, Kandí…
// although each stands in The Dawn-Breakers (21308) and most in Balyuzi, Momen or Ẓuhúru'l-Ḥaqq (15254); dbp:004 said "no account" of
// Basṭámí although his vision is in 21308. A person lookup searches inside the histories with spelling variants; "no account" needs that empty.
describe('5 · the person lookup searches inside the histories', () => {
  const BAJ = { id: 7001, document_id: 21308, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', religion: B, source_url: 'https://oceanlibrary.com/dawn-breakers#p7001',
    text: 'Mullá Ḥasan-i-Bajistání, one of the companions of Mullá Ḥusayn, was overtaken by doubts and later confessed his fault.' };
  const BAL = { id: 7002, document_id: 462, title: 'The Báb', author: 'H. M. Balyuzi', religion: B, collection: "Baha'i Books", source_url: 'https://oceanlibrary.com/balyuzi-bab#p7002',
    text: 'Bajistání, a disciple of Siyyid Kázim, was among those who set out from Karbilá.' };
  const runner = (inWork) => { const asked = []; const r = toolRunner({ search: async () => [GPB(1)], writings: async () => [], translationsOf: async () => new Map(),
    searchIn: async (q, doc) => { asked.push([doc, q]); return inWork(q, doc); } }); return { r, asked }; };
  it('the spellings: as given, without diacritics or hamza/ayn, the -í/-iy ending swapped', () => {
    expect(nameVariants("Khu'í")).toEqual(["Khu'í", 'Khui', 'Khuiy']);
    expect(nameVariants('Mullá Mihdíy-i-Kandí')).toContain('Mulla Mihdi-i-Kandi');
  });
  it('a name the main search missed is found inside Nabíl and Balyuzi; every history work is searched, the bare spelling too', async () => {
    const { r, asked } = runner((q, doc) => (doc === 21308 && /Bajist/.test(q) ? [BAJ] : doc === 462 ? [BAL] : []));
    const out = await r.run.fused_search({ query: 'Bajistání', tradition: B, about: 'history' });
    expect([...new Set(asked.map(([d]) => d))]).toEqual(HISTORY_WORKS);
    expect(asked.filter(([d]) => d === 21308).map(([, q]) => q)).toEqual(['Bajistání', 'Bajistani', 'Bajistaniy']);
    expect(out).toMatch(/Mullá Ḥasan-i-Bajistání, one of the companions/);
    expect(out).toMatch(/a disciple of Siyyid Kázim/);
    expect(out).toMatch(/searched inside the histories[^\n]*"Bajistani"[^\n]*2 passages/);
    expect(r.sweeps).toEqual([{ query: 'Bajistání', variants: ['Bajistání', 'Bajistani', 'Bajistaniy'], n: 2 }]);
  });
  it('an empty sweep says so — and is what allows "no account"', async () => {
    const { r } = runner(() => []);
    const out = await r.run.fused_search({ query: 'Ibdál', tradition: B, about: 'history' });
    expect(out).toMatch(/nothing inside them\. Only now may you write that the library gives no account/);
    expect(r.sweeps[0].n).toBe(0);
  });
  it('an absence claim is backed only by an empty sweep on that name', () => {
    const claim = 'Mullá Ḥasan-i-Bajistání was a Letter of the Living. The library gives no account of Bajistání beyond his name.';
    expect(unbackedAbsence(claim, [])).toHaveLength(1);
    expect(unbackedAbsence(claim, [{ variants: ['Bajistání', 'Bajistani'], n: 0 }])).toHaveLength(0);
    expect(unbackedAbsence(claim, [{ variants: ['Bajistání', 'Bajistani'], n: 2 }])).toHaveLength(1);
    expect(unbackedAbsence(claim, [{ variants: ['Ibdál', 'Ibdal'], n: 0 }])).toHaveLength(1);
    expect(unbackedAbsence('| 7 | Khu\'í | not identified in the library (searched: Khu\'í, Khui) |', [{ variants: ["Khu'í", 'Khui'], n: 0 }])).toHaveLength(0);
    expect(unbackedAbsence('> the library holds nothing', [])).toHaveLength(0);
  });
  it('an unbacked "no account" sends the agent into the histories once, then the answer is rewritten from what it found', async () => {
    const seen = [];
    const create = async (p) => { seen.push(p);
      if (seen.length === 1) return { choices: [{ message: { content: 'Basṭámí was the second Letter of the Living. The library gives no account of Basṭámí’s vision.' } }] };
      if (seen.length === 2) return { choices: [{ message: { content: '', tool_calls: [{ id: 'h', function: { name: 'fused_search', arguments: JSON.stringify({ query: 'Basṭámí', tradition: B, about: 'history' }) } }] } }] };
      return { choices: [{ message: { content: 'Mullá ‘Alíy-i-Basṭámí was the second Letter of the Living; Nabíl records how he recognised the Báb [[P2]].' } }] }; };
    const VIS = { ...BAJ, id: 7003, text: 'Mullá ‘Alíy-i-Basṭámí, the second to believe, recognised the Báb through a vision while in prayer and fasting.' };
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Who was Basṭámí?' }], create,
      tools: { search: async () => [GPB(1)], writings: async () => [], translationsOf: async () => new Map(), searchIn: async (q, doc) => (doc === 21308 ? [VIS] : []) } });
    const msgs = seen.at(-1).messages;   // one conversation, grown round by round
    expect(msgs.filter((m) => m.role === 'user' && /without searching inside the histories/.test(m.content))).toHaveLength(1);
    expect(msgs.findLast((m) => m.role === 'tool').content).toMatch(/through a vision while in prayer/);
    expect(r.reply).not.toMatch(/gives no account/);
    expect(r.reply).toMatch(/Nabíl records/);
  });
});

// Round-6 live evidence (11-14, sessions/anis/.claude/context/iqan-r6-t1..4.md, srcr6.txt) — the real excerpts.
const ROW11 = "| 11 † | **Mullá Báqir** | The sources disagree on which man is meant. **Reading A (Ṭabarsí brother):** Mullá Báqir-i-Kandí, brother of Mullá Mihdí. ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_1305)). The Spanish Íqán notes agree. **Reading B (Letter of the Living):** Mullá Muḥammad-Báqir-i-Tabrízí, who lived to attain Bahá'u'lláh's presence. | Kitáb-i-Íqán |";
const ROW10 = "| 10 † | **Mullá Mihdíy-i-Kandí** | Martyred at Ṭabarsí, with his brother Mullá Báqir. | Dawn-Breakers |";
const CORRECTION = '#11 is the brother of Mullá Mihdíy-i-Kandí';
describe('6 · round-6 live evidence', () => {
  it('a reader correction the sources support is applied, not left as two readings', () => {
    expect(correctedRows(CORRECTION)).toEqual([11]);
    expect(unappliedCorrection(CORRECTION, `| # | Name | Who | Source |\n|---|---|---|---|\n${ROW10}\n${ROW11}`)).toEqual([11]);
    const fixed = "| 11 † | **Mullá Báqir-i-Kandí** | Brother of Mullá Mihdíy-i-Kandí, with him at Ṭabarsí. (Some read the name as the Letter of the Living, Mullá Muḥammad-Báqir-i-Tabrízí.) | Dawn-Breakers |";
    expect(unappliedCorrection(CORRECTION, `${ROW10}\n${fixed}`)).toEqual([]);
    expect(unappliedCorrection('can you add a column for dates?', `${ROW10}\n${ROW11}`)).toEqual([]);   // no row named → no gate
  });
  it('the left-open row sends the agent back once, with the reader\'s words', async () => {
    const seen = [];
    const create = async (p) => { seen.push(p); return { choices: [{ message: { content: seen.length === 1 ? `${ROW10}\n${ROW11}` : `${ROW10}\n| 11 † | **Mullá Báqir-i-Kandí** | Brother of Mullá Mihdí, at Ṭabarsí. | Dawn-Breakers |` } }] }; };
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'list them' }, { role: 'assistant', content: `${ROW10}\n${ROW11}` }, { role: 'user', content: CORRECTION }], create,
      tools: { search: async () => [], writings: async () => [], translationsOf: async () => new Map() } });
    const asks = seen.at(-1).messages.filter((m) => m.role === 'user' && /The reader corrected row 11/.test(m.content));
    expect(asks).toHaveLength(1);
    expect(asks[0].content).toMatch(/#11 is the brother of Mullá Mihdíy-i-Kandí/);
    expect(r.reply).not.toMatch(/Reading B/);
    expect(AGENT_SYSTEM + '').toBeTruthy();
  });
  it('"remains unidentified in the library" (row 5, Sa\'íd-i-Bárfurúshí) is an absence claim the sweep must back', () => {
    const row5 = "| 5 † | **Mullá Sa‘íd-i-Bárfurúshí** | Not identified in the Writings or in Shoghi Effendi. The Íqán's Mullá Sa‘íd remains unidentified in the library. | Kitáb-i-Íqán (name only) |";
    expect(absenceClaims(row5).some((c) => /remains unidentified in the library/.test(c))).toBe(true);
    expect(unbackedAbsence(row5, [])).not.toHaveLength(0);
    expect(unbackedAbsence(row5, [{ variants: ['Sa‘íd-i-Bárfurúshí', 'Said-i-Barfurushi'], n: 0 }])).toHaveLength(0);
    expect(absenceClaims('The library does not identify him beyond the name.')).toHaveLength(1);
  });
  it('a file-name title reads as a title, and a bare site root is never the link', () => {
    expect(readableTitle('bab-kutob-03-1-2-en-notes')).not.toMatch(/bab-kutob/);
    expect(isSiteRoot('https://oceanoflights.org/')).toBe(true);
    expect(isSiteRoot('https://oceanoflights.org/file/bab-kutob-03-1-2-en-notes.pdf')).toBe(false);
    const found = new Map([['P1', { document_id: 9, title: 'Ẓuhúru\'l-Ḥaqq', source_url: 'https://oceanoflights.org/' }],
      ['P2', { document_id: 8, title: 'bab-kutob-03-1-2-en-notes', source_url: 'https://oceanoflights.org/file/bab-kutob-03-1-2-en-notes.pdf' }]]);
    const out = renderRefs('Sa‘ídu\'l-‘Ulamá\' persecuted them [[P1]]. A note [[P2]].', { found, works: new Map() });
    expect(out).not.toMatch(/\]\(https:\/\/oceanoflights\.org\/\)/);
    expect(out).toMatch(/\*Ẓuhúru'l-Ḥaqq\*/);
    expect(out).not.toMatch(/\[bab-kutob/);
  });
  it('a section number "from memory" never reaches the reader (srcr6)', () => {
    const t = 'This passage is from Gleanings. I\'m giving the section number from memory, so check it against the edition: it is, I believe, Gleanings CXXXII. It speaks of the Day of God.';
    const out = dropUncheckedDisclaimer(t).text;
    expect(out).not.toMatch(/memory|CXXXII|I believe/);
    expect(out).toMatch(/It speaks of the Day of God/);
    expect(AGENT_SYSTEM).toMatch(/never from memory/);
  });
});
