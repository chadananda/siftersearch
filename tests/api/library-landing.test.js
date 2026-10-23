// /library landing payload: hidden traditions never counted or shown, process counts read from the telemetry rings,
// arrivals deduplicated and capped; listDocs' newest order + collection exclusion produce the SQL the route relies on.
import { describe, it, expect, vi } from 'vitest';

const calls = [];
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async () => ({ changes: 0 })),
  queryAll: vi.fn(async (sql, params) => { calls.push({ sql, params }); return []; }),
  queryOne: vi.fn(async () => ({ n: 0 })),
}));
vi.mock('../../api/lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { shapeLanding } = await import('../../api/lib/library/landing.js');
const { listDocs } = await import('../../api/lib/docs-repo.js');

const snapshot = {
  at: 1792721719,
  traditions: [{ id: "Baha'i", documents: 66441, paragraphs: 3167145 }, { id: 'Other', documents: 10198, paragraphs: 623519 },
    { id: 'Islam', documents: 488, paragraphs: 3343538 }, { id: 'Empty', documents: 0, paragraphs: 0 }],
  rings: [{ id: 'text', done: 9100065 }, { id: 'sections', done: 72926, units: 75661 }, { id: 'refs', done: 5942906, units: 586795 },
    { id: 'alignment', done: 70433 }, { id: 'hype', units: 2305848 }, { id: 'phrase', units: 35368510 }, { id: 'context', done: 512115 },
    { id: 'entities', units: 222525 }, { id: 'embedding', done: 9093040 }],
};
const imports = { counts: { imported_24h: 3, imported_7d: 472, in_progress: 1, ocr: 0, waiting: 156 } };
const doc = (id, o = {}) => ({ id, title: `Book ${id}`, author: 'A', religion: "Baha'i", collection: 'Books', slug: `book-${id}`, ...o });

describe('shapeLanding', () => {
  const hidden = new Set(['Other']);
  it('counts only visible traditions, largest first', () => {
    const r = shapeLanding({ snapshot, imports, hidden });
    expect(r.traditions.map((t) => t.name)).toEqual(["Baha'i", 'Islam']);
    expect(r.totals).toEqual({ documents: 66929, paragraphs: 6510683, traditions: 2 });
    expect(r.snapshot_at).toBe(new Date(1792721719000).toISOString());
  });
  it('reads every process stage from the rings and the import board', () => {
    const { process: p, week, working } = shapeLanding({ snapshot, imports, hidden });
    expect(week).toBe(472);
    expect(working).toBe(true);
    expect(p.acquire).toEqual({ week: 472, today: 3, waiting: 156, working: 1 });
    expect(p.link.references).toBe(586795);
    expect(p.pair.paragraphs).toBe(70433);
    expect(p.index).toEqual({ vectors: 9093040, phrases: 35368510, questions: 2305848 });
    expect(p.structure.sections).toBe(75661);
  });
  it('degrades to nulls without a snapshot or import board', () => {
    const r = shapeLanding({});
    expect(r.totals).toBeNull();
    expect(r.week).toBeNull();
    expect(r.process.link.references).toBeNull();
    expect(r.arrivals).toEqual([]);
  });
  it('arrivals: hidden and untitled skipped, repeats shown once, capped, each with a reader URL', () => {
    const arrivals = [doc(9), doc(8, { religion: 'Other' }), doc(7, { title: '' }), doc(6, { title: 'Book 9' }), doc(5), doc(4), doc(3)];
    const r = shapeLanding({ arrivals, hidden, limit: 3 });
    expect(r.arrivals.map((b) => b.id)).toEqual([9, 5, 4]);
    expect(r.arrivals[0].url).toBe('/library/bahai/books/book-9');
  });
});

describe('listDocs newest', () => {
  it('orders by id descending, excludes collections, and returns no keyset cursor', async () => {
    calls.length = 0;
    const r = await listDocs({ orderBy: 'newest', excludeCollections: ['Media'], limit: 5, count: false, fields: ['id'] });
    expect(calls[0].sql).toMatch(/ORDER BY d\.id DESC/);
    expect(calls[0].sql).toMatch(/COALESCE\(d\.collection, ''\) NOT IN \(\?\)/);
    expect(calls[0].params).toContain('Media');
    expect(r.next_after_id).toBeNull();
  });
});
