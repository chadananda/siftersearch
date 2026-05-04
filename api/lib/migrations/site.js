// Site-only DB migrations — runs against per-site SQLite files at
// data/sites/<prefix>.db (one per site-only site). Holds a strict subset of
// the primary content schema: docs + content + indexes only. No enrichment,
// translation, jobs, or other primary-only tables.
//
// Each migration takes a `db` (better-sqlite3 Database, instrumented). The
// runner walks _schema_version on the db and applies pending migrations.
//
// Site-only sites are walled off from the primary corpus by construction —
// default Jafar search never opens these connections, so site-only content
// cannot leak into RAG by accident.

import { logger } from '../logger.js';

export const SITE_DB_CURRENT_VERSION = 1;

export const siteMigrations = {
  1: (db) => {
    // Mirrors the relevant columns from the primary docs + content tables.
    // Excluded: scope (whole DB is implicitly site-only), tier, slug,
    // duplicate_of, body_hash_normalized, purchase_url, metadata, etc. —
    // not used by site-only ingest.
    db.exec(`
      CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE,
        file_hash TEXT,
        filename TEXT,
        title TEXT,
        author TEXT,
        religion TEXT,
        collection TEXT,
        language TEXT DEFAULT 'en',
        year INTEGER,
        description TEXT,
        paragraph_count INTEGER DEFAULT 0,
        body_hash TEXT,
        file_mtime TEXT,
        source_site TEXT,
        source_url TEXT,
        external_id TEXT,
        encumbered INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        paragraph_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        normalized_hash TEXT,
        heading TEXT,
        blocktype TEXT DEFAULT 'paragraph',
        language TEXT,
        embedding BLOB,
        embedding_model TEXT,
        synced INTEGER DEFAULT 0,
        external_para_id TEXT,
        pdf_page INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_site_docs_file_hash ON docs(file_hash);
      CREATE INDEX IF NOT EXISTS idx_site_docs_deleted ON docs(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_site_content_doc ON content(doc_id);
      CREATE INDEX IF NOT EXISTS idx_site_content_unsynced
        ON content(synced) WHERE synced = 0 AND deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_site_content_normalized
        ON content(normalized_hash) WHERE normalized_hash IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_site_content_deleted ON content(deleted_at);
    `);
    logger.info('Site DB migration 1 complete: docs + content tables');
  }
};

// Runs synchronously (better-sqlite3). The instrumented db routes through
// logQueryTiming, so any slow migration step shows up in the slow-query log.
export function runSiteMigrations(db, siteId) {
  db.exec(`CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER PRIMARY KEY)`);
  const row = db.prepare('SELECT version FROM _schema_version LIMIT 1').get();
  const fromVersion = row?.version || 0;

  if (fromVersion >= SITE_DB_CURRENT_VERSION) {
    logger.debug({ siteId, version: fromVersion }, 'Site DB schema up to date');
    return;
  }

  logger.info({ siteId, from: fromVersion, to: SITE_DB_CURRENT_VERSION }, 'Running site DB migrations');
  for (let v = fromVersion + 1; v <= SITE_DB_CURRENT_VERSION; v++) {
    const migration = siteMigrations[v];
    if (!migration) throw new Error(`Site DB migration ${v} not found`);
    migration(db);
  }
  db.exec('DELETE FROM _schema_version');
  db.prepare('INSERT INTO _schema_version (version) VALUES (?)').run(SITE_DB_CURRENT_VERSION);
  logger.info({ siteId, version: SITE_DB_CURRENT_VERSION }, 'Site DB migrations complete');
}
