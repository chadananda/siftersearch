// The agent (agent.js; Chad 11-01): one loop with the library tools; code grounds the reply — refs → links, unknown refs and
// unverifiable quotations out — so the model cannot invent a source.
import { describe, it, expect } from 'vitest';
import { agentAnswer, renderRefs, canonWork } from '../../api/lib/assistant/agent.js';
import { agentOn } from '../../api/lib/assistant/respond.js';

const P = { id: 11, text: 'Foremost among the priceless treasures cast forth from the billowing ocean of Bahá’u’lláh’s Revelation ranks the Kitáb-i-Íqán.',
  title: 'God Passes By', author: 'Shoghi Effendi', source_url: 'https://oceanlibrary.com/gpb#p1', document_id: 5, paragraph_index: 1 };
const tools = {
  search: async () => [P],
  work: async () => ({ doc: { id: 1, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", slug: 'kitab-i-iqan', source_site: 'oceanlibrary.com', source_url: 'https://oceanlibrary.com/kitab-i-iqan/' }, others: [] }),
  notes: async () => ({ works: [{ title: 'The Kitáb-i-Íqán', notes: [{ quote: 'which is indeed the cynosure of all books', speaker: "Bahá'u'lláh", source_title: 'The Tabernacle of Unity', url: 'https://oceanlibrary.com/tab#p9' }] }] }),
};
// a scripted model: round 1 asks for tools in parallel, round 2 writes with refs
const scripted = (finalText) => {
  let n = 0;
  return async () => (n++ === 0
    ? { choices: [{ message: { content: '', tool_calls: [
      { id: 'a', function: { name: 'document_search', arguments: '{"title":"Iqan"}' } },
      { id: 'b', function: { name: 'fused_search', arguments: '{"query":"Kitáb-i-Íqán priceless treasures"}' } },
      { id: 'c', function: { name: 'work_notes_lookup', arguments: '{"title":"Book of Certitude"}' } }] } }] }
    : { choices: [{ message: { content: finalText } }] });
};

describe('agent: refs become links; nothing else does', () => {
  it('book, passage and note refs render to the library links', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Where can I read the Iqan?' }], tools,
      create: scripted('Here is [[B1]]. Shoghi Effendi writes that it is "Foremost among the priceless treasures cast forth from the billowing ocean" [[P1]]; Bahá’u’lláh calls it "the cynosure of all books" [[P2]].') });
    expect(r.reply).toMatch(/^Here is \[\*The Kitáb-i-Íqán\*\]\(https:\/\/oceanlibrary\.com\/kitab-i-iqan\/\)/);
    expect(r.reply).toContain('(https://oceanlibrary.com/gpb#p1)');
    expect(r.reply).toContain('(https://oceanlibrary.com/tab#p9)');
    expect(r.steps.map((s) => s.tool).sort()).toEqual(['document_search', 'fused_search', 'work_notes_lookup']);
    expect(r.citations.length).toBe(3);
  });
  it('a ref the tools never gave is dropped, and an invented quotation goes with its sentence', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools,
      create: scripted('The Íqán is central [[P1]]. It was revealed in two days and nights, "in the space of two days and two nights in Baghdad as an answer" [[P9]]. Shoghi Effendi ranks it "Foremost among the priceless treasures" [[P1]].') });
    expect(r.reply).not.toContain('P9');
    expect(r.reply).not.toContain('two days and two nights');
    expect(r.quotes_removed).toBe(1);
  });
});

