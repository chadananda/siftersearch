// Migration 180: after the redundant content indexes go, every query shape they could have served still has an index
// (EXPLAIN), and a DELETE FROM content looks up paragraph_extractions by index instead of scanning it.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { CONTENT_INDEX_DROPS, CONTENT_CHILD_FK_INDEXES, dropStatements, childIndexSql } from '../../api/lib/migrations/content-index-prune.js';

// tower's definitions (table-schema report, 10-23) for the dropped indexes and the ones that cover them
const TOWER = `
  CREATE TABLE docs (id INTEGER PRIMARY KEY);
  CREATE TABLE content (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    paragraph_index INTEGER, text TEXT, content_hash TEXT, normalized_hash TEXT, embedding BLOB, embedding_model TEXT,
    synced INTEGER DEFAULT 0, enhanced_synced INTEGER DEFAULT 0, updated_at TEXT, deleted_at TEXT);
  CREATE INDEX idx_content_doc ON content(doc_id);
  CREATE INDEX idx_content_doc_deleted ON content(doc_id, deleted_at) WHERE deleted_at IS NULL;
  CREATE INDEX idx_content_doc_id_cover ON content(doc_id) WHERE deleted_at IS NULL;
  CREATE INDEX idx_content_dirty_doc_updated ON content(doc_id, updated_at DESC) WHERE synced = 0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_doc_upd_unsynced ON content(doc_id, updated_at DESC) WHERE synced=0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_unsynced ON content(synced) WHERE synced = 0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_unsynced_partial ON content(synced, deleted_at) WHERE synced = 0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_unsynced_enhanced ON content(enhanced_synced) WHERE enhanced_synced = 0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_enhanced_unsynced ON content(enhanced_synced, deleted_at) WHERE enhanced_synced = 0 AND deleted_at IS NULL;
  CREATE INDEX idx_content_hash ON content(content_hash);
  CREATE INDEX idx_content_hash_embedding ON content(content_hash, embedding_model) WHERE embedding IS NOT NULL;
  CREATE INDEX idx_content_norm_active ON content(normalized_hash, doc_id) WHERE deleted_at IS NULL;
  CREATE TABLE paragraph_extractions (id INTEGER PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), output_json TEXT);
  CREATE TABLE paragraph_roles (id INTEGER PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id));`;

function migrated() {
  const db = new Database(':memory:');
  db.exec(TOWER);
  for (const sql of dropStatements()) db.exec(sql);
  const have = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r) => r.name));
  for (const ix of CONTENT_CHILD_FK_INDEXES) if (have.has(ix.table)) db.exec(childIndexSql(ix));   // ensureIndex skips absent tables
  return db;
}
const plan = (db, sql) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...Array((sql.match(/\?/g) || []).length).fill(1)).map((r) => r.detail).join(' ; ');

describe('migration 180 — content index prune', () => {
  it('drops exactly the listed indexes and keeps the ones that cover them', () => {
    const db = migrated();
    const left = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'content'`).all().map((r) => r.name));
    for (const n of Object.keys(CONTENT_INDEX_DROPS)) expect(left.has(n)).toBe(false);
    for (const n of ['idx_content_doc', 'idx_content_doc_deleted', 'idx_content_dirty_doc_updated', 'idx_content_unsynced_partial', 'idx_content_enhanced_unsynced', 'idx_content_norm_active']) expect(left.has(n)).toBe(true);
  });

  it('every query shape the dropped indexes served is still answered from an index', () => {
    const db = migrated();
    expect(plan(db, 'SELECT COUNT(*) FROM content WHERE synced = 0 AND deleted_at IS NULL')).toMatch(/idx_content_unsynced_partial/);
    expect(plan(db, 'SELECT COUNT(*) FROM content WHERE enhanced_synced = 0 AND deleted_at IS NULL')).toMatch(/idx_content_enhanced_unsynced/);
    expect(plan(db, 'SELECT id FROM content WHERE doc_id = ? AND deleted_at IS NULL')).toMatch(/USING (COVERING )?INDEX idx_content_doc_deleted/);
    expect(plan(db, 'SELECT id FROM content WHERE doc_id = ? AND synced = 0 AND deleted_at IS NULL ORDER BY updated_at DESC')).toMatch(/idx_content_dirty_doc_updated/);
    expect(plan(db, 'SELECT id FROM content WHERE doc_id = ?')).toMatch(/idx_content_doc\b/);   // the docs → content CASCADE key
  });

  it('a content row delete finds its paragraph_extractions children by index (foreign_keys ON)', () => {
    const db = migrated();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(plan(db, 'SELECT 1 FROM paragraph_extractions WHERE content_id = ?')).toMatch(/idx_paragraph_extractions_content/);
    db.prepare('INSERT INTO docs (id) VALUES (1)').run();
    db.prepare(`INSERT INTO content (id, doc_id, text) VALUES (10, 1, 'a'), (11, 1, 'b')`).run();
    db.prepare(`INSERT INTO paragraph_extractions (content_id) VALUES ('10')`).run();
    expect(() => db.prepare('DELETE FROM content WHERE id = 10').run()).toThrow(/FOREIGN KEY/);   // still enforced
    expect(db.prepare('DELETE FROM content WHERE id = 11').run().changes).toBe(1);
  });
});

describe('ensureIndex column check under routed writes (migration 181)', () => {
  it('sees a table\'s columns when PRAGMA statements go to the writer and come back without rows', async () => {
    const { ensureIndex } = await import('../../api/lib/migrations/ensure.js');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE paragraph_extractions (id INTEGER PRIMARY KEY, content_id TEXT NOT NULL)`);
    // db.js query(): a write-shaped statement (PRAGMA, CREATE …) is posted to the single writer → { rows: [{ changes }] }
    const routed = async (sql, params = []) => (/^\s*(PRAGMA|CREATE|DROP)/i.test(sql)
      ? (db.exec(sql), { rows: [{ lastInsertRowid: 0, changes: 0 }] })
      : db.prepare(sql).all(...params));
    const ix = CONTENT_CHILD_FK_INDEXES[0];
    expect(await ensureIndex(routed, { label: 't', table: ix.table, columns: [ix.column], sql: childIndexSql(ix) })).toBe(true);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = ?`).get(ix.name)).toBeTruthy();
  });
});
