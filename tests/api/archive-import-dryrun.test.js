// archive-import-dryrun: sorts a drive's approved books into held / probably held / needs OCR / straight in without linking or OCR.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../../api/lib/repos/archives-repo.js', () => ({ itemsToImport: vi.fn(), getDrive: vi.fn(), itemsForDedup: vi.fn(async () => []) }));
vi.mock('../../api/lib/docs-repo.js', () => ({ docsByIsbn: vi.fn(async () => []), findDocuments: vi.fn(), listDocs: vi.fn(), getParagraphs: vi.fn() }));
vi.mock('../../api/lib/repos/collection-repo.js', () => ({ allFingerprints: vi.fn(() => []), applyClusters: vi.fn(), syncItems: vi.fn(), upsertFile: vi.fn(), saveBody: vi.fn(), searchCollections: vi.fn(() => []), setHoldings: vi.fn() }));
vi.mock('../../api/lib/ops/media-jobs.js', () => ({ deweyMediaDir: () => '/x/media' }));
vi.mock('../../api/lib/ops/dewey-ingest-folder-job.js', () => ({ ingestDir: () => '/x/ingest' }));
const { archiveImportDryrunJob, holdingsOf } = await import('../../api/lib/ops/archive-import-dryrun-job.js');

const drive = { id: 'g', root: '/tank/archives/g' };
const text = Array.from({ length: 80 }, (_, i) => `The Holy Book chapter${i} verse${i * 7} word${i * 3}`).join('\n');
const it1 = (id, rel, o = {}) => ({ id, kind: 'book', primary_rel: rel, title: 'junk', ...o });
const pr = (cls, o = {}) => ({ probe: { class: cls, pages: 100, sampled: [1, 2], text: `[page 1]\n${'sampled sentence '.repeat(40)}`, meta_text: '', ...o } });
describe('archive-import-dryrun', () => {
  it('buckets: held by text, probably held by title, born-digital straight in, SLP-bound survivors (image PDF + scan) with pages and $; unprobed and chapter files apart; talks skipped', async () => {
    const items = [
      it1(1, 'a.txt'), it1(2, 'b.txt'),
      it1(3, 'c.pdf', { metadata: { catalog: { title: 'Kitab-i-Iqan', author: 'x' }, probe: { ...pr('scan').probe, text: '[page 1]\nshort' } } }),
      it1(4, 'd.pdf', { metadata: { catalog: { title: 'Unknown Gem' }, ...pr('scan', { pages: 200 }) } }),
      it1(5, 'e.pdf', { metadata: { catalog: { title: 'Another Gem' }, ...pr('image_pdf', { pages: 300 }) } }),
      it1(6, 'f.pdf', { metadata: { catalog: { title: 'Held Gem' }, ...pr('image_pdf') } }),
      it1(7, 'g.pdf', { metadata: pr('born_digital') }),
      it1(8, 'h.pdf'),
      it1(9, 'bk/12 Some Man chap 11.pdf', { metadata: pr('scan') }),
      { id: 10, kind: 'talk', primary_rel: 't.mp3' },
    ];
    const read = async (path) => (path.endsWith('g.pdf') ? { markdown: text, scan: false } : path.endsWith('.pdf') ? { markdown: '', scan: true } : { markdown: text, scan: false });
    const check = async (id) => (id._text ? { verdict: id.file_name === 'a.txt' || id.title === 'Held Gem' ? 'held' : 'not-held', candidates: [{ id: 9, title: 'Lib copy' }] }
      : { verdict: 'undetermined', candidates: id.title === 'Kitab-i-Iqan' ? [{ id: 11, title: 'The Kitáb-i-Íqán', paragraph_count: 300 }] : [] });
    const r = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, read, check, byIsbn: async () => [], rate: { cents_per_page: 0.4, source: 'test' }, draining: () => false });
    expect(r.counts).toEqual({ held: 2, probably_held: 1, needs_ocr: 2, straight_in: 2, duplicates: 0, unprobed: 1, chapter_files: 1, skipped: 1, failed: 0 });
    expect(r.classes).toEqual({ born_digital: 3, image_pdf: 2, scan: 2 });
    expect(r.held.map((x) => x.id)).toEqual([1, 6]);
    expect(r.held[0]).toMatchObject({ id: 1, by: 'text', candidate: '#9 Lib copy' });
    expect(r.probably_held[0]).toMatchObject({ id: 3, by: 'title', class: 'scan', candidate: '#11 The Kitáb-i-Íqán' });
    expect(r.needs_ocr).toEqual([expect.objectContaining({ id: 4, class: 'scan', pages: 200, catalogued: true }), expect.objectContaining({ id: 5, class: 'image_pdf', pages: 300 })]);
    expect(r.slp).toMatchObject({ items: 2, pages: 500, over_page_limit: 0, cents_per_page: 0.4, est_usd: 2, by_class: { image_pdf: { items: 1, pages: 300 }, scan: { items: 1, pages: 200 } } });
    expect(r.unprobed[0]).toMatchObject({ id: 8 });
    expect(r.chapter_sets).toMatchObject({ sets: 1, files: 1 });
  });
  it('pages over the SLP limit are counted for a person', async () => {
    const items = [it1(1, 'a.pdf', { metadata: pr('scan', { pages: 900 }) })];
    const r = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, check: async () => ({ verdict: 'not-held', candidates: [] }), byIsbn: async () => [], rate: { cents_per_page: 1, source: 't' }, draining: () => false });
    expect(r.slp).toMatchObject({ pages: 900, over_page_limit: 1, est_usd: 9 });
  });
});

