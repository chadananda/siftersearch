// Tower is the master copy: the edge's D1 export route and the local copy of every created document.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { d1Dump } from '../../worker/d1-dump.js';
import { keepLocal, makeDocuments } from '../../api/lib/assistant/pdf/documents.js';

const fakeD1 = (tables, rows) => ({ prepare: (sql) => ({ bind: (after) => ({ all: async () => ({ results: rows.filter((r) => r._rowid_ > after).slice(0, 1000) }) }),
  all: async () => ({ results: /sqlite_master/.test(sql) ? tables : [] }) }) });
const req = (body, key = 'k') => new Request('https://x/_d1/dump', { method: 'POST', headers: { 'x-internal-key': key }, body: JSON.stringify(body) });
const env = { S1_KEY: 'k', ANIS_DB: fakeD1([{ name: 't', sql: 'CREATE TABLE t (a)' }, { name: 'i', sql: 'CREATE INDEX i ON t(a)' }],
  Array.from({ length: 1500 }, (_, i) => ({ _rowid_: i + 1, a: i }))) };

describe('d1Dump', () => {
  it('refuses without the internal key', async () => { expect((await d1Dump(req({ db: 'anis' }, 'bad'), env)).status).toBe(401); });
  it('rejects unknown dbs and tables', async () => {
    expect((await d1Dump(req({ db: 'nope' }), env)).status).toBe(400);
    expect((await d1Dump(req({ db: 'anis', table: 'i' }), env)).status).toBe(400);   // an index is not a table
  });
  it('lists the schema, then pages rows by rowid', async () => {
    expect((await (await d1Dump(req({ db: 'anis' }), env)).json()).tables.map((t) => t.name)).toEqual(['t', 'i']);
    const p1 = await (await d1Dump(req({ db: 'anis', table: 't' }), env)).json();
    expect([p1.rows.length, p1.next]).toEqual([1000, 1000]);
    const p2 = await (await d1Dump(req({ db: 'anis', table: 't', after: p1.next }), env)).json();
    expect([p2.rows.length, p2.next]).toEqual([500, null]);
  });
});

describe('documents keep a local copy', () => {
  it('keepLocal writes under the dir, skips a missing dir and refuses escapes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-'));
    expect(await keepLocal('anis/pdf/a.pdf', Buffer.from('%PDF'), dir)).toBe(join(dir, 'anis/pdf/a.pdf'));
    expect(readFileSync(join(dir, 'anis/pdf/a.pdf'), 'utf8')).toBe('%PDF');
    expect(await keepLocal('a.pdf', 'x', join(dir, 'missing'))).toBeNull();
    expect(await keepLocal('../out.pdf', 'x', dir)).toBeNull();
  });
  it('put() keeps locally before upload, and a local failure never blocks the upload', async () => {
    const order = [];
    const d = makeDocuments({ render: async () => Buffer.from('%PDF'), publicUrl: (k) => `https://r2/${k}`, shortBase: null,
      keep: async (k) => { order.push(`keep ${k}`); throw new Error('disk'); }, upload: async (k) => { order.push(`up ${k}`); return `https://r2/${k}`; } });
    const r = await d.create({ title: 'B', markdown: '# B' });
    expect(r.url).toMatch(/^https:\/\/r2\/anis\/pdf\//);
    const pdf = order.filter((o) => o.endsWith('.pdf'));
    expect(pdf).toEqual([`keep ${r.key}`, `up ${r.key}`]);
  });
});
