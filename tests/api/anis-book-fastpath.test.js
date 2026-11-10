// The book fast path (Chad 11-10): Jev picks 'book' → the book finder (one index over works AND sections, the whole message
// scored) → ONE Jev pick → the card at once. Haiku only when nothing fits; never a summary write before the card.
// Fixture rows mirror production (api/documents?search=… on 11-10). All mocked: no Anthropic or Jev spend.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ANIS_WORK_SUMMARIES = join(tmpdir(), `work-summaries-fast-${process.pid}.json`);
import { bookFastPath, extractTitles, strongTitle, labelOf } from '../../api/lib/assistant/book-pick.js';
import { buildBookIndex, lexicalSearch, lexicalRetriever, bookCandidates } from '../../api/lib/assistant/book-finder.js';
import { titleAnswer, sectionAnswer } from '../../api/lib/assistant/title-answer.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState } from '../../api/lib/assistant/units.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

beforeAll(() => { process.env.TYPESAFE_API_KEY ||= 'test-key'; });

const BH = "Baha'i";
const DOCS = [
  { id: 101, title: 'Bhagavad Gita', author: 'Vyasa', religion: 'Hindu', collection: 'Scripture', paragraph_count: 700 },
  { id: 102, title: 'A Study of the Bhagavad Gita', author: 'Someone', religion: 'Hindu', collection: 'Studies', paragraph_count: 300 },
  { id: 201, title: 'The Kitáb-i-Íqán', author: 'Bahá’u’lláh', religion: BH, collection: 'Writings of Bahá’u’lláh', paragraph_count: 290 },
  { id: 301, title: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', religion: BH, collection: 'Writings of Shoghi Effendi', paragraph_count: 900 },
  { id: 2209612, title: "The Dispensation of Bahá'u'lláh", author: 'Hooper Dunbar', religion: BH, collection: 'Media', paragraph_count: 200 },
  { id: 919411, title: "Dispensation of Baha'u'llah", author: 'rabbani', religion: BH, collection: 'Books', paragraph_count: 1 },
  { id: 20992, title: 'The Gospel of Matthew', author: 'Matthew', religion: 'Christian', collection: 'The Bible (KJV)', paragraph_count: 785 },
  { id: 307741, title: 'Tag: Matthew Arnold', author: 'tags-Matthew', religion: null, collection: null, paragraph_count: 8 },
  { id: 17290, title: 'Douay-Rheims Bible', author: null, religion: 'Christian', collection: 'Bible', paragraph_count: 35000 },
  { id: 20820, title: 'Deepening', author: 'Research Department of the Universal House of Justice (compiler)', religion: BH, collection: 'Research Department Compilations', paragraph_count: 432 },
  { id: 22097, title: "Deepening and Compilation for Baha'i Youth Teaching Projects", author: '2605', religion: BH, collection: null, paragraph_count: 147 },
  { id: 984008, title: 'The Importance of Deepening', author: 'Unknown', religion: BH, collection: 'Media', paragraph_count: 118 },
  { id: 983360, title: "Bahá'í Deepening", author: 'William Sears', religion: BH, collection: 'Media', paragraph_count: 19 },
  { id: 21310, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: BH, collection: 'Writings of Bahá’u’lláh', paragraph_count: 500 },
];
const SECS = [
  { section_id: 20894, doc_id: 301, book: 'The World Order of Bahá’u’lláh', author: 'Shoghi Effendi', title: 'The Dispensation of Bahá’u’lláh', start_index: 188, end_index: 318, paragraphs: 131, first_para_id: 77 },
  { section_id: 983134, doc_id: 983134, book: 'Child of the Covenant', author: 'Adib Taherzadeh', title: "The Dispensation of Bahá'u'lláh as Shoghi Effendi's confession of faith", start_index: 67, end_index: 71, paragraphs: 5, first_para_id: 5 },
  ...[5, 13, 26].map((n) => ({ section_id: 17290 + n, doc_id: 17290, book: 'Douay-Rheims Bible', author: null, title: `Matthew Chapter ${n}`, start_index: 31700 + n, end_index: 31760 + n, paragraphs: 60, first_para_id: n })),
  { section_id: 2210128, doc_id: 2210128, book: "Dunbar's Thursday Night Class, 43", author: 'Hooper Dunbar', title: 'Deepening and teaching', start_index: 23, end_index: 56, paragraphs: 34, first_para_id: 9 },
];
const ALIASES = [{ title: 'Kitáb-i-Íqán', names: ['Iqan', 'Book of Certitude'] }];
const index = buildBookIndex({ docs: DOCS, sections: SECS, aliases: ALIASES });
const find = (msg, o = {}) => bookCandidates(msg, { ...o, retrievers: [lexicalRetriever(index)] });
const ids = (r) => r.cands.map((c) => (c.kind === 'work' ? c.doc.id : `s${c.sec.section_id}`));

// Jev's endpoint, counted: each call answers the next scripted choice
const jev = (...answers) => { const calls = []; const fetchImpl = vi.fn(async (url, init) => { const body = JSON.parse(init.body); calls.push(body.questions.book.criteria);
  return { ok: true, json: async () => ({ answers: { book: answers[calls.length - 1] } }) }; }); return { fetchImpl, calls }; };
const user = (t) => [{ role: 'user', content: t }];
const keyOf = (calls, re) => Object.entries(calls[0]).find(([, v]) => re.test(v))?.[0];

describe('the book finder — one index over works and sections, the WHOLE message scored', () => {
  it('"do you have the research department compilation on Deepening" → the compilation "Deepening" first, no phrase cutting', async () => {
    for (const m of ['do you have the research department compilation on Deepening', 'Research Department Compilation on Deepening',
      'no, do you have the Research Department\'s "Deepening" compilation?', 'Deepening Compilation']) expect(ids(await find(m))[0]).toBe(20820);
  });
  it('"Dispensation of Baha\'u\'llah" (ASCII, no diacritics) → the section of The World Order of Bahá’u’lláh is a candidate, beside the talk', async () => {
    const r = await find("Dispensation of Baha'u'llah");
    expect(ids(r)).toContain('s20894'); expect(ids(r)).toContain(2209612);
    expect(ids(r)).not.toContain(919411);   // a one-paragraph stub is not offered
    expect(ids(await find('Dispensation of Bahá’u’lláh'))).toContain('s20894');
  });
  it('"Matthew" → The Gospel of Matthew first; the Bible\'s chapters collapse to one section; a tag page is never offered', async () => {
    const r = await find('Matthew');
    expect(ids(r)[0]).toBe(20992);
    expect(r.cands.filter((c) => c.kind === 'section' && c.sec.doc_id === 17290)).toHaveLength(1);
    expect(ids(r)).not.toContain(307741);
  });
  it('"Iqan" → the Kitáb-i-Íqán through its listed name; "Gita" → the Bhagavad Gita before a study of it', async () => {
    expect(ids(await find('Iqan'))[0]).toBe(201);
    expect(ids(await find('Book of Certitude'))[0]).toBe(201);
    expect(ids(await find('Gita')).slice(0, 2)).toEqual([101, 102]);
  });
  it('one spelling slip still finds the work; an author alone is not a request for a book', () => {
    expect(lexicalSearch(index, 'the Dispensaton of Bahaullah')[0]?.sec?.section_id ?? lexicalSearch(index, 'the Dispensaton of Bahaullah')[0]?.doc?.id).toBeTruthy();
    expect(lexicalSearch(index, 'Hooper Dunbar').length).toBe(0);
  });
  it('a second (semantic) retriever plugs in and is merged by rank', async () => {
    const semantic = async () => [{ kind: 'work', doc: DOCS[0], score: 0.9 }];
    const r = await bookCandidates('the main book of the Hindus', { retrievers: [lexicalRetriever(index), semantic] });
    expect(ids(r)[0]).toBe(101);
  });
});

describe('book fast path', () => {
  it('"Gita" → the card with exactly ONE Jev call, no Haiku', async () => {
    const j = jev({ choice: 'c1', confidence: 0.93 }), extract = vi.fn();
    const r = await bookFastPath({ messages: user('Gita'), names: ['Gita'], deps: { fetchImpl: j.fetchImpl, find, extract } });
    expect(r.kind).toBe('work'); expect(r.work.doc.id).toBe(101);
    expect(j.fetchImpl).toHaveBeenCalledTimes(1); expect(extract).not.toHaveBeenCalled();
    expect(j.calls[0].c1).toBe('“Bhagavad Gita” — Vyasa (Hindu · Scripture), 700 paragraphs'); expect(j.calls[0].none).toBeTruthy();
  });
  it('"Iqan" → one Jev call, no Haiku', async () => {
    const j = jev({ choice: 'c1', confidence: 0.9 }), extract = vi.fn();
    const r = await bookFastPath({ messages: user('Iqan'), deps: { fetchImpl: j.fetchImpl, find, extract } });
    expect(r.work.doc.id).toBe(201); expect(j.fetchImpl).toHaveBeenCalledTimes(1); expect(extract).not.toHaveBeenCalled();
  });
  it('"Do you have access to the main book of the Hindus?" → nothing named → ONE Haiku names it → candidates → Jev → the card', async () => {
    const j = jev({ choice: 'c1', confidence: 0.88 }), extract = vi.fn(async () => ['Bhagavad Gita', 'Vedas']);
    const r = await bookFastPath({ messages: user('Do you have access to the main book of the Hindus?'), deps: { fetchImpl: j.fetchImpl, find, extract } });
    expect(extract).toHaveBeenCalledTimes(1); expect(j.fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ kind: 'work', via: 'extracted' }); expect(r.work.doc.id).toBe(101);
  });
  it('Jev says none fits → Haiku → the second pick; still nothing → null (the turn researches)', async () => {
    const j = jev({ choice: 'none', confidence: 0.9 }, { choice: 'c1', confidence: 0.8 });
    const r = await bookFastPath({ messages: user('the Gita, the real one'), deps: { fetchImpl: j.fetchImpl, find, extract: async () => ['Bhagavad Gita'] } });
    expect(j.fetchImpl).toHaveBeenCalledTimes(2); expect(r.work.doc.id).toBe(101);
    const n = jev({ choice: 'none', confidence: 0.9 });
    expect(await bookFastPath({ messages: user('Gita'), deps: { fetchImpl: n.fetchImpl, find, extract: async () => [] } })).toBeNull();
  });
  it('"Dispensation of Baha\'u\'llah" → Jev picks the SECTION of The World Order of Bahá’u’lláh', async () => {
    const j = jev(null);
    j.fetchImpl.mockImplementation(async (url, init) => { const c = JSON.parse(init.body).questions.book.criteria; j.calls.push(c);
      return { ok: true, json: async () => ({ answers: { book: { choice: keyOf(j.calls, /a section of “The World Order/), confidence: 0.95 } } }) }; });
    const r = await bookFastPath({ messages: user("Dispensation of Baha'u'llah"), deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn() } });
    expect(keyOf(j.calls, /^“The Dispensation of Bahá’u’lláh” — a section of “The World Order of Bahá’u’lláh” by Shoghi Effendi, 131 paragraphs$/)).toBeTruthy();
    expect(r).toMatchObject({ kind: 'section', sec: { doc_id: 301, start_index: 188 } });
  });
  it('"Matthew" → Jev chooses between the Gospel of Matthew and a Bible\'s Matthew section', async () => {
    const j = jev({ choice: 'c1', confidence: 0.9 });
    const r = await bookFastPath({ messages: user('Matthew'), deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn() } });
    expect(j.calls[0].c1).toMatch(/^“The Gospel of Matthew”/); expect(Object.values(j.calls[0]).some((v) => /a section of “Douay-Rheims Bible”/.test(v))).toBe(true);
    expect(r.work.doc.id).toBe(20992);
  });
  it('probe ("Deepening Compilation", Jev chose compilation): Jev picks the existing work → card; picks "new" → null, no Haiku', async () => {
    const alt = 'a NEW compilation gathered on this topic (not an existing work in the library)';
    const yes = jev({ choice: 'c1', confidence: 0.85 }), extract = vi.fn();
    const r = await bookFastPath({ messages: user('Deepening Compilation'), names: ['Deepening Compilation'], alt, deps: { fetchImpl: yes.fetchImpl, find, extract } });
    expect(r).toMatchObject({ kind: 'work', via: 'probe', work: { doc: { id: 20820 } } }); expect(yes.calls[0].new).toBe(alt);
    const no = jev({ choice: 'new', confidence: 0.9 });
    expect(await bookFastPath({ messages: user('Deepening Compilation'), names: ['Deepening Compilation'], alt, deps: { fetchImpl: no.fetchImpl, find, extract } })).toBeNull();
    expect(extract).not.toHaveBeenCalled();
  });
  it('probe asks Jev only when his phrase holds a whole title: "a compilation on deepening our faith in hard times" spends no Jev call', async () => {
    const j = jev({ choice: 'c1', confidence: 0.9 });
    expect(await bookFastPath({ messages: user('compile passages on steadfastness in tests'), names: ['steadfastness in tests'], alt: 'new', deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn() } })).toBeNull();
    expect(j.fetchImpl).not.toHaveBeenCalled();
    expect(strongTitle('Deepening Compilation', 'Deepening')).toBe(true);
    expect(strongTitle('justice and mercy', 'Justice and Peace')).toBe(false);
  });
  it('the section card: its title, the work it is part of, a link to where it starts — no model', async () => {
    const ev = [], sec = SECS[0];
    const r = await sectionAnswer({ sec }, { onEvent: (e) => ev.push(e), link: async () => 'https://oceanlibrary.com/wob?paraId=para_188' });
    expect(ev[0]).toMatchObject({ type: 'book', book: { title: 'The Dispensation of Bahá’u’lláh', url: 'https://oceanlibrary.com/wob?paraId=para_188', section: { of: 'The World Order of Bahá’u’lláh', start_index: 188 } } });
    expect(r.reply).toContain('[*The Dispensation of Bahá’u’lláh*](https://oceanlibrary.com/wob?paraId=para_188) is in the library, part of *The World Order of Bahá’u’lláh* by Shoghi Effendi');
    expect(r.citations[0]).toMatchObject({ document_id: 301, paragraph_index: 188 });
  });
  it('no description and no cached summary → the card at once, the summary written AFTER (never awaited)', async () => {
    const ev = [], later = vi.fn(() => new Promise(() => {}));   // a write that never finishes must not hold the card
    const doc = { id: 880000000 + Math.floor(Math.random() * 1e6), title: 'Untold', author: 'A', paragraph_count: 50 };
    const r = await titleAnswer({ doc, others: [] }, { onEvent: (e) => ev.push(e), links: async () => new Map(), later });
    expect(ev[0]).toMatchObject({ type: 'book', book: { id: doc.id, description: null } });
    expect(later).toHaveBeenCalledWith(doc); expect(r.reply).toMatch(/discuss it\?$/);
  });
  it('extractTitles: one Haiku call (injected), lines → titles, NONE → []', async () => {
    const complete = vi.fn(async () => ({ content: 'Bhagavad Gita\nMahabharata' }));
    expect(await extractTitles(user('the main book of the Hindus'), { complete })).toEqual(['Bhagavad Gita', 'Mahabharata']);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(await extractTitles(user('hi'), { complete: async () => ({ content: 'NONE' }) })).toEqual([]);
  });
  it('labels carry tradition and collection, so Jev can tell the work from a talk about it', () => {
    expect(labelOf({ kind: 'work', doc: DOCS[4] })).toBe("“The Dispensation of Bahá'u'lláh” — Hooper Dunbar (Baha'i · Media), 200 paragraphs");
  });
});

