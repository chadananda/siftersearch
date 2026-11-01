// archive-import-dryrun: sorts a drive's approved books into held / probably held / needs OCR / straight in without linking or OCR.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ itemsToImport: vi.fn(), getDrive: vi.fn() }));
vi.mock('../../api/lib/ops/media-jobs.js', () => ({ deweyMediaDir: () => '/x/media' }));
vi.mock('../../api/lib/ops/dewey-ingest-folder-job.js', () => ({ ingestDir: () => '/x/ingest' }));
const { archiveImportDryrunJob } = await import('../../api/lib/ops/archive-import-dryrun-job.js');

const drive = { id: 'g', root: '/tank/archives/g' };
const text = Array.from({ length: 80 }, (_, i) => `The Holy Book chapter${i} verse${i * 7} word${i * 3}`).join('\n');
const it1 = (id, rel, o = {}) => ({ id, kind: 'book', primary_rel: rel, title: 'junk', ...o });
describe('archive-import-dryrun', () => {
  it('buckets: held by text, probably held by title (scan), needs OCR, straight in; talks skipped', async () => {
    const items = [it1(1, 'a.txt'), it1(2, 'b.txt'), it1(3, 'c.pdf', { metadata: { catalog: { title: 'Kitab-i-Iqan', author: 'x' } } }), it1(4, 'd.pdf', { metadata: { catalog: { title: 'Unknown Gem' } } }), { id: 5, kind: 'talk', primary_rel: 't.mp3' }];
    const read = async (path) => (path.endsWith('.pdf') ? { markdown: '', scan: true } : { markdown: text, scan: false });
    const check = async (id) => (id._text ? { verdict: id.file_name === 'a.txt' ? 'held' : 'not-held', candidates: [{ id: 9, title: 'Lib copy' }] }
      : { verdict: 'undetermined', candidates: id.title === 'Kitab-i-Iqan' ? [{ id: 11, title: 'The Kitáb-i-Íqán', paragraph_count: 300 }] : [] });
    const r = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, read, check, draining: () => false });
    expect(r.counts).toEqual({ held: 1, probably_held: 1, needs_ocr: 1, straight_in: 1, skipped: 1, failed: 0 });
    expect(r.held[0]).toMatchObject({ id: 1, by: 'text', candidate: '#9 Lib copy' });
    expect(r.probably_held[0]).toMatchObject({ id: 3, by: 'title', candidate: '#11 The Kitáb-i-Íqán' });
    expect(r.needs_ocr[0]).toMatchObject({ id: 4, catalogued: true });
  });
});

describe('archive-import-dryrun drain', () => {
  it('yields on a drain with offset + tallies, and the resume run finishes with the same totals as one uninterrupted run', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, kind: 'talk', primary_rel: `t${i}.mp3` }));
    const whole = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, draining: () => false });
    let n = 0;
    const y = await archiveImportDryrunJob({ drive: 'g', list: 2 }, { drive, items, draining: () => n++ >= 3 });
    expect(y).toMatchObject({ yielded: true, resume: { drive: 'g', list: 2, offset: 3, limit: 1997, partial: { counts: { skipped: 3 }, checked: 3 } } });
    expect(y.resume.partial.lists.skipped).toHaveLength(2);
    const r = await archiveImportDryrunJob(y.resume, { drive, items: items.slice(3), draining: () => false });
    expect(r.checked).toBe(6);
    expect(r.counts).toEqual(whole.counts);
    expect(r.skipped).toHaveLength(2);
  });
});