describe('renderRefs', () => {
  it('adjacent refs become one citation; two paragraphs of one document are one link', () => {
    const found = new Map([['P1', { document_id: 9, source_url: 'u1', title: 'Prayers and Meditations' }], ['P2', { document_id: 9, source_url: 'u2', title: 'Prayers and Meditations' }],
      ['P3', { document_id: 4, source_url: 'u3', title: 'Gleanings' }]]);
    expect(renderRefs('"Words." ([[P1]], [[P2]])', { found, works: new Map() })).toBe('"Words." ([Prayers and Meditations](u1))');
    expect(renderRefs('x [[P2]][[P3]].', { found, works: new Map() })).toBe('x ([Prayers and Meditations](u2); [Gleanings](u3)).');
  });
  it('a long title drops its trailing parenthetical rather than being cut inside it', () => {
    const found = new Map([['P1', { document_id: 9, source_url: 'u1', title: "The Baha'i World: An International Record, Volume XVI (Baha'i Era 130–133, 1973–1976)" }]]);
    expect(renderRefs('x [[P1]]', { found, works: new Map() })).toBe("x ([The Baha'i World: An International Record, Volume XVI](u1))");
    const works = new Map([['B1', { title: 'Selections from the Writings of the Báb', url: 'ub' }]]);
    expect(renderRefs('start with *Selections from the Writings of the Báb* [[B1]], then', { found, works })).toBe('start with [*Selections from the Writings of the Báb*](ub), then');
    expect(renderRefs('see Selections from the Writings of the Báb ([[B1]]).', { found, works })).toBe('see [*Selections from the Writings of the Báb*](ub).');
  });
  it('the same citation twice across a full stop is given once', () => {
    const found = new Map([['P1', { document_id: 9, source_url: 'u1', title: 'Writings' }]]);
    expect(renderRefs('"Words" [[P1]]. [[P1]]', { found, works: new Map() })).toBe('"Words" ([Writings](u1)).');
  });
  const found = new Map([['P1', { ...P, ref: 'P1' }], ['W1', { text: 'x', title: 'Web: news', source_url: 'https://news.example/x', web: true }]]);
  const works = new Map([['B1', { title: 'The Dawn-Breakers', url: 'https://siftersearch.com/library/dawn-breakers' }]]);
  it('groups, dedups and drops', () => {
    expect(renderRefs('Read *[[B1]]* today.', { found, works })).toBe('Read [*The Dawn-Breakers*](https://siftersearch.com/library/dawn-breakers) today.');
    expect(renderRefs('A point [[P1, P1, P7]].', { found, works })).toBe('A point ([God Passes By](https://oceanlibrary.com/gpb#p1)).');
    expect(renderRefs('News [W1].', { found, works })).toBe('News ([web: Web: news](https://news.example/x)).');
    expect(renderRefs('Lost [[P8]] and [[B4]].', { found, works })).toBe('Lost and.');
    expect(renderRefs('It is first ([[P1]]).', { found, works })).toBe('It is first ([God Passes By](https://oceanlibrary.com/gpb#p1)).');
  });
});

describe('canonWork and the switch', () => {
  it('finds a core work by any of its names', () => {
    expect(canonWork('Book of Certitude').title).toBe('The Kitáb-i-Íqán');
    expect(canonWork('dawnbreakers').title).toBe('The Dawn-Breakers');
    expect(canonWork('Gleanings').title).toMatch(/^Gleanings/);
    expect(canonWork('the cat in the hat')).toBeNull();
  });
  it('engine choice beats the channel list', () => {
    expect(agentOn({ engine: 'agent', channel: 'email' }, '')).toBe(true);
    expect(agentOn({ engine: 'pipeline', channel: 'site-chat' }, 'all')).toBe(false);
    expect(agentOn({ channel: 'site-chat' }, 'site-chat')).toBe(true);
    expect(agentOn({ channel: 'email' }, 'site-chat')).toBe(false);
  });
});

describe('fixQuoteSpeakers leaves a book author alone', async () => {
  const { fixQuoteSpeakers } = await import('../../api/lib/assistant/quotes.js');
  it('"Bahá’u’lláh wrote it …, and in it He describes "…"" is not re-credited to the passage holder', () => {
    const gpb = { text: 'which He wrote in answer to the questions of the Qáḍí, in which He describes the seven stages which the soul of the seeker must needs traverse', source_author: 'Shoghi Effendi' };
    const t = "Bahá'u'lláh wrote it in answer to questions from Shaykh Muḥyi'd-Dín, the Qáḍí of Khániqayn, and in it He describes \"the seven stages which the soul of the seeker must needs traverse\".";
    expect(fixQuoteSpeakers(t, [gpb]).text).toBe(t);
  });
});