// 11-10 live: 'no, do you have the Research Department's "Deepening" compilation?' got a long researched answer, not the card;
// "Deepening Compilation" (Jev: compilation) BUILT a compilation instead of opening the existing one
describe('turn: book strategy and the compilation probe', () => {
  const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: { first: false, turn: 1, words: 9, short: false } };
  const turn = (strategy, units, messages, ...answers) => {
    const j = jev(...answers), calls = { respond: 0 }, seen = [];
    const strat = { strategy: { choice: strategy, confidence: 0.9 }, sides: [], sources: {}, decisions: [], units };
    const deps = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      bookPick: (a) => { seen.push({ names: a.names, by: a.by, alt: a.alt ?? null }); return bookFastPath({ ...a, deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn(async () => []) } }); },
      titleAnswer: async (w) => ({ reply: `CARD ${w.doc.id}`, citations: [] }),
      respond: async () => { calls.respond++; return { reply: 'researched', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 1 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { j, calls, seen, run: () => anisTurn({ messages, participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps }) };
  };
  it('the "no, …" follow-up → book → candidates → Jev pick → the card (topic and person beside the work do not block it)', async () => {
    const h = turn('book', { named_work: 'Deepening', named_person: 'Research Department', topic: 'no, do you have the compilation?' },
      [{ role: 'user', content: 'Do you have the Deepening compilation?' }, { role: 'assistant', content: 'Here are passages on deepening…' },
        { role: 'user', content: 'no, do you have the Research Department\'s "Deepening" compilation?' }], { choice: 'c1', confidence: 0.9 });
    expect((await h.run()).reply).toBe('CARD 20820'); expect(h.calls.respond).toBe(0);
    expect(h.seen[0]).toMatchObject({ names: ['Deepening'], by: 'Research Department', alt: null });
    expect(h.j.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('"Deepening Compilation" with Jev\'s compilation strategy → the probe pick → Jev: the existing work → the card', async () => {
    const h = turn('compilation', { topic: 'Deepening Compilation' }, user('Deepening Compilation'), { choice: 'c1', confidence: 0.9 });
    expect((await h.run()).reply).toBe('CARD 20820'); expect(h.calls.respond).toBe(0);
    expect(h.seen[0].alt).toMatch(/NEW compilation/);
  });
  it('…Jev: a new compilation → the compilation strategy runs as before', async () => {
    const h = turn('compilation', { topic: 'Deepening Compilation' }, user('Deepening Compilation'), { choice: 'new', confidence: 0.9 });
    expect((await h.run()).reply).toBe('researched'); expect(h.calls.respond).toBe(1); expect(h.j.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
