// Lookups fast path (W1): book / quoted words / numbered reference resolved by code, no agent/planner/format call, light writer.
import { describe, it, expect } from 'vitest';
import { parseReference, headingNumber, byHeadingNumber, holds, resolveLookup, pickQuoteOrBook } from '../../api/lib/assistant/lookup.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { codeFormat } from '../../api/lib/assistant/formats.js';
import { modelFor } from '../../api/lib/model-roles.js';

const GL = { doc: { id: 8312, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: "Baha'i", collection: 'Bahá’u’lláh', source_site: 'oceanlibrary.com', book_authority: 8 }, score: 1 };
const P = 'The earth is but one country, and mankind its citizens.';
const user = (content) => [{ role: 'user', content }];
// a passage in CORE literature (Chad 11-03: only core matches make a quote candidate) and one in commentary
const CORE = { author: 'Bahá’u’lláh', religion: "Baha'i", collection: 'Core Publications', book_authority: 8 };
const COMMENTARY = { author: 'John Huddleston', religion: "Baha'i", collection: "Baha'i Books", book_authority: 5 };

describe('parsing', () => {
  it('reads a numbered reference', () => {
    expect(parseReference('Gleanings 27')).toEqual({ title: 'Gleanings', num: 27 });
    expect(parseReference('Hidden Words no. 12')).toEqual({ title: 'Hidden Words', num: 12 });
    expect(parseReference('Gleanings section CXXVII')).toEqual({ title: 'Gleanings', num: 127, unit: 'section' });
  });
  it('a chapter named either way round: "Dawn-Breakers chapter 25", "- Chapter 25", "chapter XXV of the Dawn-Breakers" (11-11)', () => {
    for (const q of ['Dawn-Breakers chapter 25', 'Dawn-Breakers - Chapter 25', 'chapter 25 of the Dawn-Breakers', 'Chapter XXV of The Dawn-Breakers?'])
      expect(parseReference(q)).toEqual({ title: 'Dawn-Breakers', num: 25, unit: 'chapter' });
  });
  it('a title with no number is no reference (Jev decides intent; this only parses the target)', () => {
    expect(parseReference('Gleanings')).toBeNull();
  });
  it('headings carry the work\'s own numbers', () => {
    expect(headingNumber('Chapter 33')).toBe(33);
    expect(headingNumber('XXXIII. On the Trinity')).toBe(33);
    expect(headingNumber('183 — Fools')).toBe(183);
    expect(headingNumber('Unity of religions')).toBeNull();
    const st = [{ heading: '32. A' }, { heading: '33. B' }];
    expect(byHeadingNumber(st, 33)).toBe(st[1]);
    expect(byHeadingNumber([...st, { heading: 'Chapter 33' }], 33)).toBeNull();
  });
  it('holds: exact and near', () => {
    expect(holds(`He said ${P}`, P).exact).toBe(true);
    expect(holds('mankind its citizens, the earth is one country', P)).toMatchObject({ exact: false, near: true });
    expect(holds('nothing alike here', P).near).toBe(false);
  });
});

