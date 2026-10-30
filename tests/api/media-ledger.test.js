// The media stage ledger (planning/media-ledger-plan-20261030.md): meta.json stages → media_stages rows, diff-only writes, counts, reconcile.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memDb } from '../dewey/helpers.js';
import { MEDIA_LEDGER_SQL, stageRows, stageDiff } from '../../api/lib/media/ledger.js';

let rig, db;
vi.mock('../../api/lib/db.js', () => ({
  query: (...a) => rig.query(...a), queryOne: (...a) => rig.queryOne(...a), queryAll: (...a) => rig.queryAll(...a), transaction: (...a) => rig.transaction(...a),
}));
const ledger = await import('../../api/lib/repos/media-ledger-repo.js');
const { mediaLedgerReconcileJob } = await import('../../api/lib/ops/media-ledger-reconcile.js');

beforeEach(() => {
  const m = memDb(); rig = m.mod; db = m.db;
  for (const s of MEDIA_LEDGER_SQL) db.exec(s);
  db.exec(`CREATE TABLE media_items (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, speaker TEXT, state TEXT, duration_s REAL, dir TEXT, stage TEXT, published_at TEXT)`);
  db.exec(`INSERT INTO media_items (id, slug, title, speaker, state, duration_s, dir) VALUES (1,'a','A','S','done',3600,'/m/a'), (2,'b','B','S','queued',1800,'/m/b'), (3,'c','C','S','duplicate',600,'/m/c')`);
});

describe('media stage ledger', () => {
  it('meta.stages → rows: done with at, failed with an error, the rest ignored', () => {
    const rows = stageRows({ archive: { at: '2026-10-30T01:00:00Z', ms: 12.4 }, remaster: { error: 'guard', at: null }, web: { note: 'x' }, grade: null });
    expect(rows).toEqual([
      { stage: 'archive', status: 'done', at: '2026-10-30T01:00:00Z', ms: 12, host: null, detail: null },
      { stage: 'remaster', status: 'failed', at: null, ms: null, host: null, detail: '{"error":"guard"}' },
    ]);
    expect(stageDiff([{ stage: 'x', status: 'done', at: '1', ms: 1, host: null, detail: null }], [])).toEqual({ upsert: [], remove: ['x'] });
  });
  it('sync writes only the difference; a redo (stage cleared in meta) removes the row', async () => {
    const st = { archive: { at: '2026-10-30T01:00:00Z' }, remaster: { at: '2026-10-30T02:00:00Z', ms: 5000, pod: 'sifter-unipase-356', verdict: 'usable' } };
    expect(await ledger.syncItemStages(1, st)).toEqual({ upserted: 2, removed: 0 });
    expect(await ledger.syncItemStages(1, st)).toEqual({ upserted: 0, removed: 0 });
    const rows = await ledger.itemStages(1);
    expect(rows.find((r) => r.stage === 'remaster')).toMatchObject({ status: 'done', host: 'sifter-unipase-356', detail: '{"verdict":"usable"}' });
    expect(await ledger.syncItemStages(1, { archive: st.archive })).toEqual({ upserted: 0, removed: 1 });
  });
  it('counts and rates in talks and audio-hours; who has or lacks a stage', async () => {
    await ledger.syncItemStages(1, { remaster: { at: '2026-10-30T02:00:00Z' } });
    await ledger.syncItemStages(2, { archive: { at: '2026-10-29T02:00:00Z' } });
    await ledger.syncItemStages(3, { remaster: { at: '2026-10-30T02:00:00Z' } });   // a duplicate: not counted
    expect(await ledger.stageCounts()).toEqual([{ stage: 'archive', status: 'done', n: 1, audio_h: 0.5 }, { stage: 'remaster', status: 'done', n: 1, audio_h: 1 }]);
    expect(await ledger.stagesSince('2026-10-30T00:00:00Z')).toEqual([{ stage: 'remaster', n: 2, audio_h: 1.2 }]);
    expect((await ledger.itemsByStage({ stage: 'remaster', missing: true })).map((r) => r.id)).toEqual([2]);
    expect((await ledger.itemsByStage({ stage: 'remaster' })).map((r) => r.id)).toEqual([1, 3]);
  });
  it('reconcile mirrors every folder, then reports zero drift', async () => {
    const metas = { '/m/a': { stages: { archive: { at: '2026-10-30T01:00:00Z' } } }, '/m/b': { stages: {} } };
    const readMeta = async (dir) => { if (!metas[dir]) throw new Error('none'); return metas[dir]; };
    const r = await mediaLedgerReconcileJob({}, { readMeta });
    expect(r).toMatchObject({ talks: 2, changed_talks: 1, upserted: 1, removed: 0, last_id: 2 });
    expect((await mediaLedgerReconcileJob({}, { readMeta })).changed_talks).toBe(0);
  });
});

