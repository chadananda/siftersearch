/**
 * Database Schema Migrations
 *
 * Version-based migrations that run on API startup.
 * Each version number corresponds to schema changes.
 */

import { query, queryOne } from './db.js';
import { logger } from './logger.js';

// Current schema version - increment when adding migrations
const CURRENT_VERSION = 12;

/**
 * Get current database schema version
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
 * Set schema version
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
};

/**
 * Run all pending migrations
 * @returns {Promise<{from: number, to: number, applied: number}>}
 */
export async function runMigrations() {
  const fromVersion = await getSchemaVersion();

  if (fromVersion >= CURRENT_VERSION) {
    logger.debug({ version: fromVersion }, 'Schema up to date');
    return { from: fromVersion, to: fromVersion, applied: 0 };
  }

  logger.info({ from: fromVersion, to: CURRENT_VERSION }, 'Running schema migrations');

  let applied = 0;
  for (let v = fromVersion + 1; v <= CURRENT_VERSION; v++) {
    if (migrations[v]) {
      logger.info({ version: v }, 'Applying migration');
      await migrations[v]();
      applied++;
    }
  }

  await setSchemaVersion(CURRENT_VERSION);

  logger.info({ from: fromVersion, to: CURRENT_VERSION, applied }, 'Migrations complete');
  return { from: fromVersion, to: CURRENT_VERSION, applied };
}
