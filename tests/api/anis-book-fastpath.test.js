// The book fast path (Chad 11-10): Jev picks 'book' → the book finder (one index over works AND sections, the whole message
// scored) → ONE Jev pick → the card at once. Haiku only when nothing fits; never a summary write before the card.
// Fixture rows mirror production (api/documents?search=… on 11-10). All mocked: no Anthropic or Jev spend.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.ANIS_WORK_SUMMARIES = join(tmpdir(), `work-summaries-fast-${process.pid}.json`);
import { bookFastPath, extractTitles, strongTitle, labelOf, groupCopies } from '../../api/lib/assistant/book-pick.js';
import { findInWorkAnswer } from '../../api/lib/assistant/find-in-work.js';
import { runStrategy } from '../../api/lib/assistant/strategies.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
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

// 11-10 live battery: three book-path misses
// The live candidate rows (anis-trace conv_10228d20…:0 and the "main book of the Hindus" turn): several copies of ONE text
const DH_DOCS = [
  { id: 5001, title: 'The Dhammapada', author: 'Siddhartha Buddha', religion: 'Buddhist', collection: 'Pali Canon', paragraph_count: 414 },
  { id: 5002, title: 'Dhammapada (tr. Buddharakkhita)', author: 'tr. Acharya Buddharakkhita', religion: 'Buddhist', collection: 'Practice and Meditation', paragraph_count: 193 },
  { id: 5003, title: 'Dhammapada (tr. F. Max Mueller)', author: 'tr. F. Max Mueller', religion: 'Buddhist', collection: 'Pali Canon', paragraph_count: 452 },
  { id: 5004, title: "The Buddha's Path of Virtue (Dhammapada tr. Wagiswara and Saunders)", author: 'tr. K.J. Saunders', religion: 'Buddhist', collection: 'Pali Canon', paragraph_count: 643 },
  { id: 6001, title: 'The Bhagavad-Gita', author: 'Vyāsa', religion: 'Hindu', collection: 'Scripture', paragraph_count: 262 },
  { id: 6002, title: 'Bhagavad Gita (Song Celestial, tr. Edwin Arnold)', author: 'tr. Edwin Arnold', religion: 'Hindu', collection: 'Scripture', paragraph_count: 333 },
  { id: 6003, title: 'The Mahabharata', author: 'Vyāsa', religion: 'Hindu', collection: 'Scripture', paragraph_count: 9000 },
];
const DH_SECS = [
  { section_id: 7001, doc_id: 7000, book: 'Sacred Books of the East (Selected Translations)', author: 'Various, ed. Epiphanius Wilson', title: 'The Dhammapada', start_index: 10, end_index: 479, paragraphs: 469, first_para_id: 1 },
  { section_id: 7101, doc_id: 7100, book: 'Sacred Books of the East - Selections', author: 'Epiphanius Wilson', title: 'The Dhammapada', start_index: 20, end_index: 489, paragraphs: 469, first_para_id: 2 },
];
const dhIndex = buildBookIndex({ docs: DH_DOCS, sections: DH_SECS, aliases: [] });
const dhFind = (msg, o = {}) => bookCandidates(msg, { ...o, retrievers: [lexicalRetriever(dhIndex)] });
// Jev as he behaved live: his belief in "the Dhammapada" is SHARED by every option that is a copy of it (0.8 split over five
// copies = 0.16 each, below the 0.6 floor → "none"); one option per text keeps it whole
const splitJev = (re) => { const calls = []; const fetchImpl = vi.fn(async (url, init) => { const q = JSON.parse(init.body).questions.book; calls.push(q);
  const hits = Object.entries(q.criteria).filter(([k, v]) => k !== 'none' && re.test(v));
  const choice = hits[0]?.[0] ?? 'none', confidence = hits.length ? 0.8 / hits.length : 0.9;
  return { ok: true, json: async () => ({ answers: { book: { choice, confidence } } }) }; }); return { fetchImpl, calls }; };

