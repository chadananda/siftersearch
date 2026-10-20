// Chad 10-20: "keep a hash-table list of all duplicate checks so subsequent checks of the same book are instant".
import { describe, it, expect } from 'vitest';
import { checkWithMemo, stillValid, contentSha } from '../../api/lib/dewey/check-memo.js';

const table = () => {
  const rows = new Map();
  return { rows, deps: {
    sha: async (i) => `sha-of-${i.file?.data || i.path}`,
    get: async (k) => rows.get(k) || null,
    save: async (k, v) => rows.set(k, { ...v, checked_at: new Date().toISOString() }),
    hit: async () => {},
    valid: async (r) => !!r,
  } };
};

describe('holdings check memo', () => {
  it('the same content checked twice runs the real check once', async () => {
    const t = table(); let runs = 0;
    const run = async () => { runs++; return { identified: { title: 'X' }, result: { verdict: 'held', candidates: [{ id: 1 }] } }; };
    const a = await checkWithMemo({ path: '/a/book.txt' }, run, { deps: t.deps });
    const b = await checkWithMemo({ path: '/a/book.txt' }, run, { deps: t.deps });
    expect(runs).toBe(1);
    expect(a.memo.cached).toBe(false);
    expect(b).toMatchObject({ result: { verdict: 'held' }, memo: { cached: true } });
  });
  it('fresh:true checks again; errors are never stored', async () => {
    const t = table(); let runs = 0;
    const err = async () => { runs++; return { result: { verdict: 'error: timeout' } }; };
    await checkWithMemo({ path: '/b' }, err, { deps: t.deps });
    await checkWithMemo({ path: '/b' }, err, { deps: t.deps });
    expect(runs).toBe(2);
    expect(t.rows.size).toBe(0);
    const ok = async () => { runs++; return { result: { verdict: 'not-held' } }; };
    await checkWithMemo({ path: '/c' }, ok, { deps: t.deps });
    await checkWithMemo({ path: '/c' }, ok, { deps: t.deps, fresh: true });
    expect(runs).toBe(4);
  });
  it('held stands while its document is live; other verdicts expire after 7 days', async () => {
    const live = async (id) => id === 5;
    expect(await stillValid({ verdict: 'held', result: { candidates: [{ id: 5 }] }, checked_at: '2020-01-01' }, { live })).toBe(true);
    expect(await stillValid({ verdict: 'held', result: { candidates: [{ id: 6 }] }, checked_at: new Date().toISOString() }, { live })).toBe(false);
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(await stillValid({ verdict: 'not-held', result: {}, checked_at: '2026-10-15T00:00:00Z' }, { now, live })).toBe(true);
    expect(await stillValid({ verdict: 'not-held', result: {}, checked_at: '2026-10-01T00:00:00Z' }, { now, live })).toBe(false);
  });
  it('the key is the content, not the name', async () => {
    const a = await contentSha({ file: { name: 'one.txt', data: Buffer.from('same text').toString('base64') } });
    const b = await contentSha({ file: { name: 'two.txt', data: Buffer.from('same text').toString('base64') } });
    expect(a).toBe(b);
  });
});

describe('the memo never fails a check', () => {
  it('a memo read error (table not migrated yet) falls through to the real check', async () => {
    const out = await checkWithMemo({ path: '/x' }, async () => ({ result: { verdict: 'not-held' } }), { deps: {
      sha: async () => 'k', get: async () => { throw new Error('no such table: dewey_checks'); }, save: async () => { throw new Error('no such table'); }, hit: async () => {} } });
    expect(out.result.verdict).toBe('not-held');
  });
});
