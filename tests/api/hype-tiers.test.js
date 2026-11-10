// pipeline/hype-tiers — per-paragraph tiers (core | gray | history | rest), primary before copies, mixed-book split, cursor, dryRun counts. Fake docs + paragraph reads.
import { describe, it, expect } from 'vitest';
import { paraTier, selectTier, countTiers, requestsFor, TIER_ORDER } from '../../api/lib/pipeline/hype-tiers.js';

const SHOGHI = JSON.stringify([{ role: 'author', name: 'Shoghi Effendi', basis: 'para' }]);
const COMPILER = JSON.stringify([{ role: 'author', name: 'Compiler of the volume', basis: 'para' }]);
const LOG = { id: 10, title: 'Lights of Guidance', author: 'Compilation', religion: "Baha'i", collection: 'Compilations', scope: 'primary' };
const QURAN = { id: 11, title: 'The Noble Quran', author: 'Muhammad', religion: 'Islam', collection: 'Scripture', scope: 'primary' };
const BUKHARI = { id: 12, title: 'Sahih Bukhari', author: 'Al-Bukhari', religion: 'Islam', collection: 'Hadith', scope: 'primary' };
const DAWN = { id: 13, title: 'The Dawn-Breakers', author: 'Nabil', religion: "Baha'i", collection: 'History', scope: 'primary' };
const ESSAY = { id: 14, title: 'Some Essays on Light', author: 'A. Scholar', religion: 'Christian', collection: 'Essays', scope: 'primary' };
const QURAN_COPY = { ...QURAN, id: 15, scope: 'supplemental' };

describe('paraTier', () => {
  it('splits a mixed book by the paragraph writer, not the book', () => {
    expect(paraTier(LOG, SHOGHI)).toBe('core');
    expect(paraTier(LOG, COMPILER)).toBe('rest');
  });
  it('scripture is core, hadith gray, a history book history, anything else rest', () => {
    expect(paraTier(QURAN)).toBe('core');
    expect(paraTier(BUKHARI)).toBe('gray');
    expect(paraTier(DAWN, COMPILER)).toBe('history');
    expect(paraTier(ESSAY)).toBe('rest');
  });
  it('a core/gray paragraph in a history book stays core/gray (history is only the remainder)', () => {
    expect(paraTier(DAWN, SHOGHI)).toBe('core');
  });
});

describe('requestsFor', () => { it('1 request, or one per ~1500-char slice over 4000', () => { expect(requestsFor(800)).toBe(1); expect(requestsFor(4000)).toBe(1); expect(requestsFor(6000)).toBe(4); }); });

// docs paged by id; paras = pending rows per doc
const lib = (docs, rowsByDoc) => ({
  docs: async ({ afterId }) => ({ docs: docs.filter((d) => d.id > afterId) }),
  paras: async (ids, v, o) => ids.flatMap((id) => (rowsByDoc[id] || []).filter((r) => !o.pendingOnly || !r.done).map((r) => ({ doc_id: id, ...r }))),
});
const DOCS = [LOG, QURAN, BUKHARI, DAWN, ESSAY, QURAN_COPY];
const ROWS = {
  10: [{ id: 101, authors: SHOGHI, len: 300 }, { id: 102, authors: COMPILER, len: 300 }, { id: 103, authors: SHOGHI, len: 300, done: true }],
  11: [{ id: 111, len: 200 }, { id: 112, len: 200 }], 12: [{ id: 121, len: 200 }],
  13: [{ id: 131, authors: COMPILER, len: 200 }, { id: 132, authors: SHOGHI, len: 200 }], 14: [{ id: 141, len: 200 }], 15: [{ id: 151, len: 200 }],
};

