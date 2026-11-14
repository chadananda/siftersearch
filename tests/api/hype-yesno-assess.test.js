// hype-yesno-assess: model verdicts keep/rewrite/drop on stated yes/no items; fake model + fake repo deps, no DB, no network.
import { describe, it, expect } from 'vitest';
import { hypeYesnoAssessJob, parseVerdicts } from '../../api/lib/ops/hype-yesno-assess-job.js';

const YES1 = 'Do Bahá’í teachings offer a pattern for future society?', YES2 = 'Can people of any religion pray in a House of Worship?', YES3 = 'Is the soul immortal?', OK = 'What happens to the soul after death?';
const IMP = { q: 'Is there an afterlife?', implied: true, premise: 'p', implies: 'i', proof: 'x' };

function fakes(rows, replies) {
  const db = new Map(rows.map((r) => [r.id, { ...r }])), calls = [], writes = [];
  let n = 0;
  return { db, calls, writes, deps: {
    maxId: async () => 100, window: async (a, b) => [...db.values()].filter((r) => r.id > a && r.id <= b).map((r) => ({ id: r.id, doc_id: r.doc_id, hyp_questions: r.hyp_questions })),
    titles: async () => new Map([[7, 'Some Book']]), texts: async (ids) => new Map(ids.map((i) => [i, { text: `Passage ${i}. the house is open to all the peoples of the world. ` + 'x'.repeat(400) }])),
    chat: async (messages) => { calls.push(messages); const r = typeof replies === 'function' ? replies(messages, n++) : replies; return { content: r, usage: { promptTokens: 1000, completionTokens: 100, cachedTokens: 0 } }; },
    cost: ({ promptTokens, completionTokens }) => (promptTokens * 0.0001 + completionTokens * 0.0005) / 1000,
    replace: async (ups) => { for (const u of ups) { const r = db.get(u.id); if (r.hyp_questions === u.from) r.hyp_questions = u.to; } writes.push(ups.length); return ups.length; },
    reindex: async (ids) => `queued:${ids.join(',')}`, log: {}, yieldTick: async () => {},
  } };
}
const rows = () => [
  { id: 1, doc_id: 7, hyp_questions: JSON.stringify([{ q: YES1, a: 'span one' }, OK, { q: YES2, a: 'open to all the peoples' }, IMP, YES3]) },
  { id: 2, doc_id: 7, hyp_questions: JSON.stringify([OK]) },
  { id: 3, doc_id: 7, hyp_questions: JSON.stringify([{ q: 'Is God one?', a: 'z', seeker: true }]) },
];
const verdicts = (m) => JSON.stringify({ verdicts: m });
const three = verdicts([{ i: 0, verdict: 'rewrite', q: 'What pattern for future society do the Bahá’í teachings offer?' }, { i: 1, verdict: 'keep' }, { i: 2, verdict: 'drop' }]);
const reply = (_m, n) => (n === 0 ? three : verdicts([{ i: 0, verdict: 'keep' }]));

