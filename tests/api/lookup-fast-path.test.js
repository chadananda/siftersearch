// Lookups fast path (W1): book / quoted words / numbered reference resolved by code, no agent/planner/format call, light writer.
import { describe, it, expect } from 'vitest';
import { parseReference, headingNumber, byHeadingNumber, holds, resolveLookup } from '../../api/lib/assistant/lookup.js';
import { anisRespond } from '../../api/lib/assistant/respond.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { codeFormat } from '../../api/lib/assistant/formats.js';
import { modelFor } from '../../api/lib/model-roles.js';

const GL = { doc: { id: 8312, title: 'Gleanings from the Writings of Bahá’u’lláh', author: 'Bahá’u’lláh', religion: "Baha'i" }, score: 1 };
const P = 'The earth is but one country, and mankind its citizens.';
const user = (content) => [{ role: 'user', content }];

describe('parsing', () => {
  it('reads a numbered reference', () => {
    expect(parseReference('Gleanings 27')).toEqual({ title: 'Gleanings', num: 27 });
    expect(parseReference('Hidden Words no. 12')).toEqual({ title: 'Hidden Words', num: 12 });
    expect(parseReference('Gleanings section CXXVII')).toEqual({ title: 'Gleanings', num: 127 });
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
  it('a reference resolves to exactly one paragraph with its link', async () => {
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference',
      findTitled: async () => GL, paragraphsByPn: async (id, n) => [{ id: 5, paragraph_index: 40, text: P, n }],
      withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/g#40' })) });
    expect(r.kind).toBe('reference');
    expect(r.passages[0]).toMatchObject({ source_url: 'https://x/g#40', title: GL.doc.title });
  });
  it('a section number also tries the Roman pn (Gleanings 27 → XXVII)', async () => {
    const asked = [];
    const r = await resolveLookup(user('Gleanings 27'), { intent: 'reference',
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
    const hits = [{ text: 'mankind its citizens and the earth' }, { text: `Know that ${P}` }];
    const r = await resolveLookup(user(`"${P}"`), { intent: 'quote', findTitled: async () => null, search: async () => hits });
    expect(r.kind).toBe('quote');
    expect(r.passages[0].text).toContain(P);
  });
  it('a reference on a work with no pn maps onto its chapter heading', async () => {
    const r = await resolveLookup(user('Some Answered Questions 33'), { intent: 'reference', findTitled: async () => GL, paragraphsByPn: async () => [],
      headingStarts: async () => [{ id: 1, paragraph_index: 3, heading: '32. A', text: 'a' }, { id: 2, paragraph_index: 9, heading: '33. B', text: P }],
      withLinks: async (h) => h.map((x) => ({ ...x, url: 'https://x/saq#9' })) });
    expect(r).toMatchObject({ kind: 'reference', passages: [{ paragraph_index: 9, source_url: 'https://x/saq#9' }] });
  });
  it('a bare title Jev named resolves through the title index (diacritics are the index\'s fold)', async () => {
    let seen;
    const r = await resolveLookup(user('Kitáb-i-Íqán'), { intent: 'book', findTitled: async (c) => { seen = c; return GL; } });
    expect(r.kind).toBe('book');
    expect(seen).toContain('Kitáb-i-Íqán');
  });
  it('Jev said quote but the whole message is a known title: the book wins (resolver check), with no search', async () => {
    let searched = 0;
    const r = await resolveLookup(user('Epistle to the Son of the Wolf'), { intent: 'quote', findTitled: async () => GL, search: async () => { searched++; return []; } });
    expect(r.kind).toBe('book');
    expect(searched).toBe(0);
  });
  it('quote intent: a stub document titled with the wording is not a work; the phrase search runs', async () => {
    const STUB = { doc: { id: 9, title: 'Be generous in prosperity', paragraph_count: 2 }, others: [] };
    const r = await resolveLookup(user('"Be generous in prosperity, and thankful in adversity"'), { intent: 'quote', findTitled: async () => STUB,
      search: async () => [{ text: 'Be generous in prosperity, and thankful in adversity. Be a treasure to the poor' }] });
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
    expect(Object.keys(LOOKUP_KINDS)).toEqual(['none', 'book', 'quote', 'reference']);
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
