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
  it('sourceOf: origin, an uncertain candidate as "(possible original)", citedBy capped at 3', async () => {
    const cit = (i) => ({ title: `Work ${i}`, author: 'A', url: `https://oceanlibrary.com/w${i}`, rangeUrl: `https://oceanlibrary.com/w${i}#p1`, paragraphs: i, documentId: 10 + i });
    const { sourceOf } = libraryTools({ search: async () => ({}), sourceHunt: hunt({ tablet: { certain: false, candidates: [{ text: 'لوح مقصود', title: 'Lawh-i-Maqsud', url: 'https://oceanoflights.org/lm' }] }, citedBy: [1, 2, 3, 4, 5].map(cit) }) });
    const out = await sourceOf(Q);
    expect(out.map((p) => p.title)).toEqual(['Gleanings from the Writings of Bahá’u’lláh', 'Lawh-i-Maqsud (possible original)', 'Work 1', 'Work 2', 'Work 3']);
    expect(out[0].source_url).toContain('paraId=p117');
    expect(out[2].source_url).toBe('https://oceanlibrary.com/w1#p1');
    expect(out[2].text).toMatch(/quotes it/);
  });
  it('an inexact ask labels the original optional; an exact quotation does not', async () => {
    const h = hunt({ tablet: { certain: true, text: 'لوح', title: 'Lawh-i-Maqsud', url: 'https://oceanoflights.org/lm', documentId: 4 } });
    const { sourceOf } = libraryTools({ search: async () => ({}), sourceHunt: h });
    expect((await sourceOf('religion science two wings bird'))[1].title).toMatch(/give only if the reader asked/);
    expect((await sourceOf(Q))[1].title).toBe('Lawh-i-Maqsud (original)');
  });
  it('exact vs inexact and the ask for the original are told apart', () => {
    expect(isExactQuote(`Is "${Q}" from Bahá'u'lláh?`)).toBe(true);
    expect(isExactQuote('religion science two wings bird quote')).toBe(false);
    expect(asksForOriginal('what is the Persian original of the two wings quote')).toBe(true);
    expect(asksForOriginal('religion science two wings bird quote')).toBe(false);
  });
  it('whole_lookup reads the whole prayer a found passage belongs to (11-12: the Short Obligatory Prayer lost its last line)', async () => {
    const whole = vi.fn(async () => ({ passages: [{ id: 8, text: 'I bear witness, O my God…', document_id: 3, paragraph_index: 4 }, { id: 9, text: 'There is none other God but Thee, the Help in Peril, the Self-Subsisting.', document_id: 3, paragraph_index: 5 }] }));
    const { run } = toolRunner({ ...T, whole });
    await run.quotation_candidates({ quotation: Q });
    const out = await run.whole_lookup({ ref: 'P1' });
    expect(whole).toHaveBeenCalledWith(expect.objectContaining({ document_id: 3 }));
    expect(out).toContain('the Help in Peril');
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
