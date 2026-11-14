// hype-selfref-purge: dry run counts, apply empties ONLY selfReference slots, survivors keep k/points, idempotent, indexer units. Fake window/replace deps, no DB.
import { describe, it, expect } from 'vitest';
import { hypeSelfrefPurgeJob } from '../../api/lib/ops/hype-selfref-purge-job.js';
import { hypeUnitSpecs, parseStoredHypItems } from '../../api/lib/search/hype.js';

const SELF = 'According to the paragraph, what is the soul?', YES = 'Is the soul immortal?', OK = 'What happens to the soul after death?';
const IMP = { q: 'Is there an afterlife?', implied: true, premise: 'p', implies: 'i', proof: 'x' };

function fakes(rows) {
  const db = new Map(rows.map((r) => [r.id, { ...r }])), calls = [];
  return { db, calls, deps: {
    maxId: async () => 100, window: async (a, b) => [...db.values()].filter((r) => r.id > a && r.id <= b).map((r) => ({ ...r })), titles: async () => new Map([[7, 'Some Book']]),
    replace: async (ups) => { for (const u of ups) { const r = db.get(u.id); if (r.hyp_questions === u.from) r.hyp_questions = u.to; } calls.push(ups.length); return ups.length; },
    reindex: async (ids) => `queued:${ids.join(',')}`, log: {}, yieldTick: async () => {},
  } };
}
const rows = () => [
  { id: 1, doc_id: 7, hyp_questions: JSON.stringify([SELF, YES, { q: OK, a: 'x' }, IMP, { q: 'The author says what about the soul?', seeker: true }]) },
  { id: 2, doc_id: 7, hyp_questions: JSON.stringify([OK]) },
  { id: 3, doc_id: 7, hyp_questions: [SELF, OK].join('\n') },
];

describe('hype-selfref-purge', () => {
  it('dry run counts and changes nothing', async () => {
    const f = fakes(rows()), before = JSON.stringify([...f.db.values()]);
    const r = await hypeSelfrefPurgeJob({}, f.deps);
    expect(r).toMatchObject({ apply: false, paragraphs: 2, questions: 3, pointsToDelete: 3, docs: 1 });
    expect(r.samples.length).toBe(3);
    expect(f.calls).toEqual([]); expect(JSON.stringify([...f.db.values()])).toBe(before); expect(r.reindex).toBeUndefined();
  });
  it('apply empties only selfReference slots; yesNo / others / implied untouched; survivors keep their k', async () => {
    const f = fakes(rows());
    const r = await hypeSelfrefPurgeJob({ apply: true }, f.deps);
    expect(r).toMatchObject({ paragraphs: 2, questions: 3, written: 2, reindex: 'queued:7' });
    const arr = JSON.parse(f.db.get(1).hyp_questions);
    expect(arr[0]).toEqual({ q: '', dropped: 'selfReference', was: SELF });
    expect(arr[1]).toBe(YES); expect(arr[2]).toEqual({ q: OK, a: 'x' }); expect(arr[3]).toEqual(IMP); expect(arr[4].dropped).toBe('selfReference');
    expect(JSON.parse(f.db.get(2).hyp_questions)).toEqual([OK]);
    // legacy newline text becomes a JSON array with the slot kept
    expect(JSON.parse(f.db.get(3).hyp_questions)).toEqual([{ q: '', dropped: 'selfReference', was: SELF }, OK]);
    // indexer units: the same k as before for survivors (stated k = slot position), implied from 900, nothing for dropped slots
    expect(hypeUnitSpecs(f.db.get(1).hyp_questions, 'T')).toEqual([{ k: 1, text: YES }, { k: 2, text: OK }, { k: 900, text: IMP.q }, { k: 999, text: 'T' }]);
    expect(hypeUnitSpecs(rows()[0].hyp_questions, '').map((u) => u.k)).toEqual([0, 1, 2, 3, 900]);
  });
  it('is idempotent and honours limit', async () => {
    const f = fakes(rows());
    expect((await hypeSelfrefPurgeJob({ apply: true, limit: 1 }, f.deps)).paragraphs).toBe(1);
    expect(JSON.parse(f.db.get(2).hyp_questions)).toEqual([OK]);
    await hypeSelfrefPurgeJob({ apply: true }, f.deps);
    const again = await hypeSelfrefPurgeJob({ apply: true }, f.deps);
    expect(again).toMatchObject({ paragraphs: 0, questions: 0, pointsToDelete: 0, written: 0, reindex: 'none' });
  });
  it('a paragraph edited meanwhile is skipped by the compare-and-set', async () => {
    const f = fakes(rows()), orig = f.deps.window;
    f.deps.window = async (a, b) => { const w = await orig(a, b); f.db.get(1).hyp_questions = JSON.stringify([OK]); return w; };
    await hypeSelfrefPurgeJob({ apply: true }, f.deps);
    expect(JSON.parse(f.db.get(1).hyp_questions)).toEqual([OK]);
  });
  it('dropped slots are kept by slot-aware parsing only', () => {
    const raw = JSON.stringify([{ q: '', dropped: 'selfReference', was: SELF }, OK]);
    expect(parseStoredHypItems(raw).map((i) => i.q)).toEqual([OK]);
    expect(parseStoredHypItems(raw, { slots: true }).length).toBe(2);
  });
  it('fault yesNo retires yes/no slots only (seeker ones too) and counts paragraphs left with no question', async () => {
    const f = fakes([...rows(), { id: 4, doc_id: 7, hyp_questions: JSON.stringify([{ q: 'Can I know God?', seeker: true }]) }]);
    const r = await hypeSelfrefPurgeJob({ apply: true, fault: 'yesNo' }, f.deps);
    expect(r).toMatchObject({ fault: 'yesNo', paragraphs: 2, questions: 2, emptied: 1 });
    expect(JSON.parse(f.db.get(1).hyp_questions)[1]).toEqual({ q: '', dropped: 'yesNo', was: YES });
    expect(JSON.parse(f.db.get(1).hyp_questions)[0]).toBe(SELF);
    await expect(hypeSelfrefPurgeJob({ fault: 'namedBook' }, f.deps)).rejects.toMatchObject({ statusCode: 400 });
  });
});
