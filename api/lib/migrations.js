/**
 * Database Schema Migrations
 *
 * Version-based migrations that run on API startup.
 * Each version number corresponds to schema changes.
 */

import { query, queryOne, userQuery, userQueryOne } from './db.js';
import { logger } from './logger.js';

// Current schema version - increment when adding migrations
const CURRENT_VERSION = 18;
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
