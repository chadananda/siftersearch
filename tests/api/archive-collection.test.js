// collection.db per donor collection: rows, md/sample files, FTS search across collections, clusters, backfill + search reports.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { upsertFile, saveBody, allFingerprints, searchCollections, openCollection, dataDir } from '../../api/lib/repos/collection-repo.js';
import { archiveCollectionBackfillJob, archiveSearchJob } from '../../api/lib/ops/archive-collection-job.js';
import { driveDedup } from '../../api/lib/ops/archive-import-job.js';

let root;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'coll-')); process.env.ARCHIVES_DIR = root; });
afterEach(() => { delete process.env.ARCHIVES_DIR; rmSync(root, { recursive: true, force: true }); });

describe('collection.db', () => {
  it('creates <drive>.data with md/sample/slp and one row per path (upsert keeps earlier fields)', () => {
    const id = upsertFile('d1', { path: 'a/b.pdf', sha256: 'S1', title: 'T' });
    expect(upsertFile('d1', { path: 'a/b.pdf', words: 500 })).toBe(id);
    for (const d of ['md', 'sample', 'slp']) expect(existsSync(join(dataDir('d1'), d))).toBe(true);
    const db = openCollection('d1', { readonly: true }); const r = db.prepare('SELECT * FROM files').all(); db.close();
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ sha256: 'S1', title: 'T', words: 500 });
  });
  it('saveBody writes md/<id>.md with frontmatter, a scan sample, and indexes the body for search', () => {
    upsertFile('d1', { path: 'x.epub', sha256: 'H', fmt: 'epub', title: 'The Dawn-Breakers' });
    const id = saveBody('d1', 'x.epub', { md: 'Nabil narrates the dawn of the Babi faith in Shiraz.', converter: 'fingerprint.py 1', title: 'The Dawn-Breakers' });
    const md = readFileSync(join(dataDir('d1'), 'md', `${id}.md`), 'utf8');
    expect(md).toMatch(/^---\nsource: "x.epub"\nsha256: H\nformat: epub\nconverter: "fingerprint.py 1"\nconverted: /); expect(md).toContain('Shiraz');
    saveBody('d1', 's.pdf', { sample: '[page 1] sample text' });
    expect(readFileSync(join(dataDir('d1'), 'sample', '2.txt'), 'utf8')).toContain('sample text');
    expect(searchCollections({ q: 'Babi Shiraz' }).map((h) => h.path)).toEqual(['x.epub']);
    expect(searchCollections({ q: 'Babi' })[0].snippet).toContain('[Babi]');
  });
  it('search and fingerprints span every collection, read-only', () => {
    upsertFile('d1', { path: 'a.pdf', sha256: 'AA', norm_sha: 'NN', title: 'Gleanings' }); upsertFile('d2', { path: 'z/g.pdf', sha256: 'BB', title: 'Gleanings from the Writings' });
    expect(searchCollections({ title: 'Gleanings' }).map((h) => h.drive).sort()).toEqual(['d1', 'd2']);
    expect(searchCollections({ sha: 'NN' })[0]).toMatchObject({ drive: 'd1', path: 'a.pdf' });
    expect(searchCollections({ title: 'Gleanings', drive: 'd2' })).toHaveLength(1);
    expect(allFingerprints().map((r) => `${r.drive_id}:${r.path}`).sort()).toEqual(['d1:a.pdf', 'd2:z/g.pdf']);
  });
  it('driveDedup clusters across collections and records cluster/best/step on each collection\'s rows', async () => {
    upsertFile('d1', { path: 'a.pdf', sha256: 'AA', norm_sha: 'SAME', words: 9000, cls: 'born_digital', title: 'Book One' });
    upsertFile('d2', { path: 'b.pdf', sha256: 'BB', norm_sha: 'SAME', words: 9000, cls: 'scan', title: 'Book One' });
    const res = await driveDedup('d2', { view: async () => [], bySha: async () => null });
    expect(res.dups.get('d2:b.pdf')).toMatchObject({ of: 'd1:a.pdf', step: 'normalised-body' });
    const rows = (d) => { const db = openCollection(d, { readonly: true }); const r = db.prepare('SELECT best, dup_step, dup_of, cluster_id FROM files').get(); db.close(); return r; };
    expect(rows('d1')).toMatchObject({ best: 1, dup_step: null, cluster_id: 'd1:a.pdf' });
    expect(rows('d2')).toMatchObject({ best: 0, dup_step: 'normalised-body', dup_of: 'd1:a.pdf' });
    expect(searchCollections({ cluster: 'd1:a.pdf' })).toHaveLength(2);
  });
  it('syncItems mirrors catalogue items (+ probe fingerprint) idempotently; backfill job pages them', async () => {
    const items = [{ id: 1, drive_id: 'g', primary_rel: 'k/one.pdf', bytes: 10, title: 'One', metadata: { catalog: { title: 'One Real', author: 'A' }, probe: { class: 'scan', pages: 5, fp: { sha256: 'Z' } } } }, { id: 2, drive_id: 'g', primary_rel: 'k/two.epub', bytes: 20, title: 'Two' }];
    const out = await archiveCollectionBackfillJob({ drive: 'g' }, { get: async () => ({ id: 'g', donor_id: 'd' }), list: async (_d, { offset }) => (offset ? [] : items), draining: () => false });
    await archiveCollectionBackfillJob({ drive: 'g' }, { get: async () => ({ id: 'g', donor_id: 'd' }), list: async (_d, { offset }) => (offset ? [] : items), draining: () => false });
    expect(out.rows).toBe(2);
    const db = openCollection('g', { readonly: true }); const r = db.prepare('SELECT path, title, author, sha256, scan, text_layer, item_id FROM files ORDER BY id').all(); const c = db.prepare('SELECT * FROM collection').get(); db.close();
    expect(r).toEqual([{ path: 'k/one.pdf', title: 'One Real', author: 'A', sha256: 'Z', scan: 1, text_layer: 0, item_id: 1 }, { path: 'k/two.epub', title: 'Two', author: null, sha256: null, scan: null, text_layer: null, item_id: 2 }]);
    expect(c.donor).toBe('d');
  });
  it('archive-search needs a query and returns hits', async () => {
    await expect(archiveSearchJob({})).rejects.toThrow(/needs/);
    expect(await archiveSearchJob({ q: 'x' }, { search: () => [{ drive: 'd' }] })).toEqual({ hits: 1, results: [{ drive: 'd' }] });
  });
});
