// HyPE enqueue gate test (Phase F).
//
// The Sonnet enrichment pipeline (api/lib/sonnet-enrichment.js) and the local
// Qwen path (scripts/run-enrichment.js) must skip docs from external sites
// in v1. Hard rule: supplementals don't get HyPE; only primary corpus does.
//
// Per-site hype_policy resolution is deferred to v2 (oceanoflights.org is
// the obvious first central-figures opt-in given its structured authors).
//
// This test pins the gate at the SQL layer — `WHERE source_site IS NULL` —
// so a future refactor that drops the filter has to also update the test
// expectations explicitly.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

const rawDb = new Database(':memory:');
rawDb.pragma('foreign_keys = OFF');

vi.mock('../../api/lib/db.js', () => {
  function runQuery(sql, params = []) {
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
    if (isWrite) {
      const info = rawDb.prepare(sql).run(...params);
      return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }] };
    }
    return { rows: rawDb.prepare(sql).all(...params) };
  }
  async function query(sql, params = []) { return runQuery(sql, params); }
  async function queryOne(sql, params = []) { return runQuery(sql, params).rows[0] || null; }
  async function queryAll(sql, params = []) { return runQuery(sql, params).rows; }
  async function transaction(stmts) {
    const txn = rawDb.transaction((list) => list.map(({ sql, args = [] }) => rawDb.prepare(sql).run(...args)));
    return txn(stmts);
  }
  return { query, queryOne, queryAll, transaction };
});

vi.mock('../../api/lib/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));

// doc-tier classifies all our seeded docs as tier 1 (Shoghi Effendi author)
// so they're eligible for the Sonnet path. Without this the gate would be
// fooled by tier filtering rather than the source_site clause.
vi.mock('../../api/lib/doc-tier.js', () => ({
  getDocTier: () => 1
}));

const SCHEMA = `
  CREATE TABLE docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    title TEXT,
    author TEXT,
    religion TEXT,
    collection TEXT,
    description TEXT,
    paragraph_count INTEGER DEFAULT 0,
    source_site TEXT,
    deleted_at TEXT
  );
  CREATE TABLE content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text TEXT,
    hyp_thesis TEXT,
    is_duplicate INTEGER DEFAULT 0,
    deleted_at TEXT
  );
  CREATE TABLE enrichment_pending (
    content_id INTEGER PRIMARY KEY,
    tier INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

describe('HyPE enqueue gate (Phase F)', () => {
  beforeEach(() => {
    rawDb.exec(`
      DROP TABLE IF EXISTS enrichment_pending;
      DROP TABLE IF EXISTS content;
      DROP TABLE IF EXISTS docs;
    `);
    rawDb.exec(SCHEMA);
  });

  it('enqueues paragraphs from primary corpus (source_site IS NULL)', async () => {
    rawDb.prepare(`INSERT INTO docs (id, title, author, religion, source_site) VALUES (?, ?, ?, ?, ?)`)
      .run(1, 'Primary Doc', 'Shoghi Effendi', "Baha'i", null);
    rawDb.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, ?, ?)`)
      .run(100, 1, 0, 'Primary paragraph one.');

    const { enqueueParagraphsForBatch } = await import('../../api/lib/sonnet-enrichment.js');
    const queued = await enqueueParagraphsForBatch();

    expect(queued).toBe(1);
    const pending = rawDb.prepare('SELECT * FROM enrichment_pending').all();
    expect(pending).toHaveLength(1);
    expect(pending[0].content_id).toBe(100);
  });

  it('SKIPS paragraphs from supplemental docs (source_site = bahai-library.com)', async () => {
    rawDb.prepare(`INSERT INTO docs (id, title, author, religion, source_site) VALUES (?, ?, ?, ?, ?)`)
      .run(2, 'Supplemental Doc', 'Shoghi Effendi', "Baha'i", 'bahai-library.com');
    rawDb.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, ?, ?)`)
      .run(200, 2, 0, 'Supplemental paragraph one.');

    const { enqueueParagraphsForBatch } = await import('../../api/lib/sonnet-enrichment.js');
    const queued = await enqueueParagraphsForBatch();

    expect(queued).toBe(0);
    const pending = rawDb.prepare('SELECT * FROM enrichment_pending').all();
    expect(pending).toHaveLength(0);
  });

  it('SKIPS supplementals even when mixed with primary docs in the same DB', async () => {
    // Two docs, same author, same tier — only the primary one should enqueue.
    rawDb.prepare(`INSERT INTO docs (id, title, author, religion, source_site) VALUES (?, ?, ?, ?, ?)`)
      .run(1, 'Primary', 'Shoghi Effendi', "Baha'i", null);
    rawDb.prepare(`INSERT INTO docs (id, title, author, religion, source_site) VALUES (?, ?, ?, ?, ?)`)
      .run(2, 'Supplemental', 'Shoghi Effendi', "Baha'i", 'bahai-library.com');

    rawDb.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, ?, ?)`)
      .run(10, 1, 0, 'Primary text.');
    rawDb.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, ?, ?)`)
      .run(20, 2, 0, 'Supplemental text.');

    const { enqueueParagraphsForBatch } = await import('../../api/lib/sonnet-enrichment.js');
    const queued = await enqueueParagraphsForBatch();

    expect(queued).toBe(1);
    const pending = rawDb.prepare('SELECT content_id FROM enrichment_pending').all();
    expect(pending.map(r => r.content_id)).toEqual([10]);
    expect(pending.map(r => r.content_id)).not.toContain(20);
  });

  it('SKIPS oceanlibrary.com docs too — they have hype_policy=auto via sites.yaml but the v1 SQL gate is uniform', async () => {
    // The sites.yaml gives oceanlibrary.com hype_policy: auto (it has existing
    // HyPE coverage). v2 will resolve hype_policy per-site. v1 SQL gate is
    // uniform — all source_site IS NOT NULL rows skip. Acceptable trade-off
    // because OL has been superseding our primary docs (so the original
    // primary copies still get enriched). Pin the v1 behavior here.
    rawDb.prepare(`INSERT INTO docs (id, title, author, religion, source_site) VALUES (?, ?, ?, ?, ?)`)
      .run(3, 'OL Doc', 'Shoghi Effendi', "Baha'i", 'oceanlibrary.com');
    rawDb.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text) VALUES (?, ?, ?, ?)`)
      .run(300, 3, 0, 'OL paragraph.');

    const { enqueueParagraphsForBatch } = await import('../../api/lib/sonnet-enrichment.js');
    const queued = await enqueueParagraphsForBatch();
    expect(queued).toBe(0);
  });
});
