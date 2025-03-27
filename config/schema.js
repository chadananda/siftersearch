/**
 * schema.js
 * 
 * This file defines the database schemas using Zod for validation.
 * It includes schemas for users, documents, collections, and other entities.
 */

import { z } from 'zod';

// Define role enum with hierarchy
// Role hierarchy: superuser > librarian > editor > subscriber > user > visitor
export const UserRole = z.enum([
  'visitor',    // Unauthenticated or new users
  'user',       // Basic authenticated users
  'subscriber', // Users with subscription access
  'editor',     // Can edit content
  'librarian',  // Can manage collections and documents
  'admin',      // Site administrator
  'superuser'   // Full system access
]);

// User schema
export const UserSchema = z.object({
  id: z.string().uuid().optional(), // Auto-generated UUID
  clerk_id: z.string().min(1), // External auth ID from Clerk
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRole.default('user'),
  active: z.boolean().default(true),
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
});

// Document schema - updated with new fields
export const DocumentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  collection_id: z.string().uuid().optional(),
  created_by: z.string().uuid(), // User ID
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  src_type: z.enum(['pdf', 'web', 'text']).default('text'),
  src_url: z.string().url().optional(), // URL to the source document
  pdf_url: z.string().url().optional(), // URL to the PDF document
  md_url: z.string().url().optional(), // URL to the Markdown document
  metadata: z.record(z.string(), z.any()).optional(), // JSON object for flexible metadata
});

// Content Block schema - new schema for content blocks
export const ContentSchema = z.object({
  id: z.string().uuid().optional(),
  document_id: z.string().uuid(), // Reference to document
  block: z.string(), // Markdown content block
  block_type: z.enum([
    'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
    'paragraph', 'blockquote', 'code', 'fenced_code',
    'ordered_list', 'unordered_list', 'task_list', 'list_item',
    'table', 'table_row', 'table_cell',
    'horizontal_rule', 'image', 'link',
    'html', 'footnote', 'definition', 'thematic_break', 'other'
  ]),
  sequence: z.number().int().nonnegative(), // Order within document
  pdf_page: z.number().int().nonnegative().optional(), // Absolute page number in PDF
  book_page: z.string().optional(), // Book's page number (could be roman numerals, etc.)
  context: z.string().optional(), // Additional searchable context
  indexed: z.boolean().default(false), // Whether indexed in Manticore
  is_duplicate: z.boolean().default(false), // Whether this content is a duplicate
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
});

// Collection schema
export const CollectionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  parent_id: z.string().uuid().optional(), // For hierarchical collections
  created_by: z.string().uuid(),
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
  metadata: z.record(z.string(), z.any()).optional(),
});

// Category schema
export const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  parent_id: z.string().uuid().optional(), // For hierarchical categories
  created_by: z.string().uuid(),
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
});

// Author schema
export const AuthorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  bio: z.string().optional(),
  created_by: z.string().uuid(),
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
});

// Document-Category relationship
export const DocumentCategorySchema = z.object({
  document_id: z.string().uuid(),
  category_id: z.string().uuid(),
  created_at: z.date().optional(), // Date object
});

// Document-Author relationship
export const DocumentAuthorSchema = z.object({
  document_id: z.string().uuid(),
  author_id: z.string().uuid(),
  created_at: z.date().optional(), // Date object
});

// Activity Log schema
export const ActivityLogSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  action: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  details: z.record(z.string(), z.any()).optional(),
  created_at: z.date().optional(), // Date object
});

// Website schema
export const WebsiteSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['active', 'paused', 'error']).default('active'),
  last_crawled: z.date().optional(), // Date object
  crawl_frequency: z.number().int().positive().default(24), // Hours
  created_by: z.string().uuid(),
  created_at: z.date().optional(), // Date object
  updated_at: z.date().optional(), // Date object
  crawl_config: z.record(z.string(), z.any()).optional(),
});

// Search Log schema
export const SearchLogSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(), // Optional for anonymous searches
  query: z.string().min(1),
  filters: z.record(z.string(), z.any()).optional(),
  results_count: z.number().int().nonnegative(),
  session_id: z.string().optional(),
  ip_address: z.string().optional(),
  created_at: z.date().optional(), // Date object
});

// Config schema
export const ConfigSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
  updated_by: z.string().uuid(),
  updated_at: z.date().optional(), // Date object
});

// Export all schemas
export const Schemas = {
  User: UserSchema,
  Document: DocumentSchema,
  Content: ContentSchema,
  Collection: CollectionSchema,
  Category: CategorySchema,
  Author: AuthorSchema,
  DocumentCategory: DocumentCategorySchema,
  DocumentAuthor: DocumentAuthorSchema,
  ActivityLog: ActivityLogSchema,
  Website: WebsiteSchema,
  SearchLog: SearchLogSchema,
  Config: ConfigSchema,
};

// Helper function to create SQL table definitions from schemas
export function generateSQLSchema() {
  return {
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        clerk_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('visitor', 'user', 'subscriber', 'editor', 'librarian', 'admin', 'superuser')),
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `,
    documents: `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        collection_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
        src_type TEXT DEFAULT 'text' CHECK(src_type IN ('pdf', 'web', 'text')),
        src_url TEXT,
        pdf_url TEXT,
        md_url TEXT,
        metadata TEXT,
        FOREIGN KEY (collection_id) REFERENCES collections(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
    content: `
      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        block TEXT NOT NULL,
        block_type TEXT NOT NULL CHECK(block_type IN (
          'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
          'paragraph', 'blockquote', 'code', 'fenced_code',
          'ordered_list', 'unordered_list', 'task_list', 'list_item',
          'table', 'table_row', 'table_cell',
          'horizontal_rule', 'image', 'link',
          'html', 'footnote', 'definition', 'thematic_break', 'other'
        )),
        sequence INTEGER NOT NULL,
        pdf_page INTEGER,
        book_page TEXT,
        context TEXT,
        indexed INTEGER DEFAULT 0,
        is_duplicate INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `,
    collections: `
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        metadata TEXT,
        FOREIGN KEY (parent_id) REFERENCES collections(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
    categories: `
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        parent_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (parent_id) REFERENCES categories(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
    authors: `
      CREATE TABLE IF NOT EXISTS authors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        bio TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
    document_categories: `
      CREATE TABLE IF NOT EXISTS document_categories (
        document_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (document_id, category_id),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );
    `,
    document_authors: `
      CREATE TABLE IF NOT EXISTS document_authors (
        document_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (document_id, author_id),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE
      );
    `,
    activity_logs: `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `,
    websites: `
      CREATE TABLE IF NOT EXISTS websites (
        id TEXT PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'error')),
        last_crawled TEXT,
        crawl_frequency INTEGER DEFAULT 24,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        crawl_config TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );
    `,
    search_logs: `
      CREATE TABLE IF NOT EXISTS search_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        query TEXT NOT NULL,
        filters TEXT,
        results_count INTEGER NOT NULL,
        session_id TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `,
    configs: `
      CREATE TABLE IF NOT EXISTS configs (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );
    `,
    sync_state: `
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  };
}

export default Schemas;