describe('media status (internal API + Dewey)', async () => {
  const S = await import('../../api/lib/media/media-status.js');
  const repo = { getMediaItem: async (id) => (id === 1 ? { id: 1, slug: 'a', title: 'A', state: 'done', restored: 1 } : null), getMediaBySlug: async (s) => (s === 'a' ? { id: 1, slug: 'a', title: 'A', state: 'done', restored: 1 } : null),
    mediaStates: async () => [{ state: 'done', stage: null, n: 1 }] };
  const queued = [];
  const d = () => ({ ledger, repo, item: { STAGES: ['archive', 'remaster', 'web'], COMPLETE_STAGES: ['archive', 'remaster'] }, now: () => Date.parse('2026-10-30T03:00:00Z'),
    ops: { enqueue: async (name, params, by) => (queued.push({ name, params, by }), { id: queued.length }) },
    cloud: { loadState: async () => ({ queue: [5, 6], jobs: { j: {} }, pods: { p: {}, q: { terminated: true } }, staged: { 5: {} }, done: [{ id: 1, at: Date.parse('2026-10-30T02:30:00Z'), audio_s: 3600 }] }), spendOf: () => 12.345 } });
  it('status by id, slug or title: stages and what is missing', async () => {
    await ledger.syncItemStages(1, { archive: { at: '2026-10-30T01:00:00Z' } });
    const r = await S.mediaStatus('a', d());
    expect(r.item.id).toBe(1); expect(r.stages.map((x) => x.stage)).toEqual(['archive']); expect(r.missing).toEqual(['remaster']); expect(r.complete).toBe(false);
    expect((await S.mediaStatus('1', d())).item.slug).toBe('a');
    expect((await S.mediaStatus('zzz', d())).matches).toEqual([]);
    expect((await S.mediaStatus('', d())).error).toBeTruthy();
  });
  it('progress: stage counts, rates, and the lane', async () => {
    await ledger.syncItemStages(1, { remaster: { at: '2026-10-30T02:30:00Z' } });
    const p = await S.mediaProgress(d());
    expect(p.last_hour).toEqual([{ stage: 'remaster', n: 1, audio_h: 1 }]);
    expect(p.lane).toMatchObject({ queue: 2, in_flight: 1, pods: 1, staged_talks: 1, remastered_1h: 1, audio_h_1h: 1, spent_usd: 12.35 });
  });
  it('add and redo enqueue the existing reports; bad input is refused', async () => {
    expect((await S.mediaAdd({ paths: ['/etc/passwd'] }, d())).error).toBeTruthy();
    expect(await S.mediaAdd({ urls: ['https://youtu.be/x'], by: 'dewey' }, d())).toEqual({ queued: true, run: 1 });
    expect((await S.mediaRedo({ ids: [1], stages: ['nope'] }, d())).error).toBeTruthy();
    expect(await S.mediaRedo({ ids: ['1'], stages: ['web', 'nope'] }, d())).toMatchObject({ queued: true, ids: [1], stages: ['web'] });
    expect(queued.at(-1)).toMatchObject({ name: 'media-stages', params: { write: true, ids: [1], redo: ['web'] } });
  });
});
