// entities/reviewed — a reader's verdicts become ordinary, reversible decisions; Chad's outrank any model's.
import { describe, it, expect } from 'vitest';
import { decisionsFor, run } from '../../api/lib/rag/entities/reviewed.js';

const store = (live = {}) => {
  const log = { merges: [], saved: [], renames: [] };
  return { log, s: {
    getIdentityDossiers: async (ids) => ({ dossiers: new Map(ids.map((id) => [id, { id, name: `#${id}`, live: live[id] ?? true }])) }),
    applyMerge: async (canonical, merged, reason, meta) => log.merges.push({ canonical, merged, meta }),
    saveDecisions: async (rows) => log.saved.push(...rows),
    renameEntity: async (id, name) => log.renames.push({ id, name }),
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
    expect(dry.log).toEqual({ merges: [], saved: [], renames: [] });
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
});