describe('resolveLookup (mocked deps)', () => {
  it('a book name resolves through the title index with no search', async () => {
    let searched = 0;
    const r = await resolveLookup(user('Gleanings'), { intent: 'book', findTitled: async () => GL, search: async () => { searched++; return []; } });
    expect(r).toMatchObject({ kind: 'book', work: GL });
    expect(searched).toBe(0);
  });
  it('a reference resolves to its numbered paragraph with its link (a paragraph-numbered work: the next pn ends it)', async () => {
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference', headingStarts: async () => [],
      paragraphsInRange: async (id, a) => [{ id: 5, paragraph_index: 40, text: P, block_attrs: '{"pn":"27"}' }, { id: 6, paragraph_index: 41, text: 'Next.', block_attrs: '{"pn":"28"}' }].filter((r) => r.paragraph_index >= a),
      findTitled: async () => GL, paragraphsByPn: async (id, n) => [{ id: 5, paragraph_index: 40, text: P, n }],
      withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/g#40' })) });
    expect(r.kind).toBe('reference');
    expect(r.passages[0]).toMatchObject({ source_url: 'https://x/g#40', title: GL.doc.title });
  });
  it('a section number also tries the Roman pn (Gleanings 27 → XXVII)', async () => {
    const asked = [];
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference', headingStarts: async () => [], paragraphsInRange: async () => [],
      findTitled: async () => GL, paragraphsByPn: async (id, n) => { asked.push(String(n)); return n === 'XXVII' ? [{ id: 9, paragraph_index: 70, text: P }] : []; },
      withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/g#70' })) });
    expect(asked).toEqual(['27', 'XXVII']);
    expect(r).toMatchObject({ kind: 'reference', passages: [{ paragraph_index: 70 }] });
  });
  it('an ambiguous pn (2 rows) is not a reference; falls through', async () => {
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference', findTitled: async () => GL, paragraphsByPn: async () => [{ text: 'a' }, { text: 'b' }], findWork: async () => null, search: async () => [] });
    expect(r).toBeNull();
  });
  it('quoted words are confirmed by a passage that holds them, exact first', async () => {
    const hits = [{ ...CORE, text: 'mankind its citizens and the earth' }, { ...CORE, text: `Know that ${P}` }];
    const r = await resolveLookup(user(`"${P}"`), { intent: 'quote', findTitled: async () => null, search: async () => hits });
    expect(r.kind).toBe('quote');
    expect(r.passages[0].text).toContain(P);
  });
  it('a reference on a work with no pn maps onto its chapter heading', async () => {
    const r = await resolveLookup(user('Some Answered Questions 33'), { intent: 'reference', findTitled: async () => GL, paragraphsByPn: async () => [],
      paragraphsInRange: async () => [],
      headingStarts: async () => [{ id: 1, paragraph_index: 3, heading: '32. A', text: 'a' }, { id: 2, paragraph_index: 9, heading: '33. B', text: P }],
      withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/saq#9' })) });
    expect(r).toMatchObject({ kind: 'reference', passages: [{ paragraph_index: 9, source_url: 'https://x/saq#9' }] });
  });
  it('a named chapter is the chapter, not the paragraph numbered 25; the trace records the step (11-11 Dawn-Breakers)', async () => {
    const seen = [];
    const r = await resolveLookup(user('Dawn-Breakers - Chapter 25'), { intent: 'reference', findTitled: async () => GL,
      decisions: { record: (k, d) => seen.push([k, d.chosen]) },
      paragraphsByPn: async (id, n) => (String(n) === '25' ? [{ id: 7, paragraph_index: 25, text: 'One numbered line.' }] : []),
      paragraphsInRange: async (id, a) => [{ id: 2, paragraph_index: 900, heading: 'CHAPTER XXV', text: P }, { id: 3, paragraph_index: 901, heading: 'CHAPTER XXV', text: 'More of it.' }].filter((x) => x.paragraph_index >= a),
      headingStarts: async () => [{ id: 1, paragraph_index: 880, heading: 'CHAPTER XXIV', text: 'a' }, { id: 2, paragraph_index: 900, heading: 'CHAPTER XXV', text: P }],
      withLinks: async (h) => h.map((x) => ({ ...x, url: `https://x/db#${x.paragraph_index}` })) });
    expect(r).toMatchObject({ kind: 'reference', passages: [{ paragraph_index: 900 }, { paragraph_index: 901 }] });
    expect(seen).toEqual([['lookup:reference', 'chapter heading']]);
  });
  it('a chapter kept as a doc SECTION (headings are only marginal notes) resolves by the section title, not its rank (11-11 Dawn-Breakers live)', async () => {
    const seen = []; let asked;
    const r = await resolveLookup(user('Dawn-Breakers - Chapter 25'), { intent: 'reference', findTitled: async () => GL,
      decisions: { record: (k, d) => seen.push([k, d.chosen]) },
      paragraphsByPn: async () => [],
      headingStarts: async () => [{ id: 1, paragraph_index: 1300, heading: 'His journey to Karbilá', text: 'a' }],
      // front matter is a top section too: rank 25 would be CHAPTER XXIV
      topSections: async () => [{ title: 'INTRODUCTION', start_index: 6, end_index: 90 }, ...Array.from({ length: 26 }, (_, i) => ({ title: `CHAPTER ${['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI'][i]}`, start_index: 100 + i * 50, end_index: 149 + i * 50 }))],
      paragraphsInRange: async (id, a, b) => { asked = [a, b]; return [{ id: 2, paragraph_index: a, heading: 'His journey to Karbilá', text: P }, { id: 3, paragraph_index: a + 1, text: 'More of it.' }]; },
      withLinks: async (h) => h.map((x) => ({ ...x, url: `https://x/db#${x.paragraph_index}` })) });
    expect(asked).toEqual([1300, 1349]);
    expect(r).toMatchObject({ kind: 'reference', label: 'Gleanings from the Writings of Bahá’u’lláh, CHAPTER XXV', passages: [{ paragraph_index: 1300 }, { paragraph_index: 1301 }] });
    expect(seen).toEqual([['lookup:reference', 'section title']]);
  });
  it('a named chapter with no chapter headings still falls back to the display number', async () => {
    const r = await resolveLookup(user('Gleanings section 27'), { intent: 'reference', findTitled: async () => GL, headingStarts: async () => [],
      paragraphsInRange: async () => [], paragraphsByPn: async (id, n) => (String(n) === '27' ? [{ id: 5, paragraph_index: 40, text: P }] : []),
      sectionTable: async () => null, withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/g#40' })) });
    expect(r).toMatchObject({ kind: 'reference', passages: [{ paragraph_index: 40 }] });
  });
  it('a bare title Jev named resolves through the title index (diacritics are the index\'s fold)', async () => {
    let seen;
    const r = await resolveLookup(user('Kitáb-i-Íqán'), { intent: 'book', findTitled: async (c) => { seen = c; return GL; } });
    expect(r.kind).toBe('book');
    expect(seen).toContain('Kitáb-i-Íqán');
  });
  it('Jev said quote but the whole message is a known title and no passage holds the words: the book (the only candidate), Jev not asked', async () => {
    let asked = 0;
    const r = await resolveLookup(user('Epistle to the Son of the Wolf'), { intent: 'quote', findTitled: async () => GL, search: async () => [], pickQuoteOrBook: async () => { asked++; } });
    expect(r.kind).toBe('book');
    expect(asked).toBe(0);
  });
  it('quote intent: a stub document titled with the wording is not a work; the phrase search runs', async () => {
    const STUB = { doc: { id: 9, title: 'Be generous in prosperity', paragraph_count: 2 }, others: [] };
    const r = await resolveLookup(user('"Be generous in prosperity, and thankful in adversity"'), { intent: 'quote', findTitled: async () => STUB,
      search: async () => [{ ...CORE, text: 'Be generous in prosperity, and thankful in adversity. Be a treasure to the poor' }] });
    expect(r.kind).toBe('quote');
  });
  it('a confident Jev reference choice outranks an "unclear" message kind, and the choice is recorded in the turn meta', async () => {
    const seen = []; let closed;
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async (x) => { closed = x; }, fail: async () => {}, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'unclear', confidence: 0.95 }, stance: { choice: 'curious' }, lookup: { choice: 'reference', confidence: 0.99 } }),
      lookup: async (m, o) => ({ kind: 'reference', intent: o.intent, passages: [] }),
      respond: async (a) => { seen.push(a.direction); return { reply: 'r', citations: [], retrieved: [], plan: {}, timings: {} }; } };
    await anisTurn({ messages: user('Gleanings 1'), participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(seen[0]?.lookup?.kind).toBe('reference');
    expect(closed.path.triage.lookup).toEqual({ choice: 'reference', confidence: 0.99 });
  });
  it('a numbered unit too long to quote (a chapter, 40 paragraphs) → the chapter card linked to its start, no writer (11-11)', async () => {
    let responded = 0, card = null;
    const DB = { id: 50, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam' };
    const passages = Array.from({ length: 40 }, (_, i) => ({ id: 900 + i, paragraph_index: 3000 + i, heading: 'CHAPTER XXV: The Báb\'s Imprisonment', text: `p${i}` }));
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, lookup: { choice: 'reference', confidence: 0.99 } }),
      lookup: async () => ({ kind: 'reference', ref: { title: 'Dawn-Breakers', num: 25 }, label: 'The Dawn-Breakers, 25', work: { doc: DB }, passages }),
      sectionAnswer: async ({ sec, doc }) => { card = { sec, doc }; return { reply: `CARD ${sec.title}`, citations: [] }; },
      respond: async () => { responded++; return { reply: 'r', citations: [], retrieved: [], plan: {}, timings: {} }; } };
    const r = await anisTurn({ messages: user('Dawn-Breakers chapter 25'), participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(responded).toBe(0); expect(r.reply).toBe("CARD CHAPTER XXV: The Báb's Imprisonment");
    expect(card.sec).toMatchObject({ doc_id: 50, start_index: 3000, end_index: 3039, paragraphs: 40, first_para_id: 900 });
  });
  it('Jev\'s book strategy (named-work-only) but a reference lookup: the chapter resolves first, the book card is never picked (11-11 live)', async () => {
    let picked = 0, card = null;
    const DB = { id: 50, title: 'The Dawn-Breakers', author: 'Nabíl-i-A‘ẓam' };
    const passages = Array.from({ length: 40 }, (_, i) => ({ id: 900 + i, paragraph_index: 3000 + i, heading: 'CHAPTER XXV', text: `p${i}` }));
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      titleOnly: async () => null, card: async () => null,
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, lookup: { choice: 'reference', confidence: 1 } }),
      strategy: async () => ({ strategy: { choice: 'book', confidence: 0.5, reason: 'named-work-only' }, sides: [], sources: {}, decisions: [], units: { named_work: 'Dawn-Breakers' } }),
      bookPick: async () => { picked++; return { kind: 'work', work: { doc: { id: 99, title: 'THE DAWN-BREAKERS---Chapter XXV' } }, via: 'pick' }; },
      lookup: async () => ({ kind: 'reference', ref: { title: 'Dawn-Breakers', num: 25, unit: 'chapter' }, label: 'The Dawn-Breakers, 25', work: { doc: DB }, passages }),
      sectionAnswer: async ({ sec, doc }) => { card = { sec, doc }; return { reply: `CARD ${sec.title}`, citations: [] }; },
      respond: async () => ({ reply: 'r', citations: [], retrieved: [], plan: {}, timings: {} }) };
    const r = await anisTurn({ messages: user('Dawn-Breakers - Chapter 25'), participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(r.reply).toBe('CARD CHAPTER XXV'); expect(picked).toBe(0); expect(card.sec.doc_id).toBe(50);
  });
  it('quoted words found only in commentary make no quote candidate (Chad 11-03: core literature only)', async () => {
    const famous = [{ ...COMMENTARY, text: `As Bahá’u’lláh wrote: ${P}` }, { ...CORE, collection: 'Pilgrim Notes', book_authority: 7, text: P },
      { ...CORE, collection: 'Media', book_authority: 2, text: P }];
    expect(await resolveLookup(user(`"${P}"`), { intent: 'quote', findTitled: async () => null, search: async () => famous })).toBeNull();
  });
  it('a core match makes the candidate, and commentary holding the same words is left out of it', async () => {
    const hits = [{ ...COMMENTARY, id: 1, text: P }, { ...CORE, id: 2, text: P }];
    const r = await resolveLookup(user(`"${P}"`), { intent: 'quote', findTitled: async () => null, search: async () => hits });
    expect(r).toMatchObject({ kind: 'quote' });
    expect(r.passages.map((h) => h.id)).toEqual([2]);
  });
  it('commentary only, and the words are a commentary book\'s title: no candidate at all (today\'s path), Jev not asked', async () => {
    let asked = 0;
    const BOOK = { doc: { id: 77, title: 'The Earth Is But One Country', author: 'John Huddleston', religion: "Baha'i", collection: "Baha'i Books", book_authority: 5, paragraph_count: 900 }, others: [] };
    const r = await resolveLookup(user('the earth is but one country'), { intent: 'quote', findTitled: async () => BOOK,
      search: async () => [{ ...COMMENTARY, text: P }], pickQuoteOrBook: async () => { asked++; } });
    expect(r).toBeNull();
    expect(asked).toBe(0);
  });
  it('quoted words not in any passage, or no Jev intent, return null (today\'s path)', async () => {
    expect(await resolveLookup(user(P), { intent: 'quote', findTitled: async () => null, search: async () => [{ text: 'mankind citizens earth' }] })).toBeNull();
    expect(await resolveLookup(user('Gleanings'), { findTitled: async () => GL })).toBeNull();
  });
});

describe('codeFormat and writer role', () => {
  it('chooses a template by code', () => {
    const f = codeFormat({ profile: {}, channel: { id: 'web' }, shape: 'quote' });
    expect(f.by).toBe('code');
    expect(f.id).toBeTruthy();
  });
  it('light writer is Haiku', () => {
    expect(modelFor('anis-light-writer')).toMatchObject({ provider: 'anthropic' });
    expect(modelFor('anis-light-writer').model).toMatch(/haiku/);
  });
});

describe('respond with a fast lookup', () => {
  const run = async (lookup, text) => {
    const calls = { plan: 0, format: 0, search: 0, agent: 0, phrases: 0, craft: [] };
    const d = {
      plan: async () => { calls.plan++; return { shape: 'topic' }; },
      chooseFormat: async () => { calls.format++; return { id: 'x', how: '' }; },
      search: async () => { calls.search++; return { passages: [], _plan: {} }; },
      agentCreate: () => { calls.agent++; throw new Error('agent'); },
      phrases: async () => { calls.phrases++; return null; },
      craft: async (a) => { calls.craft.push(a); a.onChunk('ok'); return 'ok'; },
      companion: async () => ({ append: '', plan: {}, offer: false }),
    };
    const t0 = Date.now();
    const r = await anisRespond({ messages: user(text), direction: { stance: 'curious', lookup, engine: undefined }, deps: d });
    return { r, calls, ms: Date.now() - t0 };
  };
  it('quote: no planner, no format LLM, no search, no agent; Haiku writes; under 1 s before the writer', async () => {
    const { r, calls, ms } = await run({ kind: 'quote', phrase: P, passages: [{ text: P, title: 'Gleanings', author: 'Bahá’u’lláh', document_id: 8312, paragraph_index: 117, source_url: 'https://x/g#117' }] }, `"${P}"`);
    expect(calls).toMatchObject({ plan: 0, format: 0, search: 0, agent: 0, phrases: 0 });
    expect(calls.craft).toHaveLength(1);
    expect(calls.craft[0].llm.model).toMatch(/haiku/);
    expect(calls.craft[0].retrieved_quotes[0].text).toBe(P);
    expect(ms).toBeLessThan(1000);
    expect(r.plan.shape).toBe('quote');
  });
  it('without a lookup the old path still plans', async () => {
    const { calls } = await run(undefined, 'what did he say about the earth being one country');
    expect(calls.plan).toBe(1);
  });
});

describe('turn wiring', () => {
  it('runs the lookup only on Jev\'s decision (none or low confidence = no lookup)', async () => {
    const seen = [];
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, lookup: { choice: 'none', confidence: 0.95 } }),
      lookup: async () => { throw new Error('must not run'); },
      respond: async (a) => { seen.push(a.direction); return { reply: 'r', citations: [], retrieved: [], plan: {}, timings: {} }; } };
    await anisTurn({ messages: user('Gleanings'), participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps });
    expect(seen[0].lookup).toBeUndefined();
  });
  it('passes the lookup to respond only for a research route, and skips it when engine is forced', async () => {
    const seen = [];
    const deps = { open: async () => ({ conversationId: 'c', round: 0 }), close: async () => {}, fail: async () => {}, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
      triage: async () => ({ malicious: 0.01, complete: 0.99, stop_request: 0, kind: { choice: 'research', confidence: 0.9 }, stance: { choice: 'curious' }, lookup: { choice: 'book', confidence: 0.9 } }),
      lookup: async (m, o) => (o.intent === 'book' ? { kind: 'book', work: GL } : null),
      respond: async (a) => { seen.push(a.direction); return { reply: 'r', citations: [], retrieved: [], plan: {}, timings: {} }; } };
    const base = { messages: user('Gleanings'), participant: { id: 's' }, clientKey: 's', onEvent: () => {}, deps };
    await anisTurn(base);
    await anisTurn({ ...base, engine: 'agent' });
    expect(seen[0].lookup.kind).toBe('book');
    expect(seen[1].lookup).toBeUndefined();
  });
});

