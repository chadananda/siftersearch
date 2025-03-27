/**
 * drizzle.js
 * 
 * This file defines the database schema using Drizzle ORM.
 * It includes schemas for users, documents, collections, and other entities.
 */

import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  clerk_id: text('clerk_id'),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['visitor', 'user', 'subscriber', 'editor', 'librarian', 'admin', 'superuser'] }).default('visitor'),
  active: integer('active', { mode: 'boolean' }).default(true),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// Collections table
export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parent_id: text('parent_id').references(() => collections.id),
  created_by: text('created_by').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  status: text('status', { enum: ['active', 'archived'] }).default('active'),
  metadata: text('metadata', { mode: 'json' })
});

// Documents table
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  collection_id: text('collection_id').references(() => collections.id),
  created_by: text('created_by').references(() => users.id).notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).default('draft'),
  src_type: text('src_type', { enum: ['pdf', 'web', 'text'] }).default('text'),
  src_url: text('src_url'),
  pdf_url: text('pdf_url'),
  md_url: text('md_url'),
  metadata: text('metadata', { mode: 'json' })
});

// Content blocks table
export const content = sqliteTable('content', {
  id: text('id').primaryKey(),
  document_id: text('document_id').references(() => documents.id).notNull(),
  content_type: text('content_type', { enum: ['text', 'image', 'code', 'table', 'list'] }).default('text'),
  content: text('content').notNull(),
  sequence: integer('sequence').notNull(),
  indexed: integer('indexed', { mode: 'boolean' }).default(false),
  is_duplicate: integer('is_duplicate', { mode: 'boolean' }).default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  metadata: text('metadata', { mode: 'json' })
});

// Categories table
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parent_id: text('parent_id').references(() => categories.id),
  created_by: text('created_by').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  status: text('status', { enum: ['active', 'archived'] }).default('active')
});

// Document-Category relationships
export const document_categories = sqliteTable('document_categories', {
  id: text('id').primaryKey(),
  document_id: text('document_id').references(() => documents.id).notNull(),
  category_id: text('category_id').references(() => categories.id).notNull(),
  created_at: text('created_at').notNull()
});

// Authors table
export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  bio: text('bio'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// Document-Author relationships
export const document_authors = sqliteTable('document_authors', {
  id: text('id').primaryKey(),
  document_id: text('document_id').references(() => documents.id).notNull(),
  author_id: text('author_id').references(() => authors.id).notNull(),
  created_at: text('created_at').notNull()
});

// Activity logs
export const activity_logs = sqliteTable('activity_logs', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  details: text('details', { mode: 'json' }),
  created_at: text('created_at').notNull()
});

// Search logs
export const search_logs = sqliteTable('search_logs', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => users.id),
  query: text('query').notNull(),
  results_count: integer('results_count'),
  created_at: text('created_at').notNull(),
  metadata: text('metadata', { mode: 'json' })
});

// Websites
export const websites = sqliteTable('websites', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  created_by: text('created_by').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  last_crawled: text('last_crawled'),
  status: text('status', { enum: ['active', 'paused', 'completed', 'error'] }).default('active'),
  crawl_config: text('crawl_config', { mode: 'json' })
});

// Configuration
export const configs = sqliteTable('configs', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value', { mode: 'json' }).notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

// Sync state
export const sync_state = sqliteTable('sync_state', {
  id: text('id').primaryKey(),
  last_sync: text('last_sync').notNull(),
  updated_at: text('updated_at').notNull()
});
