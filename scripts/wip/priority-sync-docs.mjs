#!/usr/bin/env node
/**
 * One-shot priority sync for specific doc_ids — pushes paragraphs directly to Meilisearch.
 * Usage: node scripts/wip/priority-sync-docs.mjs [doc_id1 doc_id2 ...]
 * Default: syncs the 4 key fixture docs (20809, 20810, 20811, 20911)
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { MeiliSearch } from 'meilisearch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

dotenv.config({ path: join(PROJECT_ROOT, '.env-secrets') });
dotenv.config({ path: join(PROJECT_ROOT, '.env-public') });

const DOC_IDS = process.argv.slice(2).map(Number).filter(Boolean);
const TARGET_DOCS = DOC_IDS.length ? DOC_IDS : [20809, 20810, 20811, 20911];

const DB_PATH = process.env.SIFTER_DB_PATH || join(PROJECT_ROOT, 'data/sifter.db');
const MEILI_URL = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || process.env.MEILI_MASTER_KEY;
const EXPECTED_DIMS = 512;

const db = new Database(DB_PATH, { timeout: 60000, readonly: false });
const meili = new MeiliSearch({ host: MEILI_URL, apiKey: MEILI_KEY });

function blobToFloatArray(blob) {
  if (!blob) return null;
  const buf = blob instanceof Buffer ? blob : Buffer.from(blob);
  if (buf.length % 4 !== 0) return null;
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  return Array.from(arr);
}

function getAuthority(doc) {
  // Simplified authority — matches main logic
  const authorityMap = {
    'Bahá\'u\'lláh': 9, 'Bahaullah': 9,
    '\'Abdu\'l-Bahá': 8, 'Abdu\'l-Bahá': 8,
    'Shoghi Effendi': 7,
    'Universal House of Justice': 7,
  };
  for (const [k, v] of Object.entries(authorityMap)) {
    if (doc.author?.includes(k)) return v;
  }
  return doc.authority || 5;
}

async function syncDoc(docId) {
  const doc = db.prepare('SELECT * FROM docs WHERE id = ?').get(docId);
  if (!doc) { console.error(`Doc ${docId} not found`); return; }

  const paragraphs = db.prepare(
    'SELECT * FROM content WHERE doc_id = ? AND is_duplicate = 0 AND deleted_at IS NULL ORDER BY paragraph_index'
  ).all(docId);

  console.log(`Doc ${docId} "${doc.title}": ${paragraphs.length} paragraphs`);

  const authority = getAuthority(doc);

  const meiliParagraphs = paragraphs.map(p => {
    const embedding = blobToFloatArray(p.embedding);
    const record = {
      id: p.id,
      doc_id: p.doc_id,
      paragraph_index: p.paragraph_index,
      text: p.text,
      text_grounded: p.text_grounded || null,
      context: p.context || null,
      translation: p.translation || null,
      title: doc.title,
      author: doc.author,
      filename: doc.filename,
      religion: doc.religion,
      collection: doc.collection,
      language: doc.language,
      year: doc.year ? parseInt(doc.year, 10) : null,
      authority,
      encumbered: doc.encumbered ? 1 : 0,
      heading: p.heading || '',
      blocktype: p.blocktype || 'paragraph',
      source_site: doc.source_site || null,
      source_url: doc.source_url || null,
      created_at: new Date().toISOString()
    };
    if (embedding && embedding.length === EXPECTED_DIMS) {
      record._vectors = { default: embedding };
    }
    return record;
  });

  const BATCH = 500;
  const paragraphsIndex = meili.index('paragraphs');

  for (let i = 0; i < meiliParagraphs.length; i += BATCH) {
    const batch = meiliParagraphs.slice(i, i + BATCH);
    const task = await paragraphsIndex.addDocuments(batch, { primaryKey: 'id' });
    console.log(`  batch ${Math.floor(i/BATCH)+1}: taskUid=${task.taskUid}`);
  }

  // Mark synced in SQLite
  db.prepare('UPDATE content SET synced = 1, updated_at = ? WHERE doc_id = ? AND is_duplicate = 0 AND deleted_at IS NULL')
    .run(Math.floor(Date.now() / 1000), docId);

  console.log(`  ✓ ${doc.title} pushed to Meilisearch + marked synced`);
}

console.log(`Syncing docs: ${TARGET_DOCS.join(', ')}`);
for (const docId of TARGET_DOCS) {
  await syncDoc(docId);
}
db.close();
console.log('Done.');
