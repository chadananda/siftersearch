// retire-duplicates: reads the doc WITH its file path (the default select omitted it, so no file ever moved) and, on a
// re-run, moves the file of a doc already retired into the same keep instead of refusing it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const base = mkdtempSync(join(tmpdir(), 'lib-'));
const docs = new Map();
vi.mock('../../api/lib/config.js', () => ({ config: { library: { basePath: base } } }));
vi.mock('../../api/lib/docs-repo.js', () => ({
  getDoc: vi.fn(async (id, opts) => { const d = docs.get(id); return d ? Object.fromEntries(Object.entries(d).filter(([k]) => !opts?.fields || opts.fields.includes(k))) : null; }),
  markDuplicate: vi.fn(async (dup, keep) => { docs.get(dup).duplicate_of = keep; }),
}));
const { retireDuplicatesJob } = await import('../../api/lib/ops/library-jobs.js');

describe('retireDuplicatesJob', () => {
  beforeEach(() => {
    docs.clear();
    mkdirSync(join(base, 'Baha\'i/Core'), { recursive: true });
    writeFileSync(join(base, 'Baha\'i/Core/old.md'), 'x');
    docs.set(1, { id: 1, title: 'Old', file_path: "Baha'i/Core/old.md", duplicate_of: null });
    docs.set(2, { id: 2, title: 'Canon', file_path: '-sites/x/canon.md', duplicate_of: null });
  });
  it('marks and moves the file out of the library', async () => {
    const r = await retireDuplicatesJob({ pairs: [{ dup: 1, keep: 2 }], batch: 'b1', apply: true });
    expect(r.results[0]).toMatchObject({ marked: true, dup_path: "Baha'i/Core/old.md" });
    expect(existsSync(join(base, "Baha'i/Core/old.md"))).toBe(false);
    expect(existsSync(join(base, '_retired-duplicates/b1', "Baha'i/Core/old.md"))).toBe(true);
  });
  it('a doc already retired into the same keep has its file moved on a re-run', async () => {
    docs.get(1).duplicate_of = 2;
    const r = await retireDuplicatesJob({ pairs: [{ dup: 1, keep: 2 }], batch: 'b2', apply: true });
    expect(r.results[0]).toMatchObject({ alreadyMarked: true, marked: true });
    expect(existsSync(join(base, '_retired-duplicates/b2', "Baha'i/Core/old.md"))).toBe(true);
  });
});