describe('11-10 misses: copies of one text are one option; the extracted title reaches Jev; an Unmatched book turn gets the card', () => {
  it('Dhammapada: five copies → ONE option listing each copy → Jev\'s pick holds → the card (live: "none" at 0.16, twice)', async () => {
    const j = splitJev(/^“(The )?Dhammapada/), extract = vi.fn(async () => ['Dhammapada (Pali)']);
    const r = await bookFastPath({ messages: user('find "hatred ceases" in the Dhammapada'), names: ['Dhammapada'], deps: { fetchImpl: j.fetchImpl, find: dhFind, extract } });
    const opts = Object.entries(j.calls[0].criteria).filter(([k]) => k !== 'none');
    expect(opts.filter(([, v]) => /^“(The )?Dhammapada/.test(v))).toHaveLength(1);
    expect(opts.find(([, v]) => /^“(The )?Dhammapada/.test(v))[1]).toMatch(/^“The Dhammapada” — one text, 5 copies or translations in the library: (?=.*tr\. F\. Max Mueller)(?=.*a section of “Sacred Books of the East)/);
    expect(j.calls[0].instructions).toMatch(/find words or a passage in it/);
    expect(j.calls[0].instructions).toMatch(/the book is the one searched IN/);   // 11-10: "Search The Dawn-Breakers for \"Letters of the Living\"" picked a UHJ letter titled "Letters of Living, Dawn-Breakers…"
    expect(j.fetchImpl).toHaveBeenCalledTimes(1); expect(extract).not.toHaveBeenCalled();
    expect(r.kind).toBe('work'); expect(r.work.doc.id).toBe(5001);
    expect(r.work.others.map((d) => d.id)).toEqual([5002, 5003]);   // the other translations, offered beside it
  });
  it('a single candidate keeps its own label; a section and a work of different texts stay apart', () => {
    const g = groupCopies([{ kind: 'work', doc: DOCS[0] }, { kind: 'section', sec: SECS[0] }]);
    expect(g.map((c) => c.label)).toEqual([labelOf({ kind: 'work', doc: DOCS[0] }), labelOf({ kind: 'section', sec: SECS[0] })]);
  });
  it('the in-work find resolves the Dhammapada through the same pick and searches it', async () => {
    const j = splitJev(/^“(The )?Dhammapada/), search = vi.fn(async (a) => ({ works: [{ id: a.works[0], title: 'The Dhammapada' }], mode_used: 'phrase', total: 1,
      passages: [{ id: 1, document_id: a.works[0], paragraph_index: 5, text: 'Hatred ceases by love', title: 'The Dhammapada', url: null }] }));
    const got = await findInWorkAnswer({ messages: user('find "hatred ceases" in the Dhammapada'), names: ['Dhammapada'],
      deps: { bookDeps: { fetchImpl: j.fetchImpl, find: dhFind, extract: vi.fn(async () => []) } }, search });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ works: [5001], query: 'hatred ceases' }));
    expect(got?.reply).toBeTruthy();
  });
  it('"the main book of the Hindus": the second pick is TOLD the titles Haiku resolved, and the Gita copies are one option (live: none 0.39)', async () => {
    const calls = [], fetchImpl = vi.fn(async (url, init) => { const q = JSON.parse(init.body).questions.book; calls.push(q);
      const gita = Object.entries(q.criteria).find(([, v]) => /^“The Bhagavad-Gita” — one text/.test(v))?.[0];
      const told = /identified as “The Bhagavad Gita”/.test(q.instructions);
      return { ok: true, json: async () => ({ answers: { book: gita && told ? { choice: gita, confidence: 0.85 } : { choice: 'none', confidence: 0.6 } } }) }; });
    const extract = vi.fn(async () => ['The Bhagavad Gita', 'Mahabharata']);
    const r = await bookFastPath({ messages: user('Do you have access to the main book of the Hindus?'), deps: { fetchImpl, find: dhFind, extract } });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(calls.at(-1).instructions).toMatch(/identified as “The Bhagavad Gita” or “Mahabharata”/);
    expect(calls.slice(0, -1).every((c) => !/identified as/.test(c.instructions))).toBe(true);   // the first pick (if any) is not told
    expect(r).toMatchObject({ kind: 'work', via: 'extracted', work: { doc: { id: 6001 } } });
    expect(r.work.others.map((d) => d.id)).toEqual([6002]);
  });

  // "Matthew" (live conv_3a368638…:0): Jev → Unmatched; the planner routed it to book (setting_of), whose executor fell through
  // ("a lookup strategy runs as the turn gather") → 20–37 s of research, no card
  const BOOK = { strategy: { choice: 'book', confidence: 0.6 }, sides: [] };
  it('runStrategy(book) with the turn\'s finder → a handoff carrying the card; without one (or nothing found) → null as before', async () => {
    const found = { kind: 'work', work: { doc: DOCS[6], others: [] }, via: 'named' }, log = decisionLog();
    expect(await runStrategy(BOOK, { book: async () => found, decisions: log })).toEqual({ handoff: { kind: 'book', found } });
    expect(log.list().find((x) => x.point === 'book:handoff')?.chosen).toBe('card');
    expect(await runStrategy(BOOK, { book: async () => null, decisions: decisionLog() })).toBeNull();
    expect(await runStrategy(BOOK, { decisions: decisionLog() })).toBeNull();
  });
  for (const graph of [true, false]) it(`anisRespond (${graph ? 'strategy graph' : 'legacy cascade'}): an Unmatched turn rechecked as book returns the handoff, no research`, async () => {
    const saved = process.env.ANIS_STRATEGY_GRAPH;
    if (graph) delete process.env.ANIS_STRATEGY_GRAPH; else process.env.ANIS_STRATEGY_GRAPH = '0';
    try {
      const found = { kind: 'work', work: { doc: DOCS[6], others: [] }, via: 'named' }, research = vi.fn(async () => ({ passages: [], ms: 1 }));
      const d = { search: vi.fn(async () => ({ passages: [] })), plan: async () => ({ shape: 'fact' }), phrases: async () => null, prewarm: async () => null, findWork: async () => null,
        research, unmatched: async ({ direction, run }) => { direction.strategy = BOOK; return { via: 'setting_of', name: 'book', out: await run(BOOK) }; } };
      const book = vi.fn(async () => found);
      const r = await anisRespond({ messages: user('Matthew'), profile: {}, deps: d,
        direction: { channel: 'site-chat', decisions: decisionLog(), research: true, strategy: { strategy: { choice: 'other', confidence: 0.85 }, sides: [] }, book } });
      expect(r.handoff).toEqual({ kind: 'book', found }); expect(book).toHaveBeenCalledTimes(1);
      expect(research).not.toHaveBeenCalled(); expect(d.search).not.toHaveBeenCalled();
    } finally { if (saved === undefined) delete process.env.ANIS_STRATEGY_GRAPH; else process.env.ANIS_STRATEGY_GRAPH = saved; }
  });
  it('turn: "Matthew" with Jev\'s Unmatched → respond hands back the book → the card (one Jev pick, no research reply)', async () => {
    const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: { first: true, turn: 1, words: 1, short: true } };
    const j = jev({ choice: 'c1', confidence: 0.9 });
    const strat = { strategy: { choice: 'unmatched', confidence: 0.85 }, sides: [], sources: {}, decisions: [], units: {} };
    const deps = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      bookPick: (a) => bookFastPath({ ...a, deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn(async () => []) } }),
      titleAnswer: async (w) => ({ reply: `CARD ${w.doc.id}`, citations: [] }),
      // respond's Unmatched recheck lands on book: the executor runs with the finder turn.js handed in
      respond: async ({ direction }) => { const out = await runStrategy(BOOK, { book: direction.book, decisions: direction.decisions }); return out?.handoff ? { handoff: out.handoff } : { reply: 'researched', citations: [], retrieved: [], plan: {}, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 1 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    const r = await anisTurn({ messages: user('Matthew'), participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps });
    expect(r.reply).toBe('CARD 20992'); expect(j.fetchImpl).toHaveBeenCalledTimes(1);
  });
});

