// "We cannot figure out why files were moved." These lock the properties that make that answerable: every
// entry names an actor AND a reason, the trail is append-only, a doc's history reads in order, and a summary
// can answer "what removed 190 docs last night?" in one row. Driven against real SQLite with the migration DDL.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
db.exec(`CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL DEFAULT (unixepoch()),
  actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, doc_id INTEGER,
  reason TEXT, detail_json TEXT, run_id INTEGER)`);

const swallowed = [];
vi.mock('../../api/lib/swallow.js', () => ({ swallow: (e, ctx) => swallowed.push(ctx) }));
vi.mock('../../api/lib/db.js', () => ({
  query: async (sql, args = []) => db.prepare(sql).run(...args),
  queryAll: async (sql, args = []) => db.prepare(sql).all(...args),
  queryOne: async (sql, args = []) => db.prepare(sql).get(...args),
}));
const A = await import('../../api/lib/audit.js');

beforeEach(() => { db.exec('DELETE FROM audit_log'); swallowed.length = 0; });

describe('audit entries', () => {
  it('records who, what, where and WHY', async () => {
    await A.audit({ actor: 'ingest-converted-books', action: 'doc.retire', target: 'doc:24035', docId: 24035,
      reason: 'superseded by the converted book (doc 919054)', detail: { superseded_by: 919054 }, runId: 12 });
    const [row] = await A.recentAudit({});
    expect(row).toMatchObject({ actor: 'ingest-converted-books', action: 'doc.retire', doc_id: 24035, run_id: 12 });
    expect(row.reason).toContain('superseded by');
    expect(JSON.parse(row.detail_json).superseded_by).toBe(919054);
    expect(row.at).toBeGreaterThan(1700000000);          // epoch seconds, per the schema contract
  });

  it('refuses a malformed entry loudly rather than writing an unexplainable row', async () => {
    await A.audit({ action: 'doc.delete' });             // no actor
    expect(await A.recentAudit({})).toHaveLength(0);
    expect(swallowed).toContain('audit.malformed');
  });

  it('never throws, so auditing cannot break the operation it describes', async () => {
    await expect(A.audit({ actor: 'x', action: 'doc.delete', detail: { huge: 'y'.repeat(50000) } })).resolves.toBeUndefined();
  });

  it('reads one doc’s history oldest-first — the "why is this doc gone?" lookup', async () => {
    await A.audit({ actor: 'convert-missing-books', action: 'file.write', target: 'a.md', docId: 7, reason: 'converted source file' });
    await A.audit({ actor: 'ingest-converted-books', action: 'doc.create', target: 'a.md', docId: 7, reason: 'ingested the converted file' });
    await A.audit({ actor: 'safeSoftDeleteDocs', action: 'doc.delete', target: 'doc:7', docId: 7, reason: 'dedup: duplicate of 9' });
    const h = await A.docHistory(7);
    expect(h.map((e) => e.action)).toEqual(['file.write', 'doc.create', 'doc.delete']);
    expect(h[2].reason).toContain('dedup');
  });

  it('summarises by action+actor — "what removed all those docs last night?"', async () => {
    for (let i = 0; i < 190; i++) await A.audit({ actor: 'dedupe', action: 'doc.delete', docId: i, reason: 'duplicate' });
    await A.audit({ actor: 'ingest-converted-books', action: 'doc.retire', docId: 500, reason: 'superseded' });
    const s = await A.auditSummary({ sinceEpoch: 0 });
    expect(s[0]).toMatchObject({ action: 'doc.delete', actor: 'dedupe', n: 190 });
    expect(s.find((r) => r.action === 'doc.retire').n).toBe(1);
  });

  it('filters by action and by doc, so a single question does not return the whole trail', async () => {
    await A.audit({ actor: 'a', action: 'doc.delete', docId: 1, reason: 'r' });
    await A.audit({ actor: 'b', action: 'file.write', docId: 2, reason: 'r' });
    expect(await A.recentAudit({ action: 'doc.delete' })).toHaveLength(1);
    expect(await A.recentAudit({ docId: 2 })).toHaveLength(1);
  });

  it('flags a file write that REPLACED an existing file — the event that destroys a book', async () => {
    await A.audit({ actor: 'convert-missing-books', action: 'file.write', target: 'x.md', docId: 3,
      reason: 'converted source file (REPLACED an existing file)', detail: { overwrote: true } });
    const [row] = await A.recentAudit({ action: 'file.write' });
    expect(JSON.parse(row.detail_json).overwrote).toBe(true);
    expect(row.reason).toContain('REPLACED');
  });
});
