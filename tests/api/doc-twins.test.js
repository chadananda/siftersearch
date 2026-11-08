import { describe, it, expect } from 'vitest';
import { betterCopy, secondCopyOf, docTwinsJob } from '../../api/lib/ops/doc-twins-job.js';

const lib = { id: 9, source_site: null, author: 'Shoghi Effendi' }, bl = { id: 5, source_site: 'bahai-library.com', author: '1234' };

describe('betterCopy', () => {
  it('prefers the main library over a scrape', () => expect(betterCopy({ ...bl, texts: 100 }, { ...lib, texts: 90 })).toBe(true));
  it('same site: more texts, then a real author, then the older id', () => {
    expect(betterCopy({ ...bl, texts: 10 }, { ...bl, id: 7, texts: 11 })).toBe(true);
    expect(betterCopy({ ...bl, texts: 10 }, { ...bl, id: 7, texts: 10, author: 'UHJ' })).toBe(true);
    expect(betterCopy({ ...bl, id: 7, texts: 10 }, { ...bl, texts: 10 })).toBe(true);
  });
});

describe('secondCopyOf', () => {
  const info = (id) => ({ 9: lib }[id]);
  it('mutual ≥ 90% → copy of the better doc', () => expect(secondCopyOf(bl, 100, [{ other: 9, shared: 95, theirs: 100 }], info)?.keep.id).toBe(9));
  it('a piece held inside a bigger compilation is not a copy', () => expect(secondCopyOf(bl, 10, [{ other: 9, shared: 10, theirs: 400 }], info)).toBe(null));
  it('a 1-2 text doc needs the same title too (boilerplate lines match anywhere)', () => {
    const one = (t) => () => ({ ...lib, title: t });
    expect(secondCopyOf({ ...bl, title: 'Witnesses' }, 1, [{ other: 9, shared: 1, theirs: 1 }], one('Other Page'))).toBe(null);
    expect(secondCopyOf({ ...bl, title: 'Witnesses' }, 1, [{ other: 9, shared: 1, theirs: 1 }], one('Witnesses!'))?.keep.id).toBe(9);
  });
  it('the better copy itself is never marked', () => expect(secondCopyOf(lib, 100, [{ other: 5, shared: 95, theirs: 100 }], () => bl)).toBe(null));
});

describe('docTwinsJob', () => {
  const deps = (marks) => ({
    docs: async ({ sourceSite, afterId }) => ({ docs: sourceSite === 'bahai-library.com' && afterId === 0 ? [{ ...bl, title: 'Copy' }, { id: 6, source_site: 'bahai-library.com', title: 'Unique' }] : [] }),
    twins: async (id) => id === 5 ? { mine: 50, twins: [{ other: 9, shared: 50, theirs: 52 }] } : { mine: 20, twins: [{ other: 9, shared: 1, theirs: 52 }] },
    doc: async (id) => ({ ...lib, title: 'Original' }),
    mark: async (dup, keep, o) => marks.push([dup, keep, o.reason]),
  });
  it('dry run reports, marks nothing', async () => {
    const marks = [], r = await docTwinsJob({}, deps(marks));
    expect(r).toMatchObject({ scanned: 2, copies: 1, marked: 0, bySite: { 'bahai-library.com': 1 }, keptBy: { library: 1 } });
    expect(marks).toEqual([]);
  });
  it('write marks the copy duplicate_of the original', async () => {
    const marks = [], r = await docTwinsJob({ write: true }, deps(marks));
    expect(r.marked).toBe(1);
    expect(marks[0].slice(0, 2)).toEqual([5, 9]);
  });
  it('limit stops with a resume point', async () => {
    const r = await docTwinsJob({ limit: 1 }, deps([]));
    expect(r.next_after_id).toEqual({ site: 'bahai-library.com', afterId: 5 });
  });
});
