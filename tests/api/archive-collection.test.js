// collection.db per donor collection: rows, md/sample files, FTS search across collections, clusters, backfill + search reports.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { upsertFile, saveBody, allFingerprints, searchCollections, openCollection, dataDir, setHoldings, fingerprintedPaths, mdFor, recordSlp, sifterRows, mergeSifter, syncItems } from '../../api/lib/repos/collection-repo.js';
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

describe('collection.db: re-probe, staging copy, SLP, sifter, verdicts', () => {
  it('fingerprintedPaths = rows with a MinHash, or a scan with sha + sample; mdFor finds the Markdown', () => {
    upsertFile('d', { path: 'a.pdf', sha256: 'A', minhash: 'f'.repeat(1024) }); upsertFile('d', { path: 'b.pdf', sha256: 'B' }); upsertFile('d', { path: 's.pdf', sha256: 'S', cls: 'scan' });
    saveBody('d', 's.pdf', { sample: 'pre-ocr text' }); saveBody('d', 'a.pdf', { md: 'body words' });
    expect([...fingerprintedPaths('d')].sort()).toEqual(['a.pdf', 's.pdf']);
    expect(fingerprintedPaths('nothing').size).toBe(0);
    expect(mdFor('d', 'a.pdf')).toMatchObject({ md_path: expect.stringMatching(/^md\/\d+\.md$/) });
    expect(readFileSync(mdFor('d', 'a.pdf').file, 'utf8')).toContain('body words');
    expect(mdFor('d', 'b.pdf')).toBeNull(); expect(mdFor('nothing', 'x')).toBeNull();
  });
  it('setHoldings creates the row when the backfill has not, and keeps the evidence as JSON', () => {
    setHoldings('d', 'new.pdf', { relation: 'overlap', candidates: [{ title: 'T' }] });
    const db = openCollection('d', { readonly: true }); const r = db.prepare('SELECT holdings FROM files WHERE path = ?').get('new.pdf'); db.close();
    expect(JSON.parse(r.holdings)).toMatchObject({ relation: 'overlap', candidates: [{ title: 'T' }] });
  });
  it('recordSlp writes slp/<id>/ and makes the SLP Markdown the staging copy', () => {
    const id = recordSlp('d', 'scan.pdf', { markdown: '# Scanned book\n\nReal words here.', receipt: { job: 'j1' }, title: 'Scanned' });
    expect(readFileSync(join(dataDir('d'), 'slp', String(id), 'slp.md'), 'utf8')).toContain('Real words');
    expect(JSON.parse(readFileSync(join(dataDir('d'), 'slp', String(id), 'receipt.json'), 'utf8'))).toEqual({ job: 'j1' });
    expect(readFileSync(mdFor('d', 'scan.pdf').file, 'utf8')).toContain('converter: "SearchLayerPDF"');
    expect(searchCollections({ q: 'Real words' })).toHaveLength(1);
  });
  it('an older collection.db without the verdict columns gains them on open', () => {
    const db = openCollection('old'); db.exec('ALTER TABLE files DROP COLUMN verdict_why'); db.close();
    upsertFile('old', { path: 'x.pdf', verdict: 'skip', verdict_why: 'dup', verdict_by: 'archive-import', verdict_at: 'T', imported_at: 'T' });
    const c = openCollection('old', { readonly: true }); const r = c.prepare('SELECT verdict, verdict_why FROM files').get(); c.close();
    expect(r).toEqual({ verdict: 'skip', verdict_why: 'dup' });
  });
  it('syncItems carries imported_at and the document id of a linked import', () => {
    syncItems('d', { donor_id: 'x' }, [{ id: 1, primary_rel: 'imp.pdf', imported_at: 'T1', imported_ref: '/document/42' }, { id: 2, primary_rel: 'wait.pdf', imported_at: 'T2', imported_ref: 'dewey:abc' }]);
    const db = openCollection('d', { readonly: true }); const rows = db.prepare('SELECT path, imported_at, imported_doc_id FROM files WHERE path IN (?, ?) ORDER BY path').all('imp.pdf', 'wait.pdf'); db.close();
    expect(rows).toEqual([{ path: 'imp.pdf', imported_at: 'T1', imported_doc_id: 42 }, { path: 'wait.pdf', imported_at: 'T2', imported_doc_id: null }]);
  });
  it('the archive-sifter catalogue (its own db) enriches rows (empty fields only) and adds missing documents; absent → nothing', () => {
    const sdir = mkdtempSync(join(tmpdir(), 'sifter-')); process.env.ARCHIVE_SIFTER_DATA = sdir;
    try {
      expect(sifterRows('g')).toEqual([]);
      const s = new Database(join(sdir, 'g.db'));
      s.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY, rel TEXT UNIQUE, folder TEXT, name TEXT, ext TEXT, cls TEXT, size INT, mtime INT, fp TEXT, dur REAL, title TEXT, artist TEXT, year TEXT, sug TEXT, why TEXT, near TEXT, dec TEXT, dec_by TEXT, dec_at TEXT, imported INT DEFAULT 0, import_note TEXT, gen INT DEFAULT 0)`);
      const ins = s.prepare('INSERT INTO files(rel, cls, size, mtime, fp, title, artist, year, sug, why, dec) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      ins.run('k/known.pdf', 'pdf', 100, 1700000000, '100:abc', 'Sifter Title', 'Sifter Author', '1950', 'duplicate', 'same bytes', 'skip'); ins.run('k/extra.docx', 'docx', 50, 1700000001, '50:def', 'Extra', null, null, null, null, null); ins.run('k/talk.mp3', 'audio', 9, 1, 'x', 't', null, null, null, null, null);
      s.close();
      const rows = sifterRows('g'); expect(rows.map((r) => r.rel).sort()).toEqual(['k/extra.docx', 'k/known.pdf']);
      upsertFile('g', { path: 'k/known.pdf', title: 'Catalogue Title', size: null });
      expect(mergeSifter('g', rows)).toEqual({ updated: 1, added: 1 });
      expect(mergeSifter('g', rows)).toEqual({ updated: 2, added: 0 });   // idempotent
      const db = openCollection('g', { readonly: true }); const r = db.prepare('SELECT path, title, author, year, size, meta FROM files ORDER BY path').all(); db.close();
      expect(r[1]).toMatchObject({ path: 'k/known.pdf', title: 'Catalogue Title', author: 'Sifter Author', year: '1950', size: 100 });
      expect(JSON.parse(r[1].meta).sifter).toMatchObject({ fp: '100:abc', sug: 'duplicate', dec: 'skip' });
      expect(r[0]).toMatchObject({ path: 'k/extra.docx', title: 'Extra', size: 50 });
    } finally { delete process.env.ARCHIVE_SIFTER_DATA; }
  });
  it('the backfill job folds the sifter rows in and reports them', async () => {
    const out = await archiveCollectionBackfillJob({ drive: 'g' }, { get: async () => ({ id: 'g' }), list: async () => [], draining: () => false, sifter: () => [{ rel: 'a.pdf', fp: 'f' }], merge: (d, rows) => ({ updated: 0, added: rows.length }) });
    expect(out).toEqual({ drive: 'g', rows: 0, sifter: { updated: 0, added: 1 } });
  });
});