describe('hype-yesno-assess', () => {
  it('parses verdicts and ignores malformed entries', () => {
    expect([...parseVerdicts('x ' + three + ' y').entries()].map(([i, v]) => [i, v.verdict])).toEqual([[0, 'rewrite'], [1, 'keep'], [2, 'drop']]);
    expect(parseVerdicts('nonsense').size).toBe(0);
    expect(parseVerdicts(verdicts([{ i: 0, verdict: 'maybe' }, { verdict: 'keep' }])).size).toBe(0);
  });
  it('dry run calls the model, reports counts, cost and all samples, writes nothing', async () => {
    const f = fakes(rows(), reply), before = JSON.stringify([...f.db.values()]);
    const r = await hypeYesnoAssessJob({}, f.deps);
    expect(r).toMatchObject({ apply: false, paragraphs: 2, questions: 4, keep: 1, rewrite: 1, drop: 2, keepUnverified: 1, unanswered: 0, docs: 1 });
    expect(r.usd).toBeGreaterThan(0); expect(r.usdPerQuestion).toBeCloseTo(r.usd / 4, 5);
    expect(r.samples.length).toBe(4); expect(r.samples[0]).toMatchObject({ q: YES1, verdict: 'rewrite', newQ: expect.stringMatching(/^What pattern/) }); expect(r.samples[0].passage.length).toBeLessThanOrEqual(300);
    expect(f.writes).toEqual([]); expect(JSON.stringify([...f.db.values()])).toBe(before); expect(r.reindex).toBeUndefined(); expect(f.calls.length).toBe(2);
  });
  it('apply: keep sets closed, rewrite replaces q (a kept, was added), drop empties the slot; k stays stable; implied untouched', async () => {
    const f = fakes(rows(), reply);
    const r = await hypeYesnoAssessJob({ apply: true, limit: 10 }, f.deps);
    expect(r).toMatchObject({ written: 2, reindex: 'queued:7' });
    const a = JSON.parse(f.db.get(1).hyp_questions);
    expect(a[0]).toEqual({ q: 'What pattern for future society do the Bahá’í teachings offer?', a: 'span one', was: YES1 });
    expect(a[1]).toBe(OK); expect(a[2]).toEqual({ q: YES2, a: 'open to all the peoples', closed: true }); expect(a[3]).toEqual(IMP); expect(a[4]).toEqual({ q: '', dropped: 'yesNo', was: YES3 });
    // stored span 'z' is too short to verify and the model gave none: an unverifiable keep is dropped, like a new closed yes/no
    expect(JSON.parse(f.db.get(3).hyp_questions)).toEqual([{ q: '', dropped: 'yesNo', was: 'Is God one?' }]);
    expect(r.keepUnverified).toBe(1);
    expect(JSON.parse(f.db.get(2).hyp_questions)).toEqual([OK]);
  });
  it('an invalid rewrite (still yes/no, self-referencing, or a duplicate) becomes a drop', async () => {
    for (const bad of ['Is there a pattern for society?', 'What does the passage say about society?', OK, '']) {
      const f = fakes([rows()[0]], verdicts([{ i: 0, verdict: 'rewrite', q: bad }, { i: 1, verdict: 'drop' }, { i: 2, verdict: 'drop' }]));
      const r = await hypeYesnoAssessJob({ apply: true, limit: 5 }, f.deps);
      expect(r).toMatchObject({ rewrite: 0, drop: 3 });
      expect(JSON.parse(f.db.get(1).hyp_questions)[0]).toEqual({ q: '', dropped: 'yesNo', was: YES1 });
    }
  });
  it('missing verdicts are left alone and counted unanswered; a failed call changes nothing', async () => {
    const f = fakes([rows()[0]], verdicts([{ i: 1, verdict: 'keep' }])), orig = rows()[0].hyp_questions;
    const r = await hypeYesnoAssessJob({ apply: true, limit: 5 }, f.deps);
    expect(r).toMatchObject({ keep: 1, unanswered: 2, questions: 3 });
    const a = JSON.parse(f.db.get(1).hyp_questions); expect(a[0]).toEqual({ q: YES1, a: 'span one' }); expect(a[2].closed).toBe(true);
    const g = fakes([rows()[0]], 'x'); g.deps.chat = async () => { throw new Error('boom'); };
    expect(await hypeYesnoAssessJob({ apply: true, limit: 5 }, g.deps)).toMatchObject({ paragraphs: 0, questions: 0, written: 0, reindex: 'none' });
    expect(g.db.get(1).hyp_questions).toBe(orig);
  });
  it('is idempotent: judged items are not re-sent', async () => {
    const f = fakes(rows(), reply);
    await hypeYesnoAssessJob({ apply: true, limit: 10 }, f.deps);
    const n = f.calls.length, again = await hypeYesnoAssessJob({ apply: true, limit: 10 }, f.deps);
    expect(f.calls.length).toBe(n); expect(again).toMatchObject({ paragraphs: 0, questions: 0, written: 0, reindex: 'none' });
  });
  it('honours limit; apply demands an explicit limit; sampleOnly never writes', async () => {
    const f = fakes(rows(), reply);
    expect((await hypeYesnoAssessJob({ limit: 1 }, f.deps)).paragraphs).toBe(1); expect(f.calls.length).toBe(1);
    await expect(hypeYesnoAssessJob({ apply: true }, f.deps)).rejects.toMatchObject({ statusCode: 400 });
    const s = await hypeYesnoAssessJob({ apply: true, sampleOnly: true, limit: 5 }, f.deps);
    expect(s.apply).toBe(false); expect(f.writes).toEqual([]);
  });
  it('a paragraph edited meanwhile is skipped by the compare-and-set', async () => {
    const f = fakes([rows()[0]], three), orig = f.deps.window;
    f.deps.window = async (a, b) => { const w = await orig(a, b); f.db.get(1).hyp_questions = JSON.stringify([OK]); return w; };
    await hypeYesnoAssessJob({ apply: true, limit: 5 }, f.deps);
    expect(JSON.parse(f.db.get(1).hyp_questions)).toEqual([OK]);
  });
  it('a keep may stand on the model\'s own answering words when they are in the passage', async () => {
    const f = fakes([rows()[2]], verdicts([{ i: 0, verdict: 'keep', a: 'open to all the peoples of the world' }]));
    const r = await hypeYesnoAssessJob({ apply: true, limit: 5 }, f.deps);
    expect(r).toMatchObject({ keep: 1, drop: 0 });
    expect(JSON.parse(f.db.get(3).hyp_questions)).toEqual([{ q: 'Is God one?', a: 'open to all the peoples of the world', seeker: true, closed: true }]);
  });
});
