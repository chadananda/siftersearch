// entities/reviewed — a reader's verdicts become ordinary, reversible decisions; Chad's outrank any model's.
import { describe, it, expect } from 'vitest';
import { decisionsFor, planMerges, run } from '../../api/lib/rag/entities/reviewed.js';
import { LIVE_SQL, isLiveRow, isMergedRow, retiredStamp } from '../../api/lib/entity-live.js';

const store = (live = {}, imp = {}, men = {}, anchored = []) => {
  const log = { merges: [], saved: [], renames: [], retired: [], created: [], repoints: [] };
  return { log, s: {
    getIdentityDossiers: async (ids) => ({ dossiers: new Map(ids.map((id) => [id, { id, name: `#${id}`, live: live[id] ?? true, importance: imp[id] ?? null, mentions: men[id] ?? 1 }])) }),
    applyMerge: async (canonical, merged, reason, meta) => log.merges.push({ canonical, merged, meta }),
    saveDecisions: async (rows) => log.saved.push(...rows),
    renameEntity: async (id, name) => log.renames.push({ id, name }),
    createEntity: async (name) => { log.created.push(name); return 900; },
    repointCluster: async (from, to, docId, handle) => { log.repoints.push({ from, to, docId, handle }); return { moved: 3, claims: 2, held: 1 }; },
    retireEntity: async (id) => { if (anchored.includes(id)) throw new Error(`entity ${id} is anchored`); log.retired.push(id); },
  } };
};
const ctx = (s) => ({ store: s, log: { info() {} } });

describe('reviewed decisions', () => {
  it("Chad's verdict is human tier; a model reader's is model tier", () => {
    const [h, m] = decisionsFor([
      { verdict: 'same', a: 1264031, b: 1247564, into: 1247564, reason: "Bábu'l-Báb is Mullá Ḥusayn", reviewer: 'human:chad' },
      { verdict: 'different', a: 1, b: 2, reason: 'different fathers', reviewer: 'model:reader' },
    ]);
    expect(h).toMatchObject({ kind: 'merge', actorTier: 3, payload: { canonical: 1247564, merged: [1264031] } });
    expect(m).toMatchObject({ kind: 'distinct', actorTier: 2, payload: { pair: [1, 2] } });
  });
  it('a verdict without its reason is refused (a decision must say why)', () => {
    expect(() => decisionsFor([{ verdict: 'different', a: 1, b: 2, reviewer: 'human:chad' }])).toThrow(/reason/);
  });
  it('merge "into" must be one of the pair', () => {
    expect(() => decisionsFor([{ verdict: 'same', a: 1, b: 2, into: 3, reason: 'x' }])).toThrow(/into/);
  });
  it('DRY writes nothing; write applies each kind through its own store path', async () => {
    const items = [
      { verdict: 'same', a: 5, b: 6, into: 6, reason: 'Ghuṣn-i-A‘ẓam is ‘Abdu’l-Bahá', reviewer: 'human:chad' },
      { verdict: 'different', a: 7, b: 8, reason: 'colonel ≠ governor', reviewer: 'human:chad' },
      { verdict: 'rename', a: 9, name: 'the Bábí of Nayríz who fled to Ṭihrán', reason: 'its passages never name Yaḥyá' },
    ];
    const dry = store(); await run(ctx(dry.s), { items });
    expect(dry.log).toEqual({ merges: [], saved: [], renames: [], retired: [], created: [], repoints: [] });
    const w = store(); const r = await run(ctx(w.s), { items, write: true });
    expect(r.counts).toEqual({ merge: 1, distinct: 1, rename: 1 });
    expect(w.log.merges[0]).toMatchObject({ canonical: 6, merged: [5], meta: { actorTier: 3 } });
    expect(w.log.saved[0]).toMatchObject({ kind: 'distinct', targetIds: [7, 8] });
    expect(w.log.renames[0]).toEqual({ id: 9, name: 'the Bábí of Nayríz who fled to Ṭihrán' });
  });
  it('a tombstoned record is never merged', async () => {
    const w = store({ 5: false });
    const r = await run(ctx(w.s), { items: [{ verdict: 'same', a: 5, b: 6, into: 6, reason: 'x' }], write: true });
    expect(r.counts).toEqual({ skipped: 1 });
    expect(w.log.merges).toEqual([]);
  });
  // MEASURED 2026-09-28: the reader batch judged Subh-i-Azal ≡ Mírzá Yaḥyá AND each of them ≡ a third record. Pair by
  // pair, the second merge would move passages onto a record the first had just retired.
  it('chained verdicts fold into ONE survivor (the curated record) in one merge', async () => {
    const w = store({}, { 2: 52 }, { 1: 1517, 2: 637, 3: 4 });
    const r = await run(ctx(w.s), { write: true, items: [
      { verdict: 'same', a: 1, b: 2, into: 2, reason: 'Subh-i-Azal is Mírzá Yaḥyá' },
      { verdict: 'same', a: 2, b: 3, into: 2, reason: 'x' },
      { verdict: 'same', a: 1, b: 3, into: 1, reason: 'y' },
      { verdict: 'different', a: 3, b: 9, reason: 'z' },
    ] });
    expect(w.log.merges).toHaveLength(1);
    expect(w.log.merges[0].canonical).toBe(2);
    expect(w.log.merges[0].merged.sort()).toEqual([1, 3]);
    expect(w.log.saved[0].targetIds).toEqual([2, 9]);   // the verdict about a folded record now concerns its survivor
    expect(r.counts).toEqual({ merge: 1, distinct: 1 });
  });
  it('a group that also carries a "different" verdict is refused, not guessed', () => {
    const ds = decisionsFor([{ verdict: 'same', a: 1, b: 2, reason: 'a' }, { verdict: 'same', a: 2, b: 3, reason: 'b' }, { verdict: 'different', a: 1, b: 3, reason: 'c' }]);
    const { plans, survivor } = planMerges(ds, new Map());
    expect(plans[0].conflict).toMatch(/different/);
    expect(survivor.size).toBe(0);
  });
  // 2026-09-28: 356 records the retired extractor minted from bare name strings, with no passage anywhere.
  it('retires a passage-less record; one a passage still anchors is refused on its own, the batch goes on', async () => {
    const w = store({}, {}, {}, [2]);
    const r = await run(ctx(w.s), { write: true, items: [
      { verdict: 'retire', a: 1, reason: 'no passage anywhere' },
      { verdict: 'retire', a: 2, reason: 'no passage anywhere' },
      { verdict: 'different', a: 3, b: 4, reason: 'x' },
    ] });
    expect(w.log.retired).toEqual([1]);
    expect(r.results.find((x) => x.ids[0] === 2).skipped).toMatch(/refused: .*anchored/);
    expect(w.log.saved).toHaveLength(1);
  });
});

