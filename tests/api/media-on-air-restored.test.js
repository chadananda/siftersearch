// On the air = restored (Chad 10-29): counts, listing, index, facets hold only restored talks; the backfill flags the rest from meta.json.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
let db;
vi.mock('../../api/lib/db.js', () => ({
  query: async (sql, a = []) => db.prepare(sql).run(...a),
  queryOne: async (sql, a = []) => db.prepare(sql).get(...a),
  queryAll: async (sql, a = []) => db.prepare(sql).all(...a),
  transaction: async (ops) => { for (const o of ops) db.prepare(o.sql).run(...(o.args || [])); return {}; },
}));
import * as repo from '../../api/lib/repos/media-repo.js';
import { backfillRestored, resetRestoredVerify } from '../../api/lib/ops/media-jobs.js';

const row = (id, restored, extra = {}) => ({ id, slug: 's' + id, state: 'done', restored, dir: '/x/' + id, source_kind: 'youtube', speaker: 'A', duration_s: 60, ...extra });
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`CREATE TABLE media_items(id INTEGER PRIMARY KEY, slug TEXT, title TEXT, speaker TEXT, speaker_key TEXT, tradition TEXT, collection TEXT, language TEXT, year INTEGER, date TEXT, duration_s REAL, has_video INTEGER DEFAULT 0, source_kind TEXT, source_ref TEXT, youtube_id TEXT, channel TEXT, playback TEXT, thumb TEXT, quotes_n INTEGER, crs_n INTEGER, words_n INTEGER, doc_id INTEGER, grade TEXT, primary_issue TEXT, chain_key TEXT, priority REAL, audience INTEGER, queue_rank INTEGER, stage TEXT, state TEXT, why TEXT, dir TEXT, stages_done TEXT, restored INTEGER, stages_missing INTEGER, next_stage TEXT, verdict TEXT, in_quality REAL, out_quality REAL, in_bw_khz REAL, out_bw_khz REAL, completed_at TEXT, published_at TEXT, dup_group INTEGER, updated_at TEXT)`);
  for (const r of [row(1, 1), row(2, 0), row(3, null), row(4, 1)]) {
    const k = Object.keys(r); db.prepare(`INSERT INTO media_items(${k.join(',')},updated_at) VALUES(${k.map(() => '?').join(',')},'2026-10-29')`).run(...Object.values(r));
  }
});

describe('only restored talks are on the air', () => {
  it('progress, listing, index and facets count restored rows only', async () => {
    const [p] = await repo.progressCounts();
    expect(p.published).toBe(2); expect(p.downloaded).toBe(4); expect(p.published_s).toBe(120);
    expect((await repo.importProgress()).rows.reduce((n, r) => n + r.published, 0)).toBe(2);
    expect((await repo.listMedia()).items.map((i) => i.id).sort()).toEqual([1, 4]);
    expect((await repo.listMedia({ includePending: true })).total).toBe(4);
    expect((await repo.mediaIndexRows()).map((r) => r.id).sort()).toEqual([1, 4]);
    expect((await repo.mediaFacets()).total).toBe(2);
  });
});

