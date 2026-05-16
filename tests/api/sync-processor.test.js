// Integration tests for sync-processor.js — verifies the new is_duplicate
// + duplicate_of removal logic that prevents marked-duplicate paragraphs
// from being indexed into Meilisearch.
//
// The contract under test:
//   syncDocument(docId)
//     - if doc.duplicate_of != null OR doc.deleted_at != null:
//         delete doc + ALL its paragraphs from Meili, mark synced
//     - else:
//         partition paragraphs into is_duplicate/deleted_at (DELETE)
//         vs active (UPSERT)
//
// Pattern: in-memory better-sqlite3 DB (mocked db.js), spy-instrumented
// fake Meili client.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ─── In-memory DB ─────────────────────────────────────────────────────────

const rawDb = new Database(':memory:');
rawDb.pragma('journal_mode = WAL');

vi.mock('../../api/lib/db.js', () => {
  function runQuery(sql, params = []) {
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql);
    if (isWrite) {
      const info = rawDb.prepare(sql).run(...params);
      return { rows: [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }], lastInsertRowid: info.lastInsertRowid };
    }
    return { rows: rawDb.prepare(sql).all(...params) };
  }
  async function query(sql, params = []) { return runQuery(sql, params); }
  async function queryOne(sql, params = []) { const r = runQuery(sql, params); return r.rows[0] || null; }
  async function queryAll(sql, params = []) { return runQuery(sql, params).rows; }
  async function getDb() { return rawDb; }
  async function transaction(stmts) {
    const txn = rawDb.transaction((list) => list.map(({ sql, args = [] }) => rawDb.prepare(sql).run(...args)));
    return txn(stmts);
  }
  return { query, queryOne, queryAll, getDb, transaction, getBatchDb: getDb };
});

// ─── Logger silencer ──────────────────────────────────────────────────────

vi.mock('../../api/lib/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {}, trace: () => {} }
}));

// ─── Fake Meili client (instrumented spies) ───────────────────────────────

const meiliCalls = {
  documents: { addDocuments: [], deleteDocument: [], deleteDocuments: [] },
  paragraphs: { addDocuments: [], deleteDocument: [], deleteDocuments: [] }
};

const fakeMeiliClient = {
  index(name) {
    return {
      addDocuments: (docs) => {
        meiliCalls[name].addDocuments.push(docs);
        return Promise.resolve({ taskUid: `${name}-add-${Date.now()}` });
      },
      deleteDocument: (id) => {
        meiliCalls[name].deleteDocument.push(id);
        return Promise.resolve({ taskUid: `${name}-deldoc-${Date.now()}` });
      },
      deleteDocuments: (ids) => {
        meiliCalls[name].deleteDocuments.push(ids);
        return Promise.resolve({ taskUid: `${name}-deldocs-${Date.now()}` });
      },
      getDocuments: () => Promise.resolve({ results: [] })
    };
  },
  tasks: {
    waitForTask: async (uid) => ({ status: 'succeeded', taskUid: uid })
  }
};

vi.mock('../../api/lib/search.js', () => ({
  getMeili: async () => fakeMeiliClient
}));

vi.mock('../../api/lib/authority.js', () => ({
  getAuthority: () => 5
}));

const fakeConfig = { ai: { embeddings: { model: 'text-embedding-3-large', dimensions: 512 } } };
vi.mock('../../api/lib/config.js', () => ({ config: fakeConfig, default: fakeConfig }));

// runMigrations is invoked by the module's startup but only when run as main.
// Stub it so import doesn't crash.
vi.mock('../../api/lib/migrations.js', () => ({ runMigrations: async () => ({ applied: 0 }) }));

// ─── Schema (subset that syncDocument touches) ────────────────────────────

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT,
    year INTEGER, description TEXT, filename TEXT, slug TEXT,
    paragraph_count INTEGER DEFAULT 0,
    encumbered INTEGER DEFAULT 0,
    duplicate_of INTEGER,
    deleted_at TEXT,
    source_site TEXT,
    source_url TEXT
  );
  CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    paragraph_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    content_hash TEXT, normalized_hash TEXT,
    heading TEXT, blocktype TEXT,
    embedding BLOB, embedding_model TEXT,
    translation TEXT, translation_segments TEXT, context TEXT,
    is_duplicate INTEGER DEFAULT 0,
    external_para_id TEXT,
    pdf_page INTEGER,
    synced INTEGER DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

function resetDb() {
  rawDb.exec(`DROP TABLE IF EXISTS content; DROP TABLE IF EXISTS docs;`);
  rawDb.exec(SCHEMA);
  for (const name of ['documents', 'paragraphs']) {
    meiliCalls[name].addDocuments.length = 0;
    meiliCalls[name].deleteDocument.length = 0;
    meiliCalls[name].deleteDocuments.length = 0;
  }
}

function insertDoc(fields = {}) {
  const cols = Object.keys(fields).join(', ');
  const placeholders = Object.keys(fields).map(() => '?').join(', ');
  const info = rawDb.prepare(`INSERT INTO docs (${cols}) VALUES (${placeholders})`).run(...Object.values(fields));
  return Number(info.lastInsertRowid);
}