// entity-live — ONE definition of live: a retired record is not served, and it is not a merge.
describe('split: repoint one book’s cluster', () => {
  // 2026-09-28: 1249888 (the physician-martyr of Zanján) held ~70 mentions each book labelled "Ḥujjat".
  it('moves a cluster to the record the passages name, or to a new record named as the text names them', async () => {
    const w = store();
    const r = await run(ctx(w.s), { write: true, items: [
      { verdict: 'repoint', from: 1249888, to: 1247580, docId: 13433, handle: 'Ḥujjat (Mullá Muḥammad-‘Alíy-i-Zanjání)', reason: 'the passages are Ḥujjat of Zanján' },
      { verdict: 'repoint', from: 1269643, toName: '‘Alí Nakhjavání', docId: 11169, handle: "'Alí Nakhjavani", reason: 'Hand of the Cause, Accra 1970' },
    ] });
    expect(w.log.repoints).toEqual([
      { from: 1249888, to: 1247580, docId: 13433, handle: 'Ḥujjat (Mullá Muḥammad-‘Alíy-i-Zanjání)' },
      { from: 1269643, to: 900, docId: 11169, handle: "'Alí Nakhjavani" },
    ]);
    expect(w.log.created).toEqual(['‘Alí Nakhjavání']);
    expect(r.results[0].split).toEqual({ moved: 3, claims: 2, held: 1 });
  });
  it('a repoint without its book and label is refused', () => {
    expect(() => decisionsFor([{ verdict: 'repoint', from: 1, to: 2, reason: 'x' }])).toThrow(/docId, handle/);
  });
});

describe('retired records', () => {
  it('are not live, and not merged', () => {
    const row = { canonical_name: 'the Proclaimer', last_assessed_version: retiredStamp('no-passage') };
    expect(isLiveRow(row)).toBe(false);
    expect(isMergedRow(row)).toBe(false);
    expect(isLiveRow({ canonical_name: 'Mullá Ḥusayn', last_assessed_version: 'reconcile-v1' })).toBe(true);
    expect(LIVE_SQL('ge.')).toMatch(/ge\.last_assessed_version NOT LIKE 'retired:%'/);
  });
});
