import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ARCHIVES_SQL } from '../../api/lib/archives/schema.js';

let rig;
vi.mock('../../api/lib/db.js', () => ({
  query: (...a) => rig.query(...a), queryOne: (...a) => rig.queryOne(...a), queryAll: (...a) => rig.queryAll(...a), transaction: (...a) => rig.transaction(...a),
}));
const repo = await import('../../api/lib/repos/archives-repo.js');
const { archiveAdoptJob } = await import('../../api/lib/ops/archive-adopt-job.js');
const { buildIndex } = await import('../../api/lib/dewey/title-index.js');
const { memDb } = await import('../dewey/helpers.js');

beforeEach(() => { const m = memDb(); for (const s of ARCHIVES_SQL) m.db.exec(s); rig = m.mod; });

const item = (rel, o = {}) => ({ kind: 'book', section: 'main', title: 'T', primary_rel: rel, rel_paths: [rel], files: 1, bytes: 10, match: 'new', score: 50, why: 'w', destination: 'd', metadata: { a: 1 }, ...o });

describe('archives repo', () => {
  it('donor/drive upsert, id check, custody', async () => {
    await repo.upsertDonor({ id: 'duane', name: 'Duane Troxel' });
    await expect(repo.upsertDrive({ id: 'Bad_ID', donor_id: 'duane' })).rejects.toThrow();
    await repo.upsertDrive({ id: 'golden-age', donor_id: 'duane', label: 'GOLDEN AGE' });
    await repo.upsertDrive({ id: 'golden-age', donor_id: 'duane', files: 5 });
    const d = await repo.setCustody('golden-age', { status: 'copying', received_at: '2026-10-01' });
    expect(d).toMatchObject({ label: 'GOLDEN AGE', files: 5, status: 'copying', received_at: '2026-10-01' });
    expect(await repo.listDrives({ donorId: 'duane' })).toHaveLength(1);
  });
  it('re-upsert refreshes catalogue fields but keeps the decision', async () => {
    await repo.upsertItems('d1', [item('a.pdf'), item('b.pdf', { score: 90 })]);
    const [first] = await repo.listItems('d1');
    expect(first.primary_rel).toBe('b.pdf');
    await repo.decideItem(first.id, { decision: 'approve', note: 'yes', by: 'chad' });
    await repo.upsertItems('d1', [item('b.pdf', { score: 10, title: 'New title' })]);
    const [b] = await repo.listItems('d1', { decision: 'approve' });
    expect(b).toMatchObject({ score: 10, title: 'New title', decision: 'approve', decision_note: 'yes', decided_by: 'chad' });
    expect(await repo.listItems('d1')).toHaveLength(2);
    expect(await repo.itemCounts('d1')).toEqual(expect.arrayContaining([expect.objectContaining({ decision: 'approve', n: 1 })]));
  });
  it('listItems filters by match (list) and text; decideItems sets one decision on many', async () => {
    await repo.upsertItems('d2', [item('a/One_100%.pdf', { match: 'new', title: 'Gleanings 100%', score: 9 }), item('b.pdf', { match: 'held', creator: 'Shoghi Effendi', score: 8 }),
      item('c.pdf', { match: 'unsure', score: 7 }), item('d.pdf', { match: 'junk', score: 1 })]);
    expect((await repo.listItems('d2', { match: 'new,unsure' })).map((x) => x.primary_rel)).toEqual(['a/One_100%.pdf', 'c.pdf']);
    expect((await repo.listItems('d2', { match: ['held'] }))).toHaveLength(1);
    expect((await repo.listItems('d2', { q: 'shoghi' })).map((x) => x.primary_rel)).toEqual(['b.pdf']);
    expect((await repo.listItems('d2', { q: '100%' })).map((x) => x.primary_rel)).toEqual(['a/One_100%.pdf']);
    expect(await repo.listItems('d2', { q: '_' })).toHaveLength(1);   // LIKE wildcards are literal
    const ids = (await repo.listItems('d2', { match: 'new,unsure' })).map((x) => x.id);
    expect(await repo.decideItems([...ids, ids[0], 'x'], { decision: 'deny', by: 'chad' })).toBe(2);
    expect((await repo.listItems('d2', { decision: 'deny' })).map((x) => x.decided_by)).toEqual(['chad', 'chad']);
    expect(await repo.listItems('d2', { decision: 'undecided' })).toHaveLength(2);
    await expect(repo.decideItems(ids, { decision: 'maybe' })).rejects.toThrow();
    await repo.decideItems(ids, { decision: null });
    expect(await repo.listItems('d2', { decision: 'undecided' })).toHaveLength(4);
    expect(await repo.getItem(ids[0])).toMatchObject({ decision: null, decided_at: null, decided_by: null });
  });
  it('driveReport lists imported items', async () => {
    await repo.upsertDonor({ id: 'x', name: 'X' }); await repo.upsertDrive({ id: 'dr', donor_id: 'x' });
    await repo.upsertItems('dr', [item('a.pdf')]);
    expect((await repo.driveReport('dr')).imported).toHaveLength(0);
    rig.query("UPDATE intake_items SET imported_at = '2026-11-01'");
    expect((await repo.driveReport('dr')).imported).toHaveLength(1);
  });
  it('report buckets: each item counted once; junk/copies never listed; approved-not-imported listed as selected; donor report sums drives', async () => {
    await repo.upsertDonor({ id: 'duane', name: 'Duane Troxel' });
    await repo.upsertDrive({ id: 'g1', donor_id: 'duane', label: 'ONE', files: 100 });
    await repo.upsertDrive({ id: 'g2', donor_id: 'duane', label: 'TWO', files: 50 });
    await repo.upsertItems('g1', [item('imp.pdf', { title: 'Imported' }), item('sel.pdf', { title: 'Selected' }), item('held.pdf', { match: 'held' }),
      item('no.pdf'), item('open.pdf'), item('j.db', { section: 'set-aside', kind: 'junk', match: 'junk' }), item('c.pdf', { section: 'set-aside', match: 'copy' })]);
    await repo.upsertItems('g2', [item('x.mp3', { kind: 'talk', title: 'A talk' })]);
    const id = async (d, rel) => (await repo.listItems(d, { limit: 100 })).find((x) => x.primary_rel === rel).id;
    await repo.decideItem(await id('g1', 'sel.pdf'), { decision: 'approve' });
    await repo.decideItem(await id('g1', 'imp.pdf'), { decision: 'approve' });
    await repo.decideItem(await id('g1', 'no.pdf'), { decision: 'deny' });
    await repo.decideItem(await id('g1', 'c.pdf'), { decision: 'approve' });   // set-aside wins: never listed
    rig.query("UPDATE intake_items SET imported_at = '2026-11-01', imported_ref = '/library/x' WHERE primary_rel = 'imp.pdf'");
    const r = await repo.driveReport('g1');
    expect(r.buckets).toEqual({ imported: 1, selected: 1, held: 1, declined: 1, pending: 1, set_aside: 2, items: 7, reviewed: 5 });
    expect(r.imported).toEqual([expect.objectContaining({ title: 'Imported', link: '/library/x' })]);
    expect(r.selected.map((x) => x.title)).toEqual(['Selected']);
    expect(r.imported[0]).not.toHaveProperty('primary_rel');
    const d = await repo.donorReport('duane');
    expect(d.drives.map((x) => x.drive.label)).toEqual(['ONE', 'TWO']);
    expect(d).toMatchObject({ files: 150, buckets: { items: 8, reviewed: 6, pending: 2, imported: 1 } });
    expect(await repo.donorReport('nobody')).toBeNull();
    expect(repo.linkOf({ imported_ref: 'doc:77', metadata: null })).toBeNull();
    expect(repo.linkOf({ imported_ref: 'doc:77', metadata: { link: 'https://x.org/a' } })).toBe('https://x.org/a');
  });
});

