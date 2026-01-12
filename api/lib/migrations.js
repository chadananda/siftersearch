/**
 * Database Schema Migrations
 *
 * Version-based migrations that run on API startup.
 * Each version number corresponds to schema changes.
 */

import { query, queryOne, queryAll, userQuery, userQueryOne } from './db.js';
import { logger } from './logger.js';

// Current schema version - increment when adding migrations
const CURRENT_VERSION = 30;
const USER_DB_CURRENT_VERSION = 1;

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
      "Buddhism": "☸",    // Dharma wheel
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
