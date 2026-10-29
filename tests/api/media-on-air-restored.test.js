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
  db.exec(`CREATE TABLE media_items(id INTEGER PRIMARY KEY, slug TEXT, title TEXT, speaker TEXT, speaker_key TEXT, tradition TEXT, collection TEXT, language TEXT, year INTEGER, date TEXT, duration_s REAL, has_video INTEGER DEFAULT 0, source_kind TEXT, source_ref TEXT, youtube_id TEXT, channel TEXT, playback TEXT, thumb TEXT, quotes_n INTEGER, crs_n INTEGER, words_n INTEGER, doc_id INTEGER, grade TEXT, primary_issue TEXT, chain_key TEXT, priority REAL, audience INTEGER, queue_rank INTEGER, stage TEXT, state TEXT, why TEXT, dir TEXT, stages_done TEXT, restored INTEGER, published_at TEXT, updated_at TEXT)`);
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

describe('backfillRestored', () => {
  it('flags unclassified published rows from meta.json (restored tier → 1, none → 0, unreadable → 0)', async () => {
    const metas = { '/x/3': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'heavy' } };
    const n = await backfillRestored({ repo, readMeta: async (d) => { if (!metas[d]) throw new Error('nope'); return metas[d]; } });
    expect(n).toBe(1);
    expect(db.prepare('SELECT restored r FROM media_items WHERE id = 3').get().r).toBe(1);
    expect((await repo.unclassifiedDone()).length).toBe(0);
  });
  it('the bulk light tier is not restoration, and rows already flagged under the looser rule are corrected', async () => {
    resetRestoredVerify();
    const metas = { '/x/1': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'light' }, '/x/3': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'light' }, '/x/4': { web_original: { m4a: 'a.m4a' }, remaster_tier: 'cleaned' } };
    await backfillRestored({ repo, readMeta: async (d) => metas[d] || Promise.reject(new Error('nope')) });
    const r = (id) => db.prepare('SELECT restored r FROM media_items WHERE id = ?').get(id).r;
    expect([r(1), r(3), r(4)]).toEqual([0, 0, 1]);
  });
});