describe('archive-adopt report', () => {
  it('adopts a tiny catalogue, idempotently', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cat-')), 'g.db');
    const c = new Database(path);
    c.exec('CREATE TABLE files(id INTEGER PRIMARY KEY, rel, folder, name, ext, cls, size, mtime, fp, dur, title, artist, year, sug, why, near)');
    const ins = c.prepare('INSERT INTO files(rel, folder, name, ext, cls, size, dur, sug) VALUES (?,?,?,?,?,?,?,?)');
    ins.run('B/x.pdf', 'B', 'x.pdf', 'pdf', 'pdf', 9000, null, 'new');
    ins.run('CB/Covenant-Breakers/y.pdf', 'CB/Covenant-Breakers', 'y.pdf', 'pdf', 'pdf', 9000, null, 'duplicate');
    ins.run('T/t.wav', 'T', 't.wav', 'wav', 'audio', 9000, 2820, 'new');
    ins.run('T/t.mp3', 'T', 't.mp3', 'mp3', 'audio', 900, 2820, 'new');
    ins.run('T/Thumbs.db', 'T', 'Thumbs.db', 'db', 'junk', 10, null, null);
    c.close();
    const p = { drive: 'golden-age', donor: 'duane', donorName: 'Duane Troxel', catalog: path, index: buildIndex([]) };
    const r = await archiveAdoptJob(p);
    expect(r).toMatchObject({ files: 5, items: 4, section: { main: 2, 'covenant-breaker': 1, 'set-aside': 1 }, kind: { book: 2, talk: 1, junk: 1 } });
    const [top] = await repo.listItems('golden-age');
    await repo.decideItem(top.id, { decision: 'deny' });
    await archiveAdoptJob(p);
    expect(await repo.listItems('golden-age', { limit: 100 })).toHaveLength(4);
    expect((await repo.listItems('golden-age', { decision: 'deny' }))).toHaveLength(1);
    expect((await repo.getDrive('golden-age')).status).toBe('reviewing');
  });
  it('matches book titles against the library and prunes what a re-catalogue dropped (never a decision)', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cat-')), 'h.db');
    const c = new Database(path);
    c.exec('CREATE TABLE files(id INTEGER PRIMARY KEY, rel, folder, name, ext, cls, size, mtime, fp, dur, title, artist, year, sug, why, near)');
    const ins = c.prepare('INSERT INTO files(rel, folder, name, ext, cls, size, fp) VALUES (?,?,?,?,?,?,?)');
    ins.run('B/Some_Answered_Questions_OCRd.pdf', 'B', 'Some_Answered_Questions_OCRd.pdf', 'pdf', 'pdf', 9000, 'a');
    ins.run('Copy/Some_Answered_Questions_OCRd.pdf', 'Copy', 'Some_Answered_Questions_OCRd.pdf', 'pdf', 'pdf', 9000, 'a');
    ins.run('N/1956-07-14 Bahaists Meet In Memory of Martyr.pdf', 'N', '1956-07-14 Bahaists Meet In Memory of Martyr.pdf', 'pdf', 'pdf', 9000, 'b');
    ins.run('N/Gone Later Item.pdf', 'N', 'Gone Later Item.pdf', 'pdf', 'pdf', 9000, 'c');
    const index = buildIndex([{ id: 77, title: 'Some Answered Questions', author: "'Abdu'l-Bahá" }]);
    const p = { drive: 'kanz-1', donor: 'kanz', catalog: path, index };
    expect(await archiveAdoptJob(p)).toMatchObject({ files: 4, items: 3, match: { held: 1, new: 2 } });
    const held = (await repo.listItems('kanz-1')).find((x) => x.match === 'held');
    expect(held).toMatchObject({ primary_rel: 'B/Some_Answered_Questions_OCRd.pdf', match_ref: 'doc:77' });
    expect(held.why).toBe('Already in the library (Some Answered Questions #77); book, 2 copies on the drive.');
    expect((await repo.listItems('kanz-1')).every((x) => x.section === 'main')).toBe(true);
    const gone = (await repo.listItems('kanz-1')).find((x) => x.title === 'Gone Later Item');
    c.prepare('DELETE FROM files WHERE fp = ?').run('c'); c.prepare('DELETE FROM files WHERE fp = ?').run('b'); c.close();
    await repo.decideItem(gone.id, { decision: 'more_info' });
    await new Promise((r) => setTimeout(r, 5));
    expect(await archiveAdoptJob(p)).toMatchObject({ items: 1, pruned: 1 });
    expect((await repo.listItems('kanz-1', { limit: 100 })).map((x) => x.title).sort()).toEqual(['Gone Later Item', 'Some Answered Questions']);
  });
  it('excluded clips and in-drive copies are set aside, not ranked in main', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cat-')), 'i.db');
    const c = new Database(path);
    c.exec('CREATE TABLE files(id INTEGER PRIMARY KEY, rel, folder, name, ext, cls, size, mtime, fp, dur, title, artist, year, sug, why, near)');
    const ins = c.prepare('INSERT INTO files(rel, folder, name, ext, cls, size, fp, dur, sug, why) VALUES (?,?,?,?,?,?,?,?,?,?)');
    ins.run('A/jingle.mp3', 'A', 'jingle.mp3', 'mp3', 'audio', 900, 'j', 30, 'skip', 'excluded: under 60 s');
    ins.run('A/talk b.mp3', 'A', 'talk b.mp3', 'mp3', 'audio', 900, 'k', 3000, 'skip', 'duplicate: same name+duration inside drive; kept higher bitrate');
    ins.run('A/talk.mp3', 'A', 'talk.mp3', 'mp3', 'audio', 900, 'l', 3000, 'import', 'new');
    c.close();
    const r = await archiveAdoptJob({ drive: 'kanz-2', donor: 'kanz', catalog: path, index: buildIndex([]) });
    expect(r).toMatchObject({ section: { 'set-aside': 2, main: 1 }, match: { junk: 1, copy: 1, new: 1 } });
  });
});