// Chad 11-02: Anís reaches the sourcehunt engine for "where is this quote from"; an inexact ask gets the main source + similar, not the tablet
describe('source questions', async () => {
  const { libraryTools, toolRunner, isExactQuote, asksForOriginal } = await import('../../api/lib/assistant/researcher.js');
  const Q = 'The earth is but one country, and mankind its citizens';
  const hunt = (over = {}) => async () => ({ quoteAuthor: "Bahá'u'lláh", origin: { text: `${Q}.`, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", url: 'https://oceanlibrary.com/gleanings', rangeUrl: 'https://oceanlibrary.com/gleanings?paraId=p117', documentId: 3 },
    tablet: { certain: false, candidates: [] }, citedBy: [], ...over });
  const scriptedSource = (text) => { let n = 0; return async () => (n++ === 0 ? { choices: [{ message: { content: '', tool_calls: [
    { id: 'a', function: { name: 'quotation_candidates', arguments: JSON.stringify({ quotation: Q }) } },
    { id: 'b', function: { name: 'fused_search', arguments: JSON.stringify({ query: 'earth is but one country mankind its citizens' }) } }] } }] } : { choices: [{ message: { content: text } }] }); };
  const T = { ...tools, search: async () => [], sourceOf: async () => [
    { id: 1, text: `${Q}.`, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/gleanings?paraId=p117', document_id: 3 },
    { id: 2, text: 'Maqsúd original', title: 'Lawḥ-i-Maqṣúd (original)', author: "Bahá'u'lláh", source_url: 'https://oceanoflights.org/maqsud#p4', document_id: 4, language: 'ar' },
    { id: 3, text: 'Citing work', title: 'The Promise of World Peace', author: 'Universal House of Justice', source_url: 'https://oceanlibrary.com/promise#p2', document_id: 5 }] };
  it('"Where is this quote from" calls quotation_candidates and the reply links the origin', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where is this quote from: "${Q}"` }], tools: T,
      create: scriptedSource(`Bahá’u’lláh wrote "${Q}" in [[P1]]; the original is in [[P2]], and it is quoted in [[P3]].`) });
    expect(r.steps.map((s) => s.tool)).toContain('quotation_candidates');
    expect(r.reply).toContain('(https://oceanlibrary.com/gleanings?paraId=p117)');
    expect(r.reply).toContain('https://oceanoflights.org/maqsud#p4');
  });
  it('sourceOf: every find keeps its role (source, possible_original, cited_by capped at 3); titles carry no tags', async () => {
    const cit = (i) => ({ title: `Work ${i}`, author: 'A', url: `https://oceanlibrary.com/w${i}`, rangeUrl: `https://oceanlibrary.com/w${i}#p1`, paragraphs: i, documentId: 10 + i });
    const { sourceOf } = libraryTools({ search: async () => ({}), sourceHunt: hunt({ tablet: { certain: false, candidates: [{ text: 'لوح مقصود', title: 'Lawh-i-Maqsud', url: 'https://oceanoflights.org/lm' }] }, citedBy: [1, 2, 3, 4, 5].map(cit) }) });
    const out = await sourceOf(Q);
    expect(out.map((p) => p.title)).toEqual(['Gleanings from the Writings of Bahá’u’lláh', 'Lawh-i-Maqsud', 'Work 1', 'Work 2', 'Work 3']);
    expect(out.map((p) => p.role)).toEqual(['source', 'possible_original', 'cited_by', 'cited_by', 'cited_by']);
    expect(out[0].source_url).toContain('paraId=p117');
    expect(out[2].source_url).toBe('https://oceanlibrary.com/w1#p1');
  });
  it('a certain original keeps role "original" for an exact or inexact ask', async () => {
    const h = hunt({ tablet: { certain: true, text: 'لوح', title: 'Lawh-i-Maqsud', url: 'https://oceanoflights.org/lm', documentId: 4 } });
    const { sourceOf } = libraryTools({ search: async () => ({}), sourceHunt: h });
    expect((await sourceOf('religion science two wings bird'))[1]).toMatchObject({ title: 'Lawh-i-Maqsud', role: 'original' });
    expect((await sourceOf(Q))[1]).toMatchObject({ title: 'Lawh-i-Maqsud', role: 'original' });
  });
  it('exact vs inexact and the ask for the original are told apart', () => {
    expect(isExactQuote(`Is "${Q}" from Bahá'u'lláh?`)).toBe(true);
    expect(isExactQuote('religion science two wings bird quote')).toBe(false);
    expect(asksForOriginal('what is the Persian original of the two wings quote')).toBe(true);
    expect(asksForOriginal('religion science two wings bird quote')).toBe(false);
  });
  // Chad 11-14 "Let your vision be world-embracing": one line + the Gleanings passage + the original tablet's line + Gleanings' card; no citing works
  const SA = [
    { id: 1, text: `${Q}.`, title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/gleanings?paraId=p117', document_id: 3, role: 'source' },
    { id: 2, text: 'لوح مقصود', title: 'Lawḥ-i-Maqṣúd', author: "Bahá'u'lláh", source_url: 'https://oceanoflights.org/maqsud#p4', document_id: 4, language: 'ar', role: 'original' },
    { id: 3, text: 'Citing work', title: 'A letter of the Universal House of Justice', author: 'Universal House of Justice', source_url: 'https://oceanlibrary.com/uhj#p2', document_id: 5, role: 'cited_by' },
    { id: 4, text: 'The paragraph before.', title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/gleanings?paraId=p116', document_id: 3, role: 'near' },
    { id: 5, text: `${Q} (another copy).`, title: 'The Fountain of Wisdom', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/fow#p9', document_id: 6, role: 'holder' }];
  it('sourceAnswer: the source alone, with its "From …, quoting …" line (two links); citing works, holders, neighbours and the original text dropped', async () => {
    const { sourceAnswer, sourceLine } = await import('../../api/lib/assistant/tool-runner.js');
    const out = sourceAnswer(SA);
    expect(out.map((p) => p.id)).toEqual([1]);
    expect(out[0].note).toContain('From [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117), quoting the [Lawḥ-i-Maqṣúd](https://oceanoflights.org/maqsud#p4).');
    // the tablet only when known: untitled, unlinked or merely possible → the source link alone
    for (const o of [{ ...SA[1], title: 'Untitled' }, { ...SA[1], source_url: null }, { ...SA[1], role: 'possible_original' }])
      expect(sourceAnswer([SA[0], o])[0].note).toContain('From [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117).');
    // where in the work, when the source carries it (round 5: "From [Gleanings…, #117](…), quoting the [Lawḥ-…](…).")
    expect(sourceLine({ ...SA[0], place: '#117' }, SA[1])).toBe('From [Gleanings from the Writings of Bahá’u’lláh, #117](https://oceanlibrary.com/gleanings?paraId=p117), quoting the [Lawḥ-i-Maqṣúd](https://oceanoflights.org/maqsud#p4).');
    expect(sourceLine(SA[0], { ...SA[1], title: 'The Tablet of Wisdom' })).toBe('From [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117), quoting [The Tablet of Wisdom](https://oceanoflights.org/maqsud#p4).');
    // no source → at most two near passages, marked
    const none = sourceAnswer(SA.slice(1));
    expect(none.map((p) => p.id)).toEqual([4, 5]);
    expect(none[0].note).toMatch(/^NOT the quoted words/);
    // an older server (no roles) passes through
    expect(sourceAnswer(SA.map(({ role, ...p }) => p))).toHaveLength(5);
  });
  // round 4 live: the tower named a Christian-filed study (Paradise and Paradigm, author field 'Bahá’u’lláh') as the source → never; a core holder of the words stands in
  it('sourceAnswer: a misfiled or non-core "source" never stands; a core work holding the words does, else no source', async () => {
    const { sourceAnswer } = await import('../../api/lib/assistant/tool-runner.js');
    const PP = { id: 9, text: `${Q}.`, title: 'Paradise and Paradigm', author: 'Bahá’u’lláh', religion: 'Christian', source_url: 'https://x/pp#p3', document_id: 982940, role: 'source' };
    const FOW = { id: 7, text: `${Q}.`, title: 'The Fountain of Wisdom', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/fow#p9', document_id: 6, role: 'cited_by', score: 1 };
    const out = sourceAnswer([PP, FOW, SA[2]]);
    expect(out.map((p) => p.id)).toEqual([7]);
    expect(out[0].note).toContain('From [The Fountain of Wisdom](https://oceanlibrary.com/fow#p9)');
    // only a weak or non-core holder → no source, never the study
    expect(sourceAnswer([PP, { ...FOW, score: 0.5 }, SA[2]]).map((p) => p.id)).not.toContain(9);
    expect(sourceAnswer([PP, SA[2]]).map((p) => p.id)).not.toContain(9);
  });
  it('a card never credits a misfiled study to the Writer its author field names', async () => {
    const { misfiled } = await import('../../api/lib/assistant/source-tier.js');
    expect(misfiled({ religion: 'Christian', author: 'Bahá’u’lláh' })).toBe(true);
    expect(misfiled({ religion: 'Bahai', author: 'Bahá’u’lláh' })).toBe(false);
    const { fromRefs, toMarkdown } = await import('../../api/lib/assistant/widgets/quote.js');
    const card = fromRefs(['P1'], { found: new Map([['P1', { text: 'w', source_url: 'https://x/pp', title: 'Paradise and Paradigm', author: 'Bahá’u’lláh', religion: 'Christian' }]]) });
    expect(card.author).toBeNull();
    expect(toMarkdown(card)).not.toMatch(/Bahá’u’lláh/);
  });
  it('a source answer carries its book card by code, and the writer sees only the source and the original', async () => {
    const cards = [], seen = [];
    const bookCard = async ({ title }) => ({ kind: 'work', doc: { id: 3 }, book: { id: 3, title, author: "Bahá'u'lláh", url: 'https://oceanlibrary.com/gleanings', cover_url: 'https://anis.oceanlibrary.com/img/covers/3' } });
    const create = async (p) => { seen.push(p.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n'));
      return seen.length === 1 ? { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'quotation_candidates', arguments: JSON.stringify({ quotation: Q }) } }] } }] }
        : { choices: [{ message: { content: `{{quote P1}}\n\nFrom [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117), quoting the [Lawḥ-i-Maqṣúd](https://oceanoflights.org/maqsud#p4).` } }] }; };
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA, bookCard },
      onEvent: (e) => { if (e.type === 'books') cards.push(e.books); }, create });
    expect(cards.at(-1)).toEqual([expect.objectContaining({ id: 3, title: 'Gleanings from the Writings of Bahá’u’lláh' })]);
    expect(seen[1]).toContain('[B1] is the book this passage is in');
    expect(seen[1]).not.toMatch(/Universal House of Justice|Fountain of Wisdom|paragraph before|لوح/);
    expect(r.widgets.map((w) => w.kind)).toContain('quote');
    expect(r.reply).toContain('(https://oceanlibrary.com/gleanings?paraId=p117)');
    expect(r.reply).toContain('https://oceanoflights.org/maqsud#p4');
  });
  it('no book_card lookup: the source work still gets its card, cover by document id', async () => {
    const cards = [];
    const { bookCard, ...noCard } = T;
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...noCard, sourceOf: async () => SA },
      onEvent: (e) => { if (e.type === 'books') cards.push(e.books); }, create: scriptedSource(`[[B1]]: "${Q}" [[P1]]`) });
    expect(cards.at(-1)?.[0]).toMatchObject({ id: 3, url: 'https://oceanlibrary.com/gleanings', cover_url: 'https://anis.oceanlibrary.com/img/covers/3' });
    expect(r.reply).toContain('(https://oceanlibrary.com/gleanings)');
  });
  // Chad 11-14 replay: research held for the question (an earlier answer: Gleanings ¶260 + ¶261, a UHJ letter) answered with NO trace —
  // an intro, the neighbouring paragraph as a second card, "I did not check the section number…". The agent is told a source question
  // traces even so; once the trace found the source, code drops cards/sentences resting on held research or the source's own neighbours.
  const HELD = { same: true, status: 'answered', question: `Where does "${Q}" come from?`, passages: [
    { id: 260, text: 'The paragraph before.', title: 'Gleanings from the Writings of Bahá’u’lláh', author: "Bahá'u'lláh", source_url: 'https://oceanlibrary.com/gleanings?paraId=p116', document_id: 3 },
    { id: 900, text: 'A letter citing it.', title: 'A letter of the Universal House of Justice', author: 'Universal House of Justice', source_url: 'https://oceanlibrary.com/uhj#p2', document_id: 5 }] };
  const DRAFT = `{{quote P3}}\n\nThe passage just before it adds more [[P1]].\n\n{{quote P1}}\n\nThe House of Justice cites it [[P2]].\n\nFrom [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117), quoting the [Lawḥ-i-Maqṣúd](https://oceanoflights.org/maqsud#p4).\n\nI did not check the section number or the original Persian/Arabic text.`;
  const traceFirst = (final) => { const seen = []; let n = 0; const create = async (p) => { seen.push(p);
    return n++ === 0 ? { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'quotation_candidates', arguments: JSON.stringify({ quotation: Q }) } }] } }] } : final(p); }; return { create, seen }; };
  it('held research: the turn tells the agent a source question still traces first (and the edge tool says so)', async () => {
    const { create, seen } = traceFirst(() => ({ choices: [{ message: { content: '{{quote P3}}' } }] }));
    await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA }, held: HELD, create });
    expect(seen[0].messages.findLast((m) => m.role === 'user').content).toMatch(/SOURCE QUESTION[^\n]*quotation_candidates first even so/);
    expect(seen[0].messages[0].content).toMatch(/quotation_candidates FIRST and ALONE — EVEN WHEN RESEARCH IS HELD/);
    const snap = (await import('../../worker/anis/agent-tools.json', { with: { type: 'json' } })).default;
    expect(snap.tools.find((t) => t.function.name === 'quotation_candidates').function.description).toMatch(/even when research is held/);
  });
  it('after the trace: no neighbouring paragraph, no held citing letter, no "I did not check" — written whole', async () => {
    const { create } = traceFirst(() => ({ choices: [{ message: { content: DRAFT } }] }));
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA }, held: HELD, create });
    expect(r.widgets.filter((w) => w.kind === 'quote')).toHaveLength(1);
    expect(r.reply).not.toMatch(/p116|uhj#p2|just before|House of Justice|did not check/);
    expect(r.reply).toContain('https://oceanoflights.org/maqsud#p4');
  });
  it('after the trace: the same guard on a streamed reply', async () => {
    const ev = [];
    const parts = DRAFT.split(/(?<=\n\n)/);
    const { create } = traceFirst(() => ({ async *[Symbol.asyncIterator]() { for (const c of parts) yield { choices: [{ delta: { content: c } }] }; yield { choices: [], usage: {} }; } }));
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA }, held: HELD, create, onEvent: (e) => ev.push(e) });
    const text = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(text).toContain('https://oceanoflights.org/maqsud#p4');
    expect(text + r.reply).not.toMatch(/p116|uhj#p2|just before|House of Justice|did not check/);
    expect(ev.filter((e) => e.type === 'widget' && e.widget.kind === 'quote')).toHaveLength(1);
  });
  // 11-14 live replay (33246f168): the agent typed the source passage as a markdown blockquote → no card at all. The source card is code's.
  const TYPED = `The words come from Bahá'u'lláh.\n\n> ${Q}. [[P3]]\n> — [[P3]]\n\nFrom [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117).`;
  it('cards survive: the source typed as a blockquote becomes its card (whole reply)', async () => {
    const { create } = traceFirst(() => ({ choices: [{ message: { content: TYPED } }] }));
    const r = await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA }, held: HELD, create });
    expect(r.widgets.filter((w) => w.kind === 'quote')).toHaveLength(1);
    expect(r.widgets.find((w) => w.kind === 'quote').text).toContain(Q);
    expect(r.reply.split(Q)).toHaveLength(2);   // the card's own fallback only, not the typed copy too
    expect(r.reply).not.toMatch(/\[\[P|> — \(/);
    expect(r.reply).toContain('From [Gleanings');
  });
  it('cards survive: streamed, and with no quotation typed at all the card leads', async () => {
    const BARE = 'From [Gleanings from the Writings of Bahá’u’lláh](https://oceanlibrary.com/gleanings?paraId=p117), quoting [the Lawḥ-i-Maqṣúd](https://oceanoflights.org/maqsud#p4). Bahá’u’lláh revealed that Tablet in ‘Akká, and the words stand in it as the closing counsel of a long passage on the oneness of mankind.';
    for (const draft of [TYPED, BARE]) {
      const ev = [];
      const parts = draft.split(/(?<=\n)/);
      const { create } = traceFirst(() => ({ async *[Symbol.asyncIterator]() { for (const c of parts) yield { choices: [{ delta: { content: c } }] }; yield { choices: [], usage: {} }; } }));
      await agentAnswer({ messages: [{ role: 'user', content: `Where does "${Q}" come from?` }], tools: { ...T, sourceOf: async () => SA }, held: HELD, create, onEvent: (e) => ev.push(e) });
      const quotes = ev.filter((e) => e.type === 'widget' && e.widget.kind === 'quote');
      expect(quotes, draft.slice(0, 20)).toHaveLength(1);
      expect(quotes[0].widget.text).toContain(Q);
      expect(ev.some((e) => e.type === 'books')).toBe(true);   // and the book's card
      const said = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
      expect(said.split(Q), draft.slice(0, 20)).toHaveLength(2);   // one copy: the card's
      expect(said).not.toMatch(/\[\[P|> — \(|^\(\[/m);   // no orphaned ref or attribution from the typed quotation
    }
  });
  it('cards survive: an agent-written {{quote}} card with no trace is kept', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Tell me about it' }], tools: T, held: HELD, create: async () => ({ choices: [{ message: { content: 'It reads:\n\n{{quote P1}}' } }] }) });
    expect(r.widgets.filter((w) => w.kind === 'quote')).toHaveLength(1);
  });
  it('no trace this turn → held passages are cited as before (the guard is keyed on the trace, not the wording)', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Tell me about it' }], tools: T, held: HELD, create: async () => ({ choices: [{ message: { content: 'The House of Justice cites it [[P2]].' } }] }) });
    expect(r.reply).toContain('uhj#p2');
  });
  it('whole_lookup reads the whole prayer a found passage belongs to (11-12: the Short Obligatory Prayer lost its last line)', async () => {
    const whole = vi.fn(async () => ({ passages: [{ id: 8, text: 'I bear witness, O my God…', document_id: 3, paragraph_index: 4 }, { id: 9, text: 'There is none other God but Thee, the Help in Peril, the Self-Subsisting.', document_id: 3, paragraph_index: 5 }] }));
    const { run } = toolRunner({ ...T, whole });
    await run.quotation_candidates({ quotation: Q });
    const out = await run.whole_lookup({ ref: 'P1' });
    expect(whole).toHaveBeenCalledWith(expect.objectContaining({ document_id: 3 }));
    expect(out).toContain('the Help in Peril');
    expect(out.match(/\[P\d+\]/g)).toHaveLength(1);   // one prayer, one ref
    expect(await run.whole_lookup({ ref: 'P99' })).toBe('unknown ref');
  });
  it('no result: the runner returns guidance, and a source the tools never gave is dropped', async () => {
    const { run } = toolRunner({ ...T, sourceOf: async () => [] });
    expect(await run.quotation_candidates({ quotation: 'God helps those who help themselves' })).toMatch(/^no published source found for that wording — combined_search/);
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Where is this from: "God helps those who help themselves"' }], tools: { ...T, sourceOf: async () => [] },
      create: scriptedSource('That is Bahá’u’lláh in Gleanings [[P4]].') });
    expect(r.reply).not.toContain('P4');
    expect(r.reply).not.toMatch(/\]\(/);
  });
});

