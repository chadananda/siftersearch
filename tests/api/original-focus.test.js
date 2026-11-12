// `original` with a work in focus (11-12, conv_34e66ed8): units.named_work = the focus id, tree o1o reads the opening (only when no topic was asked), opening_lookup returns the first n in order.
import { describe, it, expect, vi } from 'vitest';
import { anisTurn } from '../../api/lib/assistant/turn.js';
import { emptyState, applyPatch } from '../../api/lib/assistant/units.js';
import { workPatch } from '../../api/lib/assistant/turn.js';
import { makeStrikes } from '../../api/lib/assistant/strikes.js';
import * as tools from '../../api/lib/assistant/tools.js';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';

const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const state = applyPatch(emptyState(), workPatch({ turn: 0, strategy: 'book', id: 777, title: 'Tafsir-i-Surat al-Kawthar' }), { turn: 0 });
const THREAD = [{ role: 'user', content: 'tafsir' }, { role: 'assistant', content: 'card' }, { role: 'user', content: 'give me the first couple paragraphs with side-by-side translation' }];
const turn = (units) => {
  const seen = [];
  const d = { titleOnly: async () => null, triage: async () => null,
    strategy: async () => ({ strategy: { choice: 'original', confidence: 0.74 }, units, sides: [], refersBack: false, by: 'jev' }),
    state: { load: async () => state, append: async () => {} }, lookup: vi.fn(async () => null), bookPick: async () => null,
    respond: async (a) => { seen.push(a); return { reply: 'ok', citations: [], retrieved: [], plan: { shape: 'topic' }, timings: {} }; },
    open: async () => ({ conversationId: 'c', round: 1 }), close: async () => {}, fail: async () => {}, card: async () => null, outputCheck: async () => 0.01, strikes: makeStrikes(), sleep: async () => {} };
  return { seen, run: () => anisTurn({ messages: [...THREAD], participant: { id: 's', authed: true }, clientKey: 's', onEvent: () => {}, deps: d }) };
};
describe('original: the work in focus', () => {
  it('no work named → named_work = the focus id, decision recorded', async () => {
    const h = turn({}); await h.run();
    expect(h.seen[0].direction.strategy.units.named_work).toBe(777);
    expect(h.seen[0].direction.decisions.list().map((x) => x.point)).toContain('original:focus');
  });
  it('a work named this turn is kept', async () => {
    const h = turn({ named_work: 'Gleanings' }); await h.run();
    expect(h.seen[0].direction.strategy.units.named_work).toBe('Gleanings');
  });
});
const P = (i) => ({ id: 100 + i, document_id: 777, paragraph_index: i, text: `para ${i}`, title: 'T', language: 'ar' });
async function run(units, t) {
  const g = graphFor('original', 2);
  const s = { choice: {}, ctx: {}, trace: [], question: 'q', messages: [], tools: { fused_search: async () => ({ passages: [] }), reference: async () => ({ passages: [] }), context_lookup: async () => ({ passages: [] }), edition_lookup: async () => ({ passages: [], family: [], self: null, missing_language: null }), ...t }, templates: TPL, onEvent: () => {} };
  s.units = entryUnits(g, {}, { query: 'q', question: 'q', channel: { id: 'site-chat' }, messages: [] }); Object.assign(s.units, units);
  await runGraph(g, s); return s;
}
describe('original tree: a named work with no topic → its opening', () => {
  it('o1 none → o1r none → o1o → o3', async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1), P(2)] }));
    const s = await run({ named_work: 777 }, { opening_lookup });
    expect(opening_lookup).toHaveBeenCalledWith({ document_id: 777, n: 3 }, expect.anything());
    const path = s.trace.map((x) => x.node);
    expect(path).toEqual(expect.arrayContaining(['o1o', 'o3'])); expect(path).not.toContain('o1w');
  });
  it('a work named by title (Jev’s words) with work_place opening → the opening by that title, even with a topic', async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1), P(2)] }));
    const s = await run({ named_work: 'Surah of Kawthar', topic: 'the first couple paragraphs', work_place: 'opening' }, { opening_lookup });
    expect(opening_lookup).toHaveBeenCalledWith({ work: 'Surah of Kawthar', n: 3, linked: true, said: expect.any(String) }, expect.anything());
    expect(s.trace.map((x) => x.node)).not.toContain('o1w');
  });
  it('with a topic the work is searched (o1w); a topic not found there is an absence, never the opening served instead', async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1)] }));
    const s = await run({ named_work: 777, topic: 'the station of the martyrs' }, { opening_lookup });
    const path = s.trace.map((x) => x.node);
    expect(path).toContain('o1w'); expect(opening_lookup).not.toHaveBeenCalled();
  });
  it("the opening and its editions are marked named_read: own-source keeps them (11-12 ahmad-sbs: the authorized English traded for Hofman's biography)", async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1), P(2)] }));
    const edition_lookup = vi.fn(async () => ({ passages: [{ id: 900, document_id: 888, paragraph_index: 1, text: 'نص', language: 'ar' }], family: [1], self: null, missing_language: null }));
    const s = await run({ named_work: 777 }, { opening_lookup, edition_lookup });
    expect(s.out.passages.filter((x) => [101, 900].includes(x.id)).map((x) => [x.id, x.named_read])).toEqual([[101, true], [900, true]]);
    expect(edition_lookup.mock.calls[0][0]).toMatchObject({ paragraph_id: 101, paragraph_ids: [102] });   // every opening paragraph gets its original, not verse 1 alone
    const { preferOwnWork } = await import('../../api/lib/assistant/own-source.js');
    const hosted = { ...P(1), language: 'en', author: "Bahá'u'lláh", book_author: "Bahá'u'lláh", title: 'Tablet of Ahmad (Arabic)', source_url: 'https://bahai-library.com/x', text: 'He is the King, the All-Knowing, the Wise! Lo, the Nightingale of Paradise singeth', named_read: true };
    const bio = { id: 5, document_id: 8282, title: 'The Prince of Peace', author: 'David Hofman', book_author: 'David Hofman', text: hosted.text };
    const r = await preferOwnWork([hosted], { search: async () => [bio], shape: (h) => h, keep: (p) => !!p.named_read });
    expect(r.swapped).toEqual([]);
  });
  it('no named work → opening never called', async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1)] }));
    await run({}, { opening_lookup }); expect(opening_lookup).not.toHaveBeenCalled();
  });
});
describe('opening_lookup', () => {
  const deps = { encumberedAmong: async () => new Set(), getParagraphs: vi.fn(async (d, o) => [1, 2, 3, 4, 5].slice(0, o.limit).map((i) => ({ id: i, paragraph_index: i, text: `p${i}` }))), getLinkMeta: async () => new Map([[9, { title: 'Book' }]]), withLinks: async (r) => r.map(() => ({ url: null })) };
  it('first n prose paragraphs in order; a copyrighted book gives none', async () => {
    const r = await tools.run('opening_lookup', { document_id: 9, n: 2 }, { deps });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([1, 2]); expect(deps.getParagraphs.mock.calls[0][1]).toMatchObject({ proseOnly: true, offset: 0 });
    expect(await tools.run('opening_lookup', { document_id: 9 }, { deps: { ...deps, encumberedAmong: async () => new Set([9]) } })).toEqual({ passages: [], copyright: true });
  });
  it('a title is resolved the way a search’s work filter is; an unknown title is an empty, honest result', async () => {
    const r = await tools.run('opening_lookup', { work: 'Surah of Kawthar', n: 1 }, { deps: { ...deps, findTitled: async () => ({ doc: { id: 9 } }) } });
    expect(r.passages.map((p) => p.document_id)).toEqual([9]);
    expect(await tools.run('opening_lookup', { work: 'No Such Book' }, { deps: { ...deps, findTitled: async () => null } })).toEqual({ passages: [], copyright: false });
  });
  it('the canonical "… of <author>" edition competes with a bare-titled copy (11-12: "Hidden Words" opened a bahai-library index page)', async () => {
    const findTitled = vi.fn(async () => ({ doc: { id: 9 } }));
    await tools.run('opening_lookup', { work: 'Hidden Words', n: 1 }, { deps: { ...deps, findTitled } });
    expect(findTitled).toHaveBeenCalledWith(['Hidden Words'], expect.objectContaining({ byline: true }));
  });
  it('linked: of a title’s copies, the first whose opening is aligned to an original or translation (11-12 Tablet of Aḥmad)', async () => {
    const rankTitled = async () => ({ sorted: [{ id: 1616 }, { id: 924540 }] });
    const getParagraphs = vi.fn(async (d) => [{ id: d * 10, paragraph_index: 0, text: `t${d}` }]);
    const resolveLinks = async (ids) => new Map(ids.map((i) => [i, i === 9245400 ? { translations: [{ id: 1 }] } : {}]));
    const r = await tools.run('opening_lookup', { work: 'Tablet of Aḥmad', n: 1, linked: true }, { deps: { ...deps, getParagraphs, rankTitled, resolveLinks, getLinkMeta: async () => new Map() } });
    expect(r.passages.map((p) => p.document_id)).toEqual([924540]);
    const none = await tools.run('opening_lookup', { work: 'Tablet of Aḥmad', n: 1, linked: true }, { deps: { ...deps, getParagraphs, rankTitled, resolveLinks: async () => new Map(), getLinkMeta: async () => new Map() } });
    expect(none.passages.map((p) => p.document_id)).toEqual([1616]);
  });
  it('an opening skips the page\'s own notes (11-12 Hidden Words: "(Click here…)")', async () => {
    const getParagraphs = async () => ['(Click here to jump to a specific page (in a lightly formatted version).)', '(Click here to see a copy which is interlinked.)', 'He is the Glory of Glories.', 'O SON OF SPIRIT! My first counsel is this: Possess a pure, kindly and radiant heart.']
      .map((text, i) => ({ id: i + 1, paragraph_index: i, text }));
    const r = await tools.run('opening_lookup', { document_id: 5, n: 2 }, { deps: { ...deps, getParagraphs, getLinkMeta: async () => new Map() } });
    expect(r.passages.map((p) => p.paragraph_index)).toEqual([2, 3]);
  });
  it('linked: a copy whose parenthetical the reader DID say comes first (11-12 "first three Arabic Hidden Words" opened a bahai-library "Click here…" page)', async () => {
    const rankTitled = async () => ({ sorted: [{ id: 28628, title: 'Hidden Words' }, { id: 927205, title: 'The Hidden Words' }, { id: 20750, title: 'The Hidden Words (Arabic)' }] });
    const getParagraphs = vi.fn(async (d) => [{ id: d * 10, paragraph_index: 0, text: `t${d}` }]);
    const r = await tools.run('opening_lookup', { work: 'Hidden Words', n: 1, linked: true, said: 'Show me the first three Arabic Hidden Words in Arabic' }, { deps: { ...deps, getParagraphs, rankTitled, resolveLinks: async () => new Map(), getLinkMeta: async () => new Map() } });
    expect(r.passages.map((p) => p.document_id)).toEqual([20750]);
  });
  it('linked: a copy whose parenthetical names what the reader never said comes after the rest (11-12 "Tablet of Aḥmad (Persian)", "The Hidden Words (Persian)")', async () => {
    const rankTitled = async () => ({ sorted: [{ id: 1616, title: 'Tablet of Ahmad (Lawh-i-Ahmad)' }, { id: 925939, title: 'Tablet of Aḥmad (Persian)' }, { id: 924540, title: 'Tablet of Aḥmad' }] });
    const getParagraphs = vi.fn(async (d) => [{ id: d * 10, paragraph_index: 0, text: `t${d}` }]);
    const resolveLinks = async (ids) => new Map(ids.map((i) => [i, i === 16160 ? {} : { translations: [{ id: 1 }] }]));
    const r = await tools.run('opening_lookup', { work: 'Tablet of Ahmad', n: 1, linked: true }, { deps: { ...deps, getParagraphs, rankTitled, resolveLinks, getLinkMeta: async () => new Map() } });
    expect(r.passages.map((p) => p.document_id)).toEqual([924540]);
    const hw = async () => ({ sorted: [{ id: 2, title: 'The Hidden Words (Persian)' }, { id: 3, title: 'The Hidden Words of Bahá’u’lláh', author: 'Bahá’u’lláh' }] });
    const linkedPersian = async (ids) => new Map(ids.map((i) => [i, i === 20 ? { translations: [{ id: 1 }] } : {}]));
    const a = await tools.run('opening_lookup', { work: 'Hidden Words', n: 1, linked: true, said: 'the first three Arabic Hidden Words' }, { deps: { ...deps, getParagraphs, rankTitled: hw, resolveLinks: linkedPersian, getLinkMeta: async () => new Map() } });
    expect(a.passages.map((p) => p.document_id)).toEqual([3]);
    const p = await tools.run('opening_lookup', { work: 'Hidden Words', n: 1, linked: true, said: 'the Persian Hidden Words' }, { deps: { ...deps, getParagraphs, rankTitled: hw, resolveLinks: linkedPersian, getLinkMeta: async () => new Map() } });
    expect(p.passages.map((x) => x.document_id)).toEqual([2]);
  });
});