describe('selectTier', () => {
  it('core: only core paragraphs, mixed book contributes just its core ones, copies wait for pass copy', async () => {
    const l = lib(DOCS, ROWS);
    const a = await selectTier({ tier: 'core', pass: 'primary', limit: 100 }, l);
    expect(a.docs).toEqual([{ docId: 10, ids: [101] }, { docId: 11, ids: [111, 112] }, { docId: 13, ids: [132] }]);
    expect(a.paragraphs).toBe(4);
    const c = await selectTier({ tier: 'core', pass: 'copy', limit: 100 }, l);
    expect(c.docs).toEqual([{ docId: 15, ids: [151] }]);
  });
  it('faith: the Bahá\'í phase takes only Bahá\'í docs and the other phase the rest; the other faith never holds the cursor', async () => {
    const l = lib(DOCS, ROWS);
    const b = await selectTier({ tier: 'core', pass: 'primary', faith: 'bahai', limit: 100 }, l);
    expect(b.docs).toEqual([{ docId: 10, ids: [101] }, { docId: 13, ids: [132] }]);
    const o = await selectTier({ tier: 'core', pass: 'primary', faith: 'other', limit: 100 }, l);
    expect(o.docs).toEqual([{ docId: 11, ids: [111, 112] }]);
    expect(o.cursor).toBe(10);   // doc 10 is Bahá'í: not this phase's work, so the scan moves past it
  });
  it('the rest of the mixed book comes in a later tier', async () => {
    const l = lib(DOCS, ROWS);
    expect((await selectTier({ tier: 'rest', limit: 100 }, l)).docs).toEqual([{ docId: 10, ids: [102] }, { docId: 14, ids: [141] }]);
    expect((await selectTier({ tier: 'history', limit: 100 }, l)).docs).toEqual([{ docId: 13, ids: [131] }]);
    expect((await selectTier({ tier: 'gray', limit: 100 }, l)).docs).toEqual([{ docId: 12, ids: [121] }]);
  });
  it('honours the limit (trims inside a doc) and leaves the cursor behind unfinished docs', async () => {
    const l = lib(DOCS, ROWS);
    const a = await selectTier({ tier: 'core', limit: 2 }, l);
    expect(a.docs).toEqual([{ docId: 10, ids: [101] }, { docId: 11, ids: [111] }]);
    expect(a.cursor).toBe(0);   // doc 10 still has work pending → the next scan starts at the beginning
  });
  it('cursor advances past clean docs; skip list never blocks it', async () => {
    const rows = { ...ROWS, 10: [{ id: 103, authors: SHOGHI, len: 300, done: true }] };
    const a = await selectTier({ tier: 'core', limit: 100, skip: new Set([11]) }, lib(DOCS, rows));
    expect(a.docs).toEqual([{ docId: 13, ids: [132] }]);
    expect(a.cursor).toBe(12);   // 10 clean, 11 skipped, 12 not core; 13 has work
  });
  it('exhausted when the library is scanned to the end', async () => {
    const a = await selectTier({ tier: 'core', limit: 100 }, lib(DOCS, ROWS));
    expect(a.exhausted).toBe(true);
    expect((await selectTier({ tier: 'core', limit: 100, after: 15 }, lib(DOCS, ROWS))).paragraphs).toBe(0);
  });
});

describe('countTiers', () => {
  it('counts ¶, done, pending and requests per tier and pass (aggregates for single-tier docs, rows for Bahá\'í docs)', async () => {
    const tot = { 11: { total: 2, done: 0, pending: 2, longN: 0, longChars: 0 }, 12: { total: 1, done: 1, pending: 0, longN: 0, longChars: 0 },
      14: { total: 5, done: 1, pending: 4, longN: 1, longChars: 6000 }, 15: { total: 1, done: 0, pending: 1, longN: 0, longChars: 0 } };
    const c = await countTiers({}, { docs: async ({ afterId }) => ({ docs: DOCS.filter((d) => d.id > afterId) }),
      totals: async (ids) => new Map(ids.filter((i) => tot[i]).map((i) => [i, tot[i]])),
      paras: async (ids) => ids.flatMap((id) => (ROWS[id] || []).map((r) => ({ doc_id: id, len: 300, done: false, ...r }))) });
    expect(c.core.primary).toMatchObject({ docs: 3, total: 5, done: 1, pending: 4, requests: 4 });   // quran 2 + LoG 2 (101, 103 done) + dawn 132
    expect(c.core.copy).toMatchObject({ pending: 1, requests: 1 });
    expect(c.gray.primary).toMatchObject({ total: 1, done: 1, pending: 0 });
    expect(c.history.primary).toMatchObject({ total: 1, pending: 1 });
    expect(c.rest.primary).toMatchObject({ docs: 2, pending: 4 + 1, requests: 3 + 4 + 1 });   // essay: 4 pending, 1 long (6000 chars → 4 slices) → 3+4; LoG compiler 1
    expect(TIER_ORDER).toEqual(['core', 'gray', 'history', 'rest']);
  });
});