const ALL = Object.fromEntries(['remaster', 'verify', 'transcribe', 'diarize', 'correct', 'headings', 'quotes', 'links', 'assess', 'ingest', 'catalog', 'web'].map((k) => [k, { at: 1 }]));
const good = (tier = 'heavy') => ({ web_original: { m4a: 'a.m4a' }, remaster_tier: tier, remaster: { status: 'done', method: tier === 'cleaned' ? 'cleaned' : 'pod', check: { verdict: 'changed' }, quiet: { v: 1 } }, enhancement: { listening: 'unipase' }, stages: ALL });
describe('backfillRestored', () => {
  it('flags unclassified published rows from meta.json (restored tier → 1, none → 0, unreadable → 0)', async () => {
    const metas = { '/x/3': good() };
    const n = await backfillRestored({ repo, readMeta: async (d) => { if (!metas[d]) throw new Error('nope'); return metas[d]; } });
    expect(n).toBe(4);
    expect(db.prepare('SELECT restored r FROM media_items WHERE id = 3').get().r).toBe(1);
    expect((await repo.unclassifiedDone()).length).toBe(0);
  });
  it('complete = every stage done and a passed remaster: a restored talk with a stage missing is still in the pipeline', async () => {
    resetRestoredVerify();
    db.prepare('UPDATE media_items SET restored = NULL WHERE id = 2').run();
    await backfillRestored({ repo, readMeta: async (d) => ({ '/x/2': { ...good(), stages: { ...ALL, quotes: undefined } } })[d] || Promise.reject(new Error('x')) });
    expect(db.prepare('SELECT restored r FROM media_items WHERE id = 2').get().r).toBe(0);
  });
  it('never the original (Chad 10-31): a fully transcribed talk still on the original/light copy is OFF air; a done remaster is on; rows flagged on under the looser rule come off', async () => {
    resetRestoredVerify();
    const metas = { '/x/1': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'light' }, '/x/3': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'light', stages: ALL, enhancement: { listening: 'safe' }, remaster: { status: 'review' } }, '/x/4': good('cleaned'), '/x/2': { ...good(), stages: { ...ALL, quotes: undefined } } };
    await backfillRestored({ repo, readMeta: async (d) => metas[d] || Promise.reject(new Error('nope')) });
    const r = (id) => db.prepare('SELECT restored r FROM media_items WHERE id = ?').get(id).r;
    expect([r(1), r(3), r(4)]).toEqual([0, 0, 1]);   // [1] light, stages missing: off; [3] every stage but playing the original: off; [4] remaster done: on air
  });
  it('a talk playing the original comes off air (it was on under the looser rule); once its remaster is published it goes back on (10-31)', async () => {
    resetRestoredVerify();
    const held = { web_original: { m4a: 'a.m4a' }, stages: ALL, enhancement: { listening: 'safe' }, remaster: { status: 'review' } };
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/1' ? held : Promise.reject(new Error('nope'))) });
    expect(db.prepare('SELECT restored r FROM media_items WHERE id = 1').get().r).toBe(0);
    resetRestoredVerify();
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/1' ? { ...good(), web_listening: 'unipase' } : Promise.reject(new Error('nope'))) });
    expect(db.prepare('SELECT restored r FROM media_items WHERE id = 1').get().r).toBe(1);
  });
});

describe('stage + quality index', () => {
  it('backfill fills stages_missing, next_stage, verdict and NISQA in/out so the pipeline is one indexed read', async () => {
    resetRestoredVerify();
    const m = { ...good(), stages: { ...ALL, links: undefined, assess: undefined }, remaster: { status: 'done', method: 'pod', output_assessment: { passed: true, reference: { nisqa: [2.1] }, restored: { nisqa: [3.9] } } } };
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/3' ? m : Promise.reject(new Error('x'))) });
    const r = db.prepare('SELECT restored, stages_missing sm, next_stage ns, verdict v, in_quality i, out_quality o FROM media_items WHERE id = 3').get();
    expect(r).toMatchObject({ restored: 0, sm: 2, ns: 'links', v: 'usable', i: 2.1, o: 3.9 });
  });
});

