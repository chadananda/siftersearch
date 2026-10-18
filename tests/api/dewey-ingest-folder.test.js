// The ingest folder (Chad 10-18): a file placed there is a decision to add it; worked a few at a time, EASIEST FIRST,
// re-checked just before (never added twice), the next round queued behind this one's intakes.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const items = [];
vi.mock('../../api/lib/repos/dewey-repo.js', () => ({
  findBySha: vi.fn(async (h) => items.filter((i) => i.sha256 === h).at(-1) || null),
  createItem: vi.fn(async (o) => { const i = { id: items.length + 1, log: [{ why: o.why }], ...o }; items.push(i); return i; }),
  updateItem: vi.fn(async (id, f, why) => { const i = items.find((x) => x.id === id); Object.assign(i, f); i.log.push({ why }); return i; }),
}));
vi.mock('../../api/lib/repos/activity-repo.js', () => ({ logActivity: vi.fn(async () => {}) }));
const { deweyIngestFolderJob, easiestFirst } = await import('../../api/lib/ops/dewey-ingest-folder-job.js');

const files = [
  { path: '/in/big-book.pdf', ext: 'pdf', size: 9e7 }, { path: '/in/notes.docx', ext: 'docx', size: 4e4 },
  { path: '/in/letter.txt', ext: 'txt', size: 2e3 }, { path: '/in/held-copy.doc', ext: 'doc', size: 5e4 }, { path: '/in/small.pdf', ext: 'pdf', size: 2e6 },
];
const deps = (queued) => ({
  list: async () => [...files].sort((a, b) => ({ txt: 0, docx: 1, doc: 3, pdf: 5 }[a.ext] - { txt: 0, docx: 1, doc: 3, pdf: 5 }[b.ext] || a.size - b.size)),
  sha: async (p) => `sha:${p}`,
  check: async ({ path }) => ({ identified: { title: path }, excerpt: 'x', result: { verdict: path.includes('held-copy') ? 'held' : 'not-held', candidates: [{ id: 9, title: 'Library copy' }] } }),
  appraise: async () => ({ title: 'Real Title', shelf: { religion: "Baha'i", collection: 'Pilgrim Notes' } }),
  queue: async (name, params) => queued.push([name, params]),
});

describe('dewey-ingest-folder', () => {
  beforeEach(() => { items.length = 0; });
  it('takes a batch easiest first, skips a copy already held, queues intakes then the next round', async () => {
    const queued = [];
    const r = await deweyIngestFolderJob({ batch: 3 }, deps(queued));
    expect(r.queued).toEqual(['/in/letter.txt', '/in/notes.docx']);   // txt, docx … then the held .doc counts toward the batch
    expect(r.held).toEqual(['/in/held-copy.doc']);
    expect(queued.map(([n]) => n)).toEqual(['dewey-intake', 'dewey-intake', 'dewey-ingest-folder']);
    expect(queued.at(-1)[1]).toEqual({ batch: 3, round: 2 });
    expect(items.find((i) => i.original_path === '/in/letter.txt')).toMatchObject({ state: 'source', title: 'Real Title', identified: { shelf: { collection: 'Pilgrim Notes' } } });
  });
  it('the next round skips what is handled and finishes without queueing another', async () => {
    const queued = [];
    await deweyIngestFolderJob({ batch: 3 }, deps(queued));
    queued.length = 0;
    const r = await deweyIngestFolderJob({ batch: 3, round: 2 }, deps(queued));
    expect(r.queued).toEqual(['/in/small.pdf', '/in/big-book.pdf']);
    expect(r.skipped).toBe(3);
    expect(queued.map(([n]) => n)).toEqual(['dewey-intake', 'dewey-intake']);   // nothing left → no round 3
  });
  it('a file once declined but placed in the folder is a yes', async () => {
    items.push({ id: 1, sha256: 'sha:/in/letter.txt', state: 'declined', log: [{ why: 'declined by chad' }] });
    const queued = [];
    await deweyIngestFolderJob({ batch: 1 }, deps(queued));
    expect(items[0].state).toBe('source');
  });
  it('nothing goes in unappraised or out of scope — it waits for a person (the Copyright Book List of 10-18)', async () => {
    const queued = [];
    const d = { ...deps(queued), appraise: async (id) => (String(id.title).includes('letter') ? null : String(id.title).includes('notes') ? { title: 'A list of file names', recommendation: 'skip', in_scope: 'no', summary: 'a list of PDF file names' } : { title: 'Real Title' }) };
    const r = await deweyIngestFolderJob({ batch: 2 }, d);
    expect(r.needs_person).toEqual(['/in/letter.txt', '/in/notes.docx']);
    expect(r.queued).toEqual([]);
    expect(items.find((i) => i.original_path === '/in/letter.txt').log.at(-1).why).toMatch(/could not be appraised/);
    expect(items.find((i) => i.original_path === '/in/notes.docx').log.at(-1).why).toMatch(/out of scope: a list of PDF file names/);
    expect(queued.map(([n]) => n)).toEqual(['dewey-ingest-folder']);
  });
  it('lists only document formats, easiest first', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('fs');
    const { tmpdir } = await import('os');
    const d = mkdtempSync(`${tmpdir()}/ingest-`);
    writeFileSync(`${d}/b.pdf`, 'x'.repeat(10)); writeFileSync(`${d}/a.docx`, 'x'.repeat(50)); writeFileSync(`${d}/c.mp3`, 'x'); mkdirSync(`${d}/sub`); writeFileSync(`${d}/sub/z.txt`, 'x');
    expect((await easiestFirst(d)).map((f) => f.path.split('/').pop())).toEqual(['z.txt', 'a.docx', 'b.pdf']);
  });
});