describe('renderRefs stray bold', () => {
  it('a ref that rendered to nothing leaves no lone ** behind a bold heading', async () => {
    const { renderRefs } = await import('../../api/lib/assistant/agent.js');
    expect(renderRefs('**6. The sweetness of prayer** **\n\n**a** and **b**', { found: new Map(), works: new Map() })).toBe('**6. The sweetness of prayer**\n\n**a** and **b**');
  });
});

describe('dropPlainCiteRun', () => {
  it('one story cited once at the end of its run; a doubled cite once; a cite before a blockquote of the same title goes', async () => {
    const { dropPlainCiteRun } = await import('../../api/lib/assistant/lint.js');
    const src = [{ title: 'Memories of the Holy Family' }, { title: 'Light of the World' }];
    expect(dropPlainCiteRun('A did x. (Memories of the Holy Family) He did y. (Memories of the Holy Family)', src).text).toBe('A did x. He did y. (Memories of the Holy Family)');
    expect(dropPlainCiteRun('He wrote x (Light of the World) (Light of the World)', src).text).toBe('He wrote x (Light of the World)');
    expect(dropPlainCiteRun('He wrote: (Light of the World)\n\n> "I treat"\n> — Light of the World', src).text).toBe('He wrote:\n\n> "I treat"\n> — Light of the World');
    expect(dropPlainCiteRun('He said (an aside) here. (Light of the World)', src).text).toBe('He said (an aside) here. (Light of the World)');
    const lf = [{ title: 'Lights of Fortitude: Glimpses into the Lives of the Hands of the Cause of God' }];
    expect(dropPlainCiteRun('A (Lights of Fortitude: Glimpses into the Lives of the Hands of the Cause of God, #924), b. (Lights of Fortitude: Glimpses into the Lives of the Hands of the Cause…)', lf).text).toBe('A, b. (Lights of Fortitude: Glimpses into the Lives of the Hands of the Cause…)');
    expect(dropPlainCiteRun('- one (Light of the World)\n- two (Light of the World)', src).text).toBe('- one (Light of the World)\n- two (Light of the World)');
    expect(dropPlainCiteRun('A *"x"* ([Will](https://o/w?p=1)) B *"y"* ([Will](https://o/w?p=1))', []).text).toBe('A *"x"* B *"y"* ([Will](https://o/w?p=1))');
  });
});

