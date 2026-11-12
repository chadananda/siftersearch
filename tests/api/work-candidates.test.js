// Names are candidates, Jev picks (11-11 Kawthar): document_search returns CLOSE titles when nothing matches well; a sūra NAME is no identity —
// the original tree puts the library's works for the message to Jev beside it. Numbered references ("Sura 108") never ask.
import { describe, it, expect, vi } from 'vitest';
import { graphFor, runGraph, entryUnits } from '../../api/lib/assistant/activities/graph.js';
import { TEMPLATES } from '../../api/lib/assistant/strategy-seed.js';
import { parseScriptureRef } from '../../api/lib/assistant/scripture-ref.js';
import { run as runTool } from '../../api/lib/assistant/tools.js';

const TPL = Object.fromEntries(TEMPLATES.map((t) => [t.id, t.text]));
const Q = "show me the first paragraph of tafsir-i-surata'l-Kawthar (the original arabic tablet) and show me a side-by-side translation";
const TAFSIR = { id: 20171, title: 'Tafsír-i-Súriy-i-Kawthar', author: 'The Báb', language: 'ar', paragraph_count: 806 };
const P = (i, d = 20171) => ({ id: 100 + i, document_id: d, paragraph_index: i, text: `para ${i}`, title: 'T', language: 'ar' });
const QURAN = { id: 9, document_id: 1, paragraph_index: 108, text: 'Lo! We have given thee Abundance', title: 'The Qur’án', language: 'en', theme: 'scripture' };

describe('document_search: close candidates', () => {
  const works = { id: 956819, title: "Tafsir-i-Suratu'l-Kawthar (provisional translation)", author: 'The Báb', language: 'en' };
  const deps = (found, ranked) => ({ findTitled: async () => found, rankTitled: ranked, workUrl: (x) => `https://x/${x.id}` });
  it('nothing reaches min → the close titles, marked close, rankTitled asked at a lower floor', async () => {
    const rankTitled = vi.fn(async () => ({ sorted: [TAFSIR, works] }));
    const r = await runTool('document_search', { title: "tafsir-i-surata'l-Kawthar" }, { deps: deps(null, rankTitled) });
    expect(rankTitled).toHaveBeenCalledWith(["tafsir-i-surata'l-Kawthar"], expect.objectContaining({ min: 0.7 }));
    expect(r.works.map((w) => [w.id, w.match])).toEqual([[20171, 'close'], [956819, 'close']]);
  });
  it('a confident match stays match: title and asks for no close ones', async () => {
    const rankTitled = vi.fn();
    const r = await runTool('document_search', { title: 'Iqan' }, { deps: deps({ doc: { id: 1, title: 'Kitáb-i-Íqán' }, others: [] }, rankTitled) });
    expect(r.works[0].match).toBe('title'); expect(rankTitled).not.toHaveBeenCalled();
  });
  it('nothing close either → no works', async () => {
    expect((await runTool('document_search', { title: 'zzzz' }, { deps: deps(null, async () => ({ sorted: [] })) })).works).toEqual([]);
  });
});

describe('parseScriptureRef: byName', () => {
  it('a sūra name is marked, a number is not', () => {
    expect(parseScriptureRef("Surat al-Kawthar")).toMatchObject({ kind: 'quran', sura: 108, byName: true });
    expect(parseScriptureRef('Sura 108')).toMatchObject({ kind: 'quran', sura: 108 });
    expect(parseScriptureRef('Sura 108').byName).toBeUndefined();
    expect(parseScriptureRef('the opening chapter of the Qur’an').byName).toBeUndefined();
  });
});

async function original(question, { judges = {}, bookCandidates, tools = {} } = {}) {
  const g = graphFor('original', 2);
  const decisions = [];
  const s = { choice: {}, ctx: { deps: { bookCandidates }, decisions: { record: (k, v) => decisions.push({ k, ...v }) } }, trace: [], question, messages: [{ role: 'user', content: question }], judges,
    tools: { fused_search: async () => ({ passages: [] }), context_lookup: async () => ({ passages: [] }), edition_lookup: async () => ({ passages: [], family: [], self: null, missing_language: null }),
      reference: vi.fn(async () => ({ passages: [QURAN] })), opening_lookup: vi.fn(async () => ({ passages: [P(1), P(2)] })), ...tools }, templates: TPL, onEvent: () => {} };
  s.units = entryUnits(g, {}, { query: question, question, channel: { id: 'site-chat' }, messages: [] });
  await runGraph(g, s); s.decisions = decisions; s.path = s.trace.map((x) => x.node); return s;
}
const cands = async () => ({ cands: [{ kind: 'work', doc: TAFSIR, score: 1 }, { kind: 'work', doc: { id: 956819, title: "Tafsir-i-Suratu'l-Kawthar (provisional translation)", author: 'The Báb', paragraph_count: 400 }, score: 0.9 }] });

describe('original tree: a sūra name is a candidate, Jev picks', () => {
  it("Jev picks the Báb's Tafsír → fetch.opening on that work, never Qur'án 108", async () => {
    const book = vi.fn(async (_m, cs) => ({ choice: cs.find((c) => c.doc?.id === 20171).key, confidence: 0.95 }));
    const s = await original(Q.replace("tafsir-i-surata'l-Kawthar", "tafsir-i-Surat al-Kawthar"), { judges: { book }, bookCandidates: cands });
    expect(book).toHaveBeenCalledTimes(1);
    expect(s.path).toEqual(expect.arrayContaining(['o1r', 'o1o', 'o3'])); expect(s.path).not.toContain('o1w');
    expect(s.tools.opening_lookup).toHaveBeenCalledWith({ document_id: 20171, n: 3 }, expect.anything());
    expect(s.tools.reference).not.toHaveBeenCalled();
    expect(s.decisions.find((d) => d.k === 'reference:name-or-work')).toMatchObject({ by: 'jev', chosen: expect.stringMatching(/^c/) });
  });
  it('Jev picks the sura (none of the works) → Qur’án 108 as before', async () => {
    const s = await original('Surat al-Kawthar in Arabic with a translation', { judges: { book: async () => ({ choice: 'none', confidence: 0.9 }) }, bookCandidates: cands });
    expect(s.tools.reference).toHaveBeenCalled(); expect(s.tools.opening_lookup).not.toHaveBeenCalled();
    expect(s.decisions.find((d) => d.k === 'reference:name-or-work').chosen).toBe('none');
  });
  it('hesitant / no answer → the sura stands, never an absence', async () => {
    const hes = await original('Surat al-Kawthar', { judges: { book: async () => ({ choice: 'c1', confidence: 0.2 }) }, bookCandidates: cands });
    expect(hes.tools.reference).toHaveBeenCalled(); expect(hes.tools.opening_lookup).not.toHaveBeenCalled();
    const none = await original('Surat al-Kawthar', { judges: { book: async () => null }, bookCandidates: cands });
    expect(none.tools.reference).toHaveBeenCalled();
  });
  it('"Sura 108" is numeric: parsed directly, no candidates, no Jev', async () => {
    const book = vi.fn(), find = vi.fn();
    const s = await original('Sura 108 in Arabic', { judges: { book }, bookCandidates: find });
    expect(book).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled(); expect(s.tools.reference).toHaveBeenCalled();
  });
});