function insertContent(docId, fields = {}) {
  const all = { doc_id: docId, synced: 0, ...fields };
  const cols = Object.keys(all).join(', ');
  const placeholders = Object.keys(all).map(() => '?').join(', ');
  const info = rawDb.prepare(`INSERT INTO content (${cols}) VALUES (${placeholders})`).run(...Object.values(all));
  return Number(info.lastInsertRowid);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Sync processor — duplicate / deleted handling', () => {
  let syncProcessor;

  beforeAll(async () => {
    syncProcessor = await import('../../api/workers/sync-processor.js');
  });

  beforeEach(() => {
    resetDb();
  });

  it('upserts active paragraphs to both indexes', async () => {
    const docId = insertDoc({ title: 'Active Doc', author: 'X', religion: "Baha'i", paragraph_count: 2 });
    insertContent(docId, { paragraph_index: 0, text: 'Para one', is_duplicate: 0 });
    insertContent(docId, { paragraph_index: 1, text: 'Para two', is_duplicate: 0 });

    const result = await syncProcessor.syncDocument(docId);
    expect(result.success).toBe(true);

    expect(meiliCalls.documents.addDocuments.length).toBe(1);
    expect(meiliCalls.documents.addDocuments[0][0].id).toBe(docId);

    expect(meiliCalls.paragraphs.addDocuments.length).toBe(1);
    expect(meiliCalls.paragraphs.addDocuments[0].length).toBe(2);

    expect(meiliCalls.paragraphs.deleteDocuments.length).toBe(0);
    expect(meiliCalls.documents.deleteDocument.length).toBe(0);

    const after = rawDb.prepare(`SELECT synced FROM content WHERE doc_id = ?`).all(docId);
    expect(after.every(r => r.synced === 1)).toBe(true);
  });

  it('removes the entire doc from Meili when duplicate_of is set', async () => {
    const docId = insertDoc({ title: 'Superseded', author: 'X', religion: "Baha'i", duplicate_of: 99999 });
    insertContent(docId, { paragraph_index: 0, text: 'Para one', is_duplicate: 1 });
    insertContent(docId, { paragraph_index: 1, text: 'Para two', is_duplicate: 1 });

    const result = await syncProcessor.syncDocument(docId);
    expect(result.success).toBe(true);
    expect(result.removed).toBe(true);

    expect(meiliCalls.documents.deleteDocument.length).toBe(1);
    expect(meiliCalls.documents.deleteDocument[0]).toBe(docId);

    expect(meiliCalls.paragraphs.deleteDocuments.length).toBe(1);
    expect(meiliCalls.paragraphs.deleteDocuments[0].length).toBe(2);

    expect(meiliCalls.documents.addDocuments.length).toBe(0);
    expect(meiliCalls.paragraphs.addDocuments.length).toBe(0);
  });

  it('removes the entire doc from Meili when deleted_at is set', async () => {
    const docId = insertDoc({ title: 'Deleted', author: 'X', religion: "Baha'i", deleted_at: '2026-04-30T00:00:00Z' });
    insertContent(docId, { paragraph_index: 0, text: 'Para one' });

    const result = await syncProcessor.syncDocument(docId);
    expect(result.success).toBe(true);
    expect(result.removed).toBe(true);

    expect(meiliCalls.documents.deleteDocument.length).toBe(1);
    expect(meiliCalls.paragraphs.deleteDocuments.length).toBe(1);
  });

  it('partitions per-paragraph: is_duplicate paragraphs delete, active paragraphs upsert', async () => {
    const docId = insertDoc({ title: 'Mixed', author: 'X', religion: "Baha'i", paragraph_count: 3 });
    const dup1 = insertContent(docId, { paragraph_index: 0, text: 'Dup one', is_duplicate: 1 });
    const dup2 = insertContent(docId, { paragraph_index: 1, text: 'Dup two', is_duplicate: 1 });
    insertContent(docId, { paragraph_index: 2, text: 'Active', is_duplicate: 0 });

    const result = await syncProcessor.syncDocument(docId);
    expect(result.success).toBe(true);

    // doc upserted (it isn't itself a duplicate)
    expect(meiliCalls.documents.addDocuments.length).toBe(1);

    // duplicate paragraphs deleted in one batched call
    expect(meiliCalls.paragraphs.deleteDocuments.length).toBe(1);
    const deletedIds = meiliCalls.paragraphs.deleteDocuments[0];
    expect(new Set(deletedIds)).toEqual(new Set([dup1, dup2]));

    // active paragraph upserted
    expect(meiliCalls.paragraphs.addDocuments.length).toBe(1);
    expect(meiliCalls.paragraphs.addDocuments[0].length).toBe(1);
    expect(meiliCalls.paragraphs.addDocuments[0][0].text).toBe('Active');
  });

  it('returns synced=0 when no dirty paragraphs exist', async () => {
    const docId = insertDoc({ title: 'Empty', author: 'X', religion: "Baha'i" });
    // No content rows
    const result = await syncProcessor.syncDocument(docId);
    expect(result.success).toBe(true);
    expect(result.synced).toBe(0);
    expect(meiliCalls.documents.addDocuments.length).toBe(0);
  });
});