describe('Jev lookup guidance', () => {
  it('states the quoted-words prior as a prior, and the battery holds counter-cases where quotes are not a search', async () => {
    const { LOOKUP_Q, LOOKUP_KINDS } = await import('../../api/lib/assistant/triage.js');
    expect(LOOKUP_Q).toMatch(/strong prior/i);
    expect(LOOKUP_Q).toMatch(/scare quotes/i);
    expect(Object.keys(LOOKUP_KINDS)).toEqual(['none', 'book', 'quote', 'in_work', 'find_passage', 'reference']);
    const { readFileSync } = await import('node:fs');
    const rows = readFileSync(new URL('../quality/questions/anis-lookup-intent.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(rows.filter((r) => /["“]/.test(r.text) && r.lookup === 'none').length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => Object.keys(LOOKUP_KINDS).includes(r.lookup))).toBe(true);
  });
});

describe('triage timeout', () => {
  it('waits long enough for Jev (measured 0.4-1.5 s; the old 700 ms cap failed open on most lookups)', async () => {
    const { triageMessage } = await import('../../api/lib/assistant/triage.js');
    let sig;
    await triageMessage([{ role: 'user', content: 'Gleanings' }], { apiKey: 'k', fetchImpl: async (u, init) => { sig = init.signal; return { ok: true, json: async () => ({ answers: {} }) }; } });
    expect(sig).toBeTruthy();
    // a 1 s Jev answer must still be read (the signal has not fired)
    expect(sig.aborted).toBe(false);
  });
});

describe('numbered works with no number in the text (gate fix 3: "Some Answered Questions 33", "Paris Talks 12")', async () => {
  const { sectionRange } = await import('../../api/lib/assistant/numbering.js');
  const SAQ = { id: 20911, title: 'Some Answered Questions', author: '‘Abdu’l-Bahá', paragraph_count: 788 };
  const PT = { id: 20908, title: 'Paris Talks', author: '‘Abdu’l-Bahá', paragraph_count: 819 };
  it('maps chapter / talk numbers to the edition\'s paragraph range', () => {
    expect(sectionRange(SAQ, 33)).toEqual({ unit: 'chapter', num: 33, from: 355, to: 364 });
    expect(sectionRange(SAQ, 4)).toEqual({ unit: 'chapter', num: 4, from: 40, to: 45 });
    expect(sectionRange(SAQ, 84)).toEqual({ unit: 'chapter', num: 84, from: 775, to: 787 });
    expect(sectionRange(PT, 12)).toEqual({ unit: 'talk', num: 12, from: 149, to: 159 });
    expect(sectionRange(PT, 39)).toMatchObject({ from: 523, to: 548 });
  });
  it('another edition (paragraph count differs) or an out-of-range number gets no range', () => {
    expect(sectionRange({ ...SAQ, paragraph_count: 790 }, 33)).toBeNull();
    expect(sectionRange(SAQ, 85)).toBeNull();
    expect(sectionRange({ title: 'Gleanings', paragraph_count: 788 }, 3)).toBeNull();
  });
  const deps = (doc, others = []) => ({ intent: 'reference', findTitled: async () => ({ doc: others.length ? GL.doc : doc, others }),
    paragraphsByPn: async () => [], headingStarts: async () => [],
    paragraphsInRange: async (id, a, b) => { deps.asked = [id, a, b]; return [{ id: 1, paragraph_index: a, heading: 'The Return', text: '# The Return' },
      { id: 2, paragraph_index: a + 1, text: 'Thou hast asked about the return…' }, { id: 3, paragraph_index: a + 2, text: 'Second.' }]; },
    withLinks: async (h) => h.map((x) => ({ ...x, url: `https://x/${x.doc_id}#${x.paragraph_index}` })) });
  it('"Some Answered Questions 33" resolves to chapter 33\'s opening, heading rows dropped, linked', async () => {
    const d = deps(SAQ);
    const r = await resolveLookup(user('Some Answered Questions 33'), d);
    expect(deps.asked).toEqual([20911, 355, 364]);
    expect(r).toMatchObject({ kind: 'reference', section: { unit: 'chapter', num: 33, from: 355, to: 364 },
      passages: [{ paragraph_index: 356, document_id: 20911, source_url: 'https://x/20911#356' }, { paragraph_index: 357 }] });
  });
  it('"Paris Talks 12" finds the numbered edition among the other copies the title index offers', async () => {
    const r = await resolveLookup(user('Paris Talks 12'), deps(null, [PT]));
    expect(deps.asked).toEqual([20908, 149, 159]);
    expect(r).toMatchObject({ kind: 'reference', work: { doc: PT } });
    expect(r.passages[0]).toMatchObject({ document_id: 20908, title: 'Paris Talks', paragraph_index: 150 });
  });
});

describe('a CORE title that is also a core line: both candidates, Jev chooses ("The Promised Day Is Come")', () => {
  const Q = 'The promised day is come';
  const BOOK = { doc: { id: 77, title: 'The Promised Day Is Come', author: 'Shoghi Effendi', religion: "Baha'i", collection: 'Shoghi Effendi', source_site: 'oceanlibrary.com', book_authority: 7, paragraph_count: 900 }, others: [] };
  const HIT = { ...CORE, id: 3, title: 'Gleanings from the Writings of Bahá’u’lláh', text: `Say: ${Q}, and the Lord of Hosts hath appeared.` };
  const log = () => { const rows = []; return { rows, record: (point, d) => rows.push({ point, ...d }) }; };
  const base = (pick, decisions) => ({ intent: 'quote', findTitled: async () => BOOK, search: async () => [HIT], decisions, pickQuoteOrBook: pick });
  it('both candidates exist: Jev chooses with both in view (the passage), and the choice is logged', async () => {
    let seen; const d = log();
    const r = await resolveLookup(user(Q.toLowerCase()), base(async (m, c) => { seen = c; return { choice: 'quote', confidence: 0.9, distribution: { quote: 0.9, book: 0.1 } }; }, d));
    expect(r).toMatchObject({ kind: 'quote', contested: { book: 77, by: 'jev' } });
    expect(r.passages[0].text).toContain(Q);
    expect(seen.book.work.doc.id).toBe(77);
    expect(seen.quote.passages[0].id).toBe(3);
    expect(d.rows).toEqual([expect.objectContaining({ point: 'lookup:quote-or-book', by: 'jev', chosen: 'quote', options: ['quote', 'book'] })]);
  });
  it('Jev chooses the book: the book', async () => {
    const r = await resolveLookup(user(Q.toLowerCase()), base(async () => ({ choice: 'book', confidence: 0.8 }), log()));
    expect(r).toMatchObject({ kind: 'book', work: BOOK });
  });
  it('Jev gives no answer (timeout) or a weak one: his lookup call (quote) stands, logged as such', async () => {
    for (const pick of [async () => null, async () => ({ choice: 'book', confidence: 0.4 })]) {
      const d = log();
      const r = await resolveLookup(user(Q.toLowerCase()), base(pick, d));
      expect(r.kind).toBe('quote');
      expect(d.rows[0]).toMatchObject({ by: 'code', chosen: 'quote' });
    }
  });
  it('pickQuoteOrBook sends both candidates to Jev as a typed choice and reads his answer', async () => {
    let body;
    const fetchImpl = async (u, o) => { body = JSON.parse(o.body); return { ok: true, json: async () => ({ answers: { target: { choice: 'quote', confidence: 0.92 } } }) }; };
    const a = await pickQuoteOrBook(user(Q.toLowerCase()), { book: { kind: 'book', work: BOOK }, quote: { kind: 'quote', passages: [HIT] } }, { fetchImpl, apiKey: 'k' });
    expect(a).toMatchObject({ choice: 'quote', confidence: 0.92 });
    expect(body.questions.target.type).toBe('choice');
    expect(body.questions.target.criteria.book).toContain('The Promised Day Is Come');
    expect(body.questions.target.criteria.quote).toContain('Lord of Hosts');
  });
  it('pickQuoteOrBook: a timeout is retried within budget, then reported through onJev and returns null', async () => {
    const seen = [];
    const fetchImpl = async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; };
    const a = await pickQuoteOrBook(user('x'), { book: { work: BOOK }, quote: { passages: [HIT] } }, { fetchImpl, apiKey: 'k', onJev: (i) => seen.push(i) });
    expect(a).toBeNull();
    expect(seen[0]).toMatchObject({ call: 'lookup' });
    expect(seen[0].timeouts.length).toBe(2);
  });
});

describe('a commentary title never competes with a core line (Chad 11-03: Adamson\'s "The Earth Is But One Country")', () => {
  const ADAMSON = { doc: { id: 78, title: 'The Earth Is But One Country', author: 'Hugh C. Adamson', religion: "Baha'i", collection: "Baha'i Books", book_authority: 5, paragraph_count: 900 }, others: [] };
  const GLEANINGS = { ...CORE, id: 3, title: 'Gleanings from the Writings of Bahá’u’lláh', text: `${P} Let not a man glory…` };
  it('"the earth is but one country": the quote only, Bahá\'u\'lláh\'s passage, Jev not asked, nothing contested', async () => {
    let asked = 0;
    const r = await resolveLookup(user('the earth is but one country'), { intent: 'quote', findTitled: async () => ADAMSON,
      search: async () => [GLEANINGS], pickQuoteOrBook: async () => { asked++; } });
    expect(r).toMatchObject({ kind: 'quote', passages: [{ id: 3, author: 'Bahá’u’lláh' }] });
    expect(r.contested).toBeUndefined();
    expect(asked).toBe(0);
  });
  it('an explicit book request (Jev: book) still finds the commentary book', async () => {
    const r = await resolveLookup(user('do you have the book The Earth Is But One Country?'), { intent: 'book', findTitled: async () => ADAMSON });
    expect(r).toMatchObject({ kind: 'book', work: ADAMSON });
  });
  it('a work with no authority on the row is judged by getAuthority on its author and shelf (no fixture number)', async () => {
    const noNum = { doc: { ...ADAMSON.doc, book_authority: undefined }, others: [] };
    const r = await resolveLookup(user('the earth is but one country'), { intent: 'quote', findTitled: async () => noNum, search: async () => [GLEANINGS],
      pickQuoteOrBook: async () => { throw new Error('not asked'); } });
    expect(r.kind).toBe('quote');
  });
});
