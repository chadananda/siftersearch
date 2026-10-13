// Spend ledger (Chad 10-12: "41 seconds frozen totaling spending is not ok") — running total by id range, never a
// history re-sum at boot.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createLedger } from '../../api/lib/pipeline/spend-ledger.js';

// ai_usage rows: id → { provider, usd, ts }
const fakeDb = (rows) => {
  const calls = [];
  const top = async () => (rows.length ? rows[rows.length - 1].id : 0);
  const range = async (from, to, provider, since) => {
    calls.push({ sql: 'id > ?', args: [from, to, provider, since] });
    return rows.filter((r) => r.id > from && r.id <= to && r.provider === provider && r.caller === 'corpus-rag' && r.ts > since).reduce((a, r) => a + r.usd, 0);
  };
  return { top, range, calls, deps: { top, range } };
};
const rowsOf = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i + 1, provider: 'deepseek', caller: 'corpus-rag', usd: 1, ts: '2026-10-12 15:00:00', ...extra }));

describe('spend ledger', () => {
  it('a fresh ledger fills in chunks (null meanwhile), then answers exactly', async () => {
    const db = fakeDb(rowsOf(25));
    const l = createLedger({ ...db.deps, chunk: 10, persist: false });
    expect(await l.spendSince('deepseek', '2026-10-12 14:00:00')).toBeNull();
    await l._settle();
    expect(await l.spendSince('deepseek', '2026-10-12 14:00:00')).toBe(25);
    expect(db.calls.filter((c) => /id > \?/.test(c.sql)).every((c) => c.args[1] - c.args[0] <= 10)).toBe(true);
  });
  it('after the fill each call reads only the new rows (one small range)', async () => {
    const rows = rowsOf(5); const db = fakeDb(rows);
    const l = createLedger({ ...db.deps, chunk: 10, persist: false });
    await l.spendSince('deepseek', null); await l._settle();
    rows.push({ id: 6, provider: 'deepseek', caller: 'corpus-rag', usd: 2.5, ts: '2026-10-12 16:00:00' });
    db.calls.length = 0;
    expect(await l.spendSince('deepseek', null)).toBe(7.5);
    expect(db.calls.find((c) => /id > \?/.test(c.sql)).args.slice(0, 2)).toEqual([5, 6]);
  });
  it('only rows after the baseline, for that provider and corpus-rag, count', async () => {
    const db = fakeDb([...rowsOf(3), { id: 4, provider: 'anthropic', caller: 'corpus-rag', usd: 9, ts: '2026-10-12 15:00:00' },
      { id: 5, provider: 'deepseek', caller: 'other', usd: 9, ts: '2026-10-12 15:00:00' }, { id: 6, provider: 'deepseek', caller: 'corpus-rag', usd: 9, ts: '2026-10-01 00:00:00' }]);
    const l = createLedger({ ...db.deps, chunk: 100, persist: false });
    await l.spendSince('deepseek', '2026-10-12 14:00:00'); await l._settle();
    expect(await l.spendSince('deepseek', '2026-10-12 14:00:00')).toBe(3);
  });
  it('a restart resumes from the checkpoint instead of rescanning', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.json');
    const rows = rowsOf(30); const db = fakeDb(rows);
    const a = createLedger({ ...db.deps, chunk: 10, file });
    await a.spendSince('deepseek', null); await a._settle();
    rows.push({ id: 31, provider: 'deepseek', caller: 'corpus-rag', usd: 1, ts: '2026-10-12 16:00:00' });
    db.calls.length = 0;
    const b = createLedger({ ...db.deps, chunk: 10, file });
    expect(await b.spendSince('deepseek', null)).toBe(31);
    expect(db.calls.filter((c) => /id > \?/.test(c.sql))).toHaveLength(1);
  });
  it('a changed baseline starts over', async () => {
    const db = fakeDb(rowsOf(4)); const l = createLedger({ ...db.deps, chunk: 100, persist: false });
    await l.spendSince('deepseek', null); await l._settle();
    expect(await l.spendSince('deepseek', '2026-10-13 00:00:00')).toBeNull();
    await l._settle();
    expect(await l.spendSince('deepseek', '2026-10-13 00:00:00')).toBe(0);
  });
});
