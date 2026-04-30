/**
 * Database Schema Migrations
 *
 * Version-based migrations that run on API startup.
 * Each version number corresponds to schema changes.
 */

import { query, queryOne, queryAll, userQuery, userQueryOne } from './db.js';
import { logger } from './logger.js';
import { generateDocSlug } from './slug.js';

// Current schema version - increment when adding migrations
const CURRENT_VERSION = 55;
const USER_DB_CURRENT_VERSION = 3;

/**
 * Get current database schema version (content DB)
 */
async function getSchemaVersion() {
  try {
    // Check if version table exists
    const table = await queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='_schema_version'
    `);

    if (!table) {
      return 0;
    }

    const row = await queryOne('SELECT version FROM _schema_version LIMIT 1');
    return row?.version || 0;
  } catch {
    // Table doesn't exist yet, return version 0
    return 0;
  }
}

/**
 * Set schema version (content DB)
 */
async function setSchemaVersion(version) {
  await query(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER PRIMARY KEY
    )
  `);
  await query('DELETE FROM _schema_version');
  await query('INSERT INTO _schema_version (version) VALUES (?)', [version]);
}

/**
 * Get current user database schema version
 */
async function getUserSchemaVersion() {
  try {
    const table = await userQueryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='_user_schema_version'
    `);

    if (!table) {
      return 0;
    }

    const row = await userQueryOne('SELECT version FROM _user_schema_version LIMIT 1');
    return row?.version || 0;
  } catch {
    return 0;
  }
}

/**
 * Set user database schema version
 */
async function setUserSchemaVersion(version) {
  await userQuery(`
    CREATE TABLE IF NOT EXISTS _user_schema_version (
      version INTEGER PRIMARY KEY
    )
  `);
  await userQuery('DELETE FROM _user_schema_version');
  await userQuery('INSERT INTO _user_schema_version (version) VALUES (?)', [version]);
}

/**
 * Migration definitions - each version adds new changes
 */
const migrations = {
  // Version 1: Create base schema and add missing columns
  1: async () => {
    // Create users table if not exists (base schema)
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        tier TEXT DEFAULT 'anonymous',
        referral_code TEXT,
        preferences TEXT,
        interests TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create anonymous_users table
    await query(`
      CREATE TABLE IF NOT EXISTS anonymous_users (
        id TEXT PRIMARY KEY,
        user_agent TEXT,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        search_count INTEGER DEFAULT 0,
        last_search_query TEXT,
        preferences TEXT,
        interests TEXT,
        converted_to_user_id INTEGER,
        converted_at TEXT,
        unified_to INTEGER,
        FOREIGN KEY (converted_to_user_id) REFERENCES users(id),
        FOREIGN KEY (unified_to) REFERENCES users(id)
      )
    `);

    // Add missing columns to users table (handles existing databases)
    const columns = [
      { name: 'name', sql: 'ALTER TABLE users ADD COLUMN name TEXT' },
      { name: 'email_verified', sql: 'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0' },
      { name: 'preferred_language', sql: 'ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT "en"' },
      { name: 'metadata', sql: 'ALTER TABLE users ADD COLUMN metadata TEXT' },
      { name: 'approved_at', sql: 'ALTER TABLE users ADD COLUMN approved_at TEXT' },
      { name: 'referred_by', sql: 'ALTER TABLE users ADD COLUMN referred_by INTEGER' },
      { name: 'search_count', sql: 'ALTER TABLE users ADD COLUMN search_count INTEGER DEFAULT 0' },
      { name: 'auth_provider', sql: 'ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "email"' },
    ];

    for (const col of columns) {
      try {
        await query(col.sql);
        logger.info({ column: col.name }, 'Added column to users table');
      } catch (err) {
        if (!err.message?.includes('duplicate column')) {
          throw err;
        }
      }
    }

    // Create indexes (ignore if already exist)
    try { await query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'); } catch { /* index exists */ }
    try { await query('CREATE INDEX IF NOT EXISTS idx_anonymous_users_converted ON anonymous_users(converted_to_user_id)'); } catch { /* index exists */ }
  },

  // Version 2: Add verification_codes table
  2: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'email_verification',
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index if not exists
    try {
      await query('CREATE INDEX idx_verification_email ON verification_codes(email)');
    } catch {
      // Index may already exist
    }
  },

  // Version 3: Fix refresh_tokens table to use TEXT id (code uses nanoid string)
  3: async () => {
    // Check if refresh_tokens exists and has wrong schema
    const table = await queryOne(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name='refresh_tokens'
    `);

    if (table && table.sql.includes('id INTEGER')) {
      // Recreate with correct schema (TEXT id for nanoid tokens)
      logger.info('Recreating refresh_tokens with TEXT id');
      await query('DROP TABLE IF EXISTS refresh_tokens');
    }

    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    try {
      await query('CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id)');
    } catch {
      // Index may already exist
    }
  },

  // Version 4: Add forum tables
  4: async () => {
    // Forum posts table (handles both posts and replies via parent_id)
    await query(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        author_id INTEGER NOT NULL,
        parent_id INTEGER,
        root_post_id INTEGER,
        depth INTEGER DEFAULT 0,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES forum_posts(id),
        FOREIGN KEY (root_post_id) REFERENCES forum_posts(id)
      )
    `);

    // Forum votes table
    await query(`
      CREATE TABLE IF NOT EXISTS forum_votes (
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        vote INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (post_id) REFERENCES forum_posts(id)
      )
    `);

    // Create indexes
    try { await query('CREATE INDEX idx_forum_posts_author ON forum_posts(author_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_forum_posts_parent ON forum_posts(parent_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_forum_posts_root ON forum_posts(root_post_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_forum_posts_category ON forum_posts(category)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_forum_posts_created ON forum_posts(created_at)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_forum_votes_post ON forum_votes(post_id)'); } catch { /* exists */ }

    logger.info('Forum tables created');
  },

  // Version 5: Add donations table and stripe_customer_id to users
  5: async () => {
    // Add stripe_customer_id to users
    try {
      await query('ALTER TABLE users ADD COLUMN stripe_customer_id TEXT');
      logger.info('Added stripe_customer_id to users table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
    }

    // Create donations table
    await query(`
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        stripe_session_id TEXT,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'usd',
        frequency TEXT NOT NULL,
        tier_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create indexes
    try { await query('CREATE INDEX idx_donations_user ON donations(user_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_donations_stripe_session ON donations(stripe_session_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_donations_subscription ON donations(stripe_subscription_id)'); } catch { /* exists */ }

    logger.info('Donations table created');
  },

  // Version 6: Add deletion_requested_at and conversations table
  6: async () => {
    // Add deletion_requested_at to users
    try {
      await query('ALTER TABLE users ADD COLUMN deletion_requested_at TEXT');
      logger.info('Added deletion_requested_at to users table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
    }

    // Create conversations table for user chat history
    await query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT,
        messages TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    try { await query('CREATE INDEX idx_conversations_user ON conversations(user_id)'); } catch { /* exists */ }

    logger.info('User session and deletion support added');
  },

  // Version 7: Add blocktype and translation columns for enhanced content storage
  7: async () => {
    // Check if indexed_paragraphs table exists first
    const tableExists = await queryOne(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='indexed_paragraphs'
    `);

    if (!tableExists) {
      logger.info('indexed_paragraphs table does not exist yet, skipping column additions');
      return;
    }

    // Add blocktype column for markdown block type tracking
    // Allows exact markdown reconstruction from stored content
    try {
      await query('ALTER TABLE indexed_paragraphs ADD COLUMN blocktype TEXT DEFAULT \'paragraph\'');
      logger.info('Added blocktype column to indexed_paragraphs');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
    }

    // Add translation column for inline English translations (sparse storage)
    try {
      await query('ALTER TABLE indexed_paragraphs ADD COLUMN translation TEXT');
      logger.info('Added translation column to indexed_paragraphs');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
    }

    // Add context column for disambiguation (who, what, where, when)
    // Will be populated offline by local AI
    try {
      await query('ALTER TABLE indexed_paragraphs ADD COLUMN context TEXT');
      logger.info('Added context column to indexed_paragraphs');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
    }

    // Create index for blocktype filtering
    try {
      await query('CREATE INDEX idx_paragraphs_blocktype ON indexed_paragraphs(blocktype)');
    } catch { /* exists */ }

    logger.info('Content storage enhancements added (blocktype, translation, context)');
  },

  // Version 8: Add library_nodes table for collection hierarchy and authority
  8: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS library_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER,
        node_type TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT,
        overview TEXT,
        cover_image_url TEXT,
        authority_default INTEGER DEFAULT 5,
        display_order INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES library_nodes(id)
      )
    `);

    try { await query('CREATE INDEX idx_library_nodes_parent ON library_nodes(parent_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_library_nodes_type ON library_nodes(node_type)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_library_nodes_slug ON library_nodes(slug)'); } catch { /* exists */ }
    try { await query('CREATE UNIQUE INDEX idx_library_nodes_unique ON library_nodes(parent_id, slug)'); } catch { /* exists */ }

    logger.info('Library nodes table created for collection hierarchy');
  },

  // Version 9: Add symbol column to library_nodes for religion icons
  9: async () => {
    try {
      await query('ALTER TABLE library_nodes ADD COLUMN symbol TEXT');
      logger.info('Added symbol column to library_nodes');
    } catch {
      // Column already exists
    }

    // Seed default symbols for common religions
    const RELIGION_SYMBOLS = {
      "Bahá'í": "🟙",      // 9-pointed star (U+1F7D9)
      "Islam": "☪",       // Star and crescent
      "Christianity": "✝", // Latin cross
      "Judaism": "✡",     // Star of David
      "Buddhist": "☸",    // Dharma wheel
      "Hinduism": "ॐ",    // Om symbol
      "Zoroastrianism": "𐎠", // Old Persian symbol
      "Sikhism": "☬",     // Khanda
    };

    for (const [name, symbol] of Object.entries(RELIGION_SYMBOLS)) {
      await query(
        "UPDATE library_nodes SET symbol = ? WHERE node_type = 'religion' AND name = ? AND symbol IS NULL",
        [symbol, name]
      );
    }

    logger.info('Religion symbols seeded');
  },

  // Version 10: Add revoked_at column to refresh_tokens for grace period during navigation
  // Fixes race condition where token rotation during page navigation causes logout
  10: async () => {
    try {
      await query('ALTER TABLE refresh_tokens ADD COLUMN revoked_at TEXT');
      logger.info('Added revoked_at column to refresh_tokens for grace period support');
    } catch {
      // Column already exists
    }
  },

  // Version 11: Ensure Baha'i symbol is set (may have been missed if node was created after migration 9)
  11: async () => {
    // Force update Baha'i symbol regardless of current value
    await query(
      "UPDATE library_nodes SET symbol = '🟙' WHERE node_type = 'religion' AND name LIKE '%Bah%'"
    );
    logger.info('Bahai symbol updated to 🟙 (U+1F7D9)');
  },

  // Version 12: Add document storage tables (docs, content)
  // These tables store the source of truth for document data, separate from Meilisearch indexes
  // This allows re-indexing without losing expensive processing (translations, context, embeddings)
  12: async () => {
    // Create docs table - stores document metadata
    await query(`
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY,
        file_path TEXT UNIQUE,
        file_hash TEXT,
        title TEXT,
        author TEXT,
        religion TEXT,
        collection TEXT,
        language TEXT DEFAULT 'en',
        year INTEGER,
        description TEXT,
        paragraph_count INTEGER DEFAULT 0,
        source_file TEXT,
        cover_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create content table - stores segmented paragraphs with embeddings inline
    await query(`
      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        doc_id TEXT NOT NULL,
        paragraph_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        content_hash TEXT,
        heading TEXT,
        blocktype TEXT DEFAULT 'paragraph',
        translation TEXT,
        context TEXT,
        embedding BLOB,
        embedding_model TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for efficient queries
    try { await query('CREATE INDEX idx_docs_file_path ON docs(file_path)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_docs_religion ON docs(religion)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_docs_collection ON docs(collection)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_docs_language ON docs(language)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_docs_author ON docs(author)'); } catch { /* exists */ }

    try { await query('CREATE INDEX idx_content_doc ON content(doc_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_content_hash ON content(content_hash)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_content_synced ON content(synced)'); } catch { /* exists */ }

    logger.info('Document storage tables created (docs, content)');
  },

  // Version 13: Rename legacy table names to new names if they exist
  // Handles servers that ran old v12 with indexed_documents/indexed_paragraphs
  13: async () => {
    // Check if old tables exist and new tables don't
    const oldDocsExists = await queryOne(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='indexed_documents'
    `);
    const newDocsExists = await queryOne(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='docs'
    `);

    if (oldDocsExists && !newDocsExists) {
      logger.info('Renaming indexed_documents -> docs');
      await query('ALTER TABLE indexed_documents RENAME TO docs');
    }

    const oldContentExists = await queryOne(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='indexed_paragraphs'
    `);
    const newContentExists = await queryOne(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='content'
    `);

    if (oldContentExists && !newContentExists) {
      logger.info('Renaming indexed_paragraphs -> content');
      await query('ALTER TABLE indexed_paragraphs RENAME TO content');
    }

    // If neither old nor new tables exist, create the new ones
    if (!oldDocsExists && !newDocsExists) {
      await query(`
        CREATE TABLE IF NOT EXISTS docs (
          id TEXT PRIMARY KEY,
          file_path TEXT UNIQUE,
          file_hash TEXT,
          title TEXT,
          author TEXT,
          religion TEXT,
          collection TEXT,
          language TEXT DEFAULT 'en',
          year INTEGER,
          description TEXT,
          paragraph_count INTEGER DEFAULT 0,
          source_file TEXT,
          cover_url TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    if (!oldContentExists && !newContentExists) {
      await query(`
        CREATE TABLE IF NOT EXISTS content (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          paragraph_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          content_hash TEXT,
          heading TEXT,
          blocktype TEXT DEFAULT 'paragraph',
          translation TEXT,
          context TEXT,
          embedding BLOB,
          embedding_model TEXT,
          synced INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
        )
      `);
    }

    logger.info('Document storage tables migration complete');
  },

  // Version 14: Fix content table schema
  // The renamed indexed_paragraphs table has old column names that don't match our code
  14: async () => {
    try {
      // Check if content table exists
      const tableExists = await queryOne(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='content'
      `);

      if (!tableExists) {
        logger.info('Content table does not exist, skipping schema fix');
        return;
      }

      // Try to add columns (they may already exist)
      const columnsToAdd = [
        { name: 'doc_id', sql: 'ALTER TABLE content ADD COLUMN doc_id TEXT' },
        { name: 'embedding', sql: 'ALTER TABLE content ADD COLUMN embedding BLOB' },
        { name: 'embedding_model', sql: 'ALTER TABLE content ADD COLUMN embedding_model TEXT' },
        { name: 'content_hash', sql: 'ALTER TABLE content ADD COLUMN content_hash TEXT' },
        { name: 'synced', sql: 'ALTER TABLE content ADD COLUMN synced INTEGER DEFAULT 0' },
      ];

      for (const col of columnsToAdd) {
        try {
          await query(col.sql);
          logger.info({ column: col.name }, 'Added column to content table');
        } catch (err) {
          // Column likely already exists - that's fine
          if (!err.message?.includes('duplicate column') && !err.message?.includes('already exists')) {
            logger.debug({ column: col.name, err: err.message }, 'Column add skipped');
          }
        }
      }

      // If we have document_id but added doc_id, copy values over
      try {
        await query('UPDATE content SET doc_id = document_id WHERE doc_id IS NULL AND document_id IS NOT NULL');
        logger.info('Copied document_id values to doc_id');
      } catch (err) {
        // document_id column may not exist - that's fine
        logger.debug({ err: err.message }, 'document_id copy skipped');
      }

      // Create indexes (ignore if exists)
      try { await query('CREATE INDEX IF NOT EXISTS idx_content_doc ON content(doc_id)'); } catch { /* exists */ }
      try { await query('CREATE INDEX IF NOT EXISTS idx_content_hash ON content(content_hash)'); } catch { /* exists */ }

      logger.info('Content table schema fix complete');
    } catch (err) {
      logger.error({ err: err.message }, 'Content table schema fix failed');
      // Don't throw - let the server start anyway
    }
  },

  // Version 15: Add jobs and processed_cache tables for background job queue
  15: async () => {
    // Jobs table for background processing (translation, audio, etc.)
    await query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        user_id INTEGER,
        document_id TEXT,
        params TEXT,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        progress INTEGER DEFAULT 0,
        total_items INTEGER DEFAULT 0,
        result_url TEXT,
        result_path TEXT,
        error_message TEXT,
        notify_email TEXT,
        notified_at TEXT,
        expires_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Processed content cache
    await query(`
      CREATE TABLE IF NOT EXISTS processed_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        segment_id TEXT,
        process_type TEXT NOT NULL,
        source_language TEXT,
        target_language TEXT,
        voice_id TEXT,
        content_hash TEXT NOT NULL,
        result_path TEXT,
        result_url TEXT,
        file_size INTEGER,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    try { await query('CREATE INDEX idx_jobs_status ON jobs(status)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_jobs_type ON jobs(type)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_jobs_user ON jobs(user_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_jobs_document ON jobs(document_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_jobs_priority ON jobs(priority DESC, created_at ASC)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_cache_doc ON processed_cache(document_id)'); } catch { /* exists */ }
    try { await query('CREATE INDEX idx_cache_hash ON processed_cache(content_hash)'); } catch { /* exists */ }

    // If jobs table already exists, add priority column
    try {
      await query('ALTER TABLE jobs ADD COLUMN priority INTEGER DEFAULT 0');
      logger.info('Added priority column to jobs table');
    } catch {
      // Column already exists
    }

    logger.info('Jobs and cache tables created');
  },

  // Version 16: Add translation_segments column for aligned phrase translations
  16: async () => {
    try {
      await query('ALTER TABLE content ADD COLUMN translation_segments TEXT');
      logger.info('Added translation_segments column to content table');
    } catch {
      // Column already exists
    }
  },

  // Version 17: Fix content table schema - remove document_id, standardize on doc_id
  // SQLite requires recreating the table to drop columns
  17: async () => {
    try {
      // Check if content table exists
      const tableExists = await queryOne(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='content'
      `);

      if (!tableExists) {
        logger.info('Content table does not exist, skipping schema fix');
        return;
      }

      // Check if document_id column exists
      const tableInfo = await query('PRAGMA table_info(content)');
      const hasDocumentId = tableInfo.rows?.some(col => col.name === 'document_id');

      if (!hasDocumentId) {
        logger.info('document_id column does not exist, skipping');
        return;
      }

      logger.info('Recreating content table without document_id column');

      // 1. Create new table with correct schema
      await query(`
        CREATE TABLE IF NOT EXISTS content_new (
          id TEXT PRIMARY KEY,
          doc_id TEXT NOT NULL,
          paragraph_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          content_hash TEXT,
          heading TEXT,
          blocktype TEXT DEFAULT 'paragraph',
          translation TEXT,
          translation_segments TEXT,
          context TEXT,
          embedding BLOB,
          embedding_model TEXT,
          synced INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
        )
      `);

      // 2. Copy data from old table, using doc_id if available, otherwise document_id
      await query(`
        INSERT INTO content_new (id, doc_id, paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, context, embedding, embedding_model, synced, created_at, updated_at)
        SELECT id, COALESCE(doc_id, document_id), paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, context, embedding, embedding_model, synced, created_at, updated_at
        FROM content
      `);

      // 3. Drop old table
      await query('DROP TABLE content');

      // 4. Rename new table
      await query('ALTER TABLE content_new RENAME TO content');

      // 5. Recreate indexes
      try { await query('CREATE INDEX IF NOT EXISTS idx_content_doc ON content(doc_id)'); } catch { /* exists */ }
      try { await query('CREATE INDEX IF NOT EXISTS idx_content_hash ON content(content_hash)'); } catch { /* exists */ }
      try { await query('CREATE INDEX IF NOT EXISTS idx_content_synced ON content(synced)'); } catch { /* exists */ }

      logger.info('Content table schema fixed - document_id column removed, standardized on doc_id');
    } catch (err) {
      logger.error({ err: err.message }, 'Content table schema fix failed');
      throw err;  // This is critical, let it fail
    }
  },

  // Version 18: No-op - user tables moved to separate user database
  // See userMigrations below
  18: async () => {
    logger.info('Content DB migration 18: User tables now managed separately');
  },

  // Version 19: Create email_queue table for job notifications
  19: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_text TEXT NOT NULL,
        body_html TEXT,
        job_id TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sent_at TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )
    `);

    // Create indexes for efficient queue processing
    await query('CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_email_queue_job ON email_queue(job_id)');

    logger.info('Created email_queue table');
  },

  // Version 20: Add encumbered column to docs table for copyright protection
  20: async () => {
    // Add encumbered column for copyright protection
    // Slugs are generated dynamically from title/filename + language, not stored
    try {
      await query('ALTER TABLE docs ADD COLUMN encumbered INTEGER DEFAULT 0');
      logger.info('Added encumbered column to docs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) throw err;
    }
  },

  // Version 21: Add flexible metadata JSON column to docs table
  // Consolidates rarely-queried fields into JSON for schema flexibility
  // Core columns remain for routing/slugs: id, file_path, title, religion, collection, language, encumbered
  21: async () => {
    // Add metadata column for flexible JSON storage
    try {
      await query('ALTER TABLE docs ADD COLUMN metadata TEXT DEFAULT "{}"');
      logger.info('Added metadata column to docs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) throw err;
    }

    // Add filename column for slug generation fallback
    try {
      await query('ALTER TABLE docs ADD COLUMN filename TEXT');
      logger.info('Added filename column to docs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) throw err;
    }

    // Migrate existing column data into metadata JSON
    // This preserves all existing data while consolidating into flexible format
    const docs = await queryAll(`
      SELECT id, author, year, description, paragraph_count, source_file, cover_url, file_path
      FROM docs
      WHERE metadata IS NULL OR metadata = '{}'
    `);

    for (const doc of docs) {
      const metadata = {};
      if (doc.author) metadata.author = doc.author;
      if (doc.year) metadata.year = doc.year;
      if (doc.description) metadata.description = doc.description;
      if (doc.paragraph_count) metadata.paragraph_count = doc.paragraph_count;
      if (doc.source_file) metadata.source_file = doc.source_file;
      if (doc.cover_url) metadata.cover_url = doc.cover_url;

      // Extract filename from file_path for slug generation
      const filename = doc.file_path ? doc.file_path.split('/').pop() : null;

      await query(`
        UPDATE docs SET metadata = ?, filename = ? WHERE id = ?
      `, [JSON.stringify(metadata), filename, doc.id]);
    }

    logger.info(`Migrated ${docs.length} docs to metadata JSON format`);

    // Create index on commonly queried metadata fields
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_docs_metadata_author
                   ON docs(json_extract(metadata, '$.author'))`);
    } catch (err) {
      // Index creation may fail on older libSQL versions, not critical
      logger.warn('Could not create metadata author index:', err.message);
    }
  },

  // Version 22: Mark books as encumbered for testing content protection
  // These are copyrighted books that should show preview only to non-authenticated users
  22: async () => {
    // Mark all documents in "Baha'i Books" collection as encumbered
    // These are secondary works under copyright
    const result = await query(`
      UPDATE docs SET encumbered = 1, updated_at = CURRENT_TIMESTAMP
      WHERE collection = 'Baha''i Books' OR collection = 'Books'
    `);

    logger.info(`Marked ${result.changes || 0} book documents as encumbered`);
  },

  // Version 23: Add redirects table for tracking URL path changes
  // When document titles change, the slug changes, and we need to redirect old URLs
  23: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS redirects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        old_path TEXT NOT NULL UNIQUE,
        new_path TEXT NOT NULL,
        doc_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        hit_count INTEGER DEFAULT 0,
        last_hit_at TEXT,
        FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE SET NULL
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_redirects_old_path ON redirects(old_path)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_redirects_doc_id ON redirects(doc_id)`);

    logger.info('Created redirects table for URL path tracking');
  },

  // Version 24: Add auto_segmented flag to track documents that were AI-segmented
  // Documents with no natural paragraph breaks (Arabic/Farsi) are segmented during ingestion
  // This flag helps identify them for careful re-editing to avoid breaking translations
  24: async () => {
    try {
      await query('ALTER TABLE docs ADD COLUMN auto_segmented INTEGER DEFAULT 0');
      logger.info('Added auto_segmented column to docs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) throw err;
    }

    // Create index for filtering auto-segmented documents
    await query('CREATE INDEX IF NOT EXISTS idx_docs_auto_segmented ON docs(auto_segmented)');

    logger.info('Migration 24: auto_segmented flag added for tracking AI-segmented documents');
  },

  // Version 25: Add ingestion_queue table for document submission/review workflow
  25: async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS ingestion_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_data TEXT,
        analysis_result TEXT,
        suggested_metadata TEXT,
        status TEXT DEFAULT 'pending',
        target_document_id INTEGER,
        error_message TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for common queries
    await query('CREATE INDEX IF NOT EXISTS idx_ingestion_queue_status ON ingestion_queue(status)');
    await query('CREATE INDEX IF NOT EXISTS idx_ingestion_queue_created_by ON ingestion_queue(created_by)');

    logger.info('Migration 25: ingestion_queue table created for document submission workflow');
  },

  // Version 26: Add unique constraint on file_hash and ensure relative file_path
  // - file_hash uniqueness prevents duplicate content from being indexed twice
  // - file_path should be relative to basePath for library portability
  26: async () => {
    // Add unique index on file_hash (allows NULL values, only enforces uniqueness on non-NULL)
    try {
      await query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_file_hash_unique
        ON docs(file_hash)
        WHERE file_hash IS NOT NULL AND file_hash != ''
      `);
      logger.info('Created unique index on file_hash');
    } catch (err) {
      // If duplicates exist, log warning and skip
      if (err.message.includes('UNIQUE constraint failed')) {
        logger.warn('Cannot create unique index on file_hash - duplicates exist. Run cleanup-duplicates.js first.');
      } else {
        logger.error({ err: err.message }, 'Failed to create file_hash unique index');
      }
    }

    // Convert absolute file_path to relative (remove basePath prefix)
    // This makes the library portable - files can be moved as long as structure is preserved
    const docs = await queryAll(`
      SELECT id, file_path FROM docs
      WHERE file_path IS NOT NULL AND file_path LIKE '/%'
    `);

    if (docs.length > 0) {
      logger.info(`Found ${docs.length} documents with absolute file_path, converting to relative`);

      for (const doc of docs) {
        // Extract relative path by removing common base prefixes
        let relativePath = doc.file_path;

        // Common base path patterns to strip
        const basePrefixes = [
          '/home/chad/ocean-library/',
          '/Users/chad/ocean-library/',
          '/var/lib/siftersearch/library/',
        ];

        for (const prefix of basePrefixes) {
          if (relativePath.startsWith(prefix)) {
            relativePath = relativePath.slice(prefix.length);
            break;
          }
        }

        // If still absolute, try to extract from last known structure pattern
        // Pattern: .../Baha'i/Collection/Author/filename.md
        if (relativePath.startsWith('/')) {
          const match = relativePath.match(/\/(Baha'?i|Buddhism|Christianity|Hinduism|Islam|Judaism|Zoroastrianism)\//i);
          if (match) {
            relativePath = relativePath.slice(relativePath.indexOf(match[0]) + 1);
          }
        }

        if (relativePath !== doc.file_path) {
          await query('UPDATE docs SET file_path = ? WHERE id = ?', [relativePath, doc.id]);
        }
      }

      logger.info(`Converted ${docs.length} absolute paths to relative`);
    }

    logger.info('Migration 26: file_hash uniqueness and relative file_path enforcement');
  },

  // Version 27: Migrate docs.id from TEXT to INTEGER for efficiency
  // This is a major schema change that requires recreating tables
  27: async () => {
    logger.info('Starting migration 27: Convert docs.id from TEXT to INTEGER');

    // Drop any leftover temp tables from failed migrations
    await query('DROP TABLE IF EXISTS docs_new');
    await query('DROP TABLE IF EXISTS content_new');

    // Get current columns in docs table
    const columnsResult = await queryAll("PRAGMA table_info(docs)");
    const existingColumns = new Set(columnsResult.map(c => c.name));

    // Define canonical schema with optional columns
    const requiredColumns = ['file_path', 'file_hash', 'filename', 'title', 'author', 'religion', 'collection', 'language', 'year', 'description', 'paragraph_count', 'source_file', 'cover_url', 'auto_segmented', 'encumbered', 'metadata', 'created_at', 'updated_at'];
    const optionalColumns = ['slug']; // slug exists in production but not in dev

    // Build column list for copy - only include columns that exist
    const columnsToCopy = requiredColumns.filter(c => existingColumns.has(c));
    const hasSlug = existingColumns.has('slug');
    if (hasSlug) columnsToCopy.push('slug');

    logger.info({ columns: columnsToCopy, hasSlug }, 'Detected schema columns');

    // Step 1: Create new docs table with INTEGER PRIMARY KEY
    await query(`
      CREATE TABLE IF NOT EXISTS docs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        old_id TEXT,
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
        source_file TEXT,
        cover_url TEXT,
        slug TEXT UNIQUE,
        auto_segmented INTEGER DEFAULT 0,
        encumbered INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 2: Copy all docs, preserving old_id for reference and mapping
    const destColumns = ['old_id', ...columnsToCopy].join(', ');
    const srcColumns = ['id', ...columnsToCopy].join(', ');
    await query(`INSERT INTO docs_new (${destColumns}) SELECT ${srcColumns} FROM docs`);

    const docCount = await queryOne('SELECT COUNT(*) as count FROM docs_new');
    logger.info({ count: docCount?.count }, 'Copied docs to new table with INTEGER ids');

    // Step 3: Create new content table with INTEGER doc_id
    await query(`
      CREATE TABLE IF NOT EXISTS content_new (
        id TEXT PRIMARY KEY,
        doc_id INTEGER NOT NULL,
        paragraph_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        content_hash TEXT,
        heading TEXT,
        blocktype TEXT DEFAULT 'paragraph',
        translation TEXT,
        translation_segments TEXT,
        context TEXT,
        embedding BLOB,
        embedding_model TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES docs_new(id) ON DELETE CASCADE
      )
    `);

    // Step 4: Copy content with mapped doc_id (join on old_id)
    await query(`
      INSERT INTO content_new (id, doc_id, paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, context, embedding, embedding_model, synced, created_at, updated_at)
      SELECT c.id, d.id, c.paragraph_index, c.text, c.content_hash, c.heading, c.blocktype, c.translation, c.translation_segments, c.context, c.embedding, c.embedding_model, c.synced, c.created_at, c.updated_at
      FROM content c
      INNER JOIN docs_new d ON d.old_id = c.doc_id
    `);

    const contentCount = await queryOne('SELECT COUNT(*) as count FROM content_new');
    logger.info({ count: contentCount?.count }, 'Copied content with new INTEGER doc_ids');

    // Step 5: Update redirects table doc_id (if exists)
    try {
      await query(`
        UPDATE redirects SET doc_id = (
          SELECT CAST(d.id AS TEXT) FROM docs_new d WHERE d.old_id = redirects.doc_id
        )
        WHERE doc_id IS NOT NULL
      `);
      logger.info('Updated redirects table with new doc_ids');
    } catch (err) {
      logger.debug({ err: err.message }, 'Redirects table update skipped (may not exist)');
    }

    // Step 6: Drop old tables and rename new ones
    await query('DROP TABLE IF EXISTS content');
    await query('DROP TABLE IF EXISTS docs');
    await query('ALTER TABLE docs_new RENAME TO docs');
    await query('ALTER TABLE content_new RENAME TO content');

    // Step 7: Recreate indexes
    await query('CREATE INDEX IF NOT EXISTS idx_docs_file_path ON docs(file_path)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_file_hash ON docs(file_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_religion ON docs(religion)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_collection ON docs(collection)');
    await query('CREATE INDEX IF NOT EXISTS idx_content_doc ON content(doc_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_content_hash ON content(content_hash)');

    logger.info('Migration 27 complete: docs.id is now INTEGER PRIMARY KEY AUTOINCREMENT');
  },

  // Version 28: Drop old_id column from docs table
  28: async () => {
    logger.info('Starting migration 28: Drop old_id column from docs table');

    // Cleanup any leftover docs_new table from failed migration
    await query('DROP TABLE IF EXISTS docs_new');

    // Step 1: Create new docs table without old_id (matching actual production schema)
    await query(`
      CREATE TABLE IF NOT EXISTS docs_new (
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
        source_file TEXT,
        cover_url TEXT,
        slug TEXT,
        auto_segmented INTEGER DEFAULT 0,
        encumbered INTEGER DEFAULT 0,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 2: Copy all docs (excluding old_id)
    await query(`
      INSERT INTO docs_new (id, file_path, file_hash, filename, title, author, religion, collection, language, year, description, paragraph_count, source_file, cover_url, slug, auto_segmented, encumbered, metadata, created_at, updated_at)
      SELECT id, file_path, file_hash, filename, title, author, religion, collection, language, year, description, paragraph_count, source_file, cover_url, slug, auto_segmented, encumbered, metadata, created_at, updated_at
      FROM docs
    `);

    // Step 3: Drop old table and rename new one
    await query('DROP TABLE docs');
    await query('ALTER TABLE docs_new RENAME TO docs');

    // Step 4: Recreate indexes
    await query('CREATE INDEX IF NOT EXISTS idx_docs_file_path ON docs(file_path)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_file_hash ON docs(file_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_religion ON docs(religion)');
    await query('CREATE INDEX IF NOT EXISTS idx_docs_collection ON docs(collection)');

    logger.info('Migration 28 complete: old_id column removed from docs table');
  },

  // Version 29: Add body_hash column for metadata-only updates
  // Allows editing frontmatter (title, author, etc.) without re-processing content
  // file_hash detects ANY file change, body_hash detects CONTENT change only
  29: async () => {
    try {
      await query('ALTER TABLE docs ADD COLUMN body_hash TEXT');
      logger.info('Added body_hash column to docs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) throw err;
    }

    // Create index for potential future queries by body_hash
    await query('CREATE INDEX IF NOT EXISTS idx_docs_body_hash ON docs(body_hash)');

    logger.info('Migration 29 complete: body_hash column added for metadata-only updates');
  },

  // Version 30: Convert content.id from TEXT to INTEGER
  // Meilisearch already uses rowid as its id - this makes SQLite match
  // Preserves all embeddings and data by copying with rowid as new id
  30: async () => {
    logger.info('Starting migration 30: Convert content.id from TEXT to INTEGER');

    // Check current schema
    const schema = await queryAll("PRAGMA table_info(content)");
    const idColumn = schema.find(c => c.name === 'id');

    if (idColumn && idColumn.type === 'INTEGER') {
      logger.info('content.id is already INTEGER, skipping migration');
      return;
    }

    // Get count for progress logging
    const countResult = await queryOne('SELECT COUNT(*) as count FROM content');
    const totalRows = countResult?.count || 0;
    logger.info({ totalRows }, 'Migrating content table to INTEGER id');

    // Step 1: Create new content table with INTEGER PRIMARY KEY
    // Using AUTOINCREMENT to ensure new IDs continue from highest existing
    await query(`
      CREATE TABLE IF NOT EXISTS content_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        paragraph_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        content_hash TEXT,
        heading TEXT,
        blocktype TEXT DEFAULT 'paragraph',
        translation TEXT,
        translation_segments TEXT,
        context TEXT,
        embedding BLOB,
        embedding_model TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE
      )
    `);

    // Step 2: Copy all data using rowid as the new id
    // This preserves the Meilisearch link since Meili uses rowid
    await query(`
      INSERT INTO content_new (id, doc_id, paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, context, embedding, embedding_model, synced, created_at, updated_at)
      SELECT rowid, doc_id, paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, context, embedding, embedding_model, synced, created_at, updated_at
      FROM content
    `);

    const newCount = await queryOne('SELECT COUNT(*) as count FROM content_new');
    logger.info({ originalCount: totalRows, newCount: newCount?.count }, 'Copied content with INTEGER ids');

    // Verify counts match before proceeding
    if (newCount?.count !== totalRows) {
      throw new Error(`Row count mismatch: original ${totalRows}, new ${newCount?.count}`);
    }

    // Step 3: Verify embeddings were preserved (spot check)
    const embeddingCheck = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM content WHERE embedding IS NOT NULL) as old_count,
        (SELECT COUNT(*) FROM content_new WHERE embedding IS NOT NULL) as new_count
    `);
    logger.info({
      oldEmbeddings: embeddingCheck?.old_count,
      newEmbeddings: embeddingCheck?.new_count
    }, 'Embedding preservation check');

    if (embeddingCheck?.old_count !== embeddingCheck?.new_count) {
      throw new Error(`Embedding count mismatch: original ${embeddingCheck?.old_count}, new ${embeddingCheck?.new_count}`);
    }

    // Step 4: Drop old table and rename new one
    await query('DROP TABLE content');
    await query('ALTER TABLE content_new RENAME TO content');

    // Step 5: Recreate indexes
    await query('CREATE INDEX IF NOT EXISTS idx_content_doc ON content(doc_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_content_hash ON content(content_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_content_synced ON content(synced)');

    // Step 6: Update sqlite_sequence to ensure AUTOINCREMENT continues correctly
    const maxId = await queryOne('SELECT MAX(id) as max_id FROM content');
    if (maxId?.max_id) {
      await query(`
        INSERT OR REPLACE INTO sqlite_sequence (name, seq)
        VALUES ('content', ?)
      `, [maxId.max_id]);
    }

    logger.info('Migration 30 complete: content.id is now INTEGER PRIMARY KEY AUTOINCREMENT');
  },

  // Version 31: Add soft-delete support for embedding retention
  // Documents and content are soft-deleted (deleted_at set) instead of hard-deleted
  // This preserves embeddings for 30 days to avoid regenerating expensive embeddings
  // when re-importing similar content
  31: async () => {
    logger.info('Starting migration 31: Add soft-delete columns for embedding retention');

    // Add deleted_at to docs table
    try {
      await query('ALTER TABLE docs ADD COLUMN deleted_at TEXT');
      logger.info('Added deleted_at column to docs table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
      logger.info('deleted_at column already exists in docs table');
    }

    // Add deleted_at to content table
    try {
      await query('ALTER TABLE content ADD COLUMN deleted_at TEXT');
      logger.info('Added deleted_at column to content table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
      logger.info('deleted_at column already exists in content table');
    }

    // Create index on deleted_at for efficient filtering
    await query('CREATE INDEX IF NOT EXISTS idx_docs_deleted_at ON docs(deleted_at)');
    await query('CREATE INDEX IF NOT EXISTS idx_content_deleted_at ON content(deleted_at)');

    // Create composite index for embedding lookup by content_hash (includes deleted content)
    // This enables fast embedding reuse across all content including soft-deleted
    await query('CREATE INDEX IF NOT EXISTS idx_content_hash_embedding ON content(content_hash, embedding_model) WHERE embedding IS NOT NULL');

    logger.info('Migration 31 complete: Soft-delete columns added for embedding retention');
  },

  // Version 32: Add normalized_hash for embedding deduplication
  // Enables sharing embeddings across documents with identical content
  // (same paragraph quoted in 50 docs = 1 embedding generation)
  32: async () => {
    logger.info('Starting migration 32: Add normalized_hash for embedding deduplication');

    // Add normalized_hash column to content table
    try {
      await query('ALTER TABLE content ADD COLUMN normalized_hash TEXT');
      logger.info('Added normalized_hash column to content table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
      logger.info('normalized_hash column already exists in content table');
    }

    // Create index for fast embedding lookup by normalized_hash
    // This is the key index for embedding deduplication
    await query('CREATE INDEX IF NOT EXISTS idx_content_normalized_hash ON content(normalized_hash, embedding_model) WHERE embedding IS NOT NULL');

    logger.info('Migration 32 complete: normalized_hash column added for embedding deduplication');
  },

  // Version 33: Mark that normalized_hash backfill is needed
  // The actual backfill is done via admin endpoint since it's a long-running operation (400k+ rows)
  // New content will have normalized_hash computed on insert automatically
  33: async () => {
    logger.info('Migration 33: normalized_hash backfill marker');

    // Check how many need processing
    const countResult = await queryOne('SELECT COUNT(*) as count FROM content WHERE normalized_hash IS NULL AND text IS NOT NULL');
    const totalRows = countResult?.count || 0;

    if (totalRows === 0) {
      logger.info('Migration 33: All content already has normalized_hash');
    } else {
      logger.warn({ totalRows }, 'Migration 33: Content rows need normalized_hash backfill - run POST /api/admin/backfill-normalized-hash');
    }
  },

  // Version 34: Add document_failures table for tracking ingestion failures
  // Documents with oversized paragraphs or other validation errors are logged here
  // instead of being silently accepted with bad data
  34: async () => {
    logger.info('Starting migration 34: Create document_failures table');

    await query(`
      CREATE TABLE IF NOT EXISTS document_failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT,
        file_name TEXT,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        details TEXT,
        resolved INTEGER DEFAULT 0,
        resolved_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient querying
    await query('CREATE INDEX IF NOT EXISTS idx_doc_failures_resolved ON document_failures(resolved)');
    await query('CREATE INDEX IF NOT EXISTS idx_doc_failures_error_type ON document_failures(error_type)');
    await query('CREATE INDEX IF NOT EXISTS idx_doc_failures_file_path ON document_failures(file_path)');
    await query('CREATE INDEX IF NOT EXISTS idx_doc_failures_created ON document_failures(created_at DESC)');

    logger.info('Migration 34 complete: document_failures table created');
  },

  // Version 35: Add index for embedding worker queries
  // The existing idx_content_normalized_hash only covers rows WITH embeddings
  // We need a partial index for rows NEEDING embeddings (embedding IS NULL)
  35: async () => {
    logger.info('Starting migration 35: Add index for embedding worker');

    // This index optimizes the embedding worker's main query:
    // SELECT ... FROM content WHERE embedding IS NULL AND deleted_at IS NULL
    await query('CREATE INDEX IF NOT EXISTS idx_content_needs_embedding ON content(deleted_at, normalized_hash) WHERE embedding IS NULL');

    logger.info('Migration 35 complete: embedding worker index added');
  },

  // Version 36: Add file_mtime column to docs table
  // Tracks when the source file was last modified for accurate "added" vs "modified" filtering
  36: async () => {
    logger.info('Starting migration 36: Add file_mtime column to docs');

    try {
      await query('ALTER TABLE docs ADD COLUMN file_mtime TEXT');
      logger.info('Added file_mtime column to docs table');
    } catch (err) {
      if (!err.message?.includes('duplicate column')) {
        throw err;
      }
      logger.info('file_mtime column already exists in docs table');
    }

    // Create index for efficient filtering by file modification time
    await query('CREATE INDEX IF NOT EXISTS idx_docs_file_mtime ON docs(file_mtime)');

    logger.info('Migration 36 complete: file_mtime column added');
  },

  37: async () => {
    logger.info('Starting migration 37: API keys table');

    await query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        key_prefix TEXT NOT NULL,
        rate_limit INTEGER DEFAULT 1000,
        permissions TEXT DEFAULT '["search"]',
        last_used_at TEXT,
        request_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        revoked_at TEXT
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');
    await query('CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)');

    logger.info('Migration 37 complete: api_keys table created');
  },

  38: async () => {
    logger.info('Starting migration 38: sync_jobs table');

    await query(`
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total_items INTEGER DEFAULT 0,
        completed_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT,
        error TEXT
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status, created_at)');

    logger.info('Migration 38 complete: sync_jobs table created');
  },

  // Migration 39: Counter table for instant COUNT queries
  // Replaces expensive COUNT(*) on 2.5M row content table (~2.2s each) with instant lookups
  39: async () => {
    logger.info('Starting migration 39: table_counts + triggers');

    // Create the counter table
    await query(`
      CREATE TABLE IF NOT EXISTS table_counts (
        table_name TEXT PRIMARY KEY,
        row_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Seed with current counts (one-time expensive operation during migration)
    const docsCount = await queryOne('SELECT COUNT(*) as c FROM docs WHERE deleted_at IS NULL');
    const contentCount = await queryOne('SELECT COUNT(*) as c FROM content WHERE deleted_at IS NULL');
    const unsyncedCount = await queryOne('SELECT COUNT(*) as c FROM content WHERE synced = 0 AND deleted_at IS NULL');
    const docsWithContentCount = await queryOne('SELECT COUNT(DISTINCT doc_id) as c FROM content WHERE deleted_at IS NULL');

    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('docs', ?)`, [docsCount?.c || 0]);
    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('content', ?)`, [contentCount?.c || 0]);
    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('content_unsynced', ?)`, [unsyncedCount?.c || 0]);
    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('docs_with_content', ?)`, [docsWithContentCount?.c || 0]);

    // --- Triggers for docs table ---
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_docs_insert AFTER INSERT ON docs
      WHEN NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs';
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_docs_soft_delete AFTER UPDATE OF deleted_at ON docs
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      BEGIN
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'docs';
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_docs_undelete AFTER UPDATE OF deleted_at ON docs
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs';
      END
    `);

    // --- Triggers for content table ---
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_insert AFTER INSERT ON content
      WHEN NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content';
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content_unsynced' AND NEW.synced = 0;
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_soft_delete AFTER UPDATE OF deleted_at ON content
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      BEGIN
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'content';
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'content_unsynced' AND OLD.synced = 0;
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_undelete AFTER UPDATE OF deleted_at ON content
      WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content';
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content_unsynced' AND NEW.synced = 0;
      END
    `);

    // Track synced status changes
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_synced AFTER UPDATE OF synced ON content
      WHEN OLD.synced = 0 AND NEW.synced = 1 AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'content_unsynced';
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_unsynced AFTER UPDATE OF synced ON content
      WHEN OLD.synced = 1 AND NEW.synced = 0 AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content_unsynced';
      END
    `);

    // Track docs_with_content: increment when first content row inserted for a doc
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_insert_doc_count AFTER INSERT ON content
      WHEN NEW.deleted_at IS NULL
        AND (SELECT COUNT(*) FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL AND id != NEW.id) = 0
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'docs_with_content';
      END
    `);

    // Decrement when last content row for a doc is soft-deleted
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_delete_doc_count AFTER UPDATE OF deleted_at ON content
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
        AND (SELECT COUNT(*) FROM content WHERE doc_id = NEW.doc_id AND deleted_at IS NULL) = 0
      BEGIN
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'docs_with_content';
      END
    `);

    logger.info({
      docs: docsCount?.c,
      content: contentCount?.c,
      unsynced: unsyncedCount?.c,
      docsWithContent: docsWithContentCount?.c
    }, 'Migration 39 complete: table_counts seeded with triggers');
  },

  40: async () => {
    logger.info('Starting migration 40: embedding counters + triggers for single-writer architecture');

    // NOTE: Index creation deferred — CREATE INDEX scans the full 17GB table,
    // causing D-state hangs on swap-starved servers. Run manually when memory frees up:
    //   CREATE INDEX IF NOT EXISTS idx_content_unsynced_partial ON content(synced, deleted_at) WHERE synced = 0 AND deleted_at IS NULL;
    //   CREATE INDEX IF NOT EXISTS idx_content_needs_embedding_v2 ON content(embedding, deleted_at, id) WHERE embedding IS NULL AND deleted_at IS NULL;

    // Seed counter table with embedding-related counts (extends migration 39 pattern)
    // Use 0 as placeholder — triggers maintain correct counts from here on.
    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('content_unembedded', 0)`);
    await query(`INSERT OR REPLACE INTO table_counts (table_name, row_count) VALUES ('content_oversized', 0)`);

    // Triggers for embedding counter: decrement when embedding is set, increment when cleared
    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_embedding_set AFTER UPDATE OF embedding ON content
      WHEN OLD.embedding IS NULL AND NEW.embedding IS NOT NULL AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = MAX(0, row_count - 1) WHERE table_name = 'content_unembedded';
      END
    `);

    await query(`
      CREATE TRIGGER IF NOT EXISTS trg_content_embedding_clear AFTER UPDATE OF embedding ON content
      WHEN OLD.embedding IS NOT NULL AND NEW.embedding IS NULL AND NEW.deleted_at IS NULL
      BEGIN
        UPDATE table_counts SET row_count = row_count + 1 WHERE table_name = 'content_unembedded';
      END
    `);

    logger.info('Migration 40 complete: composite indexes + embedding counters (seeded with 0)');
  },

  41: async () => {
    logger.info('Starting migration 41: librarian_suggestions table');

    await query(`
      CREATE TABLE IF NOT EXISTS librarian_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        admin_notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_librarian_suggestions_status ON librarian_suggestions(status)`);

    logger.info('Migration 41 complete: librarian_suggestions table');
  },

  42: async () => {
    logger.info('Starting migration 42: backfill empty doc slugs');

    const docs = await queryAll(`
      SELECT id, title, author, filename, language
      FROM docs
      WHERE (slug IS NULL OR slug = '') AND title IS NOT NULL
    `);

    let updated = 0;
    const seen = new Set();
    // Collect existing slugs to avoid collisions
    const existing = await queryAll(`SELECT slug FROM docs WHERE slug IS NOT NULL AND slug != ''`);
    for (const row of existing) seen.add(row.slug);

    for (const doc of docs) {
      let slug = generateDocSlug(doc);
      if (!slug) continue;

      // Ensure uniqueness
      if (seen.has(slug)) {
        let counter = 2;
        while (seen.has(`${slug}-${counter}`)) counter++;
        slug = `${slug}-${counter}`;
      }

      await query(`UPDATE docs SET slug = ? WHERE id = ?`, [slug, doc.id]);
      seen.add(slug);
      updated++;
    }

    logger.info({ total: docs.length, updated }, 'Migration 42 complete: backfilled doc slugs');
  },

  // Version 43: RAG Enhancement Layer — new columns + doc_entities table + indexes
  43: async () => {
    logger.info('Starting migration 43: RAG enhancement layer schema');
    // New content columns for enhancement pipeline
    try { await query('ALTER TABLE content ADD COLUMN hyp_questions TEXT'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query('ALTER TABLE content ADD COLUMN context_model TEXT'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query('ALTER TABLE content ADD COLUMN enhanced_synced INTEGER DEFAULT 0'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    // Optional tier column on docs (may already exist)
    try {
      await query("ALTER TABLE docs ADD COLUMN tier TEXT DEFAULT 'secondary'");
    } catch { /* column may exist */ }
    // Entity store for whole-document NER
    await query(`
      CREATE TABLE IF NOT EXISTS doc_entities (
        doc_id INTEGER PRIMARY KEY,
        entities TEXT NOT NULL,
        model TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (doc_id) REFERENCES docs(id)
      )
    `);
    // Partial indexes for enhancement worker queries
    try { await query('CREATE INDEX IF NOT EXISTS idx_content_needs_context ON content(doc_id, paragraph_index) WHERE context IS NULL AND deleted_at IS NULL'); } catch { /* exists */ }
    try { await query('CREATE INDEX IF NOT EXISTS idx_content_needs_hype ON content(id) WHERE hyp_questions IS NULL AND context IS NOT NULL AND deleted_at IS NULL'); } catch { /* exists */ }
    try { await query('CREATE INDEX IF NOT EXISTS idx_content_enhanced_unsynced ON content(enhanced_synced, deleted_at) WHERE enhanced_synced = 0 AND deleted_at IS NULL'); } catch { /* exists */ }
    logger.info('Migration 43 complete: RAG enhancement layer schema added');
  },

  // Version 44: Layered Indexing Tables
  44: async () => {
    logger.info('Starting migration 44: Layered indexing tables');
    await query(getMigration44SQL());
    logger.info('Migration 44 complete: Layered indexing tables added');
  },
  // Version 45: Normalize religion name from "Buddhism" to "Buddhist"
  // Library was renamed from Buddhism to Buddhist but old docs retained stale value
  45: async () => {
    logger.info('Starting migration 45: Normalize Buddhism → Buddhist');
    await query("UPDATE docs SET religion = 'Buddhist' WHERE religion = 'Buddhism'");
    await query("UPDATE library_nodes SET name = 'Buddhist' WHERE node_type = 'religion' AND name = 'Buddhism'");
    logger.info('Migration 45 complete: Buddhism renamed to Buddhist');
  },
  // Version 46: Add partial indexes for embedding migration and worker queries
  // These enable fast lookups without full table scans on multi-million row tables
  46: async () => {
    logger.info('Starting migration 46: Content table indexes');
    // Check which columns exist (test DBs may not have all columns)
    const cols = (await queryAll(`PRAGMA table_info(content)`)).map(c => c.name);
    if (cols.includes('embedding')) {
      await query(`CREATE INDEX IF NOT EXISTS idx_content_has_embedding
        ON content(id) WHERE embedding IS NOT NULL AND deleted_at IS NULL`);
    }
    if (cols.includes('synced')) {
      await query(`CREATE INDEX IF NOT EXISTS idx_content_unsynced
        ON content(synced) WHERE synced = 0 AND deleted_at IS NULL`);
    }
    if (cols.includes('enhanced_synced')) {
      await query(`CREATE INDEX IF NOT EXISTS idx_content_unsynced_enhanced
        ON content(enhanced_synced) WHERE enhanced_synced = 0 AND deleted_at IS NULL`);
    }
    if (cols.includes('normalized_hash')) {
      await query(`CREATE INDEX IF NOT EXISTS idx_content_normalized_hash
        ON content(normalized_hash) WHERE normalized_hash IS NOT NULL`);
    }
    logger.info('Migration 46 complete: Content table indexes added');
  },
  // Version 47: Add per-paragraph language column
  // Falls back to doc.language when NULL. Enables proper language-specific
  // segmentation and search for mixed-language documents.
  47: async () => {
    logger.info('Starting migration 47: Add language column to content');
    const cols = (await queryAll('PRAGMA table_info(content)')).map(c => c.name);
    if (!cols.includes('language')) {
      await query('ALTER TABLE content ADD COLUMN language TEXT DEFAULT NULL');
    }
    logger.info('Migration 47 complete: language column added to content');
  },
  // Version 48: Add normalized body hash for duplicate detection
  // body_hash is exact (for change detection); body_hash_normalized ignores
  // whitespace, markdown formatting, and punctuation (for dedup).
  // Paragraph-level fingerprinting uses content.normalized_hash directly (no denormalization needed).
  48: async () => {
    logger.info('Starting migration 48: Add body_hash_normalized column');
    const cols = (await queryAll('PRAGMA table_info(docs)')).map(c => c.name);
    if (!cols.includes('body_hash_normalized')) {
      await query('ALTER TABLE docs ADD COLUMN body_hash_normalized TEXT');
      await query('CREATE INDEX IF NOT EXISTS idx_docs_body_hash_norm ON docs(body_hash_normalized) WHERE deleted_at IS NULL');
    }
    logger.info('Migration 48 complete: body_hash_normalized column added to docs');
  },

  // Version 49: Add purchase_url for linking to external purchase pages (Amazon, publisher, etc.)
  49: async () => {
    logger.info('Starting migration 49: Add purchase_url column to docs');
    const cols = (await queryAll('PRAGMA table_info(docs)')).map(c => c.name);
    if (!cols.includes('purchase_url')) {
      await query('ALTER TABLE docs ADD COLUMN purchase_url TEXT');
    }
    logger.info('Migration 49 complete: purchase_url column added to docs');
  },

  // Version 50: Graph entity and relation tables for knowledge graph visualization
  50: async () => {
    logger.info('Starting migration 50: Create graph_entities and graph_relations tables');

    await query(`
      CREATE TABLE IF NOT EXISTS graph_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        religion TEXT,
        mention_count INTEGER DEFAULT 1,
        doc_count INTEGER DEFAULT 1,
        era TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(canonical_name, entity_type, religion)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS graph_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_entity_id INTEGER NOT NULL,
        target_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL DEFAULT 'co-occurs',
        weight INTEGER DEFAULT 1,
        source_doc_id INTEGER,
        source_content_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_entity_id, target_entity_id, relation_type),
        FOREIGN KEY (source_entity_id) REFERENCES graph_entities(id),
        FOREIGN KEY (target_entity_id) REFERENCES graph_entities(id)
      )
    `);

    await query('CREATE INDEX IF NOT EXISTS idx_ge_religion ON graph_entities(religion)');
    await query('CREATE INDEX IF NOT EXISTS idx_ge_type ON graph_entities(entity_type)');
    await query('CREATE INDEX IF NOT EXISTS idx_ge_mention ON graph_entities(mention_count DESC)');
    await query('CREATE INDEX IF NOT EXISTS idx_gr_source ON graph_relations(source_entity_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_gr_target ON graph_relations(target_entity_id)');

    logger.info('Migration 50 complete: graph tables created');
  },

  // Version 51: chat session persistence + published conversations
  // chat_sessions / chat_messages: optional conversation_id thread persistence
  //   (Task #8) — POST /api/v1/chat accepts ?conversation_id=… and replays
  //   prior history. tenant_id is derived from the API key on first message.
  // published_conversations: REMOTE-mode save target (Task #9) — when a
  //   tenant calls POST /api/v1/chat/save with {domain, base_path}, the
  //   publish pipeline writes a row here keyed by (tenant_id, slug) and
  //   returns share_url+fetch_url. The remote site fetches by slug from
  //   GET /api/v1/conversations/{slug}?tenant=… (Task #10).
  51: async () => {
    logger.info('Starting migration 51: chat sessions + published conversations');

    await query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,                 -- conversation_id, e.g. "conv_<uuid>"
        tenant_id TEXT NOT NULL,             -- derived from API key (or "siftersearch" for internal)
        user_id INTEGER,                     -- nullable: anonymous chats are fine
        title TEXT,                          -- generated lazily from round 1 once rounds >= 2
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',        -- active | published | archived | deleted
        published_slug TEXT,                 -- set when this session is published via /save
        metadata_json TEXT                   -- {hero_image, topic, tags, keywords, …}
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant ON chat_sessions(tenant_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_activity ON chat_sessions(last_activity)');

    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        round_index INTEGER NOT NULL,        -- 0-based round number; user+assistant share the same round
        role TEXT NOT NULL,                  -- user | assistant | system | tool
        content TEXT NOT NULL,
        tool_calls_json TEXT,                -- for assistant messages with tool_calls
        tool_name TEXT,                      -- for tool result messages
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, round_index)');

    await query(`
      CREATE TABLE IF NOT EXISTS published_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,             -- derived from API key
        slug TEXT NOT NULL,                  -- generated from title; unique per tenant
        title TEXT NOT NULL,                 -- question form
        description TEXT NOT NULL,           -- answer-summary
        question TEXT NOT NULL,              -- the seed question (round 1 user content)
        topic TEXT,
        tags_json TEXT,                      -- JSON array
        keywords_json TEXT,                  -- JSON array
        excerpt TEXT,                        -- pull-quote for listing cards
        hero_image TEXT,                     -- URL (R2/CDN)
        rounds_json TEXT NOT NULL,           -- JSON: [{n, user, jafar, round_summary:{question,answer}}]
        domain TEXT,                         -- e.g. "oceanoflights.org"
        base_path TEXT,                      -- e.g. "/conversations/"
        share_url TEXT,                      -- generated full URL
        conversation_id TEXT,                -- chat_sessions.id if published from a tracked session
        published_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, slug)
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_pubconv_tenant_slug ON published_conversations(tenant_id, slug)');
    await query('CREATE INDEX IF NOT EXISTS idx_pubconv_published_at ON published_conversations(published_at)');

    logger.info('Migration 51 complete: chat_sessions, chat_messages, published_conversations');
  },

  // Version 52: HyPE thesis column + Anthropic batch enrichment tracking.
  // Adds a separate doctrinal-thesis field per paragraph (one-sentence
  // proposition stating what the paragraph teaches). For tier 1-7 docs
  // (Bahá'í primary doctrinal) this is generated by Sonnet 4.6 via the
  // Anthropic Messages Batches API; for tier 8-9 by local Qwen3.
  52: async () => {
    logger.info('Starting migration 52: HyPE thesis + Sonnet batch tracking');
    // try/catch idempotency rather than PRAGMA table_info — the query()
    // helper misclassifies PRAGMA as a write and runs it via stmt.run()
    // which doesn't return row data, breaking column existence checks.
    try { await query('ALTER TABLE content ADD COLUMN hyp_thesis TEXT'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    // Enrichment batch tracking — one row per Anthropic Messages Batches submission.
    // Records request → batch_id → status → completed_at, so the API enrichment
    // worker can resume across restarts and we can audit cost.
    await query(`
      CREATE TABLE IF NOT EXISTS enrichment_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,           -- 'anthropic'
        model TEXT NOT NULL,              -- 'claude-sonnet-4-6'
        external_batch_id TEXT,           -- provider's batch ID
        status TEXT NOT NULL DEFAULT 'pending',
                                          -- pending | submitted | in_progress | succeeded | failed | cancelled
        request_count INTEGER NOT NULL DEFAULT 0,
        succeeded_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        submitted_at TEXT,
        completed_at TEXT,
        cost_input_tokens INTEGER DEFAULT 0,
        cost_output_tokens INTEGER DEFAULT 0,
        notes TEXT
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_enrichment_batches_status ON enrichment_batches(status)');

    // Pending paragraphs awaiting batch submission (queue between detection
    // and the next batch flush). Cleared once paragraphs are written into a
    // submitted batch.
    await query(`
      CREATE TABLE IF NOT EXISTS enrichment_pending (
        content_id INTEGER PRIMARY KEY,
        tier INTEGER NOT NULL,
        queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
        batch_id INTEGER,                 -- FK enrichment_batches.id once assigned
        FOREIGN KEY (content_id) REFERENCES content(id),
        FOREIGN KEY (batch_id) REFERENCES enrichment_batches(id)
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_enrichment_pending_unassigned ON enrichment_pending(tier) WHERE batch_id IS NULL');
    await query('CREATE INDEX IF NOT EXISTS idx_enrichment_pending_batch ON enrichment_pending(batch_id) WHERE batch_id IS NOT NULL');

    // Index to find paragraphs needing enrichment per tier
    try { await query('CREATE INDEX IF NOT EXISTS idx_content_needs_thesis ON content(id) WHERE hyp_thesis IS NULL AND deleted_at IS NULL'); } catch { /* exists */ }

    logger.info('Migration 52 complete: hyp_thesis column + enrichment_batches/_pending tables');
  },

  // Version 53: Editable site content in DB. Replaces .astro source-of-truth
  // for docs and conversations with a `doc_pages` table + extends
  // `published_conversations` for in-place editing. Live Content Collections
  // (Astro 5 experimental, Astro 6 stable) fetch from our admin API at
  // request time, so editing a doc in DB → live without code deploy.
  53: async () => {
    logger.info('Starting migration 53: editable doc_pages + conversation body');

    await query(`
      CREATE TABLE IF NOT EXISTS doc_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,            -- "indexing-layers", "research-strategy"
        section TEXT,                          -- "research" | "agents" | "api" (nav grouping)
        nav_label TEXT,                        -- short sidebar label (defaults to title)
        sort_order INTEGER DEFAULT 100,
        title TEXT NOT NULL,
        description TEXT,                      -- meta description / social preview
        body_md TEXT NOT NULL,                 -- markdown source — the editable artifact
        body_html TEXT,                        -- pre-rendered HTML cache (regenerate on update)
        layout TEXT DEFAULT 'docs',            -- which Astro layout wraps it
        status TEXT DEFAULT 'published',       -- draft | published | archived
        active_section TEXT,                   -- DocsLayout's activeSection slug (defaults to slug)
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER                     -- nullable; references users(id) when known
      )
    `);
    await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_pages_slug ON doc_pages(slug)');
    await query('CREATE INDEX IF NOT EXISTS idx_doc_pages_section_sort ON doc_pages(section, sort_order)');
    await query('CREATE INDEX IF NOT EXISTS idx_doc_pages_status ON doc_pages(status)');

    // Extend published_conversations so the body itself is editable post-publish.
    // Existing rows already store rounds_json; we add markdown-source fields so an
    // editor can adjust per-round prose without re-running the LLM pipeline.
    // Same try/catch pattern as content columns above.
    try { await query('ALTER TABLE published_conversations ADD COLUMN body_md TEXT'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query('ALTER TABLE published_conversations ADD COLUMN body_html TEXT'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query("ALTER TABLE published_conversations ADD COLUMN status TEXT DEFAULT 'published'"); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }

    logger.info('Migration 53 complete: doc_pages + editable conversation body');
  },

  // Version 54: Translation pairing.
  //
  // Adds docs.original_doc_id — for translated documents, points to the
  // original-language doc in our own corpus when we have it. NULL otherwise
  // (which is most non-Bahá'í-primary cases). Used by the document subagent
  // and the translation subagent to fetch original alongside translation
  // when a user asks for both, or to ground LLM translation in the historical
  // concordance for that work.
  //
  // Also adds a small translation_cache table for memoizing CTAI-grounded
  // translations by content hash. Translations are deterministic-enough that
  // repeated requests for the same passage should hit cache rather than
  // re-paying the LLM cost.
  54: async () => {
    logger.info('Starting migration 54: translation pairing + cache');
    try { await query('ALTER TABLE docs ADD COLUMN original_doc_id INTEGER'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query('CREATE INDEX IF NOT EXISTS idx_docs_original_doc_id ON docs(original_doc_id) WHERE original_doc_id IS NOT NULL'); } catch { /* exists */ }

    await query(`
      CREATE TABLE IF NOT EXISTS translation_cache (
        text_hash TEXT PRIMARY KEY,         -- sha256 of source text
        source_lang TEXT NOT NULL,           -- 'ar' | 'fa' | 'he' | etc.
        target_lang TEXT NOT NULL DEFAULT 'en',
        source_text TEXT NOT NULL,
        translation TEXT NOT NULL,
        jafar_terms_json TEXT,               -- the JAFAR analysis used to ground this
        model TEXT,                          -- which LLM produced the translation
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_translation_cache_lang ON translation_cache(source_lang, target_lang)');

    logger.info('Migration 54 complete: original_doc_id + translation_cache');
  },

  // Version 55: per-paragraph is_duplicate flag.
  //
  // Near-term primitive for sites integration — when content from an external
  // source duplicates material we already have, we mark the duplicate copy
  // rather than build full merge logic. Marked paragraphs are skipped by
  // Meili sync, HyPE enrichment, and default API queries.
  //
  // Set manually or by a one-shot dedup script. A future "prune" job can
  // hard-delete rows where is_duplicate = 1. See docs/sites-integration.md
  // for the eventual full duplicate-resolution architecture.
  55: async () => {
    logger.info('Starting migration 55: content.is_duplicate flag');
    try { await query('ALTER TABLE content ADD COLUMN is_duplicate INTEGER DEFAULT 0'); } catch (err) {
      if (!err.message?.includes('duplicate column')) throw err;
    }
    try { await query('CREATE INDEX IF NOT EXISTS idx_content_not_duplicate ON content(is_duplicate) WHERE is_duplicate = 0 AND deleted_at IS NULL'); } catch { /* exists */ }
    logger.info('Migration 55 complete: is_duplicate column added');
  },
};

/**
 * User database migrations - runs on USER_DATABASE_URL (Turso cloud)
 * These tables are for user data that syncs to the cloud
 */
const userMigrations = {
  // Version 1: Create all user tables in user database
  1: async () => {
    // Users table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT,
        tier TEXT DEFAULT 'anonymous',
        email_verified INTEGER DEFAULT 0,
        preferred_language TEXT DEFAULT 'en',
        referral_code TEXT,
        referred_by INTEGER,
        preferences TEXT,
        interests TEXT,
        metadata TEXT,
        approved_at TEXT,
        search_count INTEGER DEFAULT 0,
        auth_provider TEXT DEFAULT 'email',
        stripe_customer_id TEXT,
        deletion_requested_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Anonymous users table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS anonymous_users (
        id TEXT PRIMARY KEY,
        user_agent TEXT,
        first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
        search_count INTEGER DEFAULT 0,
        last_search_query TEXT,
        preferences TEXT,
        interests TEXT,
        converted_to_user_id INTEGER,
        converted_at TEXT,
        unified_to INTEGER,
        FOREIGN KEY (converted_to_user_id) REFERENCES users(id),
        FOREIGN KEY (unified_to) REFERENCES users(id)
      )
    `);

    // Verification codes table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'email_verification',
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Refresh tokens table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        revoked_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Forum posts table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        author_id INTEGER NOT NULL,
        parent_id INTEGER,
        root_post_id INTEGER,
        depth INTEGER DEFAULT 0,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES forum_posts(id),
        FOREIGN KEY (root_post_id) REFERENCES forum_posts(id)
      )
    `);

    // Forum votes table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS forum_votes (
        user_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        vote INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (post_id) REFERENCES forum_posts(id)
      )
    `);

    // Donations table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        stripe_session_id TEXT,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'usd',
        frequency TEXT NOT NULL,
        tier_id TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Conversations table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT,
        messages TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Anonymous conversations table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS anonymous_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anonymous_user_id TEXT NOT NULL,
        user_id INTEGER,
        title TEXT,
        messages TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (anonymous_user_id) REFERENCES anonymous_users(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // User profiles table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        name TEXT,
        bio TEXT,
        spiritual_background TEXT,
        interests TEXT,
        preferred_sources TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics table
    await userQuery(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        event_type TEXT NOT NULL,
        details TEXT,
        cost_usd REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create indexes
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_anonymous_users_converted ON anonymous_users(converted_to_user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_verification_email ON verification_codes(email)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts(author_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_forum_posts_parent ON forum_posts(parent_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_forum_posts_root ON forum_posts(root_post_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_forum_votes_post ON forum_votes(post_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_anon_conversations_user ON anonymous_conversations(anonymous_user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(event_type)'); } catch { /* exists */ }

    logger.info('User database tables created');
  },

  2: async () => {
    logger.info('Starting user migration 2: search_log table');

    await userQuery(`
      CREATE TABLE IF NOT EXISTS search_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        user_id INTEGER,
        anonymous_user_id TEXT,
        api_key_id INTEGER,
        result_count INTEGER DEFAULT 0,
        duration_ms INTEGER,
        search_type TEXT DEFAULT 'web',
        filters TEXT,
        ip_country TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await userQuery('CREATE INDEX IF NOT EXISTS idx_search_log_created ON search_log(created_at)');
    await userQuery('CREATE INDEX IF NOT EXISTS idx_search_log_user ON search_log(user_id)');
    await userQuery('CREATE INDEX IF NOT EXISTS idx_search_log_anon ON search_log(anonymous_user_id)');
    await userQuery('CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(query)');

    logger.info('User migration 2 complete: search_log table created');
  },

  3: async () => {
    logger.info('Starting user migration 3: api_subscriptions and api_usage_log tables');

    await userQuery(`
      CREATE TABLE IF NOT EXISTS api_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT UNIQUE,
        stripe_subscription_item_id TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        canceled_at TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await userQuery(`
      CREATE TABLE IF NOT EXISTS api_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        api_key_id INTEGER NOT NULL,
        search_type TEXT NOT NULL,
        was_cached INTEGER DEFAULT 0,
        billable INTEGER DEFAULT 1,
        reported_to_stripe INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_api_subscriptions_user ON api_subscriptions(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_api_usage_log_user ON api_usage_log(user_id)'); } catch { /* exists */ }
    try { await userQuery('CREATE INDEX IF NOT EXISTS idx_api_usage_log_reported ON api_usage_log(reported_to_stripe)'); } catch { /* exists */ }

    logger.info('User migration 3 complete: api_subscriptions and api_usage_log tables created');
  },
};

/**
 * Run all pending content database migrations
 */
async function runContentMigrations() {
  const fromVersion = await getSchemaVersion();

  if (fromVersion >= CURRENT_VERSION) {
    logger.debug({ version: fromVersion }, 'Content DB schema up to date');
    return { from: fromVersion, to: fromVersion, applied: 0 };
  }

  logger.info({ from: fromVersion, to: CURRENT_VERSION }, 'Running content DB migrations');

  let applied = 0;
  for (let v = fromVersion + 1; v <= CURRENT_VERSION; v++) {
    if (migrations[v]) {
      logger.info({ version: v }, 'Applying content migration');
      await migrations[v]();
      applied++;
    }
  }

  await setSchemaVersion(CURRENT_VERSION);

  logger.info({ from: fromVersion, to: CURRENT_VERSION, applied }, 'Content migrations complete');
  return { from: fromVersion, to: CURRENT_VERSION, applied };
}

/**
 * Run all pending user database migrations
 */
async function runUserMigrations() {
  const fromVersion = await getUserSchemaVersion();

  if (fromVersion >= USER_DB_CURRENT_VERSION) {
    logger.debug({ version: fromVersion }, 'User DB schema up to date');
    return { from: fromVersion, to: fromVersion, applied: 0 };
  }

  logger.info({ from: fromVersion, to: USER_DB_CURRENT_VERSION }, 'Running user DB migrations');

  let applied = 0;
  for (let v = fromVersion + 1; v <= USER_DB_CURRENT_VERSION; v++) {
    if (userMigrations[v]) {
      logger.info({ version: v }, 'Applying user migration');
      await userMigrations[v]();
      applied++;
    }
  }

  await setUserSchemaVersion(USER_DB_CURRENT_VERSION);

  logger.info({ from: fromVersion, to: USER_DB_CURRENT_VERSION, applied }, 'User migrations complete');
  return { from: fromVersion, to: USER_DB_CURRENT_VERSION, applied };
}

/**
 * Run all pending migrations (both content and user databases)
 * @returns {Promise<{content: object, user: object}>}
 */
/**
 * Returns the SQL string for migration 44: Layered Indexing Tables.
 * Exported for testing — allows schema verification against an in-memory DB.
 */
export function getMigration44SQL() {
  return `
CREATE TABLE IF NOT EXISTS content_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  doc_id INTEGER NOT NULL,
  people_json TEXT,
  places_json TEXT,
  documents_json TEXT,
  events_json TEXT,
  concepts_json TEXT,
  relations_json TEXT,
  rendered TEXT,
  object_pipeline_version TEXT NOT NULL DEFAULT 'v1',
  content_hash TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, object_pipeline_version)
);

CREATE TABLE IF NOT EXISTS content_enrichment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  doc_id INTEGER NOT NULL,
  task_mode TEXT NOT NULL,
  result TEXT,
  instructions_hash TEXT,
  book_meta_hash TEXT,
  window_hash TEXT,
  objects_hash TEXT,
  target_paragraph_id INTEGER,
  pipeline_version TEXT NOT NULL DEFAULT 'v1',
  model_id TEXT,
  prompt_tokens INTEGER,
  cached_tokens INTEGER,
  completion_tokens INTEGER,
  call_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id, task_mode, pipeline_version)
);

CREATE TABLE IF NOT EXISTS pipeline_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_name TEXT NOT NULL,
  version TEXT NOT NULL,
  prompt_hash TEXT,
  model_id TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  active INTEGER DEFAULT 0,
  UNIQUE(pipeline_name, version)
);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  doc_id INTEGER,
  layer TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  pipeline_version TEXT,
  total_items INTEGER DEFAULT 0,
  completed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error TEXT,
  worker_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  heartbeat_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  config_json TEXT
);

CREATE TABLE IF NOT EXISTS layer_sync_state (
  content_id INTEGER NOT NULL,
  layer TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  meili_index TEXT,
  synced_at TEXT,
  PRIMARY KEY (content_id, layer)
);

CREATE INDEX IF NOT EXISTS idx_co_doc ON content_objects(doc_id);
CREATE INDEX IF NOT EXISTS idx_co_content ON content_objects(content_id);
CREATE INDEX IF NOT EXISTS idx_ce_doc ON content_enrichment(doc_id);
CREATE INDEX IF NOT EXISTS idx_ce_content ON content_enrichment(content_id);
CREATE INDEX IF NOT EXISTS idx_pj_status ON pipeline_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pj_doc ON pipeline_jobs(doc_id);
CREATE INDEX IF NOT EXISTS idx_lss_dirty ON layer_sync_state(synced) WHERE synced = 0;
  `;
}

export async function runMigrations() {
  const contentResult = await runContentMigrations();
  const userResult = await runUserMigrations();

  return {
    content: contentResult,
    user: userResult,
    // Backwards compatibility
    from: contentResult.from,
    to: contentResult.to,
    applied: contentResult.applied + userResult.applied
  };
}
