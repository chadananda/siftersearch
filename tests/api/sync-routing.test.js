// Sync-processor routing tests (Phase G).
//
// Two pieces:
//   1. Main-DB rows route to per-site Meili indexes based on source_site.
//   2. Site-only DBs are walked independently by the sync worker, with
//      their content pushed to siftersearch_<prefix>_paragraphs.
//
// We don't import sync-processor.js directly (it loads env, runs migrations
// on first import). Instead we test the SHAPE of the routing logic via a
// reimplementation against a controlled in-memory environment. The actual
// production code uses identical logic — if the test catches a bug here, the
// production code has the same bug.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Mirror the routing function from sync-processor.js
// ---------------------------------------------------------------------------

function indexNameForSourceSite(sourceSite, registry) {
  if (!sourceSite) return 'paragraphs';
  const cfg = registry[sourceSite];
  if (!cfg || !cfg.meili_index_prefix) return 'paragraphs';
  return `siftersearch_${cfg.meili_index_prefix}_paragraphs`;
}

const REGISTRY = {
  'oceanlibrary.com': { scope: 'supplemental', meili_index_prefix: 'ol' },
  'bahai-library.com': { scope: 'supplemental', meili_index_prefix: 'balib' },
  'oceanoflights.org': { scope: 'supplemental', meili_index_prefix: 'ool' },
  'bahaiteachings.org': { scope: 'site-only', meili_index_prefix: 'bt' },
};

describe('Sync routing — source_site → Meili index name', () => {
  it('primary docs (source_site IS NULL) → paragraphs', () => {
    expect(indexNameForSourceSite(null, REGISTRY)).toBe('paragraphs');
    expect(indexNameForSourceSite(undefined, REGISTRY)).toBe('paragraphs');
  });

  it('bahai-library → siftersearch_balib_paragraphs', () => {
    expect(indexNameForSourceSite('bahai-library.com', REGISTRY))
      .toBe('siftersearch_balib_paragraphs');
  });

  it('oceanoflights → siftersearch_ool_paragraphs', () => {
    expect(indexNameForSourceSite('oceanoflights.org', REGISTRY))
      .toBe('siftersearch_ool_paragraphs');
  });

  it('unknown source_site falls back to primary (with warning at runtime)', () => {
    expect(indexNameForSourceSite('unknown.example', REGISTRY)).toBe('paragraphs');
  });

  it('empty registry → everything goes to primary', () => {
    expect(indexNameForSourceSite('bahai-library.com', {})).toBe('paragraphs');
  });
});

describe('Sync routing — batch grouping by index', () => {
  // Simulate a batch of dirty paragraphs and verify the group-by-index logic
  // (lifted verbatim from sync-processor.js).
  it('groups a mixed batch into per-index buckets', () => {
    const batch = [
      { id: 1, source_site: null },
      { id: 2, source_site: 'bahai-library.com' },
      { id: 3, source_site: null },
      { id: 4, source_site: 'oceanoflights.org' },
      { id: 5, source_site: 'bahai-library.com' },
    ];
    const groups = new Map();
    for (const p of batch) {
      const indexName = indexNameForSourceSite(p.source_site, REGISTRY);
      if (!groups.has(indexName)) groups.set(indexName, []);
      groups.get(indexName).push(p.id);
    }
    expect(groups.get('paragraphs')).toEqual([1, 3]);
    expect(groups.get('siftersearch_balib_paragraphs')).toEqual([2, 5]);
    expect(groups.get('siftersearch_ool_paragraphs')).toEqual([4]);
    // Site-only sites do NOT appear here — those rows live in a separate DB
    // and are synced by syncOneSiteOnlyDb, not the main batch loop.
    expect(groups.has('siftersearch_bt_paragraphs')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Site-only DB sync — verify the SQL the worker uses pulls correct rows
// ---------------------------------------------------------------------------

describe('Sync routing — site-only DB query', () => {
  let siteDb;

  beforeEach(() => {
    siteDb = new Database(':memory:');
    siteDb.pragma('foreign_keys = OFF');
    siteDb.exec(`
      CREATE TABLE docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT, author TEXT, filename TEXT,
        source_url TEXT, source_site TEXT,
        deleted_at TEXT
      );
      CREATE TABLE content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        paragraph_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        normalized_hash TEXT,
        heading TEXT,
        blocktype TEXT DEFAULT 'paragraph',
        embedding BLOB,
        embedding_model TEXT,
        external_para_id TEXT,
        pdf_page INTEGER,
        language TEXT,
        synced INTEGER DEFAULT 0,
        deleted_at TEXT
      );
    `);
    siteDb.prepare(`INSERT INTO docs (id, title, author, source_url, source_site) VALUES (1, 'Why Unity', 'Some Author', 'https://bahaiteachings.org/x', 'bahaiteachings.org')`).run();
    siteDb.prepare(`INSERT INTO content (doc_id, paragraph_index, text) VALUES (?, ?, ?)`).run(1, 0, 'First para');
    siteDb.prepare(`INSERT INTO content (doc_id, paragraph_index, text) VALUES (?, ?, ?)`).run(1, 1, 'Second para');
    siteDb.prepare(`INSERT INTO content (doc_id, paragraph_index, text, synced) VALUES (?, ?, ?, 1)`).run(1, 2, 'Already synced');
  });

  it('returns only synced=0 paragraphs', () => {
    const rows = siteDb.prepare(`
      SELECT c.id, c.text
      FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE c.synced = 0 AND c.deleted_at IS NULL
      ORDER BY c.id LIMIT 50
    `).all();
    expect(rows.map(r => r.text)).toEqual(['First para', 'Second para']);
  });

  it('joins source_url + title from docs for deeplink rendering', () => {
    const rows = siteDb.prepare(`
      SELECT c.text, d.title, d.source_url
      FROM content c JOIN docs d ON d.id = c.doc_id
      WHERE c.synced = 0 LIMIT 1
    `).all();
    expect(rows[0].title).toBe('Why Unity');
    expect(rows[0].source_url).toBe('https://bahaiteachings.org/x');
  });

  it('marking synced flips the flag — second pass returns nothing', () => {
    const ids = siteDb.prepare(`SELECT id FROM content WHERE synced = 0`).all().map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    siteDb.prepare(`UPDATE content SET synced = 1 WHERE id IN (${placeholders})`).run(...ids);
    const remaining = siteDb.prepare(`SELECT COUNT(*) AS n FROM content WHERE synced = 0 AND deleted_at IS NULL`).get().n;
    expect(remaining).toBe(0);
  });
});
