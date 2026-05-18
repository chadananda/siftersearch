#!/usr/bin/env node
// Bulk Meilisearch re-sync — bypasses the incremental sync worker's per-doc overhead.
// Designed for mass recovery (e.g. after mass synced=0 reset on 4M+ rows).
// Reads paragraphs in large batches directly, pushes to Meili, marks synced.
//
// Usage (on tower-nas):
//   node scripts/bulk-meili-sync.mjs
//   node scripts/bulk-meili-sync.mjs --batch 5000  (larger batches, more RAM)
//
// Stop the normal worker first to avoid write contention:
//   pm2 stop siftersearch-worker
// Then restart it after:
//   pm2 start siftersearch-worker

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { MeiliSearch } from 'meilisearch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env-secrets') });
dotenv.config({ path: join(ROOT, '.env-public') });

const DB_PATH = process.env.SIFTER_DATABASE_URL || join(ROOT, 'data/sifter.db');
const MEILI_HOST = process.env.MEILISEARCH_URL || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_API_KEY || '';

const args = process.argv.slice(2);
const batchIdx = args.indexOf('--batch');
const BATCH_SIZE = batchIdx >= 0 ? parseInt(args[batchIdx + 1]) : 2000;
const PIPELINE_LIMIT = 4;

function blobToFloatArray(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const arr = Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
  if (arr.some(v => !Number.isFinite(v))) return null;
  return arr;
}

function authorityScore(religion) {
  const r = (religion || '').toLowerCase();
  if (r.includes('bahai') || r.includes('baha')) return 90;
  if (r.includes('islam')) return 70;
  if (r.includes('christian')) return 65;
  if (r.includes('jew') || r.includes('hebrew')) return 65;
  return 40;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -131072'); // 128MB

  const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });
  try { await meili.health(); } catch (e) { console.error('Meilisearch unreachable:', e.message); process.exit(1); }

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM content WHERE synced = 0 AND deleted_at IS NULL`).get();
  console.log(`Bulk sync: ${total.toLocaleString()} unsynced paragraphs, batch=${BATCH_SIZE}, pipeline=${PIPELINE_LIMIT}`);
  if (total === 0) { console.log('Nothing to sync.'); db.close(); return; }

  // Cursor-paginated fetch — rowid > lastRowid, ordered for stable pagination.
  // SELECT rowid explicitly so we can advance the cursor.
  const fetchBatch = db.prepare(`
    SELECT c.rowid as _rowid, c.id, c.doc_id, c.paragraph_index,
           c.text, c.context, c.text_grounded,
           c.translation, c.translation_segments,
           c.heading, c.blocktype,
           c.embedding, c.external_para_id, c.pdf_page,
           c.source_url,
           d.title, d.author, d.filename, d.religion, d.collection,
           d.language, d.year, d.source_site
    FROM content c
    JOIN docs d ON d.id = c.doc_id
    WHERE c.synced = 0 AND c.deleted_at IS NULL AND c.rowid > ?
    ORDER BY c.rowid ASC
    LIMIT ?
  `);

  const markSyncedTx = db.transaction((ids) => {
    const stmt = db.prepare(`UPDATE content SET synced = 1 WHERE id = ?`);
    for (const id of ids) stmt.run(id);
  });

  let cursor = 0;
  let synced = 0;
  let skipped = 0;
  const inFlight = []; // [{taskUid, ids}]
  const startTime = Date.now();

  async function drainOldest() {
    if (!inFlight.length) return;
    const { taskUid, ids } = inFlight.shift();
    try {
      const result = await meili.tasks.waitForTask(taskUid, { timeout: 600000 });
      if (result.status === 'failed') {
        console.error(`  Task ${taskUid} failed: ${result.error?.message}`);
        skipped += ids.length;
        return;
      }
    } catch (e) {
      console.error(`  waitForTask ${taskUid} error: ${e.message}`);
      skipped += ids.length;
      return;
    }
    markSyncedTx(ids);
    synced += ids.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(synced / elapsed * 60);
    const pct = ((synced / total) * 100).toFixed(1);
    const etaH = synced > 0 ? ((total - synced) / (synced / elapsed) / 3600).toFixed(1) : '?';
    process.stdout.write(`\r  ${pct}% synced=${synced.toLocaleString()} rate=${rate}/min eta=${etaH}h    `);
  }

  while (true) {
    const rows = fetchBatch.all(cursor, BATCH_SIZE);
    if (!rows.length) {
      while (inFlight.length) await drainOldest();
      break;
    }

    // Advance cursor to highest rowid in this batch
    cursor = rows[rows.length - 1]._rowid;

    // Build Meili documents, skip rows without embeddings
    const docs = [];
    const ids = [];
    for (const row of rows) {
      const embedding = blobToFloatArray(row.embedding);
      if (!embedding) { skipped++; continue; }
      docs.push({
        id: row.id,
        doc_id: row.doc_id,
        paragraph_index: row.paragraph_index,
        text: row.text,
        context: row.context || null,
        text_grounded: row.text_grounded || null,
        translation: row.translation || null,
        translation_segments: row.translation_segments || null,
        title: row.title,
        author: row.author,
        filename: row.filename,
        religion: row.religion,
        collection: row.collection,
        language: row.language,
        year: row.year ? parseInt(row.year, 10) : null,
        authority: authorityScore(row.religion),
        heading: row.heading || '',
        blocktype: row.blocktype || 'paragraph',
        source_site: row.source_site || null,
        source_url: row.source_url || null,
        external_para_id: row.external_para_id || null,
        pdf_page: typeof row.pdf_page === 'number' ? row.pdf_page : null,
        created_at: new Date().toISOString(),
        _vectors: { default: embedding }
      });
      ids.push(row.id);
    }

    if (!docs.length) continue; // all skipped (no embeddings)

    // Backpressure: drain oldest task before enqueuing if pipeline is full
    while (inFlight.length >= PIPELINE_LIMIT) await drainOldest();

    // All primary content goes to 'paragraphs' index.
    // Site-specific routing is handled by the normal worker — skip here.
    try {
      const task = await meili.index('paragraphs').addDocuments(docs, { primaryKey: 'id' });
      inFlight.push({ taskUid: task.taskUid, ids });
    } catch (e) {
      console.error(`\n  addDocuments failed: ${e.message}`);
      skipped += ids.length;
    }
  }

  console.log(`\n\nDone in ${Math.round((Date.now() - startTime) / 60000)} minutes.`);
  console.log(`  Synced: ${synced.toLocaleString()}, skipped (no embedding): ${skipped.toLocaleString()}`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
