// "Give me the book" → the library's copy, linked (work-request.js; Chad 11-01: Anís never gave the book asked for).
import { describe, it, expect } from 'vitest';
import { workRequest, titleCandidates, findWork, workReply, aboutWork, linkTitles, dropPreamble } from '../../api/lib/assistant/work-request.js';
import { shortQuestion, anisDirection } from '../../api/lib/assistant/prompt.js';
import { buildIndex, matchTitle } from '../../api/lib/dewey/title-index.js';

const ROWS = [
  { id: 1, title: 'The Kitáb-i-Íqán: The Book of Certitude', author: "Bahá'u'lláh", religion: "Bahá'í", collection: 'Core Tablets', slug: 'kitab-i-iqan', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 290 },
  { id: 2, title: 'The Dawn-Breakers', author: 'Nabíl-i-Zarandí', religion: "Bahá'í", collection: 'Core Publications', slug: 'dawn-breakers', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 2400 },
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
    expect(r).toContain('(https://siftersearch.com/library/');
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
    const out = await anisRespond({ messages: [{ role: 'user', content: 'where can I read Dawnbreakers?' }], deps: {
      plan: async () => ({ shape: 'lookup' }), findWork: async () => work,
      search: async () => ({ passages, _plan: { shape: 'topic' } }),
      craft: async (a) => { crafted.push(a); return 'Shoghi Effendi held that it is a narrative ["every believer should master"](https://x/about#1).'; },
      companion: async () => ({ append: '', plan: null, offer: false }),
    } });
    expect(crafted[0].retrieved_quotes.map((q) => q.doc_id)).toEqual([99]);
    expect(crafted[0].direction.format.id).toBe('work');
    expect(out.reply.split('\n\n')[0]).toContain('/library/');
    expect(out.reply).toContain('every believer should master');
    expect(out.reply.trim().endsWith('with me”.')).toBe(true);
  });
});

describe('every italicised book is a link to the library, and the reply never announces itself (Chad 11-01, "Seven Valleys")', () => {
  const SV = { id: 6, title: 'The Seven Valleys', author: "Bahá'u'lláh", religion: "Bahá'í", collection: 'Core Tablets', slug: 'seven-valleys', language: 'en', source_site: 'oceanlibrary.com', paragraph_count: 120 };
  const find = async (t) => (/seven valleys/i.test(t) ? { doc: SV, others: [] } : null);
  it('links the first mention, leaves unknown italics and existing links alone', async () => {
    const text = 'It is a quiet joy to turn to *The Seven Valleys*. It draws on *Manṭiqu’ṭ-Ṭayr*. Again *The Seven Valleys*. See [*Gleanings*](https://x/g).';
    const { text: out, linked } = await linkTitles(text, { find });
    expect(linked).toBe(1);
    expect(out).toContain('[*The Seven Valleys*](https://siftersearch.com/library/');
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
