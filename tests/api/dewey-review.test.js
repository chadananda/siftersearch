// The Review popup's answers (Chad 10-18: "Needs a person" must give a way to comply): which answers fit which question,
// and what each answer does to the item — "add it" sets the override the intake / OCR guards honour.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  getItem: vi.fn(async (id) => items.find((i) => i.id === Number(id))),
  updateItem: vi.fn(async (id, f, why) => { const i = items.find((x) => x.id === Number(id)); Object.assign(i, f); i.log.push({ state: f.state || i.state, why }); return i; }),
}));
vi.mock('../../api/lib/repos/ops-report-repo.js', () => ({ enqueue: vi.fn(async () => ({})) }));
vi.mock('../../api/lib/dewey/intake.js', () => ({ libraryShelves: () => ({ 'Bahai': ['Pilgrim Notes', 'Letters'] }) }));
const { answersFor, reviewOf, resolveItem } = await import('../../api/lib/dewey/review.js');

const item = (over = {}) => ({ id: 1, title: 'Notes', author: null, state: 'needs-human', original_path: '/tank/library-originals/abc.pdf', identified: {}, log: [{ why: 'only part of a book? Its text is 1,479 words' }], ...over });

describe('answersFor', () => {
  it('a fragment: add it as it is, or decline', () => {
    expect(answersFor(item()).map((a) => a.action)).toEqual(['import', 'archive', 'decline']);
    expect(answersFor(item())[0].label).toMatch(/as it is/);
  });
  it('rejected OCR: use it first, run again, decline — no "add it" (it would only go back to OCR)', () => {
    const a = answersFor(item({ identified: { slp_rejected: { path: '/ocr/x.slp.md', check: { sampleFound: 0.35 } } }, log: [{ why: 'SearchLayerPDF text did not pass the check' }] }));
    expect(a.map((x) => x.action)).toEqual(['use-ocr', 'retry-ocr', 'archive', 'decline']);
  });
  it('OCR that barely matched our own read (2%): run again is recommended', () => {
    const a = answersFor(item({ identified: { slp_rejected: { path: '/ocr/x.slp.md', check: { sampleFound: 0.02 } } }, log: [{ why: 'did not pass' }] }));
    expect(a.map((x) => x.action)).toEqual(['retry-ocr', 'use-ocr', 'archive', 'decline']);
  });
  it('OCR failed (network): try again or decline', () => {
    expect(answersFor(item({ log: [{ why: 'full OCR failed: fetch failed' }] })).map((x) => x.action)).toEqual(['retry-ocr', 'archive', 'decline']);
  });
  it('over the page limit: approve OCR first', () => {
    expect(answersFor(item({ log: [{ why: 'a 512-page scan — over the 400-page limit for automatic OCR' }] }))[0]).toMatchObject({ action: 'retry-ocr', label: 'Approve full OCR' });
  });
  it('a possible twin: "Not the same — add it"', () => {
    expect(answersFor(item({ log: [{ why: 'possibly the same work as item 4' }] }))[0].label).toBe('Not the same — add it');
  });
});

describe('resolveItem', () => {
  beforeEach(() => { items = [item()]; });
  it('add it → source, override set, shelf and title taken, intake queued first', async () => {
    const { enqueue } = await import('../../api/lib/repos/ops-report-repo.js');
    await resolveItem(1, 'import', { title: ' The Notes ', shelf: { religion: 'Bahai', collection: 'Pilgrim Notes' } }, 'chad');
    expect(items[0]).toMatchObject({ state: 'source', title: 'The Notes', identified: { override: { add: true, by: 'chad' }, shelf: { religion: 'Bahai', collection: 'Pilgrim Notes' } } });
    expect(enqueue).toHaveBeenCalledWith('dewey-intake', { id: 1, priority: 1 }, 'chad');
  });
  it('use the OCR text → it becomes the item\'s text', async () => {
    items = [item({ identified: { slp_rejected: { path: '/ocr/x.slp.md', job_id: 'j1' } } })];
    await resolveItem(1, 'use-ocr', {}, 'chad');
    expect(items[0].identified).toMatchObject({ slp: { path: '/ocr/x.slp.md', accepted_by: 'chad' }, slp_rejected: null });
  });
  it('decline → declined; an answer that does not fit is refused; an imported item has nothing to answer', async () => {
    await expect(resolveItem(1, 'use-ocr', {}, 'chad')).rejects.toThrow(/does not fit/);
    await resolveItem(1, 'decline', {}, 'chad');
    expect(items[0].state).toBe('declined');
    await expect(resolveItem(1, 'import', {}, 'chad')).rejects.toThrow(/nothing to answer/);
  });
});

describe('reviewOf', () => {
  it('the question, the OCR text without markers, the shelves', async () => {
    items = [item({ identified: { slp_rejected: { path: '/ocr/x.slp.md', check: { why: ['too few words'] } } } })];
    const r = await reviewOf(1, { read: async () => '---\ntitle: x\n---\n<!-- pdf:1 -->\nDear friend', size: async () => ({ size: 2048 }), shelves: () => ({ Bahai: ['Letters'] }) });
    expect(r.question).toMatch(/part of a book/);
    expect(r.text).toMatchObject({ from: 'ocr-rejected', preview: 'Dear friend', why_rejected: ['too few words'] });
    expect(r.source).toMatchObject({ ext: 'pdf', bytes: 2048 });
    expect(r.shelves).toEqual({ Bahai: ['Letters'] });
  });
});

describe('decline cancels SLP', () => {
  it('a job still reading it is cancelled; a finished one is left alone', async () => {
    const cancel = vi.fn(async () => ({ deleted: true }));
    items = [item({ identified: { slp_progress: { job_id: 'job_live', step: 'processing' } } })];
    await resolveItem(1, 'decline', {}, 'chad', { cancel });
    expect(cancel).toHaveBeenCalledWith('job_live');
    expect(items[0].log.at(-1).why).toMatch(/job_live cancelled/);
    items = [item({ identified: { slp_progress: { job_id: 'job_done', step: 'complete' }, slp_rejected: { path: '/o.md', job_id: 'job_done' } } })];
    cancel.mockClear();
    await resolveItem(1, 'decline', {}, 'chad', { cancel });
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('archive (Chad 10-19: "keep an archive of unsearchable documents that might have value later")', () => {
  it('an imported, unreadable document is withdrawn from search and its item archived; the original stays', async () => {
    items = [item({ id: 1, state: 'ingested', doc_id: 956320 })];
    const remove = vi.fn(async () => ({ deleted: 1 }));
    await resolveItem(1, 'archive', {}, 'chad', { remove });
    expect(remove).toHaveBeenCalledWith([956320], expect.objectContaining({ allowLastCopy: true }));
    expect(items[0].state).toBe('archived');
    expect(items[0].log.at(-1).why).toMatch(/original is kept.*document 956320 withdrawn/);
  });
});
describe('the popup shows a document\'s size (10-19: "give me the total pages in the viewer")', () => {
  it('a PDF\'s pages and a text\'s words', async () => {
    items = [item({ identified: { slp_rejected: { path: '/ocr/x.slp.md' } } })];
    const r = await reviewOf(1, { read: async () => 'one two three four', size: async () => ({ size: 10 }), shelves: () => ({}), pdfPages: async () => 312 });
    expect(r.source.pages).toBe(312);
    expect(r.text.words).toBe(4);
  });
});
