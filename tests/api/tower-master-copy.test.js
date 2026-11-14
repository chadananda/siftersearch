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

describe('edge mirror', async () => {
  const { edgeMirrorJob, wantFull } = await import('../../api/lib/ops/edge-mirror-job.js');
  const { pkOf } = await import('../../api/lib/repos/edge-mirror-repo.js');
  const { listDocuments } = await import('../../api/lib/assistant/pdf/document-list.js');
  const { d1Edit } = await import('../../worker/d1-dump.js');
  const fakeRepo = (known = []) => {
    const m = { rows: new Map(), done: [] };
    return { m, repo: { mirrorTables: async () => known, saveTable: async () => {}, upsertRows: async (db, t, pk, rows) => rows.forEach((r) => m.rows.set(`${t}|${pkOf(r, pk)}`, r)),
      finishTable: async (db, t, o) => { m.done.push({ t, full: o.full, maxRid: o.maxRid, seen: o.seen?.size ?? null }); return 0; } } };
  };
  const edge = (n) => async (path, { table, after = 0 }) => {
    if (!table) return { tables: [{ name: 'anis_turns', sql: 'CREATE TABLE anis_turns (x)', pk: ['conversation_id', 'round', 'role'] }, { name: 'ix', sql: 'CREATE INDEX ix ON anis_turns(x)' }] };
    const rows = Array.from({ length: n }, (_, i) => ({ _rowid_: i + 1, conversation_id: 'c', round: i, role: 'user' })).filter((r) => r._rowid_ > after).slice(0, 1000);
    return { rows, next: rows.length === 1000 ? rows.at(-1)._rowid_ : null };
  };

  it('keys rows by primary key, else rowid', () => {
    expect(pkOf({ _rowid_: 9, a: 1, b: 'x' }, ['a', 'b'])).toBe('[1,"x"]');
    expect(pkOf({ _rowid_: 9 }, [])).toBe('9');
  });
  it('a small table gets a full pass; a big one continues from its cursor until the daily full pass', () => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    expect(wantFull(undefined)).toBe(true);
    expect(wantFull({ rows: 10, full_at: '2026-11-13 11:00:00' }, { now })).toBe(true);
    expect(wantFull({ rows: 9000, full_at: '2026-11-13 11:00:00' }, { now })).toBe(false);
    expect(wantFull({ rows: 9000, full_at: '2026-11-12 11:00:00' }, { now })).toBe(true);
  });
  it('copies every page of every table (indexes skipped)', async () => {
    const { m, repo } = fakeRepo();
    const out = await edgeMirrorJob({ dbs: ['anis'], call: edge(1500), repo });
    expect(m.rows.size).toBe(1500);
    expect(out['anis.anis_turns']).toEqual({ full: true, read: 1500, removed: 0 });
    expect(m.done[0]).toMatchObject({ full: true, maxRid: 1500, seen: 1500 });
  });
  it('an incremental pass reads only past the cursor', async () => {
    const { m, repo } = fakeRepo([{ name: 'anis_turns', rows: 9000, max_rid: 1400, full_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }]);
    const out = await edgeMirrorJob({ dbs: ['anis'], call: edge(1500), repo });
    expect(out['anis.anis_turns']).toEqual({ full: false, read: 100, removed: 0 });
    expect(m.done[0]).toMatchObject({ full: false, maxRid: 1500, seen: null });
  });
  it('d1Edit changes a research set status, nothing else', async () => {
    let bound;
    const env = { S1_KEY: 'k', ANIS_DB: { prepare: () => ({ bind: (...a) => { bound = a; return { first: async () => ({ id: 5, status: a[0] }) }; } }) } };
    const ed = (b) => d1Edit(new Request('https://x/_d1/edit', { method: 'POST', headers: { 'x-internal-key': 'k' }, body: JSON.stringify(b) }), env);
    expect((await ed({ op: 'set-status', id: 5, status: 'bogus' })).status).toBe(400);
    expect((await ed({ op: 'drop', id: 5 })).status).toBe(400);
    expect((await (await ed({ op: 'set-status', id: 5, status: 'curated' })).json()).row.status).toBe('curated');
    expect([bound[0], bound[2]]).toEqual(['curated', 5]);
  });
  it('lists created documents with title and short link from the map', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-'));
    await keepLocal('anis/pdf/c/abc/anis-tablet.pdf', Buffer.from('%PDF-1'), dir);
    await keepLocal('anis/s/Code1.json', JSON.stringify({ url: 'https://r2.example/anis/pdf/c/abc/anis-tablet.pdf', title: 'The Tablet' }), dir);
    await keepLocal('anis/pdf/xyz/anis-my-notes.pdf', Buffer.from('%PDF'), dir);
    const docs = await listDocuments({ dir, shortBase: 'https://s.example/d' });
    expect(docs.map((d) => [d.title, d.short, d.cached]).sort()).toEqual([['The Tablet', 'https://s.example/d/Code1', true], ['my notes', null, false]]);
  });
});
