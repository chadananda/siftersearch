/**
 * Migration 44: Layered Indexing Tables
 *
 * RED tests — getMigration44SQL() does not exist yet.
 * All tests must fail until migration 44 is implemented.
 *
 * Tests an in-memory SQLite DB using node:sqlite (Node 22+).
 * No server, no network — pure schema verification.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
// RED: getMigration44SQL does not exist in migrations.js yet
import { getMigration44SQL } from '../../api/lib/migrations.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
}

function getIndexes(db, table) {
  return db.prepare(`PRAGMA index_list(${table})`).all().map(r => r.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration 44: Layered Indexing Tables', () => {
  let db;

  beforeAll(() => {
    db = new DatabaseSync(':memory:');
    const sql = getMigration44SQL();
    db.exec(sql);
  });

  // ── 1. content_objects ────────────────────────────────────────────────────

  describe('content_objects table', () => {
    it('exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='content_objects'"
      ).get();
      expect(row).toBeTruthy();
    });

    it('has all required columns', () => {
      const cols = getColumns(db, 'content_objects');
      const required = [
        'id', 'content_id', 'doc_id',
        'people_json', 'places_json', 'documents_json', 'events_json',
        'concepts_json', 'relations_json',
        'rendered', 'object_pipeline_version', 'content_hash', 'created_at',
      ];
      for (const col of required) expect(cols, `missing column: ${col}`).toContain(col);
    });

    it('has UNIQUE(content_id, object_pipeline_version) constraint', () => {
      db.exec(`INSERT INTO content_objects
        (content_id, doc_id, object_pipeline_version)
        VALUES (1, 10, 'v1')`);
      expect(() => db.exec(`INSERT INTO content_objects
        (content_id, doc_id, object_pipeline_version)
        VALUES (1, 10, 'v1')`)).toThrow();
    });
  });

  // ── 2. content_enrichment ─────────────────────────────────────────────────

  describe('content_enrichment table', () => {
    it('exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='content_enrichment'"
      ).get();
      expect(row).toBeTruthy();
    });

    it('has all required columns', () => {
      const cols = getColumns(db, 'content_enrichment');
      const required = [
        'id', 'content_id', 'doc_id', 'task_mode', 'result',
        'instructions_hash', 'book_meta_hash', 'window_hash', 'objects_hash',
        'target_paragraph_id', 'pipeline_version', 'model_id',
        'prompt_tokens', 'cached_tokens', 'completion_tokens',
        'call_ms', 'created_at',
      ];
      for (const col of required) expect(cols, `missing column: ${col}`).toContain(col);
    });

    it('has UNIQUE(content_id, task_mode, pipeline_version) constraint', () => {
      db.exec(`INSERT INTO content_enrichment
        (content_id, doc_id, task_mode, pipeline_version)
        VALUES (1, 10, 'summarize', 'v1')`);
      expect(() => db.exec(`INSERT INTO content_enrichment
        (content_id, doc_id, task_mode, pipeline_version)
        VALUES (1, 10, 'summarize', 'v1')`)).toThrow();
    });
  });

  // ── 3. pipeline_versions ──────────────────────────────────────────────────

  describe('pipeline_versions table', () => {
    it('exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_versions'"
      ).get();
      expect(row).toBeTruthy();
    });

    it('has all required columns', () => {
      const cols = getColumns(db, 'pipeline_versions');
      const required = [
        'id', 'pipeline_name', 'version', 'prompt_hash',
        'model_id', 'config_json', 'created_at', 'active',
      ];
      for (const col of required) expect(cols, `missing column: ${col}`).toContain(col);
    });

    it('has UNIQUE(pipeline_name, version) constraint', () => {
      db.exec(`INSERT INTO pipeline_versions (pipeline_name, version) VALUES ('rag', 'v1')`);
      expect(() => db.exec(`INSERT INTO pipeline_versions (pipeline_name, version) VALUES ('rag', 'v1')`)).toThrow();
    });
  });

  // ── 4. pipeline_jobs ──────────────────────────────────────────────────────

  describe('pipeline_jobs table', () => {
    it('exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_jobs'"
      ).get();
      expect(row).toBeTruthy();
    });

    it('has all required columns', () => {
      const cols = getColumns(db, 'pipeline_jobs');
      const required = [
        'id', 'job_type', 'doc_id', 'layer', 'status', 'pipeline_version',
        'total_items', 'completed_items', 'failed_items',
        'error', 'worker_id',
        'started_at', 'completed_at', 'heartbeat_at', 'created_at',
        'config_json',
      ];
      for (const col of required) expect(cols, `missing column: ${col}`).toContain(col);
    });
  });

  // ── 5. layer_sync_state ───────────────────────────────────────────────────

  describe('layer_sync_state table', () => {
    it('exists', () => {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='layer_sync_state'"
      ).get();
      expect(row).toBeTruthy();
    });

    it('has all required columns', () => {
      const cols = getColumns(db, 'layer_sync_state');
      const required = ['content_id', 'layer', 'synced', 'meili_index', 'synced_at'];
      for (const col of required) expect(cols, `missing column: ${col}`).toContain(col);
    });

    it('has PRIMARY KEY (content_id, layer) — rejects duplicate', () => {
      db.exec(`INSERT INTO layer_sync_state (content_id, layer) VALUES (1, 'objects')`);
      expect(() => db.exec(`INSERT INTO layer_sync_state (content_id, layer) VALUES (1, 'objects')`)).toThrow();
    });
  });

  // ── 6. Indexes ────────────────────────────────────────────────────────────

  describe('indexes', () => {
    it('has idx_co_doc on content_objects', () => {
      const indexes = getIndexes(db, 'content_objects');
      expect(indexes).toContain('idx_co_doc');
    });

    it('has idx_co_content on content_objects', () => {
      const indexes = getIndexes(db, 'content_objects');
      expect(indexes).toContain('idx_co_content');
    });

    it('has idx_ce_doc on content_enrichment', () => {
      const indexes = getIndexes(db, 'content_enrichment');
      expect(indexes).toContain('idx_ce_doc');
    });

    it('has idx_ce_content on content_enrichment', () => {
      const indexes = getIndexes(db, 'content_enrichment');
      expect(indexes).toContain('idx_ce_content');
    });

    it('has idx_pj_status on pipeline_jobs', () => {
      const indexes = getIndexes(db, 'pipeline_jobs');
      expect(indexes).toContain('idx_pj_status');
    });

    it('has idx_pj_doc on pipeline_jobs', () => {
      const indexes = getIndexes(db, 'pipeline_jobs');
      expect(indexes).toContain('idx_pj_doc');
    });

    it('has idx_lss_dirty on layer_sync_state', () => {
      const indexes = getIndexes(db, 'layer_sync_state');
      expect(indexes).toContain('idx_lss_dirty');
    });
  });

  // ── 7. Insert + read-back round-trips ─────────────────────────────────────

  describe('insert and read-back', () => {
    it('can insert into content_objects and read back', () => {
      db.exec(`INSERT INTO content_objects
        (content_id, doc_id, people_json, object_pipeline_version, content_hash)
        VALUES (999, 10, '[]', 'v2', 'abc123')`);
      const row = db.prepare(`SELECT * FROM content_objects WHERE content_id = 999`).get();
      expect(row.doc_id).toBe(10);
      expect(row.people_json).toBe('[]');
      expect(row.content_hash).toBe('abc123');
    });

    it('can insert into content_enrichment and read back', () => {
      db.exec(`INSERT INTO content_enrichment
        (content_id, doc_id, task_mode, result, pipeline_version, model_id,
         prompt_tokens, cached_tokens, completion_tokens, call_ms)
        VALUES (999, 10, 'questions', 'Q1?', 'v2', 'claude-3', 100, 50, 80, 1234)`);
      const row = db.prepare(`SELECT * FROM content_enrichment WHERE content_id = 999`).get();
      expect(row.task_mode).toBe('questions');
      expect(row.result).toBe('Q1?');
      expect(row.prompt_tokens).toBe(100);
      expect(row.call_ms).toBe(1234);
    });

    it('can insert into pipeline_versions and read back', () => {
      db.exec(`INSERT INTO pipeline_versions
        (pipeline_name, version, model_id, active)
        VALUES ('layered', 'v2', 'claude-3', 1)`);
      const row = db.prepare(`SELECT * FROM pipeline_versions WHERE pipeline_name = 'layered' AND version = 'v2'`).get();
      expect(row.model_id).toBe('claude-3');
      expect(row.active).toBe(1);
    });

    it('can insert into pipeline_jobs and read back', () => {
      db.exec(`INSERT INTO pipeline_jobs
        (job_type, doc_id, layer, status, pipeline_version, total_items, completed_items, failed_items)
        VALUES ('enrichment', 42, 'objects', 'pending', 'v1', 100, 0, 0)`);
      const row = db.prepare(`SELECT * FROM pipeline_jobs WHERE doc_id = 42`).get();
      expect(row.job_type).toBe('enrichment');
      expect(row.status).toBe('pending');
      expect(row.total_items).toBe(100);
    });

    it('can insert into layer_sync_state and read back', () => {
      db.exec(`INSERT INTO layer_sync_state
        (content_id, layer, synced, meili_index)
        VALUES (999, 'enrichment', 0, 'sifter-en')`);
      const row = db.prepare(`SELECT * FROM layer_sync_state WHERE content_id = 999 AND layer = 'enrichment'`).get();
      expect(row.synced).toBe(0);
      expect(row.meili_index).toBe('sifter-en');
    });
  });
});