// battery round 3 (11-10): "main book of the Hindus" — the pick's near miss (0.57) was lost when the Unmatched recheck said book 0.6;
// "Matthew" — the backup's lookup said book under 0.6, so the card waited for Unmatched + the planner (16.5 s)
describe('book path: near miss held, weak lookup book runs first (battery round 3)', () => {
  const BOOK = { strategy: { choice: 'book', confidence: 0.6 }, sides: [] };
  const triWith = (lookup) => ({ malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, lookup, features: { first: true, turn: 1, words: 1, short: true } });
  const strat = { strategy: { choice: 'unmatched', confidence: 0.85 }, sides: [], sources: {}, decisions: [], units: {} };
  const rig = (tri, j, respond) => ({ titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
    bookPick: (a) => bookFastPath({ ...a, deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn(async () => []) } }),
    titleAnswer: async (w) => ({ reply: `CARD ${w.doc.id}`, citations: [] }), lookup: async () => null, respond,
    open: async () => ({ conversationId: 'c', round: 1 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} });

  it('bookFastPath: a candidate picked under the floor → null, and onHeld gets that candidate', async () => {
    const j = jev({ choice: 'c1', confidence: 0.57 });
    let held = null;
    const r = await bookFastPath({ messages: user('Matthew'), onHeld: (f) => { held = f; }, deps: { fetchImpl: j.fetchImpl, find, extract: vi.fn(async () => []) } });
    expect(r).toBeNull();
    expect(held).toMatchObject({ kind: 'work', work: { doc: { id: 20992 } }, confidence: 0.57 });
  });
  it('turn: the book path ran, its pick fell short; the Unmatched recheck says book → the held card, no second pick, no research', async () => {
    const j = jev({ choice: 'c1', confidence: 0.57 });
    const respond = vi.fn(async ({ direction }) => { const out = await runStrategy(BOOK, { book: direction.book, decisions: direction.decisions }); return out?.handoff ? { handoff: out.handoff } : { reply: 'researched', citations: [], retrieved: [], plan: {}, timings: {} }; });
    const r = await anisTurn({ messages: user('Matthew'), participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: rig(triWith({ choice: 'book', confidence: 0.9 }), j, respond) });
    expect(r.reply).toBe('CARD 20992'); expect(j.fetchImpl).toHaveBeenCalledTimes(1); expect(respond).toHaveBeenCalledTimes(1);
  });
  it('turn: Unmatched + a lookup book under 0.6 → the pick runs BEFORE respond → the card, respond never called', async () => {
    const j = jev({ choice: 'c1', confidence: 0.9 });
    const respond = vi.fn(async () => ({ reply: 'researched', citations: [], retrieved: [], plan: {}, timings: {} }));
    const r = await anisTurn({ messages: user('Matthew'), participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: rig(triWith({ choice: 'book', confidence: 0.4, by: 'haiku' }), j, respond) });
    expect(r.reply).toBe('CARD 20992'); expect(respond).not.toHaveBeenCalled();
  });
});
