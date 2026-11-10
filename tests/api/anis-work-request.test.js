// "Give me the book" → the library's copy, linked (work-request.js; Chad 11-01: Anís never gave the book asked for).
import { describe, it, expect } from 'vitest';
import { workRequest, titleCandidates, findWork, workReply, aboutWork, linkTitles, dropPreamble, bareTitle } from '../../api/lib/assistant/work-request.js';
import { shortQuestion, anisDirection } from '../../api/lib/assistant/prompt.js';
import { buildIndex, matchTitle } from '../../api/lib/dewey/title-index.js';

const ROWS = [
  { id: 1, title: 'The Kitáb-i-Íqán: The Book of Certitude', author: "Bahá'u'lláh", religion: "Bahá'í", collection: 'Core Tablets', slug: 'kitab-i-iqan', source_url: 'https://oceanlibrary.com/kitab-i-iqan/', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 290 },
  { id: 2, title: 'The Dawn-Breakers', author: 'Nabíl-i-Zarandí', religion: "Bahá'í", collection: 'Core Publications', slug: 'dawn-breakers', source_url: 'https://oceanlibrary.com/dawn-breakers/', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 2400 },
  { id: 3, title: 'Memorials of the Faithful', author: "'Abdu'l-Bahá", religion: "Bahá'í", collection: 'Core Tablets', slug: 'memorials', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 300 },
  { id: 4, title: 'Some Answered Questions', author: "'Abdu'l-Bahá", religion: "Bahá'í", collection: 'Core Tablets', slug: 'saq', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 900 },
  { id: 5, title: 'Some Answered Questions: Study Guide', author: 'A. Student', religion: "Bahá'í", collection: 'Study', slug: 'saq-guide', language: 'en', source_site: null, paragraph_count: 80 },
];
const index = buildIndex(ROWS);
const listDocs = async ({ ids }) => ({ docs: ROWS.filter((r) => ids.includes(r.id)) });
const find = (q, named) => findWork(q, { named, index, match: matchTitle, listDocs });

describe('a request for a book is answered with the book', () => {
  it('the Book of Certitude, by its subtitle (11-01 live reply quoted Tabernacle of Unity and gave no link)', async () => {
    const w = await find('Please locate The Book of Certitude and show me where it appears in the library.');
    expect(w.doc.id).toBe(1);
    const r = workReply(w);
    expect(r).toContain('(https://oceanlibrary.com/kitab-i-iqan/)');
    expect(r).not.toContain('siftersearch.com');
    expect(r).toContain('kitab-i-iqan');
    expect(r).not.toMatch(/catalog|elsewhere|bahai\.org|Reference Library/i);
  });
  it('"Dawnbreakers" written together, inside a long personal story (11-01 reply said "search a digital catalog")', async () => {
    const q = "My grandmother kept a worn old notebook and kept mentioning a book called Dawnbreakers that she read when she was young. She passed away last spring and I'd love to read it myself now. Could you help me locate the full text of Dawnbreakers?";
    expect((await find(q)).doc.id).toBe(2);
  });
  it('other wordings', async () => {
    expect((await find('Where can I read the Book of Certitude?')).doc.id).toBe(1);
    expect((await find('do you have Some Answered Questions?')).doc.id).toBe(4);   // the work, not its study guide
    expect((await find('can I get a copy of the Iqan')).doc.id).toBe(1);
    // 11-01 live (the one Chad saw right): a typo, "the book X", "in your library"
    expect((await find('Please, I am searching for the book Some Answerd Questions. Where I can find it in your library?')).doc.id).toBe(4);
  });
  it('the named work from the plan is a candidate too', async () => {
    expect(titleCandidates('link to it please', { type: 'work', name: 'The Dawn-Breakers' })).toContain('The Dawn-Breakers');
  });
});

describe('what the book SAYS is a search, not a book request', () => {
  it.each([
    'What does the Iqan say about the return?',
    'find the passage in the Book of Certitude about the sun',
    'Where can I read the quote about the veils in the Iqan?',
    'Who was Mullá Ḥusayn?',
  ])('%s', async (q) => { expect(await find(q)).toBeNull(); });
  it('no title found → null (falls through to search)', async () => {
    expect(workRequest('where can I read something on patience')).toBe(true);
    expect(await find('where can I read something on patience')).toBeNull();
  });
});