// the answering round streams a sentence at a time (11-12: the reply appeared only after the whole 5–9 s final round)
describe('agent: the answer streams, verified sentences only', () => {
  const chunks = (parts, tc = null) => ({ async *[Symbol.asyncIterator]() {
    for (const p of parts) yield { choices: [{ delta: { content: p } }] };
    if (tc) yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: tc, arguments: '{"query":"Iqan"}' } }] } }] };
    yield { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } };
  } });
  const longOk = 'Shoghi Effendi ranks the Íqán above every other work of its Author, a book he calls the foremost treasure of the Revelation and the key to its scripture. ';
  const streaming = (finalParts, first = null) => { let n = 0;
    return async (p) => { expect(p.stream).toBe(true); return n++ === 0 ? chunks(first || ['Let me search.'], 'fused_search') : chunks(finalParts); }; };
  it('sentences go out as written, refs rendered; an invented quotation never shows', async () => {
    const ev = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, onEvent: (e) => ev.push(e),
      create: streaming([longOk, 'He writes it is "Foremost among the priceless treasures" [[P1]]. ', 'It was "revealed in two nights in Baghdad as an answer" [[P1]]. ', 'That is all.']) });
    const text = ev.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(r.streamed).toBe(true);
    expect(text).toContain('Shoghi Effendi ranks');
    expect(text).toContain('(https://oceanlibrary.com/gpb#p1)');
    expect(text).not.toContain('two nights');
    expect(text).not.toContain('Let me search');
    expect(r.usage.out).toBe(14);
  });
  it('a short preamble before a tool call is never shown', async () => {
    const ev = [];
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'What is the Iqan?' }], tools, onEvent: (e) => ev.push(e),
      create: streaming(['Short answer.']) });
    expect(ev.some((e) => e.type === 'text')).toBe(false);
    expect(r.streamed).toBe(false);
    expect(r.reply).toBe('Short answer.');
  });
  it('a non-streaming create still answers (nothing streams)', async () => {
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Where can I read the Iqan?' }], tools, create: scripted('Here is [[B1]].') });
    expect(r.streamed).toBe(false);
  });
});

