// Database schema definitions for Sifter Search

// App database schema - stores global application data
export const appDbSchema = {
  tables: {
    libraries: `
      CREATE TABLE IF NOT EXISTS libraries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settings JSON
      )
    `,
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        settings JSON
      )
    `,
    library_users: `
      CREATE TABLE IF NOT EXISTS library_users (
        library_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (library_id, user_id),
        FOREIGN KEY (library_id) REFERENCES libraries(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `
  }
};

// Library database schema - stores library-specific data
export const libraryDbSchema = {
  tables: {
    settings: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSON,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    api_keys: `
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        last_used_at DATETIME,
        call_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT 1
      )
    `,
    chat_sessions: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME,
        metadata JSON
      )
    `,
    chat_messages: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata JSON,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      )
    `
  }
};

// Content database schema - stores documents and their metadata
export const contentDbSchema = {
  tables: {
    documents: `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    chunks: `
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSON,
        embedding BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `
  }
};

// Index database schema - stores vector embeddings and search indices
export const indexDbSchema = {
  tables: {
    embeddings: `
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    search_index: `
      CREATE TABLE IF NOT EXISTS search_index (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chunk_id TEXT NOT NULL,
        term TEXT NOT NULL,
        score REAL NOT NULL,
        UNIQUE(chunk_id, term)
      )
    `
  }
};