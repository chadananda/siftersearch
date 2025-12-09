#!/usr/bin/env node
/**
 * Database Migration Runner
 * Usage: npm run migrate [create <name>]
 */

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

async function ensureMigrationsTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(db) {
  const result = await db.execute('SELECT name FROM _migrations ORDER BY id');
  return new Set(result.rows.map(r => r.name));
}

async function getMigrationFiles() {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    return files
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    await mkdir(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
}

async function runMigrations() {
  const db = await getDb();

  console.log('Running migrations...\n');

  await ensureMigrationsTable(db);
  const applied = await getAppliedMigrations(db);
  const files = await getMigrationFiles();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  [skip] ${file}`);
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`  [run]  ${file}`);

    for (const stmt of statements) {
      await db.execute(stmt);
    }

    await db.execute({
      sql: 'INSERT INTO _migrations (name) VALUES (?)',
      args: [file]
    });

    count++;
  }

  console.log(`\nDone. Applied ${count} migration(s).`);
}

async function createMigration(name) {
  await mkdir(MIGRATIONS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${timestamp}_${name}.sql`;
  const filepath = join(MIGRATIONS_DIR, filename);

  await writeFile(filepath, `-- Migration: ${name}\n-- Created: ${new Date().toISOString()}\n\n`);

  console.log(`Created: migrations/${filename}`);
}

// CLI
const [,, cmd, arg] = process.argv;

if (cmd === 'create' && arg) {
  createMigration(arg);
} else {
  runMigrations().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