// the answer IS a book → its card at once, from the cited [B#] (Chad 11-13: "What is the most important Baha'i Doctrinal book?" >> Iqan card)
describe('agent: a cited work shows its book card', () => {
  const chunks = (parts, tc = null) => ({ async *[Symbol.asyncIterator]() {
    for (const p of parts) yield { choices: [{ delta: { content: p } }] };
    if (tc) yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'x', function: { name: tc, arguments: '{"title":"Iqan"}' } }] } }] };
    yield { choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } };
  } });
  it('the reply cites [[B1]] → one books event with the cover by id', async () => {
    let n = 0; const ev = [];
    const create = async () => (n++ === 0 ? chunks(['Let me look.'], 'document_search')
      : chunks(['Shoghi Effendi names the Kitáb-i-Íqán [[B1]] foremost among the treasures of the Revelation, the key to all scripture before it. ', 'Read it first [[B1]].']));
    await agentAnswer({ messages: [{ role: 'user', content: "What is the most important Baha'i doctrinal book?" }], tools, onEvent: (e) => ev.push(e), create });
    const books = ev.filter((e) => e.type === 'books');
    expect(books).toHaveLength(1);
    expect(books[0].books[0]).toMatchObject({ id: 1, title: 'The Kitáb-i-Íqán', cover_url: 'https://anis.oceanlibrary.com/img/covers/1' });
  });
});

