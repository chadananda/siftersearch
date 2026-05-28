#!/usr/bin/env node
// One-shot migration: copy graph pipeline tables from sifter.db to graph.db.
// Uses ATTACH to read from sifter.db inside graph.db's connection.
// Safe to run multiple times (INSERT OR IGNORE). Does NOT drop tables from sifter.db.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = join(dirname(__filename), '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const SIFTER_DB_PATH = resolve('./data/sifter.db');
const GRAPH_DB_PATH = resolve('./data/graph.db');

const TABLES = [
  'authority_tiers',
  'entity_aliases',
  'entity_mentions',
  'paragraph_roles',
  'entity_sets',
  'set_members',
  'quote_clusters',
  'quote_instances',
  'paragraph_extractions',
  'extraction_validations',
  'extraction_runs',
  'er_audit_log',
  'model_calibration',
  'promotion_queue',
  'significance_markers',
  'periods',
  'episodes',
  'pending_bridge_relations',
];

mkdirSync('./data', { recursive: true });

console.log(`Attaching sifter.db at: ${SIFTER_DB_PATH}`);
console.log(`Target graph.db at: ${GRAPH_DB_PATH}`);

const graphDb = new Database(GRAPH_DB_PATH);
graphDb.pragma('journal_mode = WAL');
graphDb.pragma('busy_timeout = 30000');
graphDb.exec(`ATTACH DATABASE '${SIFTER_DB_PATH}' AS src`);

for (const table of TABLES) {
  const srcExists = graphDb.prepare(`SELECT name FROM src.sqlite_master WHERE type='table' AND name=?`).get(table);
  if (!srcExists) {
    console.log(`  ${table}: not found in sifter.db — skipping`);
    continue;
  }
  const dstExists = graphDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
  if (!dstExists) {
    console.log(`  ${table}: not in graph.db yet — run graph migrations first`);
    continue;
  }
  const before = graphDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const srcCount = graphDb.prepare(`SELECT COUNT(*) AS n FROM src.${table}`).get().n;
  try {
    graphDb.exec(`INSERT OR IGNORE INTO ${table} SELECT * FROM src.${table}`);
  } catch (err) {
    console.error(`  ${table}: copy failed — ${err.message}`);
    continue;
  }
  const after = graphDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const copied = after - before;
  console.log(`  ${table}: src=${srcCount} before=${before} after=${after} copied=${copied}`);
}

graphDb.exec(`DETACH DATABASE src`);
graphDb.close();
console.log('Migration complete.');
