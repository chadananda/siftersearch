// The live path of a follow-up (11-09): Jev's refers_back reaches the ACTIVE executors (strategies.js, not only the candidate trees) and turn.js
// (no quote lookup, no unclear); a work's title link is its publisher (OceanLibrary) page, never siftersearch.com. Jev mocked, no spend.
import { describe, it, expect } from 'vitest';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { runStrategy, withAnchors } from '../../api/lib/assistant/strategies.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import { decisionLog } from '../../api/lib/assistant/decision-log.js';
import { emptyState, applyPatch } from '../../api/lib/assistant/units.js';
import { workUrl } from '../../api/lib/source-links.js';
import { workLead, linkTitles } from '../../api/lib/assistant/work-request.js';

const Q1 = 'My grandmother passed away. Will I recognise her in the next world?';
const R1 = 'Abdu\'l-Bahá says [*Selections*](https://oceanlibrary.com/a#1) and [*Tablets*](https://oceanlibrary.com/b#2).';
const FOLLOW = ['the second one', 'what are the actual words?', 'how does that compare with the Gita?'];
const thread = (q) => [{ role: 'user', content: Q1 }, { role: 'assistant', content: R1 }, { role: 'user', content: q }];
const state = applyPatch(emptyState(), { thread: [{ turn: 0, strategy: 'understanding', topic: Q1, found_outcome: 'several' }], given: [{ turn: 0, kind: 'passage', ref: '20910:42' }, { turn: 0, kind: 'passage', ref: '20915:7' }] }, { turn: 0 });

describe('turn level: Jev said the message refers back (the live route, Jev mocked)', () => {
  const base = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' } };
  const feats = { first: false, turn: 2, words: 4, short: true, quoted: 0, script: null };
  const harness = (triage, strat) => {
    const calls = { respond: [], lookup: [] };
    const deps = {
      open: async () => ({ conversationId: 'conv_1', round: 1 }), close: async () => {}, fail: async () => {},
      triage: async () => triage, strategy: async () => strat, state: { load: async () => state, append: async () => {} },
      lookup: async (m, o) => { calls.lookup.push(o); return { kind: 'quote', passages: [{ text: 'literal' }] }; },
      respond: async (a) => { calls.respond.push(a); return { reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      resolve: async () => ({ query: 'glued by the resolver', by: 'haiku' }), card: async () => ({ text: 'a reader', data: {} }),
      outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {},
    };
    return { calls, run: (m) => anisTurn({ messages: m, participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps }) };
  };
  const strat = (choice, extra = {}) => ({ strategy: { choice, confidence: 0.9 }, sides: [], sources: {}, decisions: [], refersBack: true, ...extra });

  it('"what are the actual words?": Jev also read it as a quote lookup → NO literal lookup; the search is the last topic', async () => {
    const h = harness({ ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, lookup: { choice: 'quote', confidence: 0.9 }, features: feats }, strat('understanding'));
    await h.run(thread(FOLLOW[1]));
    expect(h.calls.lookup).toHaveLength(0);
    expect(h.calls.respond[0].direction.query).toBe(Q1);
    expect(h.calls.respond[0].direction.strategy.refersBack).toBe(true);
  });
  it('"the second one": an unclear verdict does not stand when Jev says it refers to the previous reply', async () => {
    const h = harness({ ...base, kind: { choice: 'unclear', confidence: 0.8 }, outcome: { choice: 'ask_back', confidence: 0.4 }, features: feats }, strat('comparison'));
    const r = await h.run(thread(FOLLOW[0]));
    expect(r.status).toBe('answered'); expect(h.calls.respond).toHaveLength(1);
    expect(h.calls.respond[0].direction.query).toBe(Q1);
  });
  it('"how does that compare with the Gita?": the direction carries the choice (sides, the Gita as Hindu\'s book) and the last topic', async () => {
    const h = harness({ ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, features: feats }, strat('comparison', { sides: ['Bahá’í', 'Hindu'], sources: { Hindu: 'Bhagavad Gita' } }));
    await h.run(thread(FOLLOW[2]));
    const d = h.calls.respond[0].direction;
    expect(d.query).toBe(Q1); expect(d.strategy.sources).toEqual({ Hindu: 'Bhagavad Gita' });
  });
  it('without refersBack nothing changes: the lookup runs, the resolver\'s query stands', async () => {
    const h = harness({ ...base, kind: { choice: 'research', confidence: 0.9 }, outcome: { choice: 'search', confidence: 0.9 }, lookup: { choice: 'quote', confidence: 0.9 }, features: feats }, strat('understanding', { refersBack: undefined }));
    await h.run(thread(FOLLOW[1]));
    expect(h.calls.lookup).toHaveLength(1); expect(h.calls.respond[0].direction.query).toBe('glued by the resolver');
  });
});

describe('executor level: the active v1 strategies use the last topic, not the glued follow-up', () => {
  it('comparison: every side search is the last topic; the Gita is named as the second side\'s book; the glue is not used', async () => {
    const queries = [], decisions = decisionLog([]);
    const search = async (a) => { queries.push(a.query); return { passages: [] }; };
    const glued = `${Q1} how does that compare with the Gita?`;
    await runStrategy({ strategy: { choice: 'comparison', confidence: 0.9 }, refersBack: true, sides: ['Alpha', 'Beta'], sources: { Beta: 'Bhagavad Gita' } },
      { messages: thread(FOLLOW[2]), question: FOLLOW[2], query: glued, search, state, profile: {}, decisions, sourceTools: { search: async () => ({ passages: [] }) } });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.includes(Q1) && !q.includes('Gita'))).toBe(true);
    const side = decisions.list().find((d) => d.point === 'side:Beta');
    expect(side?.saw?.source).toBe('Bhagavad Gita');
    expect(decisions.list().some((d) => d.point === 'refers-back:query')).toBe(true);
  });
  it('withAnchors: the last turn\'s cited passages lead and are not repeated; a failed load costs only itself', async () => {
    const tools = { context_lookup: async (i) => (i.document_id === 20915 ? Promise.reject(new Error('down')) : { passages: [{ document_id: i.document_id, paragraph_index: i.paragraph_index, text: 'the words' }] }) };
    const out = await withAnchors([{ document_id: 20910, paragraph_index: 42, text: 'dup' }, { document_id: 1, paragraph_index: 1, text: 'other' }], state, { tools }, decisionLog([]));
    expect(out.map((p) => `${p.document_id}:${p.paragraph_index}`)).toEqual(['20910:42', '1:1']);
    expect(out[0].anchor).toBe(true);
  });
});

