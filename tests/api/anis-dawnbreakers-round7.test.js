// Dawn-Breakers battery, first 10 live questions (11-14: 3 pass, 3 weak, 4 fail). Every case here is a real excerpt from those replies.
// 1 Nabíl is THE narrative source (dbp:004 "The library does not give me Nabíl's own chapter" — doc 21308 is in the library): his own tier,
//   after the Guardian, never dropped by core-first; a history search looks inside the work. 2 Clean cards: no [pg N]/[^N], no PDF page,
//   no file-name title. 3 Layout: no lead-in without its card, no cut-off sentence, one card per passage. 4 Length is judgement, not a cap.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSentenceGate, linkQuotes, markQuotes, dropUnverified, rowWithout } from '../../api/lib/assistant/quotes.js';
import { sourceTier, coreFirst, byTier, isNarrative, TIER_ORDER } from '../../api/lib/assistant/source-tier.js';
import { toolRunner } from '../../api/lib/assistant/researcher.js';
import { cleanCardText, isPdfDump, readableTitle, isSiteRoot, holdsPhrase, cleanUrl, otherBook } from '../../api/lib/assistant/widgets/card-text.js';
import { fromRefs as quoteFrom } from '../../api/lib/assistant/widgets/quote.js';
import { fromRefs as sceneFrom } from '../../api/lib/assistant/widgets/scene.js';
import { expandTemplates, blockquoteCards, mendTemplates } from '../../api/lib/assistant/widgets/templates.js';
import { dropDanglingLeadIn, dropCutOff, unholdTexts, dropNarration, unbackedAbsence, absenceClaims, unappliedCorrection, correctedRows, dropUncheckedDisclaimer, dropSearchedNote, numberedRows, rebuildsTable, dropRebuildPreamble, fixCounts, dropSourceSpeculation, dropLinkDebris, noteDuplicateRows, duplicateRows, recapitalise, isNarration, pointsAbove, dropAbovePointer } from '../../api/lib/assistant/lint.js';
import { unlinkSiteRoots } from '../../api/lib/assistant/lint.js';
import { markdownDefects } from '../../api/lib/assistant/md-valid.js';
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

// Round-7 live replay (11-14, tower f538aa830): srcr7 / evilr7 / iqanr7 SSE and the 4-turn Íqán chain (tests/fixtures/anis/iqan-r7/t1..t4.md,
// the real replies) — the real excerpts.
const GLEAN_261 = { id: 261, document_id: 7, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", religion: B, source_url: 'https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah/?paraId=para_261',
  text: 'Watch over yourselves, for the Evil One is lying in wait, ready to entrap you. Gird yourselves against his wicked devices, and, led by the light of the name of the All-Seeing God, make your escape from the darkness that surroundeth you. Let your thought be fixed upon that which will rehabilitate the fortunes of mankind and sanctify the hearts and souls of men. Let your vision be world-embracing, rather than confined to your own self. The Evil One is he that hindereth the rise and obstructeth the spiritual progress of the children of men.' };
const SAQ_921 = { id: 921, document_id: 8, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', religion: B, source_url: 'https://oceanlibrary.com/some-answered-questions/?paraId=para_921',
  text: 'As for sensible realities, these are also purely good, and evil is merely their non-existence; that is, blindness is the want of sight, deafness is the want of hearing, poverty is the want of wealth, illness is the want of health, death is the want of life, and weakness is the want of strength.' };
