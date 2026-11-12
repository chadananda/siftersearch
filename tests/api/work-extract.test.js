// work-extract.js: a selection made FROM one work (Chad 11-12, the Tablets of the Divine Plan prayers table).
import { describe, it, expect } from 'vitest';
import { extractFromWork, extractReply, sectionAt, pickChunk } from '../../api/lib/assistant/work-extract.js';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState } from '../../api/lib/assistant/units.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';

const rows = [
  { id: 1, paragraph_index: 0, text: 'Tablet to the Northeastern States', heading: 'Tablet 1' },
  { id: 2, paragraph_index: 1, text: 'O ye apostles of Bahá’u’lláh! May my life be sacrificed for you!', heading: 'Tablet 1' },
  { id: 3, paragraph_index: 2, text: 'O Thou incomparable God! O Thou Lord of the Kingdom!', heading: 'Tablet 1' },
  { id: 4, paragraph_index: 3, text: 'Thou art the Powerful, the Mighty.', heading: 'Tablet 1' },
  { id: 5, paragraph_index: 4, text: 'O God, my God! Thou seest how black darkness is enshrouding all regions', heading: 'Tablet 2' },
];
const secs = [{ title: 'Tablet 1', start_index: 0, end_index: 3, level: 1 }, { title: 'Tablet 2', start_index: 4, end_index: 4, level: 1 }];
const msgs = [{ role: 'user', content: 'Do you have the Tablets of the Divine Plan?' }, { role: 'assistant', content: 'Yes …' }, { role: 'user', content: 'can you extract out just the prayers and give me a table of links to each?' }];

describe('work-extract', () => {
  it('reads the whole work, keeps the picked pieces, and builds a linked table by section', async () => {
    const complete = async () => ({ content: '{"kind":"prayers","show":"table","items":[{"from":2,"to":3,"label":"O Thou incomparable God!"},{"from":4,"to":4,"label":"O God, my God!"},{"from":99,"to":99,"label":"not in the work"}]}' });
    const got = await extractFromWork({ messages: msgs, doc: { id: 7, title: 'Tablets of the Divine Plan' }, deps: { paragraphTexts: async () => rows, sectionsOf: async () => secs, complete,
      withLinks: async (h) => h.map((x) => ({ ...x, url: `https://oceanlibrary.com/x#${x.paragraph_index}` })) } });
    expect(got.result.total).toBe(2);
    expect(got.reply).toMatch(/^\*\*2 prayers\*\* in \*Tablets of the Divine Plan\*/);
    expect(got.reply).toContain('| 1 | Tablet 1 | [O Thou incomparable God!](https://oceanlibrary.com/x#2) |');
    expect(got.reply).toContain('| 2 | Tablet 2 | [O God, my God!](https://oceanlibrary.com/x#4) |');
    expect(got.result.passages[0].text).toContain('Thou art the Powerful');   // the piece spans its paragraphs
  });
  it('nothing fits → null (the turn researches)', async () => {
    const got = await extractFromWork({ messages: msgs, doc: { id: 7, title: 'T' }, deps: { paragraphTexts: async () => rows, complete: async () => ({ content: '{"items":[]}' }) } });
    expect(got).toBeNull();
  });
  it('texts are written out in full when asked for', () => {
    const r = extractReply({ title: 'T', kind: 'prayers', show: 'texts', pieces: [{ label: 'P', section: 'S', url: 'u', rows: [{ text: 'a' }, { text: 'b' }] }] });
    expect(r).toContain('> a\n>\n> b');
    expect(r).toContain('[*T*, S](u)');
  });
  it('bad JSON from the picker is no items, never a throw', async () => {
    expect((await pickChunk('x', 'T', rows, { complete: async () => ({ content: 'sorry' }) })).items).toEqual([]);
  });
  it('sectionAt takes the deepest section holding the paragraph', () => {
    expect(sectionAt([...secs, { title: 'Part', start_index: 0, end_index: 9, level: 0 }], 2)).toBe('Tablet 1');
  });
});

describe('the turn: Jev\'s from_work lookup', () => {
  const turn = (extract) => {
    const seen = { respond: [] };
    const tri = { malicious: 0.01, complete: 0.99, stop_request: 0, stance: { choice: 'curious' }, kind: { choice: 'research', confidence: 0.9 }, lookup: { choice: 'from_work', confidence: 0.9 },
      outcome: { choice: 'search', confidence: 0.9 }, features: { first: false, turn: 1, words: 14, short: false } };
    const strat = { strategy: { choice: 'compilation', confidence: 0.7 }, refersBack: true, units: { named_work: 'Tablets of the Divine Plan' } };
    const d = { titleOnly: async () => null, triage: async () => tri, strategy: async () => strat, state: { load: async () => emptyState(), append: async () => {} },
      lookup: async () => null, bookPick: async () => ({ kind: 'work', work: { doc: { id: 7, title: 'Tablets of the Divine Plan' } }, via: 'pick' }), extractFromWork: extract,
      respond: async (a) => { seen.respond.push(a); return { reply: 'built', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
      open: async () => ({ conversationId: 'c', round: 1 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
    return { seen, run: () => anisTurn({ messages: msgs, participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: d }) };
  };
  it('the selection is made from the work → the table, no research', async () => {
    const h = turn(async ({ doc }) => ({ result: { query: 'prayers', mode: 'extract', total: 1, passages: [] }, reply: `**1 prayer** in *${doc.title}*:`, work: doc }));
    const r = await h.run();
    expect(r.reply).toBe('**1 prayer** in *Tablets of the Divine Plan*:');
    expect(h.seen.respond).toHaveLength(0);
  });
  it('nothing could be made → Unmatched (the strategy builder) with the work still named, never Jev\'s library-wide pick', async () => {
    const h = turn(async () => null);
    await h.run();
    const s = h.seen.respond[0].direction.strategy;
    expect(s.strategy.choice).toBe('unmatched');
    expect(s.strategy.was).toBe('compilation');
    expect(s.units.named_work).toBe('Tablets of the Divine Plan');
  });
});