describe('title links: the publisher page, never siftersearch.com', () => {
  const ocean = { id: 21310, title: 'God Passes By', author: 'Shoghi Effendi', religion: 'Baha\'i', collection: 'Core', slug: 'god-passes-by', source_url: 'https://oceanlibrary.com/god-passes-by/' };
  const bare = { id: 20910, title: 'Selections from the Writings of ‘Abdu’l-Bahá', author: '‘Abdu’l-Bahá', religion: 'Baha\'i', collection: 'Core', slug: 'selections' };
  it('workUrl: OceanLibrary when the doc has it; our library reader when it has no online source (Chad 11-09)', () => {
    expect(workUrl(ocean)).toBe('https://oceanlibrary.com/god-passes-by/');
    expect(workUrl(bare)).toMatch(/^https:\/\/siftersearch\.com\/library\//);
  });
  it('linkTitles links an italic title to its online source, else to our library reader, and counts', async () => {
    const find = async (t) => (/God Passes/.test(t) ? { doc: ocean } : { doc: bare });
    const r = await linkTitles('See *God Passes By* and *Selections from the Writings*.', { find });
    expect(r.text).toMatch(/^See \[\*God Passes By\*\]\(https:\/\/oceanlibrary\.com\/god-passes-by\/\) and \[\*Selections from the Writings\*\]\(https:\/\/siftersearch\.com\/library\//);
    expect(r.linked).toBe(2);
  });
  it('workLead (the book asked for) links OceanLibrary when it has it, else our library reader', () => {
    expect(workLead({ doc: bare, others: [] })).toMatch(/\]\(https:\/\/siftersearch\.com\/library\//);
    expect(workLead({ doc: ocean })).toMatch(/\[\*God Passes By\*\]\(https:\/\/oceanlibrary\.com\/god-passes-by\/\)/);
  });
});

describe('work links resolve the online publisher (11-09)', () => {
  const bare = { id: 20910, title: 'Selections from the Writings', author: 'A', religion: 'Baha\'i', collection: 'Core', slug: 'selections' };
  const gut = { id: 7, title: 'Moby', author: 'M', encumbered: 0 };
  const urlOf = (d) => (d.id === 7 ? 'https://gutenberg.org/ebooks/2701' : workUrl(d));
  it('workLead links Gutenberg when link meta has it, else the library reader', () => {
    expect(workLead({ doc: gut, others: [bare] }, urlOf)).toMatch(/\[\*Moby\*\]\(https:\/\/gutenberg\.org\/ebooks\/2701\)/);
    expect(workLead({ doc: gut, others: [bare] }, urlOf)).toMatch(/\]\(https:\/\/siftersearch\.com\/library\//);
  });
  it('linkTitles uses resolved links, falling back to the reader', async () => {
    const find = async (t) => ({ doc: /Moby/.test(t) ? gut : bare });
    const links = async () => new Map([[7, 'https://gutenberg.org/ebooks/2701']]);
    const r = await linkTitles('See *Moby* and *Selections from the Writings*.', { find, links });
    expect(r.text).toMatch(/\[\*Moby\*\]\(https:\/\/gutenberg\.org\/ebooks\/2701\)/);
    expect(r.text).toMatch(/\(https:\/\/siftersearch\.com\/library\//);
  });
});