const fx = (t) => readFileSync(new URL(`../fixtures/anis/iqan-r7/${t}.md`, import.meta.url), 'utf8');
describe('7 · round-7 live replay (7d)', () => {
  it('srcr7: the source card holds the asked words, checked in code; the passage without them is not the source', () => {
    expect(holdsPhrase(GLEAN_261.text, 'Let your vision be world-embracing')).toBe(true);
    expect(holdsPhrase(SAQ_921.text, 'Let your vision be world-embracing')).toBe(false);
    expect(holdsPhrase(GLEAN_261.text, 'Watch over yourselves… ready to entrap you')).toBe(true);   // an elided quotation: every part
    expect(holdsPhrase(GLEAN_261.text, '')).toBe(false);
  });
  it('srcr7: the title typed beside its ref is one linked title, straight apostrophes against the record\'s curly ones', () => {
    const works = new Map([['B1', { title: 'Gleanings from the Writings of Bahá’u’lláh' }]]);
    const out = renderRefs("The line comes from Bahá'u'lláh, in *Gleanings from the Writings of Bahá'u'lláh* [[B1]].", { found: new Map(), works });
    expect(out.match(/Gleanings from the Writings/g)).toHaveLength(1);   // one title, never "in *Gleanings…* [*Gleanings…*](…)"
    expect(out).toMatch(/^The line comes from Bahá'u'lláh, in \*Gleanings from the Writings of Bahá’u’lláh\*\.$/);
  });
  const EVIL = '> Watch over yourselves, for the Evil One is lying in wait, ready to entrap you. Gird yourselves against his wicked devices... The Evil One is he that hindereth the rise and obstructeth the spiritual progress of the children of men. [[P1]]\n\n'
    + 'In ‘Abdu’l-Bahá\'s words, evil is an absence:\n\n> As for sensible realities, these are also purely good, and evil is merely their non-existence; that is, blindness is the want of sight, … weakness is the want of strength. [[P2]]\n\nSo evil has no existence of its own.';
  it('evilr7: the stream releases a blockquote whole — its attribution never runs into the next sentence', () => {
    const pieces = [];
    const gate = createSentenceGate([GLEAN_261, SAQ_921], (s) => pieces.push(s));
    for (const c of EVIL.match(/[\s\S]{1,7}/g)) gate.push(c);
    gate.flush();
    expect(pieces.join('')).toBe(EVIL);
    expect(pieces.some((p) => p.startsWith('> Watch over yourselves') && p.includes('children of men. [[P1]]'))).toBe(true);
    const linked = pieces.map((p) => linkQuotes(p, [GLEAN_261, SAQ_921].map((x) => ({ ...x, citation_url: x.source_url, source_title: x.title }))).text).join('');
    expect(linked).not.toMatch(/\]\([^)]*\) Gird yourselves/);
    expect(linked).not.toMatch(/\[Some Answered Questions\]\([^)]*\)\)? \(\[Some Answered Questions\]/);
  });
  it('evilr7: a typed quotation of a held passage becomes its card, with the words quoted; one not held stays as typed', () => {
    const found = new Map([['P1', GLEAN_261], ['P2', SAQ_921]]);
    const t = blockquoteCards(EVIL, found, new Set());
    expect(t).toMatch(/^\{\{quote "Watch over yourselves[^"]*children of men\." P1\}\}$/m);
    expect(t).toMatch(/^\{\{quote "As for sensible realities[^"]*want of strength\." P2\}\}$/m);
    expect(t).not.toMatch(/^>/m);
    const x = expandTemplates(t, { found, works: new Map(), carded: new Set() });
    expect(x.widgets.map((w) => w.kind)).toEqual(['quote', 'quote']);
    expect(x.widgets[0].text).toMatch(/^Watch over yourselves/);
    expect(x.widgets[0].text).not.toMatch(/Let your thought be fixed/);   // the words quoted, not the whole passage
    const invented = '> The Evil One whispers in the hearts of men and leads them astray from the path. [[P1]]';
    expect(blockquoteCards(invented, found, new Set())).toBe(invented);
  });
  const IQAN_OPEN = "Searching inside the histories (Nabíl, Balyuzi, Momen, Ẓuhúru'l-Ḥaqq) turns up no account of Mullá Sa'íd-i-Bárfurúshí. I searched *\"Mullá Sa'íd-i-Bárfurúshí\"*, *\"Mulla Said-i-Barfurushi\"*, \"Mulla Said-i-Barfurushiy\" and \"Mullá Sa'íd-i-Zirih-Kinárí Bárfurúsh\". Bahá'u'lláh names thirteen divines, then twelve others, and every other row rests on a ";
  it('iqanr7: no search narration, no cut-off lead, the searched-names note leaves the row', () => {
    const d = dropCutOff(dropNarration(IQAN_OPEN).text).text;
    expect(d).not.toMatch(/Searching inside|I searched|turns up no/);
    expect(d).not.toMatch(/rests on a\s*$/);
    const row5 = "| 5 | Mullá Sa'íd-i-Bárfurúshí | Not identified in the library (searched: Mullá Sa'íd-i-Bárfurúshí, Mulla Said-i-Barfurushi, Mulla Said-i-Barfurushiy, Mullá Sa'íd-i-Zirih-Kinárí Bárfurúsh) | none |";
    expect(dropSearchedNote(row5)).toBe("| 5 | Mullá Sa'íd-i-Bárfurúshí | Not identified in the library | none |");
  });
  it('iqanr7: a file-name title ("Bkw26") reads as the writer\'s tablet', () => {
    expect(readableTitle('abdul-baha-bkw26-en')).toBe('A Tablet of ‘Abdu’l-Bahá');
    expect(readableTitle('abdul-baha-bkw26-en')).not.toMatch(/bkw/i);
  });

  // The 4-turn Íqán chain: list → research → reader's #11 correction → "email me the final table" (t4 lost rows 4, 7, 9, 10, cut rows 2–3,
  // said "I have no email address for you yet…" and opened with talk about the previous turn).
  const t2 = fx('t2'), t3 = fx('t3'), t4 = fx('t4');
  const tableOf = (s) => s.split('\n').filter((l) => /^\|/.test(l));
  const row11 = tableOf(t3).find((l) => /^\| 11 \|/.test(l));
  const fullTable = tableOf(t2).map((l) => (/^\| 11 \|/.test(l) ? row11 : l)).join('\n');
  const t4Preamble = t4.split('\n# ')[0];   // the real opening: editing talk + the address line
  const draft = `${t4Preamble}\n# The *"Illumined Divines"* of the Kitáb-i-Íqán: Final Table\n\nIn the Kitáb-i-Íqán, Bahá'u'lláh names some of the learned who attained His Court.\n\n${fullTable}\n\nBahá'u'lláh adds that there were others, well nigh four hundred in number.`;
  const convo = [{ role: 'user', content: 'Who were the illumined divines named in the Iqan?' }, { role: 'assistant', content: fx('t1') },
    { role: 'user', content: 'Please search the histories for each of them.' }, { role: 'assistant', content: t2 },
    { role: 'user', content: CORRECTION }, { role: 'assistant', content: t3 }, { role: 'user', content: 'Email me the final table.' }];
  it('the email turn carries all 13 rows through the correction — no new searches, quotations verified in earlier turns', async () => {
    expect(numberedRows(t2).map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const parts = draft.match(/[\s\S]{1,11}/g);
    let n = 0;
    const create = async () => (n++ === 0
      ? { async *[Symbol.asyncIterator]() { for (const c of parts) yield { choices: [{ delta: { content: c } }] }; yield { choices: [], usage: {} }; } }
      : { choices: [{ message: { content: draft } }] });
    const ev = [];
    const r = await agentAnswer({ messages: convo, create, onEvent: (e) => ev.push(e),
      tools: { search: async () => [], writings: async () => [], translationsOf: async () => new Map(), searchIn: async () => [] } });
    for (const out of [r.reply, ev.filter((e) => e.type === 'text').map((e) => e.content).join('')].filter((x) => x.trim())) {
      expect(numberedRows(out).map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
      const rows = numberedRows(out);
      expect(rows.find((x) => x.n === 11).text).toMatch(/brother of Mullá Mihdíy-i-Kandí/);
      expect(rows.find((x) => x.n === 2).text).toMatch(/The Sháh sent him/);   // row 2 whole, its quotation kept
      expect(rows.find((x) => x.n === 4).text).toMatch(/first to leave the House of God/);
      for (const l of tableOf(out)) expect(l.trim()).toMatch(/\|$/);   // every row keeps its cells
      expect(out).not.toMatch(/no email address|send the one you would like/);
      expect(out).not.toMatch(/Here is the whole table again|This restores|The searches added/);
      expect(out.trimStart()).toMatch(/^#/);   // it opens with the table's heading
    }
  });
  it('a one-row revision (turn 3) keeps its acknowledgement — only a rebuilt table drops the editing talk', () => {
    expect(rebuildsTable(convo.slice(0, 5), t3)).toBe(false);
    expect(dropRebuildPreamble(t4).text).not.toMatch(/Here is the whole table again/);
    expect(dropRebuildPreamble(t4).text).toMatch(/^# The \*"Illumined Divines"\*/);
  });
  it('a quotation no passage or earlier reply holds still leaves its row cell, never the row', () => {
    const row = '| 4 | Mullá ‘Alíy-i-Basṭámí | A Letter of the Living. He said *"the stars themselves bowed before the gate of Shíráz in that hour"* ([God Passes By](https://x.org/gpb)). He died in prison. | GPB |';
    expect(rowWithout(row, ['the stars themselves bowed before the gate of Shíráz in that hour'])).toBe('| 4 | Mullá ‘Alíy-i-Basṭámí | A Letter of the Living. He died in prison. | GPB |');
    const d = dropUnverified(`Intro line here.\n\n| # | Name | Who | Src |\n|---|---|---|---|\n${row}\n| 5 | X | Y. | Z |`, []);
    expect(numberedRows(d.text).map((x) => x.n)).toEqual([4, 5]);
  });
});

// Round 7e (11-14 live): srcr7d sent no card yet said "in the passage quoted above" (the trace re-found a HELD passage and the dedup dropped
// its source role); iqanr7d said "fourteen" over 13 rows, ended with an offer, guessed the glossary "may have mixed up the two"; the t4 email
// turn left "585))" link debris and gave rows 6 and 8 one description unremarked; presume-baseline leaked (P55), a lowercase "these sources",
// and a footnote arrow inside a file-name link.
const W = 'Let your vision be world-embracing, rather than confined to your own self.';
describe('8 · round-7e live evidence', () => {
  const tools = { search: async () => [], writings: async () => [], translationsOf: async () => new Map(), searchIn: async () => [],
    sourceOf: async () => [{ ...GLEAN_261, role: 'source' }] };
  const HELD = { same: true, status: 'answered', question: `Where does "${W}" come from?`, passages: [GLEAN_261] };
  const trace = (final) => { const seen = []; let n = 0; return { seen, create: async (p) => { seen.push(p);
    return n++ === 0 ? { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'quotation_candidates', arguments: JSON.stringify({ quotation: W }) } }] } }] } : final(p); } }; };
  it('srcr7d: a trace that re-finds a held passage still makes it THE source — its card and its "From …" note', async () => {
    const { create, seen } = trace(() => ({ choices: [{ message: { content: 'These words are from Gleanings.\n\n{{quote P1}}' } }] }));
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${W}" come from?` }], tools, held: HELD, create });
    const told = seen[1].messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n');
    expect(told).toMatch(/From \[Gleanings from the Writings of Bahá’u’lláh/);
    expect(r.widgets.map((w) => w.kind)).toContain('quote');
  });
  it('srcr7d: with no card above, the prose never points at "the passage quoted above" (whole reply and streamed)', async () => {
    const said = 'These words come from *Gleanings from the Writings of Bahá’u’lláh*, in the passage quoted above.';
    expect(pointsAbove(said)).toBe(true);
    expect(dropAbovePointer(said)).toBe('These words come from *Gleanings from the Writings of Bahá’u’lláh*.');
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Where is that from?' }], tools: { ...tools, sourceOf: async () => [] }, create: async () => ({ choices: [{ message: { content: said } }] }) });
    expect(r.reply).not.toMatch(/quoted above/);
    const ev = [], parts = said.match(/[\s\S]{1,9}/g);
    await agentAnswer({ messages: [{ role: 'user', content: 'Where is that from?' }], tools: { ...tools, sourceOf: async () => [] }, onEvent: (e) => ev.push(e),
      create: async () => ({ async *[Symbol.asyncIterator]() { for (const c of parts) yield { choices: [{ delta: { content: c } }] }; yield { choices: [], usage: {} }; } }) });
    expect(ev.filter((e) => e.type === 'text').map((e) => e.content).join('')).not.toMatch(/quoted above/);
  });
  it('iqanr7d: the count is stated once, from the rendered rows', () => {
    const intro = 'In the Kitáb-i-Íqán, Bahá’u’lláh names fourteen of the learned who attained His Court.';
    expect(fixCounts(intro, 13).text).toMatch(/names 13 of the learned|names thirteen of the learned/);
    expect(fixCounts('Bahá’u’lláh names fourteen of them.\n\nThat is the list, which gives thirteen rows.', 13).text).not.toMatch(/rows/);
    expect(fixCounts(intro, null).text).not.toMatch(/fourteen/);
  });
  it('iqanr7d: an offer paragraph is narration (pills carry offers); the t4 ask for an address stays', () => {
    expect(isNarration('I can read it with you and prepare a side-by-side document of the two translations, if you would like.')).toBe(true);
    expect(isNarration('Would you like me to prepare a side-by-side document?')).toBe(true);
    expect(isNarration('Please tell me where to send this document and it will go out.')).toBe(false);
  });
  it('iqanr7d row 8: no guess at how a source erred — one clause says the sources cannot separate them', () => {
    const cell = 'Named in the Spanish glossary. The glossary may have mixed up the two men, since Nabíl describes Kandí the same way.';
    const out = dropSourceSpeculation(cell).text;
    expect(out).not.toMatch(/mixed up/);
  });
  it('t4: a rewritten link leaves no "585))" debris; whole links survive', () => {
    const l5 = 'The passage in the Íqán reads: "…and others, well nigh four hundred in number, whose names are all inscribed upon the \'Guarded Tablet\' of God." 585))';
    expect(dropLinkDebris(l5).text).toBe('The passage in the Íqán reads: "…and others, well nigh four hundred in number, whose names are all inscribed upon the \'Guarded Tablet\' of God."');
    const ok = 'See [The Kitáb-i-Íqán](https://oceanlibrary.com/kitab-i-iqan_bahaullah/?paraId=para_260&selectionString=a0.0~a0.585)) and more.';
    expect(dropLinkDebris('See ([The Kitáb-i-Íqán](https://oceanlibrary.com/k?p=1)).').text).toBe('See ([The Kitáb-i-Íqán](https://oceanlibrary.com/k?p=1)).');
    expect(dropLinkDebris(ok).text).toMatch(/\[The Kitáb-i-Íqán\]\(https:\/\/oceanlibrary\.com\/kitab-i-iqan_bahaullah\/\?paraId=para_260&selectionString=a0\.0~a0\.585\)/);
  });
  const R6 = "| 6 | Mullá Mihdíy-i-Ḵhu’í | A close companion of Bahá'u'lláh and teacher of the children of His household. He was martyred at Ṭabarsí. | Spanish Íqán glossary ([Libro de Certeza](https://bahai-library.com/bahaullah_libro_certeza_iqan&chapter=all)) |";
  const R8 = "| 8 | Mullá Mihdíy-i-Kandí | A close companion of Bahá'u'lláh and tutor to the children of His household. He was at Ṭabarsí, where Quddús permitted him to meet a messenger from Kand. | The Dawn-Breakers, note 152 ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_1404)) |";
  it('t4 rows 6/8: one description for two men → row 6 says the glossary matches Nabíl\'s Kandí, identity unconfirmed (whole and streamed)', () => {
    const whole = noteDuplicateRows(`${R6}\n| 7 | X | Y. | Z |\n${R8}`);
    const r6 = whole.split('\n')[0];
    expect(r6).toMatch(/matches the one the sources give for Mullá Mihdíy-i-Kandí \(row 8\), so his identity is unconfirmed/);
    expect(whole.split('\n')[2]).toBe(R8);
    const dup = duplicateRows();
    expect(dup(R6)).toBe(R6);
    expect(dup(R8)).toMatch(/identity is unconfirmed|do not separate/);
  });
  it('presume-baseline: raw (P55) markers never show; a lowercase "these sources" after a drop is recapitalised', () => {
    const t = renderRefs('Marriage is between a man and a woman ([Gleanings](https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah/x)) (P55). It is the foundation (P2).', { found: new Map([['P2', GLEAN_261], ['P55', GLEAN_261]]), works: new Map() });
    expect(t).not.toMatch(/\(P\d+\)/);
    expect(recapitalise('He says so. these sources don\'t engage that question.')).toBe('He says so. These sources don\'t engage that question.');
    expect(recapitalise('| 5 | X | these sources do not say | Z |')).toBe('| 5 | X | These sources do not say | Z |');
  });
  it('presume-baseline: a footnote arrow never rides in a URL, and a file-name title reads as the tablet', () => {
    expect(cleanUrl('https://oceanoflights.org/bahaullah-st-015-en/).%20%E2%86%91')).toBe('https://oceanoflights.org/bahaullah-st-015-en/');
    expect(cleanUrl('https://oceanoflights.org/bahaullah-st-015-en/ ↑')).toBe('https://oceanoflights.org/bahaullah-st-015-en/');
    expect(cleanUrl('https://oceanlibrary.com/x?p=1')).toBe('https://oceanlibrary.com/x?p=1');
    expect(readableTitle('bahaullah-st-015_en')).toBe('A Tablet of Bahá’u’lláh');
  });
});

// ── 9 Round 8 (live check of 7e, Íqán chain t4, 11-14) ──────────────────────────────────────────────────────────────────
describe('round 8: a link is the passage\'s own book; emphasis stays balanced; the duplicate-row note names the right row', () => {
  const KJV = 'https://oceanlibrary.com/kjv-apocalypse-saint-john-of-patmos';
  // the backfill bound Taherzadeh's volumes (docs 429/430/432, title "Revelation") to the KJV Apocalypse by title alone
  const TAHERZADEH = { id: 708, document_id: 430, title: 'Revelation', author: 'Adib Taherzadeh', religion: B, source_url: KJV, url: KJV,
    text: 'survived all the other Letters of the Living, was the only one who embraced the Cause of Bahá\'u\'lláh and remained loyal and devoted to Him' };
  it('a link whose book is another one (title word only) is dropped; the passage\'s own books keep theirs', () => {
    expect(otherBook(KJV, 'Revelation', 'Adib Taherzadeh')).toBe(true);
    expect(otherBook('https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_1304', 'The Dawn-Breakers', 'Nabil Zarandi')).toBe(false);
    expect(otherBook(KJV, 'The Bible (KJV), The Revelation of Saint John', 'King James Bible')).toBe(false);
    const r = toolRunner({ search: async () => [], writings: async () => [], translationsOf: async () => new Map() });
    const ref = r.add(TAHERZADEH);
    expect(r.found.get(ref).source_url).toBeNull();
    const out = renderRefs(`Taherzadeh writes that he survived them all [[${ref}]].`, { found: r.found, works: new Map() });
    expect(out).toMatch(/\*Revelation\*/);
    expect(out).not.toMatch(/kjv/);
  });
  it('t4 line 27: a site-root link after the cited title goes; a bare root link keeps its label', () => {
    const line = `- **Mullá Báqir-i-Tabrízí, the Letter of the Living (not row 11).** Adib Taherzadeh writes that he **"survived all the other Letters of the Living, was the only one who embraced the Cause of Bahá'u'lláh and remained loyal and devoted to Him"* ([Revelation, #708](https://oceanlibrary.com/kjv-apocalypse-saint-john-of-patmos))* ([Revelation](https://oceanlibrary.com/)). The Báb's words to him, **"Haply thou mayest in eight years, in the day of His Revelation, attain unto His Presence,"* ([Epistle to the Son of the Wolf](https://oceanlibrary.com/epistle-to-the-son-of-the-wolf_bahaullah/?paraId=para_258&selectionString=epistle_to_the_son_of_the_wolf_bahai_en-bl9w.0~epistle_to_the_son_of_the_wolf_bahai_en-bl9w.416))* are quoted by Bahá'u'lláh ([Epistle to the Son of the Wolf](https://oceanlibrary.com/epistle-to-the-son-of-the-wolf_bahaullah/?paraId=para_183&selectionString=epistle_to_the_son_of_the_wolf_bahai_en-bl7t.0~epistle_to_the_son_of_the_wolf_bahai_en-bl7t.393)). 'Abdu'l-Bahá relates his visit to Bahá'u'lláh in Baghdad ([Tablet, provisional translation](https://oceanlibrary.com/)).`;
    const out = unlinkSiteRoots(line.replace(KJV, 'https://oceanlibrary.com/x-revelation'));
    expect(out).not.toMatch(/\(\[Revelation\]\(https:\/\/oceanlibrary\.com\/\)\)/);
    expect(unlinkSiteRoots('A tablet ([Tablet, provisional translation](https://oceanlibrary.com/)).')).toBe('A tablet (Tablet, provisional translation).');
  });
  it('t4 row 11: the quote link goes after the closing emphasis, so markQuotes leaves the stars balanced (md-valid flags the broken one)', () => {
    const broken = `| 11 | Mullá Báqir | The brother of Mullá Mihdíy-i-Kandí (row 10), as the reader reads him. Nabíl's notes list **"Mullá Báqir, brother of Mullá Mihdí, both of whom were men of considerable learning, to whose great attainments Bahá'u'lláh testifies in the 'Kitáb-i-Íqán.'"* ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250))* The Spanish note adds that he was martyred at Ṭabarsí. He is not the Letter of the Living Mullá Báqir-i-Tabrízí (see note). | Nabíl, [The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250); Spanish edition's note, [Libro de Certeza](https://bahai-library.com/bahaullah_libro_certeza_iqan&chapter=all) |`;
    expect(markdownDefects(broken.split('|')[3]).some((d) => d.id === 'unbalanced-emphasis')).toBe(true);
    const words = 'Mullá Báqir, brother of Mullá Mihdí, both of whom were men of considerable learning, to whose great attainments Bahá\'u\'lláh testifies in the \'Kitáb-i-Íqán.\'';
    const NOTE = { id: 250, document_id: 21308, title: 'The Dawn-Breakers', author: 'Nabil Zarandi', religion: B, citation_url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250', source_url: 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250', source_title: 'The Dawn-Breakers', text: `Among them were ${words}` };
    const said = `Nabíl's notes list *"${words}"* and more.`;
    const linked = linkQuotes(said, [NOTE]).text;
    expect(linked).toMatch(/\*"[^"]+"\* \(\[The Dawn-Breakers\]/);
    const marked = markQuotes(linked, [NOTE]).text;
    expect(markdownDefects(marked).filter((d) => d.id === 'unbalanced-emphasis')).toEqual([]);
  });
  const T4 = [`| 8 | Mullá Mihdíy-i-Khu’í | The glossary's description of him matches the one the sources give for Mullá Báqir (row 11), so his identity is unconfirmed. The Spanish edition's note describes him as a close companion of Bahá'u'lláh and tutor to the children of His household, martyred at Ṭabarsí. The histories hold no account under this name. | Spanish edition's note, [Libro de Certeza](https://bahai-library.com/bahaullah_libro_certeza_iqan&chapter=all) |`, `| 10 | Mullá Mihdíy-i-Kandí | "A close companion of Bahá'u'lláh, and a tutor to the children of His household." Nabíl places him in the fort at Ṭabarsí with his brother Mullá Báqir. | Nabíl, [The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_1304&selectionString=dawn-breakers-prod-version_en_12x.0~dawn-breakers-prod-version_en_12x.86) |`, `| 11 | Mullá Báqir | The brother of Mullá Mihdíy-i-Kandí (row 10), as the reader reads him. Nabíl's notes list **"Mullá Báqir, brother of Mullá Mihdí, both of whom were men of considerable learning, to whose great attainments Bahá'u'lláh testifies in the 'Kitáb-i-Íqán.'"* ([The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250))* The Spanish note adds that he was martyred at Ṭabarsí. He is not the Letter of the Living Mullá Báqir-i-Tabrízí (see note). | Nabíl, [The Dawn-Breakers](https://oceanlibrary.com/dawn-breakers_nabil/?paraId=fn_250); Spanish edition's note, [Libro de Certeza](https://bahai-library.com/bahaullah_libro_certeza_iqan&chapter=all) |`];
  it('t4 rows 8/10/11: the glossary row names Kandí (row 10), whose description it repeats, never Báqir (row 11) — whole reply and stale copy alike', () => {
    const fresh = T4[0].replace(/The glossary's description of him matches the one the sources give for Mullá Báqir \(row 11\), so his identity is unconfirmed\. /, '');
    for (const rows of [T4, [fresh, T4[1], T4[2]]]) {
      const row8 = noteDuplicateRows(rows.join('\n')).split('\n')[0];
      expect(row8).toMatch(/matches the one the sources give for Mullá Mihdíy-i-Kandí \(row 10\)/);
      expect(row8).not.toMatch(/row 11/);
      expect(row8.match(/matches the one/g)).toHaveLength(1);
    }
  });
  it('streamed, row 8 comes before row 10: its copied claim is not trusted, and row 10 carries the note', () => {
    const g = duplicateRows(), [a, b] = [g(T4[0]), g(T4[1])];
    expect(a).not.toMatch(/row 11|Mullá Báqir \(/);
    expect(a).toMatch(/matches another man's in these sources/);
    expect(b).toMatch(/The glossary gives Mullá Mihdíy-i-Khu’í \(row 8\) this same description/);
  });
});

// ── 9b A quote wrapped in the card marker (presumption run 11-14, 1fuszlx / 1kuomdm) ────────────────────────────────────
describe('round 8: {{quote:\n\n> "…"\n\nP7}} becomes the card, or else a plain blockquote', () => {
  const SAQ = { id: 275, document_id: 20911, title: 'Some Answered Questions', author: "'Abdu'l-Bahá", religion: B, source_url: 'https://oceanlibrary.com/saq#p275',
    text: 'The resurrection of the Manifestations of God is not of the body. All that pertains to Them — all Their states and conditions, all that They do, found, teach, interpret, illustrate, and instruct — is of a mystical and spiritual character and does not belong to the realm of materiality.' };
  const RAW = `He states a principle about all the Manifestations of God:\n\n{{quote:\n\n> "${SAQ.text}"  \n> — [[P7]]\n\nP7}}\n\nHe argues from the Gospels themselves.`;
  it('the P-number is recovered and the card drawn; no brace, no "P7}}" reaches the reader', () => {
    const found = new Map([['P7', { ...SAQ, ref: 'P7' }]]);
    const mended = mendTemplates(RAW, { found, works: new Map() });
    expect(mended).toMatch(/^\{\{quote P7\}\}$/m);
    expect(mended).not.toMatch(/^>/m);
    const x = expandTemplates(mended, { found, works: new Map(), carded: new Set() });
    expect(x.widgets.map((w) => w.kind)).toEqual(['quote']);
    expect(x.text).not.toMatch(/\{\{|\}\}|P7\}/);
    expect(x.text).toMatch(/Gospels themselves/);
  });
  it('a ref not in hand: the marker goes and the quote stays as an ordinary blockquote', () => {
    const mended = mendTemplates(RAW, { found: new Map(), works: new Map() });
    expect(mended).not.toMatch(/\{\{|\}\}|P7\}/);
    expect(mended).toMatch(/^> "The resurrection of the Manifestations/m);
    expect(mended).toMatch(/^> — \[\[P7\]\]$/m);
  });
  it('the sentence gate releases the marker whole, never split at its blank lines', () => {
    const out = []; const gate = createSentenceGate([SAQ], (s) => out.push(s));
    for (const ch of RAW.match(/[\s\S]{1,7}/g)) gate.push(ch);
    gate.flush();
    const piece = out.find((s) => s.includes('{{quote'));
    expect(piece).toMatch(/P7\}\}/);
  });
});
