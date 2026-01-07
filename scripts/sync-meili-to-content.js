#!/usr/bin/env node

/**
 * Sync paragraphs from Meilisearch to SQLite content table
 *
 * This script:
 * 1. Reads all paragraphs from Meilisearch
 * 2. Maps them to SQLite docs using doc_id
 * 3. Inserts into the content table
 */

import { MeiliSearch } from 'meilisearch';
import { query, queryOne, queryAll } from '../api/lib/db.js';
import crypto from 'crypto';

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const MEILI_KEY = process.env.MEILISEARCH_KEY || '';
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes('--dry-run');

const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY });

function generateContentHash(text) {
  return crypto.createHash('md5').update(text || '').digest('hex').slice(0, 16);
}

async function syncContent() {
  console.log('Sync Meilisearch Paragraphs to SQLite Content Table');
  console.log('===================================================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Meilisearch: ${MEILI_HOST}\n`);

  const paragraphsIndex = meili.index('paragraphs');

  // Get all valid doc_ids from SQLite
  const docs = await queryAll('SELECT id FROM docs');
  const validDocIds = new Set(docs.map(d => d.id));
  console.log(`Found ${validDocIds.size} documents in SQLite\n`);

  // Check current content count
  const currentContent = await queryOne('SELECT COUNT(*) as count FROM content');
  console.log(`Current content rows: ${currentContent?.count || 0}\n`);

  // Process Meilisearch paragraphs in batches
  let offset = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalInvalidDoc = 0;
  const batch = [];

  console.log('Fetching paragraphs from Meilisearch...');

  while (true) {
    const result = await paragraphsIndex.getDocuments({
      limit: BATCH_SIZE,
      offset,
      fields: ['id', 'doc_id', 'paragraph_index', 'text', 'heading', 'blocktype', 'translation', 'translation_segments']
    });

    if (result.results.length === 0) break;

    for (const para of result.results) {
      // Get numeric doc_id - could be number or string
      let docId = para.doc_id;
      if (typeof docId === 'string') {
        // Try to parse as number, skip if it's a slug
        const parsed = parseInt(docId, 10);
        if (isNaN(parsed)) {
          totalInvalidDoc++;
          continue;
        }
        docId = parsed;
      }

      if (!validDocIds.has(docId)) {
        totalInvalidDoc++;
        continue;
      }

      // Check if already exists
      const existing = await queryOne('SELECT id FROM content WHERE id = ?', [para.id]);
      if (existing) {
        totalSkipped++;
        continue;
      }

      batch.push({
        id: para.id,
        doc_id: docId,
        paragraph_index: para.paragraph_index || 0,
        text: para.text || '',
        content_hash: generateContentHash(para.text),
        heading: para.heading || null,
        blocktype: para.blocktype || 'paragraph',
        translation: typeof para.translation === 'object' ? JSON.stringify(para.translation) : para.translation || null,
        translation_segments: typeof para.translation_segments === 'object' ? JSON.stringify(para.translation_segments) : para.translation_segments || null
      });

      // Insert in batches
      if (batch.length >= 100 && !DRY_RUN) {
        await insertBatch(batch);
        totalInserted += batch.length;
        console.log(`  Inserted ${totalInserted} paragraphs...`);
        batch.length = 0;
      }
    }

    offset += BATCH_SIZE;

    if (offset % 10000 === 0) {
      console.log(`  Processed ${offset} paragraphs...`);
    }
  }

  // Insert remaining batch
  if (batch.length > 0 && !DRY_RUN) {
    await insertBatch(batch);
    totalInserted += batch.length;
  }

  if (DRY_RUN) {
    totalInserted = batch.length;
  }

  console.log('\n===================================================');
  console.log('Summary:');
  console.log(`  Would insert: ${totalInserted}`);
  console.log(`  Already existed: ${totalSkipped}`);
  console.log(`  Invalid doc_id: ${totalInvalidDoc}`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run without --dry-run to apply changes.');
  } else {
    // Verify final count
    const finalContent = await queryOne('SELECT COUNT(*) as count FROM content');
    console.log(`\nFinal content rows: ${finalContent?.count || 0}`);
  }
}

async function insertBatch(batch) {
  for (const para of batch) {
    try {
      await query(`
        INSERT OR IGNORE INTO content (id, doc_id, paragraph_index, text, content_hash, heading, blocktype, translation, translation_segments, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        para.id,
        para.doc_id,
        para.paragraph_index,
        para.text,
        para.content_hash,
        para.heading,
        para.blocktype,
        para.translation,
        para.translation_segments
      ]);
    } catch (err) {
      console.error(`Failed to insert ${para.id}: ${err.message}`);
    }
  }
}

syncContent().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