describe('published = on air (10-31, talk 485): published_at follows restored', () => {
  const pub = (id) => db.prepare('SELECT restored r, published_at p FROM media_items WHERE id = ?').get(id);
  // 485 after the typed chain: remaster held (nisqa_down), the original still the listening copy, verify/quiet skipped
  const m485 = { web_original: { m4a: 'a.m4a' }, web_listening: 'safe', enhancement: { listening: 'safe' }, remaster: { status: 'review', verdict: 'review', swapped: 0 },
    stages: { ...ALL, verify: { at: 1, skipped: 'not remastered' }, quiet: { at: 1, skipped: 'no published pure remaster' } } };
  it('the catalogue write of a held typed adoption leaves it unpublished, even when the caller sends published_at', async () => {
    const { indexFields } = await import('../../api/lib/media/item.js');
    await repo.updateMediaItem(2, { state: 'done', stage: 'catalog', ...indexFields(m485), published_at: '2026-10-31T20:16:05Z' });
    expect(pub(2)).toEqual({ r: 0, p: null });
  });
  it('a talk is stamped the first time it goes on air, keeps that date, and loses it when it comes off', async () => {
    await repo.setIndex(2, { restored: 1 });
    const first = pub(2).p; expect(first).toBeTruthy();
    await repo.updateMediaItem(2, { restored: 1 }); expect(pub(2).p).toBe(first);
    await repo.setRestored(2, false); expect(pub(2)).toEqual({ r: 0, p: null });
    await repo.updateMediaItem(2, { title: 'x' }); expect(pub(2).p).toBe(null);   // a write without the flag leaves it alone
  });
  it('an on-air row that lost published_at is stamped again on the next backfill tick (11-01: 2647/2659 complete, restored 1, published_at NULL)', async () => {
    resetRestoredVerify();
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/3' ? good() : Promise.reject(new Error('nope'))) });
    db.prepare('UPDATE media_items SET published_at = NULL WHERE id = 3').run();
    expect(pub(3)).toEqual({ r: 1, p: null });
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/3' ? good() : Promise.reject(new Error('nope'))) });   // verify pass already done: only the per-tick list can catch it
    expect(pub(3).r).toBe(1); expect(pub(3).p).toBeTruthy();
  });
  it('the verify pass takes an off-air row that still carries published_at off the published list (485 was restored 0 + published_at)', async () => {
    resetRestoredVerify();
    db.prepare("UPDATE media_items SET restored = 0, published_at = '2026-10-31T20:16:05Z' WHERE id = 2").run();
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/2' ? m485 : Promise.reject(new Error('nope'))) });
    expect(pub(2)).toEqual({ r: 0, p: null });
  });
  it('a talk outside done is off the air: no published_at, by the repair (151 rows on 10-31) and on every state write', async () => {
    const at = '2026-10-30T10:00:00Z';
    db.prepare("UPDATE media_items SET published_at = ? WHERE id IN (1, 2, 3)").run(at);
    db.prepare("UPDATE media_items SET state = 'duplicate' WHERE id = 2").run();
    db.prepare("UPDATE media_items SET state = 'scheduled' WHERE id = 3").run();
    expect(await repo.clearOffAirPublished()).toEqual({ cleared: 2, ids: [2, 3] });
    expect([pub(1).p, pub(2).p, pub(3).p]).toEqual([at, null, null]);   // the done talk keeps its date
    expect((await repo.clearOffAirPublished()).cleared).toBe(0);
    await repo.updateMediaItem(1, { state: 'review', restored: 1 }); expect(pub(1).p).toBe(null);   // leaving done clears it, even with restored in the same write
    await repo.updateMediaItem(1, { state: 'done' }); await repo.setIndex(1, { restored: 1 }); expect(pub(1).p).toBeTruthy();   // back on air: stamped again
  });
  it('a published talk a duplicate group eliminates, excludes or un-revives loses published_at in the same write (11-01: 2187 duplicate with published_at)', async () => {
    const at = '2026-10-31T23:57:17Z';
    db.prepare("UPDATE media_items SET published_at = ? WHERE id IN (1, 2, 4)").run(at);
    await repo.markDuplicateItems([1], 'duplicate of s9: remaster NISQA 3.35 vs 2.25', 7);
    await repo.excludeItems([2], 'excluded');
    expect([pub(1).p, pub(2).p, pub(4).p]).toEqual([null, null, at]);
    db.prepare("UPDATE media_items SET state = 'queued', published_at = ? WHERE id = 4").run(at);
    await repo.unreviveItem(4, 'held again'); expect(pub(4).p).toBe(null);
    expect((await repo.clearOffAirPublished()).cleared).toBe(0);
  });
  it('the verify pass re-derives the verdict: a held remaster indexed "light" moves to "review" and so onto the held page (10-31, 1728)', async () => {
    resetRestoredVerify();
    db.prepare("UPDATE media_items SET restored = 0, verdict = 'light', next_stage = NULL, stages_missing = 0 WHERE id = 2").run();
    const m1728 = { remaster_tier: 'light', web_original: { m4a: 'a.m4a' }, enhancement: { listening: 'safe' }, quality: { overall: 'B' }, stages: ALL,
      remaster: { status: 'review', verdict: 'review', judged: { action: 'hold', problems: ['bad_excerpt'] } } };
    await backfillRestored({ repo, readMeta: async (d) => (d === '/x/2' ? m1728 : Promise.reject(new Error('nope'))) });
    expect(db.prepare('SELECT verdict v FROM media_items WHERE id = 2').get().v).toBe('review');
    expect((await repo.heldRows()).map((r) => r.id)).toContain(2);
  });
  it('the verify pass runs the repair once per pass', async () => {
    resetRestoredVerify();
    db.prepare("UPDATE media_items SET state = 'review', published_at = '2026-10-30' WHERE id = 3").run();
    await backfillRestored({ repo, readMeta: async () => Promise.reject(new Error('nope')) });
    expect(pub(3).p).toBe(null);
  });
});