describe('archive-import-dryrun duplicates and evidence', () => {
  it('copies within the drive (any bucket, straight_in included) are listed once, the best copy is checked; matched rows keep the comparison numbers', async () => {
    const items = [
      it1(1, 'a/Hidden Words.txt', { title: 'The Hidden Words', bytes: 5000 }), it1(2, 'b/Hidden Words copy.txt', { title: 'The Hidden Words', bytes: 5100 }),
      it1(3, 'c.pdf', { title: 'Gleanings Whole', metadata: pr('scan', { pages: 300 }) }), it1(4, 'd.pdf', { title: 'Gleanings Whole', metadata: pr('image_pdf', { pages: 298 }) }),
      it1(5, 'e.txt', { title: 'Breakwell Pilgrim Notes' }),
    ];
    const rel = { relation: 'partial', ours_in_theirs: 0.3, theirs_in_ours: 0.8, length_ratio: 0.4, in_order: 0.9 };
    const check = async (id) => (id.title === 'Breakwell Pilgrim Notes' ? { verdict: 'partly-held', candidates: [{ id: 208557, title: 'Utterances', relation: rel }] } : { verdict: 'not-held', candidates: [] });
    const read = async () => ({ markdown: text, scan: false });
    const r = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, read, check, byIsbn: async () => [], rate: { cents_per_page: 1, source: 't' }, draining: () => false });
    expect(r.counts).toMatchObject({ duplicates: 2, held: 1, straight_in: 1, needs_ocr: 1 });
    expect(r.duplicates.map((x) => [x.id, x.of_id, x.step])).toEqual([[1, 2, 'title+length'], [3, 4, 'title+length']]);
    expect(r.held[0]).toMatchObject({ id: 5, evidence: [{ id: 208557, relation: 'partial', ours_in_theirs: 0.3, theirs_in_ours: 0.8, length_ratio: 0.4 }] });
    expect(r.slp).toMatchObject({ items: 1, pages: 298 });
  });
});

describe('archive-import-dryrun drain', () => {
  it('yields on a drain with offset + tallies, and the resume run finishes with the same totals as one uninterrupted run', async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, kind: 'talk', primary_rel: `t${i}.mp3` }));
    const whole = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, rate: { cents_per_page: 0.5, source: 't' }, draining: () => false });
    let n = 0;
    const y = await archiveImportDryrunJob({ drive: 'g', list: 2 }, { drive, items, rate: { cents_per_page: 0.5, source: 't' }, draining: () => n++ >= 3 });
    expect(y).toMatchObject({ yielded: true, resume: { drive: 'g', list: 2, offset: 3, limit: 1997, partial: { counts: { skipped: 3 }, checked: 3, classes: expect.any(Object), slp: expect.any(Object) } } });
    expect(y.resume.partial.lists.skipped).toHaveLength(2);
    const r = await archiveImportDryrunJob(y.resume, { drive, items: items.slice(3), rate: { cents_per_page: 0.5, source: 't' }, draining: () => false });
    expect(r.checked).toBe(6);
    expect(r.counts).toEqual(whole.counts);
    expect(r.skipped).toHaveLength(2);
  });
});

describe('archive-import-dryrun evidence for the batch page', () => {
  it('every verdict row carries relation + overlaps + length ratio + top 3 candidates with titles, is saved on the collection row, and clusters list members with title, step and score', async () => {
    const saved = [];
    const rel = { relation: 'overlap', ours_in_theirs: 0.1, theirs_in_ours: 0.2, length_ratio: 0.5 };
    const items = [it1(1, 'a.txt', { title: 'Partial Book' }), it1(2, 'b.txt', { title: 'Clean Book' }), it1(3, 'c/Twin Book.txt', { title: 'The Twin Book', bytes: 5000 }), it1(4, 'd/Twin Book 2.txt', { title: 'The Twin Book', bytes: 5100 })];
    const check = async (id) => (id.title === 'Partial Book' ? { verdict: 'partly-held', candidates: [1, 2, 3, 4].map((n) => ({ id: n, title: `Cand ${n}`, relation: rel })) } : { verdict: 'not-held', candidates: [] });
    const r = await archiveImportDryrunJob({ drive: 'g' }, { drive, items, read: async () => ({ markdown: text, scan: false }), check, byIsbn: async () => [], rate: { cents_per_page: 1, source: 't' }, draining: () => false, saveHoldings: async (...a) => { saved.push(a); } });
    expect(r.probably_held[0].holdings).toMatchObject({ verdict: 'probably_held', relation: 'overlap', ours_in_theirs: 0.1, theirs_in_ours: 0.2, length_ratio: 0.5 });
    expect(r.probably_held[0].holdings.candidates.map((c) => c.title)).toEqual(['Cand 1', 'Cand 2', 'Cand 3']);
    expect(r.straight_in[0].holdings).toMatchObject({ verdict: 'straight_in', relation: null, candidates: [] });
    expect(r.duplicates[0].holdings.dup).toMatchObject({ step: 'title+length' });
    expect(saved.map((a) => a[1])).toEqual(expect.arrayContaining(['a.txt', 'b.txt']));
    expect(saved).toHaveLength(4);
    expect(saved.find((a) => a[1] === 'a.txt')[0]).toBe('g');
    expect(r.dedup.clusters[0]).toMatchObject({ step: 'title+length', keep: { title: 'The Twin Book' }, members: [{ title: 'The Twin Book', step: 'title+length', score: expect.any(Number) }], score: expect.any(Number) });
    expect(holdingsOf('held', {}).candidates).toEqual([]);
  });
});