// one card per work (Chad 11-13: "Iqan" → "two book cards (one inside, one outside the chat)")
describe('agent: one book card per work', () => {
  it('book_card showed it → the reply\'s {{book B1}} adds no second card; a short reply cites it once', async () => {
    let n = 0; const ev = [];
    const create = async () => (n++ === 0
      ? { choices: [{ message: { content: '', tool_calls: [{ id: 'a', function: { name: 'book_card', arguments: '{"title":"Iqan"}' } }] }, finish_reason: 'tool_calls' }], usage: {} }
      : { choices: [{ message: { content: 'The Kitáb-i-Íqán [[B1]] is the Book of Certitude.\n\n{{book B1}}' }, finish_reason: 'stop' }], usage: {} });
    const bookCard = async () => ({ kind: 'book', book: { id: 1, title: 'The Kitáb-i-Íqán', author: "Bahá'u'lláh", url: 'https://oceanlibrary.com/kitab-i-iqan/' } });
    const r = await agentAnswer({ messages: [{ role: 'user', content: 'Iqan' }], tools: { ...tools, bookCard }, onEvent: (e) => ev.push(e), create });
    expect(ev.filter((e) => e.type === 'books')).toHaveLength(1);
    expect(r.widgets.filter((w) => w.kind === 'book')).toHaveLength(0);
  });
});