describe('the book reply: link first, what the texts say ABOUT it, then the offer (Chad 11-01: "very thin")', () => {
  const work = { doc: ROWS[1], others: [] };
  const rows = [
    { text: 'The Dawn-Breakers of Nabíl is a narrative every believer should master.', doc_id: 99, citation_url: 'https://x/about#1' },
    { text: 'And finally is this, His moving invocation to God.', doc_id: 2, citation_url: 'https://x/dawn#900' },   // the book itself
    { text: 'Patience is a virtue.', doc_id: 98, citation_url: 'https://x/other#1' },                                   // not about it
  ];
  it('aboutWork keeps only other works that name it', () => {
    expect(aboutWork(work, rows).map((r) => r.doc_id)).toEqual([99]);
  });
  it('anisRespond: the link leads, the crafted middle quotes the passage about it, the offer closes', async () => {
    const { anisRespond } = await import('../../api/lib/assistant/respond.js');
    const crafted = [];
    const passages = rows.map((r, i) => ({ text: r.text, title: 'T', author: 'A', document_id: r.doc_id, paragraph_index: i, source_url: r.citation_url }));
    const out = await anisRespond({ messages: [{ role: 'user', content: 'where can I read Dawnbreakers?' }], direction: { strategy: { strategy: { choice: 'book', confidence: 0.9 }, sides: [] } }, deps: {
      plan: async () => ({ shape: 'lookup' }), findWork: async () => work,
      search: async () => ({ passages, _plan: { shape: 'topic' } }),
      craft: async (a) => { crafted.push(a); return 'Shoghi Effendi held that it is a narrative ["every believer should master"](https://x/about#1).'; },
      companion: async () => ({ append: '', plan: null, offer: false }),
    } });
    expect(crafted[0].retrieved_quotes.map((q) => q.doc_id)).toEqual([99]);
    expect(crafted[0].direction.format.id).toBe('work');
    expect(out.reply.split('\n\n')[0]).toContain('](https://oceanlibrary.com/dawn-breakers/)');
    expect(out.reply).toContain('every believer should master');
    expect(out.reply.trim().endsWith('with me”.')).toBe(true);
  });
});

describe('every italicised book is a link to the library, and the reply never announces itself (Chad 11-01, "Seven Valleys")', () => {
  const SV = { id: 6, title: 'The Seven Valleys', author: "Bahá'u'lláh", religion: "Bahá'í", collection: 'Core Tablets', slug: 'seven-valleys', source_url: 'https://oceanlibrary.com/seven-valleys/', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 120 };
  const find = async (t) => (/seven valleys/i.test(t) ? { doc: SV, others: [] } : null);
  it('links the first mention, leaves unknown italics and existing links alone', async () => {
    const text = 'It is a quiet joy to turn to *The Seven Valleys*. It draws on *Manṭiqu’ṭ-Ṭayr*. Again *The Seven Valleys*. See [*Gleanings*](https://x/g).';
    const { text: out, linked } = await linkTitles(text, { find });
    expect(linked).toBe(1);
    expect(out).toContain('[*The Seven Valleys*](https://oceanlibrary.com/seven-valleys/)');
    expect(out.match(/seven-valleys/g)).toHaveLength(1);
    expect(out).toContain(' *Manṭiqu’ṭ-Ṭayr*.');
    expect(out).toContain('[*Gleanings*](https://x/g)');
  });
  it('drops "To answer your question directly about what this work is:"', () => {
    expect(dropPreamble('Dear friend,\n\nTo answer your question directly about what this work is: The Seven Valleys is a treatise.'))
      .toBe('Dear friend,\n\nThe Seven Valleys is a treatise.');
    expect(dropPreamble('The Seven Valleys is a treatise.')).toBe('The Seven Valleys is a treatise.');
  });
  it('a short question gets the short-answer direction', () => {
    expect(shortQuestion('Seven Valleys')).toBe(true);
    expect(anisDirection({ question: 'Seven Valleys' })).toMatch(/2–4 sentences/);
    expect(anisDirection({ question: 'What does Bahá’u’lláh write about the stages of the soul’s journey toward God?' })).not.toMatch(/2–4 sentences/);
  });
});

