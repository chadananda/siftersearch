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
  it('with a topic the work is searched (o1w); a topic not found there is an absence, never the opening served instead', async () => {
    const opening_lookup = vi.fn(async () => ({ passages: [P(1)] }));
    const s = await run({ named_work: 777, topic: 'the station of the martyrs' }, { opening_lookup });
    const path = s.trace.map((x) => x.node);
    expect(path).toContain('o1w'); expect(opening_lookup).not.toHaveBeenCalled();
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
});
