#!/usr/bin/env node
/**
 * Database Migration Runner
 * Usage: npm run migrate [create <name>]
 */

import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'migrations');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

function stripFilePrefix(url) { return url?.startsWith('file:') ? url.slice(5) : url; }

function getDb() {
  const url = process.env.TURSO_DATABASE_URL || 'file:./data/sifter.db';
  const path = stripFilePrefix(url) || './data/sifter.db';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 30000');
  return db;
}

function ensureMigrationsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
}

function getAppliedMigrations(db) {
  return new Set(db.prepare('SELECT name FROM _migrations ORDER BY id').all().map(r => r.name));
}

async function getMigrationFiles() {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    return files.filter(f => f.endsWith('.sql')).sort();
  } catch {
    await mkdir(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
}

async function runMigrations() {
  const db = getDb();
  console.log('Running migrations...\n');
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);
  const files = await getMigrationFiles();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) { console.log(`  [skip] ${file}`); continue; }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    console.log(`  [run]  ${file}`);
    for (const stmt of statements) {
      try {
        db.exec(stmt);
      } catch (err) {
        if (err.message?.includes('duplicate column name')) console.log(`    [info] Column already exists, skipping`);
        else throw err;
      }
    }
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    count++;
  }
  console.log(`\nDone. Applied ${count} migration(s).`);
  db.close();
}

async function createMigration(name) {
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${timestamp}_${name}.sql`;
  await writeFile(join(MIGRATIONS_DIR, filename), `-- Migration: ${name}\n-- Created: ${new Date().toISOString()}\n\n`);
  console.log(`Created: migrations/${filename}`);
}

const [,, cmd, arg] = process.argv;
if (cmd === 'create' && arg) createMigration(arg);
else runMigrations().catch(err => { console.error('Migration failed:', err.message); process.exit(1); });