describe('the BOOK, not a talk about it (11-01 live: "Gleanings" and "Seven Valleys" linked Hooper Dunbar talks)', () => {
  const R = [
    { id: 11, title: 'Gleanings (part 14)', author: 'Hooper Dunbar', collection: 'Media', paragraph_count: 283 },
    { id: 12, title: 'Gleanings', author: 'Hooper Dunbar', collection: 'Media', paragraph_count: 116 },
    { id: 13, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', collection: 'Bahá’u’lláh', paragraph_count: 717 },
    { id: 14, title: "Gleanings From the Writings of Bahá'u'lláh, pages 1-5", author: 'x', collection: null, paragraph_count: 13 },
    { id: 21, title: 'Seven Valleys', author: 'Hooper Dunbar', collection: 'Media', paragraph_count: 195 },
    { id: 22, title: 'The Seven Valleys', author: "Bahá'u'lláh", collection: 'Core Tablets', paragraph_count: 71 },
    { id: 23, title: 'The Seven Valleys: A Meditation', author: 'George Townshend', collection: 'Papers', paragraph_count: 35 },
    { id: 24, title: 'Tag: Haft Vadi (Seven Valleys)', author: 'tags', collection: null, paragraph_count: 57 },
    { id: 31, title: 'Prayers and Meditations', author: 'Bahá’u’lláh', collection: 'Bahá’u’lláh', paragraph_count: 877 },
    { id: 32, title: 'Prayers', author: 'x', collection: null, paragraph_count: 625 },
  ].map((r) => ({ religion: "Bahá'í", slug: `s${r.id}`, language: 'en', ...r }));
  const ix = buildIndex(R);
  const f = (q) => findWork(q, { index: ix, match: matchTitle, listDocs: async ({ ids }) => ({ docs: R.filter((r) => ids.includes(r.id)) }) });
  it.each([
    ['can I get a copy of Gleanings?', 13],
    ['Find Seven Valleys for me. I need the complete text, not a summary.', 22],
    ['do you have the Seven Valleys?', 22],
    ['where can I read Prayers and Meditations', 31],
  ])('%s', async (q, id) => { expect((await f(q)).doc.id).toBe(id); });
});

describe('a bare title is a request for the book (Chad 11-01: "Dawnbreakers" got an unsourced summary)', () => {
  it.each([['Dawnbreakers', 2], ['Seven Valleys?', 6], ['Some Answered Questions', 4]])('%s', async (q, id) => {
    const rows = [...ROWS, { id: 6, title: 'The Seven Valleys', author: "Bahá'u'lláh", religion: "Bahá'í", collection: 'Core Tablets', slug: 'sv', language: 'en', source_site: null, paragraph_count: 71 },
      { id: 7, title: 'Prayers', author: 'x', religion: "Bahá'í", collection: 'c', slug: 'p', language: 'en', paragraph_count: 600 }];
    const w = await findWork(q, { index: buildIndex(rows), match: matchTitle, listDocs: async ({ ids }) => ({ docs: rows.filter((r) => ids.includes(r.id)) }) });
    expect(w.doc.id).toBe(id);
  });
  it('a title that adds only its byline is that title ("The Hidden Words" = The Hidden Words of Bahá’u’lláh, 11-09)', async () => {
    const rows = [{ id: 50, title: 'Hidden Words', author: 'bahaullah', religion: "Bahá'í", collection: 'c', slug: 'hw', language: 'en', source_site: 'bahai-library.com', paragraph_count: 160 },
      { id: 51, title: 'The Hidden Words of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: "Bahá'í", collection: 'Core', slug: 'hwb', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 155 },
      { id: 52, title: 'The Hidden Words of Wisdom', author: 'Someone Else', religion: "Bahá'í", collection: 'c', slug: 'x', language: 'en', paragraph_count: 900 }];
    const w = await findWork('The Hidden Words', { index: buildIndex(rows), match: matchTitle, listDocs: async ({ ids }) => ({ docs: rows.filter((r) => ids.includes(r.id)) }) });
    expect(w.doc.id).toBe(51);
  });
  it('a topic word or a question stays a search', async () => {
    const rows = [{ id: 7, title: 'Prayers', author: 'x', religion: "Bahá'í", collection: 'c', slug: 'p', language: 'en', paragraph_count: 600 }, ...ROWS];
    const o = { index: buildIndex(rows), match: matchTitle, listDocs: async ({ ids }) => ({ docs: rows.filter((r) => ids.includes(r.id)) }) };
    expect(await findWork('Prayers', o)).toBeNull();
    expect(await findWork('What is the Dawn-Breakers about?', o)).toBeNull();
    expect(bareTitle('who was Nabil')).toBeNull();
  });
});

describe('a book reply never carries an unsourced middle (11-01 live: "Dawnbreakers" → "I didn\'t find a passage… tell me more")', () => {
  it('a crafted middle with no passage link is dropped: link + offer only', async () => {
    const { anisRespond } = await import('../../api/lib/assistant/respond.js');
    const work = { doc: ROWS[1], others: [] };
    const out = await anisRespond({ messages: [{ role: 'user', content: 'Dawnbreakers' }], direction: { strategy: { strategy: { choice: 'book', confidence: 0.9 }, sides: [] } }, deps: {
      plan: async () => ({ shape: 'lookup' }), findWork: async () => work,
      search: async () => ({ passages: [{ text: 'The Dawn-Breakers of Nabíl is a narrative every believer should master.', title: 'T', author: 'A', document_id: 99, paragraph_index: 0, source_url: 'https://x/about#1' }], _plan: { shape: 'topic' } }),
      craft: async () => 'I didn’t find a passage that says this directly in this search. Could you tell me a little more about what you’re looking for?',
      companion: async () => ({ append: '', plan: null, offer: false }),
    } });
    expect(out.reply).toBe(workReply(work));
  });
});

describe('a bare title opens only a CORE book unless Jev decided the reader wants a book (Chad 11-03: Adamson\'s "The Earth Is But One Country")', () => {
  const rows = [...ROWS, { id: 78, title: 'The Earth Is But One Country', author: 'Hugh C. Adamson', religion: "Baha'i", collection: "Baha'i Books", book_authority: 5, slug: 'adamson', language: 'en', paragraph_count: 900 }];
  const o = { index: buildIndex(rows), match: matchTitle, listDocs: async ({ ids }) => ({ docs: rows.filter((r) => ids.includes(r.id)) }) };
  it('"the earth is but one country" with coreOnly does not open Adamson\'s book', async () => {
    expect(await findWork('the earth is but one country', { ...o, coreOnly: true })).toBeNull();
  });
  it('without coreOnly (Jev said book) the same words still find it', async () => {
    expect((await findWork('the earth is but one country', o))?.doc.id).toBe(78);
  });
  it('an explicit request for the book resolves every book, coreOnly or not', async () => {
    expect((await findWork('where can I read The Earth Is But One Country?', { ...o, coreOnly: true }))?.doc.id).toBe(78);
  });
});

describe('respond: findWork is core-only unless Jev\'s lookup intent is book', () => {
  const run = async (direction) => {
    const { anisRespond } = await import('../../api/lib/assistant/respond.js');
    const seen = [];
    await anisRespond({ messages: [{ role: 'user', content: 'the earth is but one country' }], direction,
      deps: { plan: async () => ({ shape: 'quote' }), search: async () => ({ passages: [], _plan: { shape: 'quote' } }), craft: async () => 'ok',
        companion: async () => ({}), sourceHunt: async () => null, phrases: async () => null, findWork: async (q, opts) => { seen.push(opts); return null; } } });
    return seen[0];
  };
  it('no book intent → coreOnly', async () => { expect(await run({ strategy: { strategy: { choice: 'book', confidence: 0.9 }, sides: [] } })).toMatchObject({ coreOnly: true }); });
  it('Unmatched runs no book lookup at all', async () => { expect(await run({})).toBeUndefined(); });
  it('Jev said book (no lookup result) → every book', async () => { expect((await run({ lookupIntent: 'book' }))?.coreOnly).toBeFalsy(); });
});

describe('the work itself outranks a study whose title contains its name (11-09 "Gita")', () => {
  const rows = [
    { id: 90, title: 'Gita and Gospel', author: 'J. N. Farquhar', religion: 'Christianity', collection: 'Books', slug: 'gita-gospel', language: 'en', paragraph_count: 400 },
    { id: 91, title: 'The Bhagavad-Gita', author: 'Vyasa', religion: 'Hinduism', collection: 'Scripture', slug: 'bg', language: 'en', paragraph_count: 700 },
  ];
  it('picks the scripture, lists the study after it', async () => {
    const w = await findWork('Where can I read Gita?', { index: buildIndex(rows), match: matchTitle, listDocs: async ({ ids }) => ({ docs: rows.filter((r) => ids.includes(r.id)) }) });
    expect(w.doc.id).toBe(91);
  });
});
